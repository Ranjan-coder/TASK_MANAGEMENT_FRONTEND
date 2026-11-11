/**
 * lib/chat/chatOutbox.ts — the app's single outbox (lib/chat/outbox.ts) wired
 * to the API, the chat store and this device's storage.
 *
 * A message is encrypted once, before it is queued; retries resend the same
 * ciphertext with the same clientMsgId. Pending messages are stored encrypted
 * next to the chat keys (wiped at sign-out, memory only on shared computers),
 * so a reload or a dropped connection doesn't lose what someone typed.
 */
import { Outbox, type OutboxEntry } from "./outbox";
import { localIdFor } from "./messageStore";
import { sendMessage } from "@/lib/api/chat.api";
import { saveOutbox, loadOutbox } from "@/lib/crypto/keyStore";
import { useChatStore } from "@/store/chatStore";
import type { Message, SendMessageBody } from "@/types/chat";

export type OutboxBody = SendMessageBody & { clientMsgId: string };
export type ChatOutboxEntry = OutboxEntry<OutboxBody>;

let outbox: Outbox<OutboxBody, Message> | null = null;
let ownerId: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
// Saving waits until the earlier visit's messages are back in the queue;
// otherwise a quick first send would overwrite them on disk.
let restored = false;

type HttpError = { response?: { status?: number; data?: { message?: string } } };

/** Offline, server errors, rate limits and timeouts are worth retrying; other refusals aren't. */
export const classifySendError = (err: unknown): "retry" | "fail" => {
  const status = (err as HttpError)?.response?.status;
  if (!status) return "retry";
  return status >= 500 || status === 408 || status === 429 ? "retry" : "fail";
};

const schedulePersist = () => {
  if (!restored) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!outbox || !ownerId) return;
    saveOutbox(ownerId, outbox.pending()).catch(() => {});
  }, 150);
};

const onSent = (entry: ChatOutboxEntry, saved: Message) => {
  const store = useChatStore.getState();
  store.confirmSent(entry.conversationId, saved);
  const conv = store.conversations.find((c) => c._id === entry.conversationId);
  if (conv) store.upsertConversation({ ...conv, lastMessage: saved, lastActivityAt: saved.createdAt });
};

const onChange = (entry: ChatOutboxEntry) => {
  useChatStore
    .getState()
    .setLocalStatus(entry.conversationId, localIdFor(entry.clientMsgId), entry.status === "failed" ? "failed" : "sending", entry.error);
};

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
const onOnline = () => outbox?.resume();

/** The outbox for this person, created on first use (synchronously, so a send never waits). */
const ensureOutbox = (userId: string): Outbox<OutboxBody, Message> => {
  if (outbox && ownerId === userId) return outbox;
  resetChatOutbox();
  ownerId = userId;
  outbox = new Outbox<OutboxBody, Message>({
    send: (e) => sendMessage(e.conversationId, e.body),
    classify: classifySendError,
    describe: (err) => (err as HttpError)?.response?.data?.message || "Not sent",
    onSent,
    onChange,
    storage: { put: schedulePersist, remove: schedulePersist },
    isOnline
  });
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  return outbox;
};

/**
 * Starts the outbox for this person and returns the messages an earlier visit
 * left unsent (the caller decrypts them for display, then calls restore).
 */
export const initChatOutbox = async (userId: string): Promise<ChatOutboxEntry[]> => {
  ensureOutbox(userId);
  try {
    const saved = await loadOutbox<ChatOutboxEntry>(userId);
    const known = new Set(outbox!.pending().map((e) => e.clientMsgId));
    return saved.filter((e) => !known.has(e.clientMsgId));
  } catch {
    return [];
  }
};

/** Starts sending messages returned by initChatOutbox (after they're shown). */
export const restoreChatOutbox = (entries: ChatOutboxEntry[]) => {
  outbox?.restore(entries);
  restored = true;
  schedulePersist(); // saves sends made meanwhile; drops entries not restored (chats left since)
};

/** Shows the message at once and queues it for sending. */
export const queueMessage = (entry: { conversationId: string; body: OutboxBody; local: Message }) => {
  const box = ensureOutbox(entry.local.sender._id);
  useChatStore.getState().addLocal(entry.conversationId, entry.local);
  box.enqueue({ clientMsgId: entry.body.clientMsgId, conversationId: entry.conversationId, body: entry.body });
};

export const retryMessage = (clientMsgId: string) => outbox?.retry(clientMsgId);

export const discardMessage = (conversationId: string, clientMsgId: string) => {
  if (outbox?.discard(clientMsgId)) useChatStore.getState().removeLocal(conversationId, localIdFor(clientMsgId));
};

/** Connection is back: send now instead of waiting for the next retry. */
export const resumeChatOutbox = () => outbox?.resume();

/** Sign-out: forget everything queued in this tab (storage is wiped with the keys). */
export const resetChatOutbox = () => {
  outbox?.clear();
  outbox = null;
  ownerId = null;
  restored = false;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
};

/** A pending message for display, rebuilt from its saved (encrypted) request. */
export const localMessageFromEntry = (entry: ChatOutboxEntry, sender: Message["sender"]): Message => ({
  _id: localIdFor(entry.clientMsgId),
  clientMsgId: entry.clientMsgId,
  conversation: entry.conversationId,
  sender,
  type: "text",
  ciphertext: entry.body.ciphertext,
  iv: entry.body.iv,
  keyRef: entry.body.keyRef,
  franking: entry.body.franking,
  mentions: entry.body.mentions,
  mentionsAll: entry.body.mentionsAll,
  threadRoot: entry.body.threadRoot ?? null,
  alsoInChat: entry.body.alsoInChat,
  attachments: [],
  reactions: [],
  isEdited: false,
  isDeleted: false,
  createdAt: new Date(entry.createdAt).toISOString(),
  updatedAt: new Date(entry.createdAt).toISOString(),
  localStatus: entry.status === "failed" ? "failed" : "sending",
  localError: entry.error
});
