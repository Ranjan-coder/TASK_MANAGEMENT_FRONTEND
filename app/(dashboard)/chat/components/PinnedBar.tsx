"use client";

import { useEffect, useRef, useState } from "react";
import { Pin, ChevronDown, X } from "lucide-react";
import type { PinnedItem } from "@/lib/api/chat.api";
import { mentionsToPlain } from "@/lib/chat/mentions";
import { useMentions } from "./MentionContext";

/** One-line text for a pinned message (decrypted on this device). */
const usePinText = () => {
  const { nameOf } = useMentions();
  return (m: PinnedItem["message"]) =>
    m.decryptedContent ? mentionsToPlain(m.decryptedContent, nameOf) : m.attachments?.[0]?.originalName ? `📎 ${m.attachments[0].originalName}` : "🔒 Encrypted message";
};

/**
 * Pinned messages under the chat header (chat-features-plan.md CH-P). Shows
 * the newest pin; clicking jumps to it and moves on to the next one, like
 * WhatsApp. The list shows them all, with unpin for people who may pin.
 */
export function PinnedBar({ pins, canPin, onJump, onUnpin }: { pins: PinnedItem[]; canPin: boolean; onJump: (id: string) => void; onUnpin: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const textOf = usePinText();

  useEffect(() => setIndex((i) => (i < pins.length ? i : 0)), [pins.length]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!pins.length) return null;
  const current = pins[index] ?? pins[0];

  return (
    <div ref={ref} className="relative px-3 sm:px-4 py-1.5 border-b border-slate-800 bg-slate-900/60 flex items-center gap-2 shrink-0">
      <Pin className="h-3.5 w-3.5 text-violet-400 shrink-0" aria-hidden />
      <button
        onClick={() => {
          onJump(current.message._id);
          setIndex((i) => (i + 1) % pins.length); // next click: the next (older) pin
        }}
        className="flex-1 min-w-0 text-left"
        title="Go to pinned message"
      >
        <p className="text-[10px] text-violet-300 font-semibold">
          Pinned{pins.length > 1 ? ` · ${index + 1} of ${pins.length}` : ""}
        </p>
        <p className="text-xs text-slate-300 truncate">{textOf(current.message)}</p>
      </button>
      <button onClick={() => setOpen((v) => !v)} aria-label="All pinned messages" aria-expanded={open} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800">
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 z-30 max-h-80 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl">
          <ul>
            {pins.map((p) => (
              <li key={p.message._id} className="flex items-start gap-2 px-3 py-2 border-b border-slate-800/60 last:border-0">
                <button
                  onClick={() => {
                    setOpen(false);
                    onJump(p.message._id);
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-[11px] text-slate-400 font-semibold">{p.message.sender?.name}</p>
                  <p className="text-sm text-slate-200 line-clamp-2 break-words">{textOf(p.message)}</p>
                </button>
                {canPin && (
                  <button onClick={() => onUnpin(p.message._id)} aria-label="Unpin" title="Unpin" className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-300 hover:bg-slate-800">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
