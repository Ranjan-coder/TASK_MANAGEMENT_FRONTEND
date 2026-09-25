"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { decryptMessage } from "@/lib/crypto/e2e";
import {
  getCachedSessionKey,
  dmCacheKey,
  groupCacheKey
} from "@/lib/crypto/keyStore";
import {
  Message,
  TypingPayload,
  ReadReceiptPayload,
  ReactionPayload,
  PresencePayload,
  MemberAddedPayload,
  MemberRemovedPayload,
  RekeyPayload
} from "@/types/chat";
import { Conversation } from "@/types/chat";

/**
 * Hook that subscribes to all chat-related socket events.
 * Must be mounted once in the chat layout — handles all inbound events.
 *
 * Decryption happens here: we look up the session key from cache,
 * decrypt the message, then attach decryptedContent before storing.
 */
export const useChat = () => {
  const socket = getSocket();
  const { user } = useAuthStore();
  const {
    appendMessage,
    updateMessage,
    removeMessage,
    hideMessageForMe,
    upsertConversation,
    handleTyping,
    handlePresence,
    markConversationRead,
    activeConversationId
  } = useChatStore();

  const activeConvRef = useRef<string | null>(null);
  activeConvRef.current = activeConversationId;

  // ── Decrypt a message using the cached session key ──────────────────────
  const decryptMsg = useCallback(
    async (
      msg: Message,
      convType: "dm" | "group",
      otherUserId?: string,
      convId?: string,
      otherKeyVersion?: number
    ): Promise<Message> => {
      if (msg.type === "system" || msg.isDeleted || !msg.ciphertext || !msg.iv) return msg;

      try {
        const cacheKey =
          convType === "dm" && otherUserId
            ? dmCacheKey(otherUserId, otherKeyVersion)
            : groupCacheKey(convId || msg.conversation);

        const sessionKey = getCachedSessionKey(cacheKey);
        if (!sessionKey) {
          // Session key not yet derived — mark as pending
          return { ...msg, decryptedContent: "🔑 Decrypting...", decryptionFailed: false };
        }

        const plain = await decryptMessage(msg.ciphertext, msg.iv, sessionKey);
        return { ...msg, decryptedContent: plain };
      } catch {
        return { ...msg, decryptedContent: "🔒 Unable to decrypt", decryptionFailed: true };
      }
    },
    []
  );

  useEffect(() => {
    if (!socket || !user) return;

    // ── Inbound message ────────────────────────────────────────────────────
    const onMessage = async (msg: Message) => {
      // We need the conversation to know type + other userId for DM key lookup
      const { conversations } = useChatStore.getState();
      let conv = conversations.find((c) => c._id === msg.conversation);

      if (!conv) {
        try {
          const { fetchConversation } = await import("@/lib/api/chat.api");
          conv = await fetchConversation(msg.conversation);
          if (conv) upsertConversation(conv);
        } catch {}
      }

      let decrypted = msg;
      if (conv) {
        const otherMember = conv.members.find((m) => m.user._id !== user._id);
        decrypted = await decryptMsg(msg, conv.type, otherMember?.user._id, conv._id, otherMember?.user.keyVersion);
      }

      appendMessage(msg.conversation, decrypted);

      // Update conversation preview + bump to top
      if (conv) {
        upsertConversation({
          ...conv,
          lastMessage: msg,
          lastActivityAt: msg.createdAt,
          // Increment unread only if not the active conversation and not sent by me
          unreadCount:
            activeConvRef.current !== msg.conversation && msg.sender._id !== user._id
              ? (conv.unreadCount || 0) + 1
              : conv.unreadCount || 0
        });
      }
    };

    // ── New conversation created ───────────────────────────────────────────
    const onConversationCreated = (newConv: Conversation) => {
      upsertConversation(newConv);
    };

    // ── Typing ─────────────────────────────────────────────────────────────
    const onTyping = (payload: TypingPayload) => {
      if (payload.userId === user._id) return; // ignore own typing
      handleTyping(payload);
    };

    // ── Read receipt ───────────────────────────────────────────────────────
    const onRead = (payload: ReadReceiptPayload) => {
      if (payload.userId === user._id) {
        markConversationRead(payload.conversationId);
      }
    };

    // ── Reactions ──────────────────────────────────────────────────────────
    const onReaction = ({ messageId, conversationId, reactions }: ReactionPayload) => {
      const { messages } = useChatStore.getState();
      const msgs = messages[conversationId] || [];
      const msg = msgs.find((m) => m._id === messageId);
      if (msg) {
        updateMessage(conversationId, { ...msg, reactions });
      }
    };

    // ── Message deleted (for everyone) ─────────────────────────────────────
    const onDeleted = ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      removeMessage(conversationId, messageId);
    };

    // ── Message deleted for me (syncs across this user's other tabs/devices) ─
    const onDeletedForMe = ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      hideMessageForMe(conversationId, messageId);
    };

    // ── Presence ───────────────────────────────────────────────────────────
    const onPresence = (payload: PresencePayload) => {
      handlePresence(payload);
    };

    // ── Group: member added ────────────────────────────────────────────────
    const onMemberAdded = ({ conversationId, user: newUser }: MemberAddedPayload) => {
      const { conversations } = useChatStore.getState();
      const conv = conversations.find((c) => c._id === conversationId);
      if (conv && !conv.members.some((m) => m.user._id === newUser._id)) {
        upsertConversation({
          ...conv,
          members: [...conv.members, { user: newUser, role: "member", joinedAt: new Date().toISOString(), lastRead: null }]
        });
      }
    };

    // ── Group: member removed ──────────────────────────────────────────────
    const onMemberRemoved = ({ conversationId, userId }: MemberRemovedPayload) => {
      const { conversations } = useChatStore.getState();
      const conv = conversations.find((c) => c._id === conversationId);
      if (conv) {
        upsertConversation({
          ...conv,
          members: conv.members.filter((m) => m.user._id !== userId)
        });
      }
    };

    // ── Group: re-key ──────────────────────────────────────────────────────────
    const onRekey = ({ conversationId, groupKeys }: RekeyPayload) => {
      const { conversations } = useChatStore.getState();
      const conv = conversations.find((c) => c._id === conversationId);
      if (conv) {
        upsertConversation({ ...conv, groupKeys });
      }
    };

    // ── Message edited ─────────────────────────────────────────────────────────
    const onEdited = async ({
      messageId,
      conversationId,
      ciphertext,
      iv,
      editedAt
    }: { messageId: string; conversationId: string; ciphertext: string; iv: string; editedAt: string }) => {
      const { messages, conversations } = useChatStore.getState();
      const msgs = messages[conversationId] || [];
      const msg = msgs.find((m) => m._id === messageId);
      if (!msg) return;

      const conv = conversations.find((c) => c._id === conversationId);
      let decryptedContent: string | undefined;
      try {
        const otherMember = conv?.members.find((m) => m.user._id !== user._id);
        const cacheKey =
          conv?.type === "dm" && user
            ? dmCacheKey(otherMember?.user._id || "", otherMember?.user.keyVersion)
            : groupCacheKey(conversationId);
        const sessionKey = getCachedSessionKey(cacheKey);
        if (sessionKey) {
          decryptedContent = await decryptMessage(ciphertext, iv, sessionKey);
        }
      } catch {}

      updateMessage(conversationId, {
        ...msg,
        ciphertext,
        iv,
        decryptedContent,
        isEdited: true,
        editedAt
      });
    };

    // Register all listeners
    socket.on("chat:message", onMessage);
    socket.on("conversation:created", onConversationCreated);
    socket.on("chat:typing", onTyping);
    socket.on("chat:read", onRead);
    socket.on("chat:reaction", onReaction);
    socket.on("chat:message:deleted", onDeleted);
    socket.on("chat:message:deletedForMe", onDeletedForMe);
    socket.on("chat:message:edited", onEdited);
    socket.on("presence:update", onPresence);
    socket.on("chat:member:added", onMemberAdded);
    socket.on("chat:member:removed", onMemberRemoved);
    socket.on("chat:rekey", onRekey);

    // Presence heartbeat every 60s
    const heartbeat = setInterval(() => {
      socket.emit("presence:heartbeat");
    }, 60_000);

    return () => {
      socket.off("chat:message", onMessage);
      socket.off("conversation:created", onConversationCreated);
      socket.off("chat:typing", onTyping);
      socket.off("chat:read", onRead);
      socket.off("chat:reaction", onReaction);
      socket.off("chat:message:deleted", onDeleted);
      socket.off("chat:message:deletedForMe", onDeletedForMe);
      socket.off("chat:message:edited", onEdited);
      socket.off("presence:update", onPresence);
      socket.off("chat:member:added", onMemberAdded);
      socket.off("chat:member:removed", onMemberRemoved);
      socket.off("chat:rekey", onRekey);
      clearInterval(heartbeat);
    };
  }, [socket, user]);
};

/**
 * Emits join/leave conversation room events when the active conversation changes.
 */
export const useJoinConversation = (conversationId: string | null) => {
  const socket = getSocket();

  useEffect(() => {
    if (!socket || !conversationId) return;
    socket.emit("join:conversation", { conversationId });
    return () => {
      socket.emit("leave:conversation", { conversationId });
    };
  }, [socket, conversationId]);
};

/**
 * Returns a function to emit typing start/stop, debounced.
 */
export const useSendTyping = (conversationId: string | null) => {
  const socket = getSocket();
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const sendTyping = useCallback(() => {
    if (!socket || !conversationId) return;

    // Only emit "start" once per typing burst instead of on every keystroke —
    // previously this fired a socket event on every single character typed.
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("chat:typing:start", { conversationId });
    }

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit("chat:typing:stop", { conversationId });
    }, 2000);
  }, [socket, conversationId]);

  useEffect(
    () => () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (isTypingRef.current && socket && conversationId) {
        socket.emit("chat:typing:stop", { conversationId });
      }
    },
    [socket, conversationId]
  );

  return sendTyping;
};
