"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ArrowUp, ArrowDown, Palmtree } from "lucide-react";
import { monitoringApi, type DesignerRow } from "@/lib/api/monitoring.api";
import { cn } from "@/lib/utils";

type SortKey = "projects" | "reply" | "fast" | "escalations" | "rating" | "reports";
const PERIODS = [7, 30, 90] as const;

/** Change vs the previous period; `lowerIsBetter` flips the colour. */
function Trend({ now, before, lowerIsBetter, unit = "" }: { now: number | null; before: number | null; lowerIsBetter?: boolean; unit?: string }) {
  if (now == null || before == null || now === before) return null;
  const up = now > before;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center text-[10px] ml-1", good ? "text-emerald-400" : "text-rose-400")} title={`Previous period: ${before}${unit}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(Math.round((now - before) * 10) / 10)}
      {unit}
    </span>
  );
}

const sorters: Record<SortKey, (a: DesignerRow, b: DesignerRow) => number> = {
  projects: (a, b) => b.activeProjects.lead + b.activeProjects.backup - (a.activeProjects.lead + a.activeProjects.backup),
  reply: (a, b) => (a.replies.avgMinutes ?? Infinity) - (b.replies.avgMinutes ?? Infinity),
  fast: (a, b) => (b.replies.fastRate ?? -1) - (a.replies.fastRate ?? -1),
  escalations: (a, b) => b.replies.escalations - a.replies.escalations,
  rating: (a, b) => (b.rating.average ?? -1) - (a.rating.average ?? -1),
  reports: (a, b) => b.reports.total - a.reports.total
};

export default function PerformancePage() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [sort, setSort] = useState<SortKey>("projects");
  const { data, isLoading } = useQuery({ queryKey: ["designer-performance", days], queryFn: async () => (await monitoringApi.designers(days)).data.data });
  const rows = useMemo(() => [...(data?.designers || [])].sort(sorters[sort]), [data, sort]);

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("py-2 px-3 font-medium", className)}>
      <button onClick={() => setSort(k)} className={cn("hover:text-white", sort === k && "text-white underline underline-offset-4")}>
        {children}
      </button>
    </th>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-emerald-300" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold text-white">Designer performance</h1>
          <p className="text-sm text-slate-400">Reply times count working hours only. Arrows compare with the previous {days} days.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Period">
          {PERIODS.map((d) => (
            <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={cn("px-3 py-1.5 rounded-lg border text-xs", days === d ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto">
        {isLoading ? (
          <p className="p-5 text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">No designers with projects yet. Assign lead designers in Admin → Projects.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                <th className="py-2 px-3 font-medium">Designer</th>
                <Th k="projects" className="text-right">Projects</Th>
                <Th k="reply" className="text-right">Avg. reply</Th>
                <Th k="fast" className="text-right">Within {data?.fastThresholdMin} min</Th>
                <Th k="escalations" className="text-right">Escalations</Th>
                <Th k="rating" className="text-right">Rating</Th>
                <Th k="reports" className="text-right">Reports</Th>
                <th className="py-2 px-3 font-medium text-right" title="Flagged words this person sent (Send anyway)">Flagged words</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.designer._id} className="border-b border-slate-800/60 align-top">
                  <td className="py-2.5 px-3">
                    <span className="text-slate-100">{r.designer.name}</span>
                    {r.designer.onLeave && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-emerald-300"><Palmtree className="h-3 w-3" /> on leave</span>
                    )}
                    {r.designer.status !== "active" && <span className="ml-2 text-[10px] text-rose-300">{r.designer.status}</span>}
                    <span className="block text-[11px] text-slate-500">{r.designer.designation}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300" title={`${r.activeProjects.lead} as lead, ${r.activeProjects.backup} as backup`}>
                    {r.activeProjects.lead}
                    {r.activeProjects.backup ? <span className="text-slate-500"> +{r.activeProjects.backup}</span> : null}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {r.replies.avgMinutes == null ? "—" : `${r.replies.avgMinutes} min`}
                    <Trend now={r.replies.avgMinutes} before={r.replies.prevAvgMinutes} lowerIsBetter unit="m" />
                    <span className="block text-[10px] text-slate-500">{r.replies.waits} waits</span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {r.replies.fastRate == null ? "—" : `${r.replies.fastRate}%`}
                    <Trend now={r.replies.fastRate} before={r.replies.prevFastRate} unit="%" />
                  </td>
                  <td className={cn("py-2.5 px-3 text-right", r.replies.escalations ? "text-rose-300" : "text-slate-300")}>
                    {r.replies.escalations}
                    <Trend now={r.replies.escalations} before={r.replies.prevEscalations} lowerIsBetter />
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {r.rating.average == null ? "—" : `${r.rating.average}★`}
                    <Trend now={r.rating.periodAverage} before={r.rating.prevAverage} />
                    <span className="block text-[10px] text-slate-500">{r.rating.count} ratings</span>
                  </td>
                  <td className={cn("py-2.5 px-3 text-right", r.reports.total ? "text-amber-300" : "text-slate-300")}>
                    {r.reports.total}
                    {r.reports.total > 0 && <span className="block text-[10px] text-slate-500">{r.reports.actionTaken} actioned · {r.reports.open} open</span>}
                  </td>
                  <td className={cn("py-2.5 px-3 text-right", r.flaggedWords ? "text-rose-300" : "text-slate-300")}>{r.flaggedWords}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        Reports count customer reports about the person in this period. Designers see only their own overall rating (Settings → Reports), never who rated them.
      </p>
    </div>
  );
}
