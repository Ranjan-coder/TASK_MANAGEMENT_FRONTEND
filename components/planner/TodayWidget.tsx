"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarCheck, ListTodo, Video } from "lucide-react";
import { useMeetings, usePlannerKey, useReminders } from "@/hooks/usePlanner";
import { plannerApi } from "@/lib/api/planner.api";
import { addDays, fmtTime, startOfDay } from "./ui";

/**
 * Dashboard card: today's next meetings and reminders, and overdue todos.
 * Reuses the Planner's cached queries (no extra requests when the Planner was
 * opened), and shows nothing readable until the person's keys are unlocked.
 */
export function TodayWidget() {
  const { state } = usePlannerKey();
  const key = state.status === "ready" ? state.key : null;
  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const { meetings } = useMeetings(Boolean(key), today, tomorrow);
  const { reminders } = useReminders(key);
  // Overdue: open todos due before now (count only: the index answers it without decrypting)
  const overdue = useQuery({
    queryKey: ["planner", "due", "overdue"],
    enabled: Boolean(key),
    queryFn: () => plannerApi.dueItems(new Date(Date.now() - 365 * 86400e3).toISOString(), new Date().toISOString())
  });

  const now = Date.now();
  const nextMeetings = meetings.filter((m) => !m.cancelled && +new Date(m.endAt) > now && m.myResponse !== "declined").slice(0, 3);
  const todayReminders = reminders.filter((r) => +new Date(r.nextAt) < +tomorrow).slice(0, 3);

  return (
    <section className="rounded-3xl bg-slate-900 border border-slate-800 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-violet-300" /> Today
        </h2>
        <Link href="/planner" className="text-xs text-violet-300 hover:text-white">Open Planner</Link>
      </div>
      {!key ? (
        <p className="text-xs text-slate-500">
          {state.status === "locked" ? "Your Planner is locked on this device. Open it to unlock." : "Loading…"}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1"><Video className="h-3 w-3" /> Meetings</p>
            {nextMeetings.length === 0 ? <p className="text-slate-500 text-xs">None left today</p> : nextMeetings.map((m) => (
              <p key={m._id} className="text-slate-200 truncate"><span className="text-slate-400">{fmtTime(m.startAt)}</span> {m.title || "Meeting"}</p>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1"><AlarmClock className="h-3 w-3" /> Reminders</p>
            {todayReminders.length === 0 ? <p className="text-slate-500 text-xs">Nothing today</p> : todayReminders.map((r) => (
              <p key={r._id} className="text-slate-200 truncate"><span className="text-slate-400">{fmtTime(r.nextAt)}</span> {r.text}</p>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-1"><ListTodo className="h-3 w-3" /> Todos</p>
            <p className={(overdue.data?.length || 0) > 0 ? "text-rose-300" : "text-slate-500 text-xs"}>
              {(overdue.data?.length || 0) > 0 ? `${overdue.data!.length} overdue` : "Nothing overdue"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
