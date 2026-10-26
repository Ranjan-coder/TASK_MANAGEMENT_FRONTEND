"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, AtSign, Check } from "lucide-react";
import { toast } from "sonner";
import { updateNotify } from "@/lib/api/chat.api";
import { useChatStore } from "@/store/chatStore";
import { cn } from "@/lib/utils";
import type { Conversation, MuteFor, NotifyLevel } from "@/types/chat";

const LEVELS: { value: NotifyLevel; label: string; hint: string }[] = [
  { value: "all", label: "All messages", hint: "Notify me about everything" },
  { value: "mentions", label: "Mentions only", hint: "Only when someone @mentions me" },
  { value: "off", label: "Nothing", hint: "No notifications from this chat" }
];
const SNOOZES: { value: MuteFor; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "8h", label: "8 hours" },
  { value: "1w", label: "1 week" }
];

/** True while a snooze is running. */
export const isSnoozed = (c: Pick<Conversation, "mutedUntil">) => Boolean(c.mutedUntil && new Date(c.mutedUntil).getTime() > Date.now());
/** Whether the chat stays quiet for ordinary messages (for the bell and sidebar icons). */
export const isQuiet = (c: Pick<Conversation, "mutedUntil" | "notify">) => isSnoozed(c) || c.notify === "off";

/** Bell in the chat header: my notification choice for this chat (nobody else sees it). */
export function NotifyMenu({ conv }: { conv: Conversation }) {
  // The store copy updates live (other devices); the page's copy is the fallback
  const live = useChatStore((s) => s.conversations.find((c) => c._id === conv._id));
  const current = { notify: live?.notify ?? conv.notify ?? "all", mutedUntil: live?.mutedUntil ?? conv.mutedUntil ?? null };
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const save = async (body: { notify?: NotifyLevel; muteFor?: MuteFor }) => {
    setSaving(true);
    try {
      const state = await updateNotify(conv._id, body);
      const store = useChatStore.getState();
      const c = store.conversations.find((x) => x._id === conv._id);
      if (c) store.upsertConversation({ ...c, notify: state.notify, mutedUntil: state.mutedUntil });
      setOpen(false);
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const snoozed = isSnoozed(current);
  const Icon = isQuiet(current) ? BellOff : current.notify === "mentions" ? AtSign : Bell;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications for this chat"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center transition",
          isQuiet(current) ? "text-amber-400 hover:bg-slate-800" : "text-slate-400 hover:text-white hover:bg-slate-800"
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-40 w-64 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl p-1">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Notify me about</p>
          {LEVELS.map((l) => (
            <button
              key={l.value}
              role="menuitemradio"
              aria-checked={current.notify === l.value}
              disabled={saving}
              onClick={() => save({ notify: l.value })}
              className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left hover:bg-slate-800 disabled:opacity-50"
            >
              <Check className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", current.notify === l.value ? "text-violet-400" : "invisible")} />
              <span>
                <span className="block text-sm text-slate-200">{l.label}</span>
                <span className="block text-[11px] text-slate-500">{l.hint}</span>
              </span>
            </button>
          ))}
          <div className="my-1 h-px bg-slate-800" />
          <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            {snoozed ? `Snoozed until ${new Date(current.mutedUntil!).getFullYear() > 9000 ? "you turn it back on" : new Date(current.mutedUntil!).toLocaleString()}` : "Snooze everything"}
          </p>
          <div className="flex flex-wrap gap-1 px-2 pb-2">
            {SNOOZES.map((s) => (
              <button
                key={s.value}
                disabled={saving}
                onClick={() => save({ muteFor: s.value })}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
            {snoozed && (
              <button
                disabled={saving}
                onClick={() => save({ muteFor: "none" })}
                className="px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 text-xs text-violet-200 disabled:opacity-50"
              >
                Turn back on
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
