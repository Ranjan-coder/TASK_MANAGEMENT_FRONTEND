import { create } from "zustand";
import { Conversation, Message, TypingPayload, PresencePayload } from "@/types/chat";
import { applyReceipt, type ReceiptState } from "@/lib/chat/receipts";

/** Live receipt from the server (team view: userId + times; customer view: team times only) */
export interface ReceiptPayload {
  conversationId: string;
  userId?: string;
  lastRead?: string;
  lastDelivered?: string;
  teamLastRead?: string;
  teamLastDelivered?: string;
}
import {
  LruKeys,
  confirmLocal,
  findIndexById,
  insertMessage,
  isLocal,
  mergeMessages,
  replaceMessage,
  replaceWithPage,
  updateById
} from "@/lib/chat/messageStore";

/** Conversations whose messages stay in memory; older ones reload when reopened. */
export const MAX_CACHED_CONVERSATIONS = 20;

interface ChatState {
  // ── Data ──────────────────────────────────────────────────────────────────
  conversations: Conversation[];
  activeConversationId: string | null;
  /** Messages keyed by conversationId, in order (lib/chat/messageStore.ts): oldest → newest, then unsent. */
  messages: Record<string, Message[]>;
  /** Typing users: conversationId → Set of userNames currently typing */
  typingUsers: Record<string, Set<string>>;
  /** Set of userIds currently online (from Redis presence) */
  onlineUsers: Set<string>;
  /** Total unread messages across all conversations */
  totalUnread: number;
  /** Whether the conversation list has been loaded */
  conversationsLoaded: boolean;
  /** Delivered / read times of the others in each open chat (lib/chat/receipts.ts) */
  receipts: Record<string, ReceiptState>;
  /** Loaded threads: root message id → replies, in order (same rules as `messages`) */
  threads: Record<string, Message[]>;

  // ── Conversation actions ──────────────────────────────────────────────────
  setConversations: (convs: Conversation[]) => void;
  upsertConversation: (conv: Conversation) => void;
  removeConversation: (convId: string) => void;
  setActiveConversation: (id: string | null) => void;
  markConversationRead: (convId: string) => void;

  // ── Message actions ───────────────────────────────────────────────────────
  /** A freshly fetched page (keeps unsent messages and ones that arrived meanwhile). */
  setMessages: (convId: string, msgs: Message[]) => void;
  /** An older page ("load previous messages"); duplicates are dropped. */
  prependMessages: (convId: string, msgs: Message[]) => void;
  /** A message from the server (live event or confirmed send), placed in order. */
  appendMessage: (convId: string, msg: Message) => void;
  updateMessage: (convId: string, msg: Message) => void;
  /** "Delete for everyone" — marks the message as deleted in place (shows the "Message deleted" placeholder). */
  removeMessage: (convId: string, msgId: string) => void;
  /** "Delete for me" — removes the message from local state entirely, as if it never existed for this viewer. */
  hideMessageForMe: (convId: string, msgId: string) => void;

  // ── Unsent messages (lib/chat/chatOutbox.ts) ──────────────────────────────
  addLocal: (convId: string, msg: Message) => void;
  setLocalStatus: (convId: string, localId: string, status: "sending" | "failed", error?: string) => void;
  removeLocal: (convId: string, localId: string) => void;
  /** The server saved a message typed here: it replaces the pending copy. */
  confirmSent: (convId: string, saved: Message) => void;

  // ── Receipts ──────────────────────────────────────────────────────────────
  initReceipts: (convId: string, state: ReceiptState) => void;
  applyReceiptEvent: (payload: ReceiptPayload) => void;

  // ── Threads ───────────────────────────────────────────────────────────────
  setThread: (rootId: string, msgs: Message[]) => void;
  prependThread: (rootId: string, msgs: Message[]) => void;
  /** A root's reply count / last reply / faces changed */
  patchThreadRoot: (convId: string, rootId: string, patch: Partial<Message>) => void;

  // ── Jumps, stars ──────────────────────────────────────────────────────────
  /** A window around a jumped-to message replaces the list (unsent messages stay). */
  replaceWindow: (convId: string, msgs: Message[]) => void;
  /** Newer messages after a jump */
  appendPage: (convId: string, msgs: Message[]) => void;
  /** Changes one message by id in the chat and any loaded thread (e.g. ★) */
  patchMessage: (convId: string, msgId: string, patch: Partial<Message>) => void;

