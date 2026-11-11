"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";

const MIN_AHEAD_MS = 2 * 60 * 1000; // the server needs at least a minute
const MAX_AHEAD_MS = 30 * 24 * 3600 * 1000;

/** At hour:00 on the day `daysAhead` from today (local time). */
const atHour = (daysAhead: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
};
/** Next Monday 9:00 (a week from today if today is Monday). */
const nextMonday = () => {
  const d = atHour(0, 9);
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d;
};

/** "Send later" choices: in an hour, tomorrow morning, next Monday, or a chosen time. */
export function SchedulePicker({ onPick, onClose }: { onPick: (at: Date) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState("");
  const presets = [
    { label: "In 1 hour", at: new Date(Date.now() + 3600e3) },
    { label: "Tomorrow, 9 AM", at: atHour(1, 9) },
    { label: "Monday, 9 AM", at: nextMonday() }
  ];

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const customDate = custom ? new Date(custom) : null;
  const customOk = Boolean(customDate && +customDate - Date.now() >= MIN_AHEAD_MS && +customDate - Date.now() <= MAX_AHEAD_MS);

  return (
    <div ref={ref} role="dialog" aria-label="Send later" className="absolute bottom-full right-4 mb-1 z-30 w-64 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl p-2">
      <p className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Send later</p>
      {presets.map((p) => (
        <button key={p.label} onClick={() => onPick(p.at)} className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-800 text-sm text-slate-200">
          {p.label}
          <span className="text-[11px] text-slate-500">{format(p.at, "EEE d MMM, HH:mm")}</span>
        </button>
      ))}
      <div className="mt-1 pt-2 border-t border-slate-800 px-2 space-y-2">
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          min={format(new Date(Date.now() + MIN_AHEAD_MS), "yyyy-MM-dd'T'HH:mm")}
          max={format(new Date(Date.now() + MAX_AHEAD_MS), "yyyy-MM-dd'T'HH:mm")}
          aria-label="Choose date and time"
          className="w-full h-8 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 px-2"
        />
        <button
          disabled={!customOk}
          onClick={() => customDate && onPick(customDate)}
          className="w-full h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40"
        >
          Schedule
        </button>
      </div>
    </div>
  );
}
