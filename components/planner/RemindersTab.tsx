"use client";

import { useMemo, useState } from "react";
import { AlarmClock, Check, Repeat, Trash2 } from "lucide-react";
import { useReminders, type Reminder } from "@/hooks/usePlanner";
import type { Freq } from "@/lib/api/planner.api";
import { cn } from "@/lib/utils";
import { btn, input, primary, fmtWhen, toLocalInput, startOfDay, addDays } from "./ui";

const FREQ_LABEL: Record<Freq, string> = { none: "Doesn't repeat", daily: "Every day", weekdays: "Every weekday (Mon–Fri)", weekly: "Every week", monthly: "Every month" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Reminders: the server fires them (push, in-app) at the right time, in your time
 * zone, even when the app is closed. The message it sends is generic because the
 * reminder text is encrypted; open the Planner to read it.
 */
export function RemindersTab({ vaultKey }: { vaultKey: CryptoKey }) {
  const active = useReminders(vaultKey, "active");
  const [showDone, setShowDone] = useState(false);
  const done = useReminders(showDone ? vaultKey : null, "done");

  const [text, setText] = useState("");
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 3600e3)));
  const [freq, setFreq] = useState<Freq>("none");
  const [days, setDays] = useState<number[]>([]);

  // Buckets in one pass over the (already time-sorted) list
  const groups = useMemo(() => {
    const now = new Date();
    const tomorrow = addDays(startOfDay(now), 1);
    const g: Record<"Overdue" | "Today" | "Upcoming", Reminder[]> = { Overdue: [], Today: [], Upcoming: [] };
    for (const r of active.reminders) {
      const t = new Date(r.nextAt);
      (t < now ? g.Overdue : t < tomorrow ? g.Today : g.Upcoming).push(r);
    }
    return g;
  }, [active.reminders]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const when = new Date(at);
    if (!text.trim() || Number.isNaN(+when) || when < new Date()) return;
    active.create.mutate(
      { text: text.trim(), at: when.toISOString(), recurrence: freq === "none" ? undefined : { freq, ...(freq === "weekly" && days.length ? { byWeekday: days } : {}) } },
      { onSuccess: () => setText("") }
    );
  };

  const tomorrow9 = () => {
    const t = addDays(startOfDay(new Date()), 1);
    t.setHours(9);
    return Math.max(1, Math.round((+t - Date.now()) / 60000));
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Remind me to…" maxLength={500} className={input} />
        <div className="flex flex-wrap gap-2 items-center">
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="When" className={cn(input, "w-auto")} />
          <select value={freq} onChange={(e) => setFreq(e.target.value as Freq)} aria-label="Repeat" className={cn(input, "w-auto")}>
            {(Object.keys(FREQ_LABEL) as Freq[]).map((f) => (
              <option key={f} value={f}>
                {FREQ_LABEL[f]}
              </option>
            ))}
          </select>
          {freq === "weekly" && (
            <div className="flex gap-1" role="group" aria-label="On days">
              {DAYS.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  aria-pressed={days.includes(i)}
                  onClick={() => setDays((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
                  className={cn("px-2 py-1 rounded-md text-xs border", days.includes(i) ? "bg-violet-600/30 border-violet-500 text-white" : "border-slate-700 text-slate-400")}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          <button className={primary} disabled={!text.trim() || active.create.isPending}>
            <AlarmClock className="h-4 w-4" /> Set reminder
          </button>
        </div>
      </form>

      {active.isLoading ? (
        <div className="h-24 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : active.reminders.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">No reminders. Set one above, or from a todo with the bell button.</p>
      ) : (
        (Object.keys(groups) as (keyof typeof groups)[])
          .filter((k) => groups[k].length)
          .map((k) => (
            <section key={k} className="space-y-2">
              <h3 className={cn("text-xs font-semibold uppercase tracking-wider", k === "Overdue" ? "text-rose-400" : "text-slate-400")}>{k}</h3>
              <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl">
                {groups[k].map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="flex-1 min-w-[160px]">
                      <span className="text-sm text-white block">{r.broken ? "Can't open this reminder" : r.text}</span>
                      <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                        {fmtWhen(r.nextAt)}
                        {r.recurrence?.freq && r.recurrence.freq !== "none" && (
                          <>
                            <Repeat className="h-3 w-3" /> {FREQ_LABEL[r.recurrence.freq]}
                          </>
                        )}
                        {r.link && <span className="ml-1 text-slate-600">· from a {r.link.kind === "item" ? "todo" : r.link.kind}</span>}
                      </span>
                    </span>
                    <button onClick={() => active.snooze.mutate({ id: r._id, minutes: 10 })} className={btn}>10 min</button>
                    <button onClick={() => active.snooze.mutate({ id: r._id, minutes: 60 })} className={btn}>1 hour</button>
                    <button onClick={() => active.snooze.mutate({ id: r._id, minutes: tomorrow9() })} className={btn}>Tomorrow 9:00</button>
                    <button onClick={() => active.done.mutate(r._id)} className={btn} aria-label="Done">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => active.remove.mutate(r._id)} className={cn(btn, "text-red-300")} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}

      <div>
        <button onClick={() => setShowDone((s) => !s)} className="text-xs text-slate-400 hover:text-white">
          {showDone ? "Hide done" : "Show done"}
        </button>
        {showDone && (
          <ul className="mt-2 divide-y divide-slate-800 border border-slate-800 rounded-xl opacity-70">
            {done.reminders.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">Nothing yet.</li>}
            {done.reminders.map((r) => (
              <li key={r._id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
                <span className="flex-1 line-through">{r.text}</span>
                <span className="text-[11px]">{r.lastFiredAt ? fmtWhen(r.lastFiredAt) : ""}</span>
                <button onClick={() => active.remove.mutate(r._id)} className="text-slate-600 hover:text-red-400" aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
