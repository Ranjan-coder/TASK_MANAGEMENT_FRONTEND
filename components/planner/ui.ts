/** Shared look and small helpers for the Planner screens. */
export const input =
  "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500";
export const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs hover:border-slate-500 disabled:opacity-40";
export const primary = "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold";

export const NOTE_COLORS: Record<string, string> = {
  none: "border-slate-800 bg-slate-900",
  yellow: "border-amber-500/40 bg-amber-500/10",
  green: "border-emerald-500/40 bg-emerald-500/10",
  blue: "border-sky-500/40 bg-sky-500/10",
  pink: "border-pink-500/40 bg-pink-500/10",
  purple: "border-violet-500/40 bg-violet-500/10",
  grey: "border-slate-600 bg-slate-800/60"
};

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (d: string | Date) => timeFmt.format(new Date(d));
export const fmtDay = (d: string | Date) => dayFmt.format(new Date(d));
export const fmtWhen = (d: string | Date) => `${fmtDay(d)}, ${fmtTime(d)}`;

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
/** Monday 00:00 of the week containing d. */
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || (err instanceof Error ? err.message : fallback);
