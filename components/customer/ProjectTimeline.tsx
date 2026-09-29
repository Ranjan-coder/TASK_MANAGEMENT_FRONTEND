"use client";

import Link from "next/link";
import { Check, MessageSquare, CalendarClock } from "lucide-react";
import { PROJECT_STAGES, type MyProject } from "@/lib/api/projectExtras.api";
import { cn } from "@/lib/utils";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** One project's status timeline (R1): Consultation → … → Handover. Read-only for customers. */
export function ProjectTimeline({ project }: { project: MyProject }) {
  const currentIdx = PROJECT_STAGES.findIndex((s) => s.value === project.stage);
  const reachedAt = (stage: string) => [...project.stageHistory].reverse().find((h) => h.stage === stage)?.at;
  const latestNote = [...project.stageHistory].reverse().find((h) => h.note)?.note;
  const done = project.stage === "handover" || project.status === "completed";

  return (
    <article className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{project.name}</h3>
          <p className="text-xs text-slate-400">
            {project.leadDesigner ? `Designer: ${project.leadDesigner.name}` : "Your Bonito team"}
            {project.status === "on_hold" && <span className="ml-2 text-amber-300">· On hold</span>}
          </p>
        </div>
        <Link href={`/chat/${project._id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold">
          <MessageSquare className="h-3.5 w-3.5" /> Open chat
        </Link>
      </header>

      <ol aria-label="Project progress" className="flex sm:grid sm:grid-cols-7 gap-0 overflow-x-auto pb-1 -mx-1 px-1">
        {PROJECT_STAGES.map((s, i) => {
          const state = i < currentIdx || (done && i === currentIdx) ? "done" : i === currentIdx ? "current" : "todo";
          const at = reachedAt(s.value);
          return (
            <li key={s.value} aria-current={state === "current" ? "step" : undefined} className="relative flex flex-col items-center text-center min-w-[84px] sm:min-w-0">
              {i > 0 && <span className={cn("absolute top-3.5 right-1/2 w-full h-0.5 -z-0", i <= currentIdx ? "bg-violet-500" : "bg-slate-700")} aria-hidden />}
              <span
                className={cn(
                  "relative z-10 h-7 w-7 rounded-full flex items-center justify-center border-2 text-[11px] font-bold",
                  state === "done" && "bg-violet-600 border-violet-600 text-white",
                  state === "current" && "bg-slate-950 border-violet-400 text-violet-200 ring-4 ring-violet-500/20",
                  state === "todo" && "bg-slate-950 border-slate-700 text-slate-500"
                )}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("mt-1.5 text-[11px] leading-tight", state === "todo" ? "text-slate-500" : "text-slate-200", state === "current" && "font-semibold")}>{s.label}</span>
              {at && state !== "todo" && <span className="text-[10px] text-slate-500">{fmt(at)}</span>}
            </li>
          );
        })}
      </ol>

      {(latestNote || project.expectedHandover) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          {latestNote && <p>📍 {latestNote}</p>}
          {project.expectedHandover && !done && (
            <p className="inline-flex items-center gap-1 text-slate-400">
              <CalendarClock className="h-3.5 w-3.5" /> Expected handover {new Date(project.expectedHandover).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
