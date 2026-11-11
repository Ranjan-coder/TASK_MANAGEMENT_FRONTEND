"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { fetchThread } from "@/lib/api/chat.api";
import { findIndexById } from "@/lib/chat/messageStore";
import type { MentionPerson } from "@/lib/chat/mentions";
import { useChatStore } from "@/store/chatStore";
import type { Message } from "@/types/chat";
import { MessageList, type MessageListHandle } from "./MessageList";
import { MessageInput } from "./MessageInput";

const NO_MESSAGES: Message[] = [];
const messageKey = (m: Message) => m._id;

interface Props {
  conversationId: string;
  rootId: string;
  onClose: () => void;
  /** Decrypts fetched messages with the chat's keys */
  decrypt: (msgs: Message[]) => Promise<Message[]>;
  onSend: (text: string, picked: MentionPerson[], thread: { threadRoot: string; alsoInChat: boolean }) => Promise<boolean | void>;
  /** Voice notes and scheduled replies inside the thread (P4) */
  onVoiceNote?: (blob: Blob, durationSec: number, mimeType: string, thread: { threadRoot: string; alsoInChat: boolean }) => Promise<void>;
  onSchedule?: (text: string, picked: MentionPerson[], sendAt: Date, thread: { threadRoot: string; alsoInChat: boolean }) => Promise<boolean | void>;
  /** Renders one row (the page's MessageRow with its actions); `list` gives the previous message */
  renderRow: (msg: Message, index: number, list: readonly Message[], inThread: boolean) => React.ReactNode;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * A thread beside the chat (chat-features-plan.md CH-T): the root message,
 * its replies (virtualised, same list as the chat) and a composer that can
 * also post the reply to the chat.
 */
export function ThreadPanel({ conversationId, rootId, onClose, decrypt, onSend, onVoiceNote, onSchedule, renderRow, disabled, placeholder }: Props) {
  const replies = useChatStore((s) => s.threads[rootId]) ?? NO_MESSAGES;
  // The chat's copy of the root has live reply counts; the fetched one is the fallback
  const liveRoot = useChatStore((s) => {
    const list = s.messages[conversationId];
    const i = list ? findIndexById(list, rootId) : -1;
    return i >= 0 ? list![i] : null;
  });
  const [fetchedRoot, setFetchedRoot] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [alsoInChat, setAlsoInChat] = useState(false);
  const listRef = useRef<MessageListHandle>(null);
  const root = liveRoot ?? fetchedRoot;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchThread(conversationId, rootId)
      .then(async (data) => {
        const [r, ...msgs] = await decrypt([data.root, ...data.messages]);
        if (cancelled) return;
        setFetchedRoot(r);
        useChatStore.getState().setThread(rootId, msgs);
        setHasMore(data.hasMore);
        setCursor(data.nextCursor);
      })
      .catch(() => !cancelled && toast.error("Couldn't open this thread"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, rootId, decrypt]);

  const busyRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (busyRef.current || !cursor) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const data = await fetchThread(conversationId, rootId, cursor);
      useChatStore.getState().prependThread(rootId, await decrypt(data.messages));
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch {
      toast.error("Couldn't load earlier replies");
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [conversationId, rootId, cursor, decrypt]);

  const rowFor = useCallback((msg: Message, i: number) => renderRow(msg, i, replies, true), [renderRow, replies]);

  return (
    <aside className="h-full flex flex-col bg-slate-950 border-l border-slate-800" aria-label="Thread">
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">Thread</p>
          <p className="text-[11px] text-slate-500">
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
            {hasMore ? "+" : ""}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close thread" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading && !root ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-5 w-5 rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {root && <div className="px-4 pt-4 pb-2 border-b border-slate-800/70 shrink-0 max-h-[40%] overflow-y-auto">{renderRow(root, 0, [root], true)}</div>}
          <MessageList
            key={rootId}
            ref={listRef}
            listId={`thread:${rootId}`}
            items={replies}
            getKey={messageKey}
            renderRow={rowFor}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onReachTop={loadMore}
          />
          <MessageInput
            onSend={async (text, picked) => {
              const sent = await onSend(text, picked, { threadRoot: rootId, alsoInChat });
              if (sent !== false) listRef.current?.scrollToBottom();
              return sent;
            }}
            disabled={disabled || !root || root.isDeleted}
            placeholder={placeholder ?? "Reply in thread…"}
            draftKey={`thread:${rootId}`}
            onVoiceNote={onVoiceNote ? (blob, sec, mime) => onVoiceNote(blob, sec, mime, { threadRoot: rootId, alsoInChat }) : undefined}
            onSchedule={onSchedule ? (text, picked, at) => onSchedule(text, picked, at, { threadRoot: rootId, alsoInChat }) : undefined}
            extraControls={
              <label className="flex items-center gap-2 px-4 pt-2 text-xs text-slate-400 cursor-pointer select-none">
                <input type="checkbox" checked={alsoInChat} onChange={(e) => setAlsoInChat(e.target.checked)} className="accent-violet-500" />
                Also send to the chat
              </label>
            }
          />
        </>
      )}
    </aside>
  );
}
