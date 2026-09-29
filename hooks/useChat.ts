"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import {
  ConversationCrypto,
  getConversationCrypto,
  registerConversationCrypto
} from "@/lib/crypto/conversationKeys";
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
import { decryptTextWith } from "@/lib/crypto/conversationKeys";

/**
 * Hook that subscribes to all chat-related socket events.
 * Must be mounted once in the chat layout — handles all inbound events.
 *
 * Decryption happens here via the conversation's ConversationCrypto (which
 * picks the right key version per message), then decryptedContent is attached.
 */

/** Fired when a conversation's keys change so an open chat re-resolves its keys. */
export const CHAT_KEYS_UPDATED_EVENT = "chat:keys-updated";
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

  // ── Crypto for a conversation (reuses the open chat's, or builds one) ────
  const cryptoFor = useCallback(
    async (conv: Conversation): Promise<ConversationCrypto | null> => {
      const existing = getConversationCrypto(conv._id);
      if (existing) return existing;
      if (!user) return null;
      try {
        const c = await ConversationCrypto.create(conv, user._id);
        registerConversationCrypto(c);
        return c;
      } catch {
        return null; // keys locked on this device
      }
    },
    [user]
  );

  const decryptMsg = useCallback(
    async (msg: Message, conv: Conversation): Promise<Message> => {
      if (msg.type === "system" || msg.isDeleted || !msg.ciphertext || !msg.iv) return msg;
      const c = await cryptoFor(conv);
      if (!c) return { ...msg, decryptedContent: "🔑 Decrypting...", decryptionFailed: false };
      return c.decrypt(msg);
    },
    [cryptoFor]
  );

  /** Swap in fresh conversation data (new key versions) and tell the open chat. */
  const refreshCrypto = useCallback(
    async (conv: Conversation) => {
      if (user && getConversationCrypto(conv._id)) {
        try {
          registerConversationCrypto(await ConversationCrypto.create(conv, user._id));
        } catch {}
      }
      window.dispatchEvent(new CustomEvent(CHAT_KEYS_UPDATED_EVENT, { detail: { conversationId: conv._id } }));
    },
    [user]
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

      const decrypted = conv ? await decryptMsg(msg, conv) : msg;

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
    const onMemberAdded = ({ conversationId, user: newUser, groupKeyring }: MemberAddedPayload) => {
      const { conversations } = useChatStore.getState();
      const conv = conversations.find((c) => c._id === conversationId);
      if (conv && !conv.members.some((m) => m.user._id === newUser._id)) {
        const updated: Conversation = {
          ...conv,
          members: [...conv.members, { user: newUser, role: "member", joinedAt: new Date().toISOString(), lastRead: null }],
          ...(groupKeyring ? { groupKeyring } : {})
        };
        upsertConversation(updated);
        refreshCrypto(updated);
      }
    };

    // ── Group: member removed ──────────────────────────────────────────────
    const onMemberRemoved = ({ conversationId, userId }: MemberRemovedPayload) => {
      // I was removed: drop the chat from this device
      if (userId === user._id) {
        useChatStore.getState().removeConversation(conversationId);
        if (window.location.pathname === `/chat/${conversationId}`) window.location.href = "/chat";
        return;
      }
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
    const onRekey = ({ conversationId, groupKeyring, groupKeys }: RekeyPayload) => {
      const { conversations } = useChatStore.getState();
      const conv = conversations.find((c) => c._id === conversationId);
      if (conv) {
        const updated: Conversation = { ...conv, groupKeyring, ...(groupKeys ? { groupKeys } : {}) };
        upsertConversation(updated);
        refreshCrypto(updated);
      }
    };

    // ── Project team / status changed (Admin → Projects) ───────────────────────
    const onProjectUpdated = (conv: Conversation) => {
      upsertConversation(conv);
      refreshCrypto(conv);
    };

    // ── Message edited ─────────────────────────────────────────────────────────
    const onEdited = async ({
      messageId,
      conversationId,
      ciphertext,
      iv,
      keyRef,
      franking,
      editedAt
    }: {
      messageId: string;
      conversationId: string;
      ciphertext: string;
      iv: string;
      keyRef?: Message["keyRef"];
      franking?: Message["franking"];
      editedAt: string;
    }) => {
      const { messages, conversations } = useChatStore.getState();
      const msgs = messages[conversationId] || [];
      const msg = msgs.find((m) => m._id === messageId);
      if (!msg) return;

      const conv = conversations.find((c) => c._id === conversationId);
      let opened: { text: string; frankingKey?: string; verified: boolean } | undefined;
      try {
        const c = conv ? await cryptoFor(conv) : null;
        const key = c ? await c.keyForMessage({ keyRef, sender: msg.sender, ciphertext, iv }) : null;
        if (key) opened = await decryptTextWith(key, ciphertext, iv, franking?.commitment);
      } catch {}

      updateMessage(conversationId, {
        ...msg,
        ciphertext,
        iv,
        keyRef,
        franking,
        decryptedContent: opened?.text,
        frankingKey: opened?.frankingKey,
        frankVerified: opened?.verified ?? false,
        isEdited: true,
        editedAt
      });
    };

    // Register all listeners
    socket.on("chat:message", onMessage);
    socket.on("conversation:created", onConversationCreated);
    socket.on("chat:project:updated", onProjectUpdated);
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
      socket.off("chat:project:updated", onProjectUpdated);
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
