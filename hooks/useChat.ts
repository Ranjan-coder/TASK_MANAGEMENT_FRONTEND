"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import {
  ConversationCrypto,
  getConversationCrypto,
  registerConversationCrypto,
  rotateConversationGroupKey
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
import {
  initChatOutbox,
  restoreChatOutbox,
  resumeChatOutbox,
  localMessageFromEntry
} from "@/lib/chat/chatOutbox";
import { findIndexById, localIdFor } from "@/lib/chat/messageStore";
import type { ReceiptPayload } from "@/store/chatStore";
import { initDrafts } from "@/lib/chat/drafts";

/**
 * Hook that subscribes to all chat-related socket events.
 * Must be mounted once in the chat layout — handles all inbound events.
 *
 * Decryption happens here via the conversation's ConversationCrypto (which
 * picks the right key version per message), then decryptedContent is attached.
 */

/** A message by id in a chat or any loaded thread (reactions and edits can target either). */
const findAnywhere = (convId: string, id: string): Message | undefined => {
  const s = useChatStore.getState();
  for (const list of [s.messages[convId] || [], ...Object.values(s.threads)]) {
    const i = findIndexById(list, id);
    if (i >= 0) return list[i];
  }
  return undefined;
};

// ── Delivered (✓✓): newest time per chat, sent together at most every 2 s ────
const pendingDelivered = new Map<string, string>();
let deliveredTimer: ReturnType<typeof setTimeout> | null = null;
const flushDelivered = () => {
  deliveredTimer = null;
  if (!pendingDelivered.size) return;
  const socket = getSocket();
  if (!socket.connected) {
    deliveredTimer = setTimeout(flushDelivered, 5000); // try again once connected
    return;
  }
  const items = [...pendingDelivered].map(([conversationId, upTo]) => ({ conversationId, upTo }));
  pendingDelivered.clear();
  for (let i = 0; i < items.length; i += 50) socket.emit("chat:delivered", items.slice(i, i + 50));
};
/** My app received messages of this chat up to `upTo` (ISO time). */
export const queueDelivered = (conversationId: string, upTo: string) => {
  const cur = pendingDelivered.get(conversationId);
  if (!cur || new Date(upTo) > new Date(cur)) pendingDelivered.set(conversationId, upTo);
  if (!deliveredTimer) deliveredTimer = setTimeout(flushDelivered, 2000);
};

// ── Read while looking at the chat (blue ✓✓), at most every 1.5 s per chat ───
const readTimers = new Map<string, ReturnType<typeof setTimeout>>();
const readSoon = (conversationId: string) => {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return; // read when they come back
  if (readTimers.has(conversationId)) return;
  readTimers.set(
    conversationId,
    setTimeout(() => {
      readTimers.delete(conversationId);
      getSocket().emit("chat:read", { conversationId });
      useChatStore.getState().markConversationRead(conversationId);
    }, 1500)
  );
};

// ── Key help: share keys / replace a key without anyone opening the chat ──────
const KEY_HELP_COOLDOWN_MS = 30_000;
const keyHelpAt = new Map<string, number>();
const helpWithKeys = async (conversationId: string, user: { _id: string; role?: string }) => {
  const last = keyHelpAt.get(conversationId) || 0;
  if (Date.now() - last < KEY_HELP_COOLDOWN_MS) return; // one go per chat at a time
  keyHelpAt.set(conversationId, Date.now());
  try {
    const { fetchConversation } = await import("@/lib/api/chat.api");
    const conv = await fetchConversation(conversationId); // fresh keyring
    const mine = conv.members.find((m) => m.user?._id === user._id);
    if (conv.type !== "group" || mine?.role !== "admin" || user.role === "customer") return;
    if (conv.rekeyRequested && (conv.project || conv.internalFor)) {
      // Someone left the team: a new key, wrapped for the remaining members only
      await rotateConversationGroupKey(
        conv,
        user._id,
        conv.members.filter((m) => m.user).map((m) => ({ _id: m.user._id, publicKey: m.user.publicKey, keyVersion: m.user.keyVersion }))
      ).catch((err: { response?: { status?: number } }) => {
        if (err?.response?.status !== 409) throw err; // 409: a teammate replaced it first
      });
      return;
    }
    const c = await ConversationCrypto.create(conv, user._id);
    registerConversationCrypto(c);
    await c.healGroupKeys();
  } catch {
    // Keys locked on this device, or nothing this person can share: someone else will
  }
};