  // ── Presence & Typing ─────────────────────────────────────────────────────
  handlePresence: (payload: PresencePayload) => void;
  handleTyping: (payload: TypingPayload) => void;

  // ── Reset ─────────────────────────────────────────────────────────────────
  reset: () => void;
}

const initialState = {
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  onlineUsers: new Set<string>(),
  totalUnread: 0,
  conversationsLoaded: false,
  receipts: {},
  threads: {}
};

// Which conversations' messages were used most recently (memory bound)
const recent = new LruKeys(MAX_CACHED_CONVERSATIONS);
const recentThreads = new LruKeys(10);

/** Where a message belongs: the chat itself, its thread, or both (a reply also sent to the chat). */
const placesOf = (msg: Message) => ({
  main: !msg.threadRoot || Boolean(msg.alsoInChat),
  thread: msg.threadRoot || null
});

export const useChatStore = create<ChatState>((set) => {
  /**
   * Writes one conversation's message list. Unchanged lists don't trigger a
   * render; a conversation pushed out of the LRU is dropped from memory
   * unless it's open or still has unsent messages.
   */
  const writeMessages = (convId: string, fn: (list: Message[]) => Message[]) =>
    set((state) => {
      const current = state.messages[convId] || [];
      const next = fn(current);
      if (next === current && convId in state.messages) return {};
      const messages = { ...state.messages, [convId]: next };
      const evicted = recent.touch(
        convId,
        (k) => k === state.activeConversationId || (messages[k] || []).some(isLocal)
      );
      for (const k of evicted) delete messages[k];
      return { messages };
    });

  /** Same for a thread; `onlyIfLoaded` skips threads nobody opened (live replies to closed threads). */
  const writeThread = (rootId: string, fn: (list: Message[]) => Message[], onlyIfLoaded = false) =>
    set((state) => {
      if (onlyIfLoaded && !(rootId in state.threads)) return {};
      const current = state.threads[rootId] || [];
      const next = fn(current);
      if (next === current && rootId in state.threads) return {};
      const threads = { ...state.threads, [rootId]: next };
      for (const k of recentThreads.touch(rootId, (k) => (threads[k] || []).some(isLocal))) delete threads[k];
      return { threads };
    });

  /** Applies a change by id to every loaded thread (ids are unique, so at most one changes). */
  const writeAllThreads = (fn: (list: Message[]) => Message[]) =>
    set((state) => {
      let changed = false;
      const threads: Record<string, Message[]> = {};
      for (const [k, list] of Object.entries(state.threads)) {
        const next = fn(list);
        threads[k] = next;
        if (next !== list) changed = true;
      }
      return changed ? { threads } : {};
    });

  /** Puts a message wherever it belongs (chat, thread or both). */
  const place = (convId: string, msg: Message, fn: (list: Message[]) => Message[], threadOnlyIfLoaded: boolean) => {
    const { main, thread } = placesOf(msg);
    if (main) writeMessages(convId, fn);
    if (thread) writeThread(thread, fn, threadOnlyIfLoaded);
  };

  return {
    ...initialState,

    // ── Conversation actions ────────────────────────────────────────────────

    setConversations: (convs) => {
      const totalUnread = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      set({ conversations: convs, totalUnread, conversationsLoaded: true });
    },

    upsertConversation: (conv) =>
      set((state) => {
        const idx = state.conversations.findIndex((c) => c._id === conv._id);
        let next: Conversation[];
        if (idx >= 0) {
          next = [...state.conversations];
          next[idx] = conv;
        } else {
          next = [conv, ...state.conversations];
        }
        // Re-sort by lastActivityAt descending
        next.sort(
          (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
        );
        const totalUnread = next.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        return { conversations: next, totalUnread };
      }),

    removeConversation: (convId) =>
      set((state) => {
        const messages = { ...state.messages };
        delete messages[convId];
        recent.delete(convId);
        return {
          conversations: state.conversations.filter((c) => c._id !== convId),
          messages,
          activeConversationId: state.activeConversationId === convId ? null : state.activeConversationId
        };
      }),

    setActiveConversation: (id) => set({ activeConversationId: id }),

    markConversationRead: (convId) =>
      set((state) => {
        const convs = state.conversations.map((c) =>
          c._id === convId ? { ...c, unreadCount: 0, mentionCount: 0 } : c
        );
        const totalUnread = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        return { conversations: convs, totalUnread };
      }),

    // ── Message actions ─────────────────────────────────────────────────────

    setMessages: (convId, msgs) => writeMessages(convId, (list) => replaceWithPage(list, msgs)),

    prependMessages: (convId, msgs) => writeMessages(convId, (list) => mergeMessages(list, msgs)),

    appendMessage: (convId, msg) =>
      place(
        convId,
        msg,
        (list) => {
          // Our own message coming back (live echo or send response): swap out the pending copy
          if (msg.clientMsgId) return confirmLocal(list, msg);
          // Already shown (e.g. the send response arrived first): keep the decrypted copy
          if (findIndexById(list, msg._id) >= 0) return list;
          return insertMessage(list, msg);
        },
        true
      ),

    updateMessage: (convId, msg) => {
      writeMessages(convId, (list) => replaceMessage(list, msg));
      writeAllThreads((list) => replaceMessage(list, msg));
    },

    removeMessage: (convId, msgId) => {
      const del = (list: Message[]) =>
        updateById(list, msgId, (m) => ({ ...m, isDeleted: true, ciphertext: undefined, iv: undefined }));
      writeMessages(convId, del);
      writeAllThreads(del);
    },

    hideMessageForMe: (convId, msgId) => {
      writeMessages(convId, (list) => updateById(list, msgId, () => null));
      writeAllThreads((list) => updateById(list, msgId, () => null));
    },

    // ── Unsent messages ─────────────────────────────────────────────────────

    addLocal: (convId, msg) => place(convId, msg, (list) => insertMessage(list, msg), false),

    setLocalStatus: (convId, localId, status, error) => {
      const mark = (list: Message[]) =>
        updateById(list, localId, (m) =>
          m.localStatus === status && m.localError === error ? m : { ...m, localStatus: status, localError: error }
        );
      writeMessages(convId, mark);
      writeAllThreads(mark);
    },

    removeLocal: (convId, localId) => {
      writeMessages(convId, (list) => updateById(list, localId, () => null));
      writeAllThreads((list) => updateById(list, localId, () => null));
    },

    confirmSent: (convId, saved) => place(convId, saved, (list) => confirmLocal(list, saved), true),

    // ── Receipts ────────────────────────────────────────────────────────────

    initReceipts: (convId, receiptState) => set((state) => ({ receipts: { ...state.receipts, [convId]: receiptState } })),

    applyReceiptEvent: (payload) =>
      set((state) => {
        const cur = state.receipts[payload.conversationId];
        if (!cur) return {}; // chat not open here: nothing shows ticks for it
        const next = applyReceipt(cur, payload);
        return next === cur ? {} : { receipts: { ...state.receipts, [payload.conversationId]: next } };
      }),

    // ── Threads ─────────────────────────────────────────────────────────────

    setThread: (rootId, msgs) => writeThread(rootId, (list) => replaceWithPage(list, msgs)),

    prependThread: (rootId, msgs) => writeThread(rootId, (list) => mergeMessages(list, msgs)),

    patchThreadRoot: (convId, rootId, patch) =>
      writeMessages(convId, (list) => updateById(list, rootId, (m) => ({ ...m, ...patch }))),

    // ── Jumps, stars ────────────────────────────────────────────────────────

    replaceWindow: (convId, msgs) =>
      writeMessages(convId, (list) => mergeMessages(list.filter(isLocal), msgs)),

    appendPage: (convId, msgs) => writeMessages(convId, (list) => mergeMessages(list, msgs)),

    patchMessage: (convId, msgId, patch) => {
      const fn = (list: Message[]) => updateById(list, msgId, (m) => ({ ...m, ...patch }));
      writeMessages(convId, fn);
      writeAllThreads(fn);
    },

    // ── Presence & Typing ───────────────────────────────────────────────────

    handlePresence: ({ userId, isOnline }) =>
      set((state) => {
        if (state.onlineUsers.has(userId) === isOnline) return state; // no change → no re-render
        const next = new Set(state.onlineUsers);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return { onlineUsers: next };
      }),

    handleTyping: ({ conversationId, name, isTyping }) =>
      set((state) => {
        const existing = state.typingUsers[conversationId];
        if (Boolean(existing?.has(name)) === isTyping) return state; // repeat event → no re-render
        const current = new Set(existing || []);
        if (isTyping) current.add(name);
        else current.delete(name);
        return {
          typingUsers: { ...state.typingUsers, [conversationId]: current }
        };
      }),

    // ── Reset ───────────────────────────────────────────────────────────────

    reset: () => {
      recent.clear();
      recentThreads.clear();
      set({ ...initialState, onlineUsers: new Set() });
    }
  };
});
