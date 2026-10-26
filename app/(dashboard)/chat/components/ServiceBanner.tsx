"use client";

import { useEffect, useState } from "react";
import { Clock, Moon } from "lucide-react";
import { fetchServiceInfo, type ServiceInfo } from "@/lib/api/chat.api";

/** "~15 min", "~2 h", "about a day" */
const roughly = (min: number) => {
  if (min < 60) return `~${Math.max(5, Math.round(min / 5) * 5)} min`;
  if (min < 60 * 20) return `~${Math.round(min / 60)} h`;
  return "about a day";
};

/**
 * For customers in a project chat (P4): when the team usually answers, and
 * whether they're working now. Built from real reply times and the business
 * hours set in Admin → Reply times; says nothing it can't back up.
 */
export function ServiceBanner({ conversationId }: { conversationId: string }) {
  const [info, setInfo] = useState<ServiceInfo | null>(null);

  useEffect(() => {
    let live = true;
    fetchServiceInfo(conversationId)
      .then((i) => live && setInfo(i))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [conversationId]);

  if (!info?.project) return null;
  return (
    <div className="px-3 sm:px-4 py-1.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2 text-[11px] text-slate-400 shrink-0" role="status">
      {info.openNow ? <Clock className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden /> : <Moon className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden />}
      <span className="truncate">
        {info.openNow
          ? info.typicalReplyMinutes
            ? `The team usually replies in ${roughly(info.typicalReplyMinutes)}`
            : "The team is available now"
          : `The team is away now${info.backAt ? ` — back ${info.backAt}` : ""}. Your message will be waiting for them.`}
        {info.hours && <span className="hidden sm:inline text-slate-500"> · Hours: {info.hours}</span>}
      </span>
    </div>
  );
}
