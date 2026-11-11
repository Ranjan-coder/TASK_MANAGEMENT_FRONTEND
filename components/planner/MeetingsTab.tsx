"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight, Download, ExternalLink, Pencil, Plus, ShieldAlert, Users, Video, X, XCircle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useMeetings, localTimeZone, type Meeting, type MeetingDetails } from "@/hooks/usePlanner";
import { plannerApi, type PlannerPerson } from "@/lib/api/planner.api";
import { wrapMeetingKeyFor, meetingKeyOf, seal } from "@/lib/crypto/vault";
import { checkMeetingLink } from "@/lib/planner/links";
import { downloadIcs, googleCalendarUrl } from "@/lib/planner/ics";
import { cn } from "@/lib/utils";
import { btn, input, primary, fmtDay, fmtTime, startOfWeek, startOfDay, addDays, errMsg } from "./ui";

const RESPONSE_STYLE: Record<string, string> = {
  accepted: "text-emerald-300",
  tentative: "text-amber-300",
  declined: "text-rose-300 line-through",
  pending: "text-slate-400"
};

/** Week agenda of the person's meetings (as organiser or invitee). */
export function MeetingsTab() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const { meetings, isLoading } = useMeetings(true, weekStart, weekEnd);
  const [editing, setEditing] = useState<Meeting | "new" | null>(null);
  const canOrganise = me?.role !== "customer";
  const refresh = () => qc.invalidateQueries({ queryKey: ["planner", "meetings"] });

  // Group by day: one pass over the (start-sorted) list
  const byDay = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => ({ day: addDays(weekStart, i), items: [] as Meeting[] }));
    for (const m of meetings) {
      const i = Math.floor((+new Date(m.startAt) - +weekStart) / 86400000);
      if (days[i]) days[i].items.push(m);
    }
    return days;
  }, [meetings, weekStart]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setWeekStart((w) => addDays(w, -7))} className={btn} aria-label="Previous week">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setWeekStart(startOfWeek(new Date()))} className={btn}>This week</button>
        <button onClick={() => setWeekStart((w) => addDays(w, 7))} className={btn} aria-label="Next week">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <span className="text-sm text-slate-300">
          {fmtDay(weekStart)} – {fmtDay(addDays(weekStart, 6))}
        </span>
        {canOrganise && (
          <button onClick={() => setEditing("new")} className={cn(primary, "ml-auto")}>
            <Plus className="h-4 w-4" /> New meeting
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-40 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : (
        <div className="space-y-3">
          {byDay.map(({ day, items }) => (
            <section key={+day} className="space-y-1.5">
              <h3 className={cn("text-xs font-semibold uppercase tracking-wider", +day === +startOfDay(new Date()) ? "text-violet-300" : "text-slate-400")}>{fmtDay(day)}</h3>
              {items.length === 0 ? (
                <p className="text-xs text-slate-600 pl-1">No meetings</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((m) => (
                    <MeetingCard key={m._id} m={m} onEdit={() => setEditing(m)} onChanged={refresh} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {editing && <MeetingEditor meeting={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}

function MeetingCard({ m, onEdit, onChanged }: { m: Meeting; onEdit: () => void; onChanged: () => void }) {
  // Checked again when shown: another attendee's app could have saved anything
  const link = m.link ? checkMeetingLink(m.link) : null;
  const respond = (r: "accepted" | "tentative" | "declined") =>
    plannerApi.respond(m._id, r).then(onChanged).catch((err) => toast.error(errMsg(err, "Couldn't answer")));
  const cancel = () =>
    window.confirm("Cancel this meeting for everyone?") && plannerApi.cancelMeeting(m._id).then(onChanged).catch((err) => toast.error(errMsg(err, "Couldn't cancel")));
  const event = { uid: m._id, title: m.title, start: new Date(m.startAt), end: new Date(m.endAt), description: m.agenda, location: m.location, url: link?.ok ? link.href : null };

  return (
    <li className={cn("rounded-xl border p-3 space-y-2", m.cancelled ? "border-slate-800 bg-slate-900/40 opacity-60" : "border-slate-800 bg-slate-900")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-white font-medium truncate">
            {m.cancelled && <span className="text-rose-300 mr-1">Cancelled ·</span>}
            {m.broken ? "Can't open this meeting's details" : m.title || "Meeting"}
          </p>
          <p className="text-xs text-slate-400">
            {fmtTime(m.startAt)} – {fmtTime(m.endAt)} · organised by {m.isOrganiser ? "you" : m.organiser.name}
          </p>
        </div>
        {!m.cancelled && (
          <div className="flex flex-wrap gap-1.5">
            {m.isOrganiser ? (
              <>
                <button onClick={onEdit} className={btn}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button onClick={cancel} className={cn(btn, "text-red-300")}><XCircle className="h-3.5 w-3.5" /> Cancel</button>
              </>
            ) : (
              (["accepted", "tentative", "declined"] as const).map((r) => (
                <button key={r} onClick={() => respond(r)} className={cn(btn, m.myResponse === r && "border-violet-500 text-white")}>
                  {r === "accepted" ? "Accept" : r === "tentative" ? "Maybe" : "Decline"}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {link &&
        (link.ok ? (
          <a href={link.href!} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1.5 text-sm", link.provider ? "text-sky-300 hover:text-sky-200" : "text-amber-300")}>
            {link.provider ? <Video className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            {link.provider ? `Join on ${link.provider}` : `Check this link before joining (${link.host})`}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="text-xs text-rose-300 inline-flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5" /> This meeting&apos;s link isn&apos;t safe to open and has been hidden.
          </p>
        ))}
      {m.location && <p className="text-xs text-slate-400">Where: {m.location}</p>}
      {m.agenda && <p className="text-sm text-slate-300 whitespace-pre-line">{m.agenda}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Users className="h-3.5 w-3.5 text-slate-500" />
        {(m.hiddenGuests || 0) > 0 && <span className="text-slate-400">+{m.hiddenGuests} {m.hiddenGuests === 1 ? "guest" : "guests"}</span>}
        {m.attendees.map((a) => (
          <span key={a.user} className={RESPONSE_STYLE[a.response]} title={a.response}>
            {a.name}
          </span>
        ))}
      </div>
      {!m.cancelled && !m.broken && (
        <div className="flex gap-1.5">
          <button onClick={() => downloadIcs(event)} className={btn}><Download className="h-3.5 w-3.5" /> .ics</button>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={btn}><CalendarPlus className="h-3.5 w-3.5" /> Google Calendar</a>
        </div>
      )}
    </li>
  );
}

// ── Create / edit ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function MeetingEditor({ meeting, onClose, onSaved }: { meeting: Meeting | null; onClose: () => void; onSaved: () => void }) {
  const me = useAuthStore((s) => s.user)!;
  const start0 = meeting ? new Date(meeting.startAt) : new Date(Math.ceil(Date.now() / 1800000) * 1800000 + 1800000);
  const end0 = meeting ? new Date(meeting.endAt) : new Date(+start0 + 1800000);
  const [details, setDetails] = useState<MeetingDetails>({ title: meeting?.title || "", agenda: meeting?.agenda || "", link: meeting?.link || "", location: meeting?.location || "" });
  const [day, setDay] = useState(dateInput(start0));
  const [from, setFrom] = useState(timeInput(start0));
  const [to, setTo] = useState(timeInput(end0));
  const [people, setPeople] = useState<PlannerPerson[]>(
    (meeting?.attendees || []).filter((a) => a.user !== me._id).map((a) => ({ _id: a.user, name: a.name, role: "", designation: "", avatarUrl: "" }))
  );
  const [reminder, setReminder] = useState<number | null>(meeting ? meeting.reminderMinutes : 10);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startAt = new Date(`${day}T${from}`);
  const endAt = new Date(`${day}T${to}`);
  const linkCheck = details.link ? checkMeetingLink(details.link) : null;

  // Clash check: busy times of the people invited for this slot (names only, no details)
  useEffect(() => {
    if (!people.length || Number.isNaN(+startAt) || !(endAt > startAt)) return setBusy({});
    const t = setTimeout(() => {
      plannerApi
        .availability(people.map((p) => p._id), startAt.toISOString(), endAt.toISOString())
        .then((rows) =>
          setBusy(Object.fromEntries(rows.map((r) => [r.user, r.busy.some((b) => new Date(b.start) < endAt && new Date(b.end) > startAt && !(meeting && +new Date(b.start) === +new Date(meeting.startAt)))])))
        )
        .catch(() => setBusy({}));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, day, from, to]);

  const save = async () => {
    setError("");
    if (!details.title.trim()) return setError("Give the meeting a title");
    if (Number.isNaN(+startAt) || !(endAt > startAt)) return setError("The meeting must end after it starts");
    if (startAt < new Date()) return setError("Choose a time in the future");
    if (details.link && !linkCheck?.ok) return setError(linkCheck?.error || "Check the link");
    const clean: MeetingDetails = { title: details.title.trim(), agenda: details.agenda.trim(), link: linkCheck?.href || "", location: details.location.trim() };
    setSaving(true);
    try {
      const ids = people.map((p) => p._id);
      if (!meeting) {
        const { key, wraps } = await wrapMeetingKeyFor(me._id, ids);
        await plannerApi.createMeeting({ startAt: startAt.toISOString(), endAt: endAt.toISOString(), timeZone: localTimeZone(), enc: await seal(key, clean), attendees: wraps, reminderMinutes: reminder });
      } else {
        const before = new Set(meeting.attendees.map((a) => a.user));
        const removedSomeone = [...before].some((u) => u !== me._id && !ids.includes(u));
        const addedSomeone = ids.some((u) => !before.has(u));
        // Removing someone: a new key, so they can't read anything from now on
        const current = removedSomeone ? undefined : await meetingKeyOf(me._id, { ...meeting, enc: { ciphertext: "", iv: "" } });
        const changedPeople = removedSomeone || addedSomeone;
        const { key, wraps } = changedPeople ? await wrapMeetingKeyFor(me._id, ids, current) : { key: current!, wraps: undefined };
        await plannerApi.updateMeeting(meeting._id, {
          version: meeting.version,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          timeZone: localTimeZone(),
          enc: await seal(key, clean),
          reminderMinutes: reminder,
          ...(wraps ? { attendees: wraps } : {}),
          ...(removedSomeone ? { rekey: true } : {})
        });
      }
      toast.success(meeting ? "Meeting updated" : "Meeting created. Invites sent.");
      onSaved();
    } catch (err) {
      setError(errMsg(err, "Couldn't save the meeting"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label={meeting ? "Edit meeting" : "New meeting"}>
      <div className="w-full max-w-lg h-full overflow-y-auto bg-slate-900 border-l border-slate-700 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{meeting ? "Edit meeting" : "New meeting"}</h2>
          <button onClick={onClose} className={btn} aria-label="Close"><X className="h-3.5 w-3.5" /></button>
        </div>
        {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">{error}</p>}
        <input value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} placeholder="Title" maxLength={200} className={input} />
        <div className="flex flex-wrap gap-2">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" className={cn(input, "w-auto")} />
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Starts" className={cn(input, "w-auto")} />
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Ends" className={cn(input, "w-auto")} />
        </div>
        <PeoplePicker value={people} onChange={setPeople} busy={busy} />
        <div className="space-y-1">
          <input value={details.link} onChange={(e) => setDetails({ ...details, link: e.target.value })} placeholder="Meeting link (Meet, Zoom, Teams, …)" className={input} />
          {linkCheck && (
            <p className={cn("text-xs", !linkCheck.ok ? "text-rose-300" : linkCheck.provider ? "text-emerald-300" : "text-amber-300")}>
              {!linkCheck.ok ? linkCheck.error : linkCheck.provider ? `${linkCheck.provider} link` : `Not a known meeting service (${linkCheck.host}). People will be asked to check it.`}
            </p>
          )}
        </div>
        <input value={details.location} onChange={(e) => setDetails({ ...details, location: e.target.value })} placeholder="Place (optional)" maxLength={200} className={input} />
        <textarea value={details.agenda} onChange={(e) => setDetails({ ...details, agenda: e.target.value })} placeholder="Agenda (optional)" rows={5} maxLength={4000} className={input} />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Remind everyone
          <select value={reminder ?? "none"} onChange={(e) => setReminder(e.target.value === "none" ? null : Number(e.target.value))} className={cn(input, "w-auto")}>
            <option value="none">No reminder</option>
            {[5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>{n} minutes before</option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-slate-500">Title, link, place and agenda are end-to-end encrypted for the people invited. Invites and reminders only mention the time.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm">Close</button>
          <button onClick={save} disabled={saving} className={primary}>{saving ? "Saving…" : meeting ? "Save changes" : "Send invites"}</button>
        </div>
      </div>
    </div>
  );
}

/** Search people you may invite (planner /people), with a busy warning per person. */
function PeoplePicker({ value, onChange, busy }: { value: PlannerPerson[]; onChange: (p: PlannerPerson[]) => void; busy: Record<string, boolean> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlannerPerson[]>([]);
  const [open, setOpen] = useState(false);
  const chosen = useMemo(() => new Set(value.map((p) => p._id)), [value]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(() => {
      plannerApi.people(q).then((r) => alive && setResults(r.filter((p) => !chosen.has(p._id)))).catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, chosen]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((p) => (
          <span key={p._id} className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border", busy[p._id] ? "border-amber-500/50 text-amber-200" : "border-slate-700 text-slate-200")}>
            {p.name}
            {busy[p._id] && " · busy then"}
            <button onClick={() => onChange(value.filter((x) => x._id !== p._id))} aria-label={`Remove ${p.name}`}><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} placeholder="Invite people (search by name)" className={input} />
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            {results.map((p) => (
              <li key={p._id}>
                <button type="button" onMouseDown={() => { onChange([...value, p]); setQ(""); }} className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                  {p.name} <span className="text-[11px] text-slate-500">{p.role === "customer" ? "Customer" : p.designation}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
