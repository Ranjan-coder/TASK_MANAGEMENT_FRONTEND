import { create } from "zustand";
import { Conversation, Message, TypingPayload, PresencePayload } from "@/types/chat";

interface ChatState {
  // ── Data ──────────────────────────────────────────────────────────────────
  conversations: Conversation[];
  activeConversationId: string | null;
  /** Messages keyed by conversationId. Each array is in ascending (oldest→newest) order. */
  messages: Record<string, Message[]>;
  /** Typing users: conversationId → Set of userNames currently typing */
  typingUsers: Record<string, Set<string>>;
  /** Set of userIds currently online (from Redis presence) */
  onlineUsers: Set<string>;
  /** Total unread messages across all conversations */
  totalUnread: number;
  /** Whether the conversation list has been loaded */
  conversationsLoaded: boolean;

  // ── Conversation actions ──────────────────────────────────────────────────
  setConversations: (convs: Conversation[]) => void;
  upsertConversation: (conv: Conversation) => void;
  setActiveConversation: (id: string | null) => void;
  markConversationRead: (convId: string) => void;

  // ── Message actions ───────────────────────────────────────────────────────
  setMessages: (convId: string, msgs: Message[]) => void;
  prependMessages: (convId: string, msgs: Message[]) => void;
  appendMessage: (convId: string, msg: Message) => void;
  updateMessage: (convId: string, msg: Message) => void;
  removeMessage: (convId: string, msgId: string) => void;

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
  conversationsLoaded: false
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  // ── Conversation actions ──────────────────────────────────────────────────

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

  setActiveConversation: (id) => set({ activeConversationId: id }),

  markConversationRead: (convId) =>
    set((state) => {
      const convs = state.conversations.map((c) =>
        c._id === convId ? { ...c, unreadCount: 0 } : c
      );
      const totalUnread = convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      return { conversations: convs, totalUnread };
    }),

  // ── Message actions ───────────────────────────────────────────────────────

  setMessages: (convId, msgs) =>
    set((state) => ({
      messages: { ...state.messages, [convId]: msgs }
    })),

  prependMessages: (convId, msgs) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: [...msgs, ...(state.messages[convId] || [])]
      }
    })),

  appendMessage: (convId, msg) =>
    set((state) => {
      const existing = state.messages[convId] || [];
      // Avoid duplicates (optimistic + confirmed)
      if (existing.some((m) => m._id === msg._id)) return {};
      return {
        messages: { ...state.messages, [convId]: [...existing, msg] }
      };
    }),

  updateMessage: (convId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: (state.messages[convId] || []).map((m) => (m._id === msg._id ? msg : m))
      }
    })),

  removeMessage: (convId, msgId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: (state.messages[convId] || []).map((m) =>
          m._id === msgId ? { ...m, isDeleted: true, ciphertext: undefined, iv: undefined } : m
        )
      }
    })),

  // ── Presence & Typing ─────────────────────────────────────────────────────

  handlePresence: ({ userId, isOnline }) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      if (isOnline) next.add(userId);
      else next.delete(userId);
      return { onlineUsers: next };
    }),

  handleTyping: ({ conversationId, name, isTyping }) =>
    set((state) => {
      const current = new Set(state.typingUsers[conversationId] || []);
      if (isTyping) current.add(name);
      else current.delete(name);
      return {
        typingUsers: { ...state.typingUsers, [conversationId]: current }
      };
    }),

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset: () => set({ ...initialState, onlineUsers: new Set() })
}));
