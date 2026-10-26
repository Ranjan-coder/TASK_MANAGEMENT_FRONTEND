"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { CalendarClock, ChevronDown, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cancelScheduled, fetchScheduled, type ScheduledItem } from "@/lib/api/chat.api";
import type { ConversationCrypto } from "@/lib/crypto/conversationKeys";
import { mentionsToPlain } from "@/lib/chat/mentions";
import type { Message } from "@/types/chat";
import type { User } from "@/types";
import { useMentions } from "./MentionContext";

export interface ScheduledListHandle {
  refresh: () => void;
}

/**
 * My messages waiting to be sent in this chat (P4), above the composer.
 * Decrypted here for the preview; each can be cancelled until it goes.
 */
export const ScheduledList = forwardRef<ScheduledListHandle, { conversationId: string; crypto: ConversationCrypto | null; me: User }>(function ScheduledList(
  { conversationId, crypto, me },
  ref
) {
  const { nameOf } = useMentions();
  const [items, setItems] = useState<(ScheduledItem & { text: string })[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchScheduled(conversationId);
      const opened = await Promise.all(
        list.map(async (s) => {
          const m = crypto ? await crypto.decrypt({ ...s, _id: s._id, sender: me, type: "text", attachments: [], reactions: [], isEdited: false, isDeleted: false, updatedAt: s.createdAt } as unknown as Message) : null;
          return { ...s, text: m?.decryptedContent && !m.decryptionFailed ? mentionsToPlain(m.decryptedContent, nameOf) : "🔒 Encrypted message" };
        })
      );
      setItems(opened);
    } catch {
      /* the list is an extra */
    }
  }, [conversationId, crypto, me, nameOf]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  // Sent ones drop off the list: check again around when the next one is due
  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(refresh, Math.max(15_000, Math.min(new Date(items[0].sendAt).getTime() - Date.now() + 70_000, 600_000)));
    return () => clearTimeout(t);
  }, [items, refresh]);

  if (!items.length) return null;
  return (
    <div className="px-3 sm:px-4 pt-2">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-300 hover:text-violet-200">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        {items.length} scheduled message{items.length === 1 ? "" : "s"}
        <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 max-h-48 overflow-y-auto">
          {items.map((s) => (
            <li key={s._id} className="flex items-start gap-2 rounded-lg bg-slate-800/70 border border-slate-700/60 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500">{format(new Date(s.sendAt), "EEE d MMM, HH:mm")}{s.threadRoot ? " · in a thread" : ""}</p>
                <p className="text-xs text-slate-200 line-clamp-2 break-words">{s.text}</p>
              </div>
              <button
                aria-label="Cancel scheduled message"
                title="Cancel"
                onClick={async () => {
                  try {
                    await cancelScheduled(s._id);
                    setItems((prev) => prev.filter((x) => x._id !== s._id));
                  } catch (err) {
                    toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't cancel");
                    refresh();
                  }
                }}
                className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-slate-500 hover:text-rose-300 hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
