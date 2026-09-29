"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlarmClock, MessageSquareReply, Timer } from "lucide-react";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket";
import { slaApi, type ReplyReminder as Reminder } from "@/lib/api/sla.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";

// After "Reply now", don't show the same reminder again for a while (the chat is open)
const REPLY_GRACE_MS = 5 * 60 * 1000;

/**
 * The designer's "customer is waiting" popup (60-minute reminder). Shows on
 * every device the designer is signed in on; closes itself when anyone on the
 * team replies.
 */
export function ReplyReminderPopup() {
  const router = useRouter();
  const pathname = usePathname();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [hiddenUntil, setHiddenUntil] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [snoozing, setSnoozing] = useState(false);
  const replyRef = useRef<HTMLButtonElement>(null);

  const hide = (slaId: string, until: number) => setHiddenUntil((h) => ({ ...h, [slaId]: until }));

  const load = useCallback(async () => {
    try {
      const res = await slaApi.pending();
      setReminders(res.data.data);
      for (const r of res.data.data) if (r.snoozedUntil) hide(r.slaId, new Date(r.snoozedUntil).getTime());
    } catch {
      /* not critical: the socket event still arrives */
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    load();
    const onReminder = (r: Reminder) => {
      setReminders((list) => [r, ...list.filter((x) => x.slaId !== r.slaId)]);
      setHiddenUntil((h) => {
        const { [r.slaId]: _gone, ...rest } = h;
        return rest;
      });
    };
    const onResolved = ({ slaId }: { slaId: string }) => setReminders((list) => list.filter((x) => x.slaId !== slaId));
    const onSnoozed = ({ slaId, snoozedUntil }: { slaId: string; snoozedUntil: string }) => {
      hide(slaId, new Date(snoozedUntil).getTime());
      setReminders((list) => list.map((x) => (x.slaId === slaId ? { ...x, canSnooze: false } : x)));
    };
    socket.on("connect", load);
    socket.on("sla:reminder", onReminder);
    socket.on("sla:resolved", onResolved);
    socket.on("sla:snoozed", onSnoozed);
    return () => {
      socket.off("connect", load);
      socket.off("sla:reminder", onReminder);
      socket.off("sla:resolved", onResolved);
      socket.off("sla:snoozed", onSnoozed);
    };
  }, [load]);


  // Re-check snoozed/hidden reminders every 20 s, but only while there are any
  // (this used to re-render the whole app shell every 20 s for everyone).
  const hasReminders = reminders.length > 0;
  useEffect(() => {
    if (!hasReminders) return;
    const tick = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(tick);
  }, [hasReminders]);
  const visible = reminders.filter(
    (r) => !((hiddenUntil[r.slaId] ?? 0) > now) && pathname !== `/chat/${r.conversationId}`
  );
  const current = visible[0];

  useEffect(() => {
    if (current) replyRef.current?.focus();
  }, [current?.slaId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  const minutesNow = current.waitingMinutes;

  const replyNow = () => {
    hide(current.slaId, Date.now() + REPLY_GRACE_MS);
    router.push(`/chat/${current.conversationId}`);
  };

  const snooze = async () => {
    setSnoozing(true);
    try {
      const res = await slaApi.snooze(current.slaId);
      hide(current.slaId, new Date(res.data.data.snoozedUntil).getTime());
      setReminders((list) => list.map((x) => (x.slaId === current.slaId ? { ...x, canSnooze: false } : x)));
      toast.info("We'll remind you again in 10 minutes");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't snooze"));
      load();
    } finally {
      setSnoozing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reply-reminder-title"
        aria-describedby="reply-reminder-body"
        className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-6 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <AlarmClock className="h-5 w-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h2 id="reply-reminder-title" className="text-base font-semibold text-white">
              {current.customerName} is waiting for a reply
            </h2>
            <p id="reply-reminder-body" className="mt-1 text-sm text-slate-300">
              No reply for <strong className="text-amber-200">{minutesNow} working minutes</strong> in{" "}
              <span className="text-white">{current.projectName}</span>.
              {current.escalated ? " This has been escalated to the admin team." : " Please reply now."}
            </p>
          </div>
        </div>

        {visible.length > 1 && (
          <p className="mt-3 text-xs text-slate-400">
            {visible.length - 1} more customer{visible.length > 2 ? "s are" : " is"} waiting.
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {current.canSnooze && !current.escalated && (
            <button
              type="button"
              onClick={snooze}
              disabled={snoozing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <Timer className="h-4 w-4" /> Snooze 10 min
            </button>
          )}
          <button
            ref={replyRef}
            type="button"
            onClick={replyNow}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <MessageSquareReply className="h-4 w-4" /> Reply now
          </button>
        </div>
      </div>
    </div>
  );
}