/** Fired when a conversation's keys change so an open chat re-resolves its keys. */
export const CHAT_KEYS_UPDATED_EVENT = "chat:keys-updated";
export const useChat = () => {
  const socket = getSocket();
  const user = useAuthStore((s) => s.user);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const hideMessageForMe = useChatStore((s) => s.hideMessageForMe);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const handleTyping = useChatStore((s) => s.handleTyping);
  const handlePresence = useChatStore((s) => s.handlePresence);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

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
      if (msg.type === "system" || msg.isDeleted) return msg;
      // Nothing to open: no text and no files (files need their key, see ConversationCrypto.decrypt)
      if ((!msg.ciphertext || !msg.iv) && !msg.attachments?.length) return msg;
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

      // Our own message, still shown as pending here: we have its text, no need to decrypt
      const pendingHere =
        msg.clientMsgId &&
        findIndexById(useChatStore.getState().messages[msg.conversation] || [], localIdFor(msg.clientMsgId)) >= 0;
      const decrypted = conv && !pendingHere ? await decryptMsg(msg, conv) : msg;

      appendMessage(msg.conversation, decrypted);

      if (msg.sender._id !== user._id) {
        // My app has it: ✓✓ for the sender. On screen: it's read too.
        queueDelivered(msg.conversation, msg.createdAt);
        if (activeConvRef.current === msg.conversation) readSoon(msg.conversation);
      }

      // A reply only inside a thread doesn't change the chat's preview or unread count
      if (msg.threadRoot && !msg.alsoInChat) {
        const pingsMe = Boolean(msg.mentionsAll) || Boolean(msg.mentions?.includes(user._id));
        if (conv && pingsMe && activeConvRef.current !== msg.conversation && msg.sender._id !== user._id) {
          upsertConversation({ ...conv, mentionCount: (conv.mentionCount || 0) + 1 });
        }
        return;
      }

      // Update conversation preview + bump to top
      if (conv) {
        // Unread counts only grow for chats not on screen, and never for my own messages
        const counts = activeConvRef.current !== msg.conversation && msg.sender._id !== user._id;
        const pingsMe = Boolean(msg.mentionsAll) || Boolean(msg.mentions?.includes(user._id));
        upsertConversation({
          ...conv,
          lastMessage: msg,
          lastActivityAt: msg.createdAt,
          unreadCount: counts ? (conv.unreadCount || 0) + 1 : conv.unreadCount || 0,
          mentionCount: counts && pingsMe ? (conv.mentionCount || 0) + 1 : conv.mentionCount || 0
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
      const msg = findAnywhere(conversationId, messageId);
      if (msg) updateMessage(conversationId, { ...msg, reactions });
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
      const { conversations } = useChatStore.getState();
      const msg = findAnywhere(conversationId, messageId);
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

    // Reconnected: send what's waiting now rather than after the next backoff
    const onConnect = () => resumeChatOutbox();

    // Someone received or read messages in a chat open here (ticks)
    const onReceipt = (payload: ReceiptPayload) => useChatStore.getState().applyReceiptEvent(payload);

    // A teammate is waiting for this chat's key (just added, or new device), or a
    // removal needs a new key: as a group admin, handle it now in the background
    const onKeysNeeded = ({ conversationId }: { conversationId: string }) => helpWithKeys(conversationId, user);

    // I starred / unstarred on another device
    const onStarred = ({ messageId, starred }: { messageId: string; starred: boolean }) => {
      const s = useChatStore.getState();
      for (const convId of Object.keys(s.messages)) s.patchMessage(convId, messageId, { starred });
    };

    // A thread got a reply: its root's "N replies" line updates
    const onThreadUpdated = ({
      conversationId,
      rootId,
      ...patch
    }: { conversationId: string; rootId: string; threadReplyCount: number; threadLastReplyAt: string; threadParticipants: string[] }) =>
      useChatStore.getState().patchThreadRoot(conversationId, rootId, patch);

    // My notification choice changed (here or on another device)
    const onNotify = ({ conversationId, notify, mutedUntil }: { conversationId: string; notify: Conversation["notify"]; mutedUntil: string | null }) => {
      const conv = useChatStore.getState().conversations.find((c) => c._id === conversationId);
      if (conv) upsertConversation({ ...conv, notify, mutedUntil });
    };

    // Register all listeners
    socket.on("connect", onConnect);
    socket.on("chat:notify", onNotify);
    socket.on("chat:receipt", onReceipt);
    socket.on("chat:thread:updated", onThreadUpdated);
    socket.on("chat:starred", onStarred);
    socket.on("chat:keys:needed", onKeysNeeded);
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

    // Back to this tab with a chat open: what arrived meanwhile is read now
    const onVisible = () => {
      if (document.visibilityState === "visible" && activeConvRef.current) readSoon(activeConvRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.off("connect", onConnect);
      socket.off("chat:notify", onNotify);
      socket.off("chat:receipt", onReceipt);
      socket.off("chat:thread:updated", onThreadUpdated);
      socket.off("chat:starred", onStarred);
      socket.off("chat:keys:needed", onKeysNeeded);
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
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [socket, user]);

  // ── Outbox: messages a previous visit left unsent ─────────────────────────
  // Shown (decrypted here; storage holds ciphertext only) once the conversation
  // list is in, then sent. Retries reuse their clientMsgId, so nothing doubles.
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const restoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !conversationsLoaded || restoredForRef.current === user._id) return;
    restoredForRef.current = user._id;
    initDrafts(user._id); // unsent text per chat, from this device

    // Everything in the list has reached this device: ✓✓ for the senders
    for (const c of useChatStore.getState().conversations) {
      const last = c.lastMessage;
      const senderId = last ? String((last.sender as unknown as { _id?: string })?._id ?? last.sender) : null;
      if (last && senderId !== user._id) queueDelivered(c._id, last.createdAt);
    }

    (async () => {
      const entries = await initChatOutbox(user._id);
      const { conversations, addLocal } = useChatStore.getState();
      const sendable = [];
      for (const entry of entries) {
        const conv = conversations.find((c) => c._id === entry.conversationId);
        if (!conv) continue; // no longer a member: the server would refuse it anyway
        addLocal(conv._id, await decryptMsg(localMessageFromEntry(entry, user), conv));
        sendable.push(entry);
      }
      restoreChatOutbox(sendable);
    })().catch((err) => console.warn("Unsent messages couldn't be restored:", err));
  }, [user, conversationsLoaded, decryptMsg]);
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
