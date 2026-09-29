"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Timer, Plus, Trash2, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { slaApi, type ReplyTimeSettings } from "@/lib/api/sla.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { UserPicker, type PickedUser } from "@/components/admin/UserPicker";
import { cn } from "@/lib/utils";

// Shown Monday-first; values are JS weekdays (0 = Sunday)
const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" }
];

const card = "bg-slate-900/80 border border-slate-800 rounded-2xl p-5";
const input =
  "px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";

interface FormState {
  start: string;
  end: string;
  workDays: number[];
  autoReplyMin: number;
  remindMin: number;
  escalateMin: number;
  holidays: { date: string; name: string }[];
  contacts: PickedUser[];
}

const toForm = (s: ReplyTimeSettings): FormState => ({
  start: s.businessHours.start,
  end: s.businessHours.end,
  workDays: s.businessHours.workDays,
  autoReplyMin: s.sla.autoReplyMin,
  remindMin: s.sla.remindMin,
  escalateMin: s.sla.escalateMin,
  holidays: s.holidays,
  contacts: s.escalationContacts.map((c) => ({ _id: c._id, name: c.name, email: c.email, role: c.role }))
});

export default function ReplyTimesPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["reply-time-settings"], queryFn: async () => (await slaApi.getSettings()).data.data });
  const metricsQuery = useQuery({ queryKey: ["reply-time-metrics"], queryFn: async () => (await slaApi.metrics(30)).data.data });
  const [form, setForm] = useState<FormState | null>(null);
  const [holiday, setHoliday] = useState({ date: "", name: "" });

  useEffect(() => {
    if (settingsQuery.data && !form) setForm(toForm(settingsQuery.data));
  }, [settingsQuery.data, form]);

  const save = useMutation({
    mutationFn: async (f: FormState) =>
      (
        await slaApi.updateSettings({
          businessHours: { start: f.start, end: f.end, workDays: f.workDays },
          sla: { autoReplyMin: f.autoReplyMin, remindMin: f.remindMin, escalateMin: f.escalateMin },
          holidays: f.holidays,
          escalationContacts: f.contacts.map((c) => c._id)
        })
      ).data.data,
    onSuccess: (data) => {
      queryClient.setQueryData(["reply-time-settings"], data);
      setForm(toForm(data));
      toast.success("Saved. New waiting periods use these settings.");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save the settings"))
  });

  if (settingsQuery.isLoading || !form) {
    return <div className="text-sm text-slate-400">{settingsQuery.isError ? "Couldn't load the settings." : "Loading…"}</div>;
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleDay = (d: number) =>
    set("workDays", form.workDays.includes(d) ? form.workDays.filter((x) => x !== d) : [...form.workDays, d]);
  const timersValid = form.autoReplyMin > 0 && form.autoReplyMin < form.remindMin && form.remindMin < form.escalateMin;
  const defaultContact = settingsQuery.data?.defaultEscalationContact;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Timer className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Reply times</h1>
          <p className="text-sm text-slate-400">How quickly the team answers customers in project chats, and who hears about delays.</p>
        </div>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.workDays.length === 0) return toast.error("Pick at least one working day");
          if (!timersValid) return toast.error("Timers must increase: auto-reply < reminder < escalation");
          save.mutate(form);
        }}
      >
        <section className={card} aria-labelledby="hours-h">
          <h2 id="hours-h" className="text-base font-semibold text-white">Working hours (IST)</h2>
          <p className="text-xs text-slate-400 mt-1">Timers only count these hours. Messages outside them get an automatic “we’re closed” reply.</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="text-xs text-slate-300">
              Opens
              <input type="time" value={form.start} onChange={(e) => set("start", e.target.value)} className={cn(input, "block mt-1")} required />
            </label>
            <label className="text-xs text-slate-300">
              Closes
              <input type="time" value={form.end} onChange={(e) => set("end", e.target.value)} className={cn(input, "block mt-1")} required />
            </label>
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs text-slate-300 mb-2">Working days (unticked days are days off)</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = form.workDays.includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d.v)}
                    className={cn(
                      "w-14 py-2 rounded-lg border text-sm",
                      on ? "bg-violet-600/25 border-violet-500/50 text-violet-100" : "border-slate-700 text-slate-500 line-through"
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </section>

        <section className={card} aria-labelledby="timers-h">
          <h2 id="timers-h" className="text-base font-semibold text-white">Timers (working minutes)</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {(
              [
                ["autoReplyMin", "“Designer is busy” message to the customer"],
                ["remindMin", "Reminder popup for the designer"],
                ["escalateMin", "Escalation to the contacts below"]
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="text-xs text-slate-300">
                {label}
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={form[k]}
                  onChange={(e) => set(k, Number(e.target.value))}
                  className={cn(input, "block mt-1 w-full")}
                  required
                />
              </label>
            ))}
          </div>
          {!timersValid && <p className="mt-2 text-xs text-rose-400">Each timer must be longer than the one before it.</p>}
        </section>

        <section className={card} aria-labelledby="contacts-h">
          <h2 id="contacts-h" className="text-base font-semibold text-white">Escalation contacts</h2>
          <p className="text-xs text-slate-400 mt-1">Get a notification and an email when a customer waits past the escalation timer. The project manager is always included too.</p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200">
              <Lock className="h-3 w-3 text-slate-400" /> {defaultContact?.email || "admin@bonito.in"}
            </span>
            <span className="text-slate-500">always included</span>
            {defaultContact?.missing && <span className="text-amber-300">— this account doesn’t exist yet</span>}
          </div>
          <div className="mt-3">
            <UserPicker
              id="escalation-contacts"
              label="More people"
              kind="staff"
              multiple
              value={form.contacts}
              onChange={(v) => set("contacts", v)}
              placeholder="Search staff by name or email"
            />
          </div>
        </section>

        <section className={card} aria-labelledby="holidays-h">
          <h2 id="holidays-h" className="text-base font-semibold text-white">Holidays</h2>
          <p className="text-xs text-slate-400 mt-1">Treated like a day off: timers pause.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-300">
              Date
              <input type="date" value={holiday.date} onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))} className={cn(input, "block mt-1")} />
            </label>
            <label className="text-xs text-slate-300 flex-1 min-w-[160px]">
              Name (optional)
              <input value={holiday.name} maxLength={80} onChange={(e) => setHoliday((h) => ({ ...h, name: e.target.value }))} className={cn(input, "block mt-1 w-full")} placeholder="Diwali" />
            </label>
            <button
              type="button"
              disabled={!holiday.date}
              onClick={() => {
                set("holidays", [...form.holidays.filter((h) => h.date !== holiday.date), holiday].sort((a, b) => a.date.localeCompare(b.date)));
                setHoliday({ date: "", name: "" });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {form.holidays.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-800 border border-slate-800 rounded-lg">
              {form.holidays.map((h) => (
                <li key={h.date} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-slate-200">
                    {new Date(`${h.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    {h.name && <span className="text-slate-400"> · {h.name}</span>}
                  </span>
                  <button type="button" onClick={() => set("holidays", form.holidays.filter((x) => x.date !== h.date))} aria-label={`Remove ${h.date}`} className="text-slate-500 hover:text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex justify-end">
          <button type="submit" disabled={save.isPending} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50">
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>

      <section className={card} aria-labelledby="metrics-h">
        <h2 id="metrics-h" className="text-base font-semibold text-white">Response times — last 30 days</h2>
        {metricsQuery.isLoading ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : !metricsQuery.data?.designers.length ? (
          <p className="mt-3 text-sm text-slate-400">No customer messages in project chats yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-3 font-medium">Lead designer</th>
                  <th className="py-2 px-3 font-medium text-right">Waits</th>
                  <th className="py-2 px-3 font-medium text-right">Avg. reply</th>
                  <th className="py-2 px-3 font-medium text-right">Within {metricsQuery.data.fastThresholdMin} min</th>
                  <th className="py-2 px-3 font-medium text-right">Reminders</th>
                  <th className="py-2 px-3 font-medium text-right">Escalations</th>
                  <th className="py-2 pl-3 font-medium text-right">Rating</th>
                </tr>
              </thead>
              <tbody>
                {metricsQuery.data.designers.map((d, i) => (
                  <tr key={d.designer?._id || i} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3 text-slate-200">{d.designer?.name || "Former staff"}{d.open > 0 && <span className="ml-2 text-xs text-amber-300">{d.open} waiting now</span>}</td>
                    <td className="py-2 px-3 text-right text-slate-300">{d.periods}</td>
                    <td className="py-2 px-3 text-right text-slate-300">{d.avgReplyMinutes == null ? "—" : `${d.avgReplyMinutes} min`}</td>
                    <td className="py-2 px-3 text-right text-slate-300">{d.fastReplyRate == null ? "—" : `${d.fastReplyRate}%`}</td>
                    <td className="py-2 px-3 text-right text-slate-300">{d.reminders}</td>
                    <td className={cn("py-2 px-3 text-right", d.escalations ? "text-rose-300" : "text-slate-300")}>{d.escalations}</td>
                    <td className="py-2 pl-3 text-right text-slate-300" title={d.rating?.recentAverage != null ? `Last 90 days: ${d.rating.recentAverage}★ (${d.rating.recentCount})` : undefined}>
                      {d.rating ? `${d.rating.average}★ (${d.rating.count})` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-500">Times count working hours only. “Waits” = times a customer message waited for a staff reply.</p>
          </div>
        )}
      </section>
    </div>
  );
}
