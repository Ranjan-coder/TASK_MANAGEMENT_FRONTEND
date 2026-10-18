"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Timer } from "lucide-react";
import { workflowApi } from "@/lib/api/workflow.api";
import { cn } from "@/lib/utils";

/**
 * E2: time in each stage, from the stage history (nothing for staff to enter).
 * The bar shows the average against the target; the slowest stage is flagged.
 */
export function StageReport() {
  const [days, setDays] = useState(180);
  const { data, isLoading } = useQuery({ queryKey: ["workflow-report", days], queryFn: () => workflowApi.report(days) });
  const max = Math.max(1, ...(data?.rows || []).map((r) => Math.max(r.averageDays ?? 0, r.targetDays ?? 0)));

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-white flex items-center gap-1.5 flex-1">
          <Timer className="h-4 w-4" /> Time in each stage
        </h2>
        {[30, 90, 180, 365].map((d) => (
          <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={cn("px-2.5 py-1 rounded-lg border text-xs", days === d ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {d === 365 ? "1 year" : `${d} days`}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="h-32 rounded-xl bg-slate-800/50 animate-pulse" />
      ) : (
        <>
          {data.bottleneck && (
            <p className="text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Slowest stage: <b>{data.rows.find((r) => r.stage === data.bottleneck)?.name}</b>
              {(() => {
                const r = data.rows.find((x) => x.stage === data.bottleneck);
                return r?.targetDays && r.averageDays ? ` · ${r.averageDays} days on average against a ${r.targetDays}-day target` : r?.averageDays ? ` · ${r.averageDays} days on average` : "";
              })()}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="py-2 pr-3 font-medium">Stage</th>
                  <th className="py-2 pr-3 font-medium w-[38%]">Average vs target</th>
                  <th className="py-2 pr-3 font-medium text-right">Median</th>
                  <th className="py-2 pr-3 font-medium text-right">Over target</th>
                  <th className="py-2 pr-3 font-medium text-right">Finished</th>
                  <th className="py-2 pr-3 font-medium text-right">There now</th>
                  <th className="py-2 font-medium text-right">Overdue now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.rows.map((r) => (
                  <tr key={r.stage} className={cn(r.stage === data.bottleneck && "bg-amber-500/5", r.older && "opacity-60")}>
                    <td className="py-2 pr-3 text-slate-200">{r.name}</td>
                    <td className="py-2 pr-3">
                      {r.averageDays === null ? (
                        <span className="text-slate-600">No finished projects yet</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="relative h-2 rounded-full bg-slate-800">
                            <div className={cn("h-2 rounded-full", r.targetDays && r.averageDays > r.targetDays ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${(r.averageDays / max) * 100}%` }} />
                            {r.targetDays && <div className="absolute -top-0.5 h-3 w-0.5 bg-white/70" style={{ left: `${(r.targetDays / max) * 100}%` }} title={`Target ${r.targetDays} days`} />}
                          </div>
                          <span className="text-slate-400">{r.averageDays} days{r.targetDays ? ` · target ${r.targetDays}` : ""}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-300">{r.medianDays ?? "—"}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{r.overTargetPct === null ? "—" : `${r.overTargetPct}%`}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{r.finished}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{r.inStageNow}</td>
                    <td className={cn("py-2 text-right", r.overdueNow ? "text-rose-300 font-semibold" : "text-slate-500")}>{r.overdueNow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            {data.projects} project(s) in the last {data.days} days. Set each stage&apos;s usual time under Stages → Rules &amp; messages to see targets and get overdue alerts.
          </p>
        </>
      )}
    </section>
  );
}
