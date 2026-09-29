"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Gauge, Clock, Flag, ShieldHalf, Star, Users, FolderKanban, PhoneCall, RefreshCw } from "lucide-react";
import { monitoringApi } from "@/lib/api/monitoring.api";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
  waiting: "Waiting",
  auto_replied: "Auto-replied",
  reminded: "Designer reminded",
  escalated: "Escalated"
};

function Tile({ href, icon: Icon, label, value, sub, alert }: { href: string; icon: typeof Gauge; label: string; value: string | number; sub?: string; alert?: boolean }) {
  return (
    <Link href={href} className={cn("block rounded-2xl border p-4 transition hover:border-slate-500", alert ? "border-rose-500/40 bg-rose-500/5" : "border-slate-800 bg-slate-900/80")}>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className={cn("h-4 w-4", alert ? "text-rose-300" : "text-slate-400")} /> {label}
      </div>
      <p className={cn("mt-2 text-2xl font-bold", alert ? "text-rose-200" : "text-white")}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </Link>
  );
}

/** Admin home for monitoring: what needs attention right now. */
export default function OverviewPage() {
  const { data: o, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => (await monitoringApi.overview()).data.data,
    refetchInterval: 60_000
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Gauge className="h-5 w-5 text-violet-300" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-sm text-slate-400">Customer projects at a glance. Refreshes every minute.</p>
        </div>
        <button onClick={() => refetch()} aria-label="Refresh" className="h-9 w-9 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white">
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
      </div>

      {isLoading || !o ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <section aria-label="Needs attention" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Tile href="#waiting" icon={Clock} label="Customers waiting now" value={o.waiting.count} sub={o.waiting.escalated ? `${o.waiting.escalated} escalated` : "none escalated"} alert={o.waiting.escalated > 0} />
            <Tile href="/admin/reports" icon={Flag} label="Open reports" value={o.reports.open} sub={o.reports.overdue ? `${o.reports.overdue} over 48 h` : `${o.reports.last30} in 30 days`} alert={o.reports.overdue > 0} />
            <Tile href="/admin/moderation" icon={ShieldHalf} label="Abuse alerts" value={o.moderation.open} sub={o.moderation.threats ? `${o.moderation.threats} with threats` : "open"} alert={o.moderation.threats > 0} />
            <Tile href="/admin/campaigns" icon={PhoneCall} label="New consultation requests" value={o.leads.new} sub="from campaigns" />
          </section>

          <section aria-label="Health" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Tile
              href="/admin/performance"
              icon={Clock}
              label="Replies (7 days)"
              value={o.replies7d.avgMinutes == null ? "—" : `${o.replies7d.avgMinutes} min`}
              sub={o.replies7d.fastRate == null ? "no customer messages yet" : `${o.replies7d.fastRate}% within ${o.replies7d.fastThresholdMin} min · ${o.replies7d.count} waits`}
            />
            <Tile href="/admin/performance" icon={Star} label="Rating (30 days)" value={o.ratings.average30 == null ? "—" : `${o.ratings.average30}★`} sub={`${o.ratings.count30} ratings${o.ratings.low30 ? ` · ${o.ratings.low30} low` : ""}`} alert={o.ratings.low30 > 0} />
            <Tile href="/admin/projects" icon={FolderKanban} label="Active projects" value={o.projects.active} sub={`${o.projects.onHold} on hold · ${o.projects.completed} completed`} />
            <Tile href="/admin/customers" icon={Users} label="Customers" value={o.customers.total} sub={`${o.customers.newThisWeek} new this week · ${o.customers.verified} verified`} />
          </section>

          <section id="waiting" className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-base font-semibold text-white">Longest-waiting customers</h2>
            {o.waiting.longest.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Everyone has a reply. 🎉</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-800">
                {o.waiting.longest.map((w) => (
                  <li key={w.conversationId} className="py-2.5 flex flex-wrap items-center gap-3 text-sm">
                    <span className="flex-1 min-w-[200px]">
                      <span className="text-white">{w.customerName}</span> <span className="text-slate-400">in {w.projectName}</span>
                      <span className="block text-[11px] text-slate-500">Lead: {w.designerName || "—"}</span>
                    </span>
                    <span className="text-xs text-slate-300">
                      {new Date(w.clockStart) > new Date() ? "clock starts at opening" : `waiting ${formatDistanceToNowStrict(new Date(w.waitingSince))}`}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", w.stage === "escalated" ? "border-rose-500/40 text-rose-200 bg-rose-500/10" : "border-slate-700 text-slate-300")}>
                      {STAGE_LABEL[w.stage] || w.stage}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">Admins aren&apos;t members of project chats — follow up with the lead designer or project manager.</p>
          </section>
        </>
      )}
    </div>
  );
}
