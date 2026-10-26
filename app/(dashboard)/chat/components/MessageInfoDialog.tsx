"use client";

import { useEffect } from "react";
import { CheckCheck, X } from "lucide-react";
import { whoSaw, type ReceiptState } from "@/lib/chat/receipts";
import type { Message } from "@/types/chat";
import { useMentions } from "./MentionContext";

/** Who has seen / received one of my messages (staff only; customers never get names, CH-D3). */
export function MessageInfoDialog({ message, receipts, onClose }: { message: Message; receipts: ReceiptState; onClose: () => void }) {
  const { nameOf } = useMentions();
  const { read, delivered } = whoSaw(receipts, new Date(message.createdAt).getTime());
  const waiting = Object.keys(receipts.byUser).filter((id) => !read.includes(id) && !delivered.includes(id));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const Section = ({ title, ids, icon }: { title: string; ids: string[]; icon?: React.ReactNode }) =>
    ids.length ? (
      <div>
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
          {icon}
          {title} · {ids.length}
        </p>
        <ul className="space-y-1">
          {ids.map((id) => (
            <li key={id} className="text-sm text-slate-200 truncate">
              {nameOf(id) ?? "Former member"}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Message info"
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Message info</h2>
          <button onClick={onClose} aria-label="Close" className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Section title="Seen by" ids={read} icon={<CheckCheck className="h-3 w-3 text-sky-400" />} />
        <Section title="Delivered to" ids={delivered} icon={<CheckCheck className="h-3 w-3" />} />
        <Section title="Not yet received" ids={waiting} />
      </div>
    </div>
  );
}
