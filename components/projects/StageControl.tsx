"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  extrasApi,
  PROJECT_STAGES,
  stageIndex,
  stageLabel,
  nextStageOf,
  prevStageOf,
  STAGE_MIN_REASON,
  type ProjectStage,
  type StageMove,
  type Timeline
} from "@/lib/api/projectExtras.api";
import { cn } from "@/lib/utils";

type Status = "active" | "on_hold" | "completed";
type Pending = { to: ProjectStage; kind: StageMove } | null;

const errInfo = (err: unknown) => {
  const r = (err as { response?: { data?: { message?: string; errors?: { code?: string }[] } } })?.response;
  return { code: r?.data?.errors?.[0]?.code, message: r?.data?.message };
};

/**
 * Project stage track with the controls to move it (same rules as the server,
 * backend config/projectStages.js):
 *   - "Move to <next>": one step forward, optional note for the customer
 *   - "Back": one step back, reason required
 *   - admins can click any step to skip to it, reason required
 * Sends the stage on screen as `from`; if someone moved it meanwhile the server
 * refuses (STAGE_CHANGED) and we reload instead of overwriting their change.
 */
export function StageControl({
  projectId,
  stage: rawStage,
  status = "active",
  expectedHandover = null,
  canEdit,
  isAdmin = false,
  compact = false,
  onUpdated,
  onStale
}: {
  projectId: string;
  stage?: ProjectStage | null;
  status?: Status;
  expectedHandover?: string | null;
  canEdit: boolean;
  isAdmin?: boolean;
  compact?: boolean;
  onUpdated: (t: Timeline) => void;
  /** Someone else changed it first: reload the project */
  onStale?: () => void;
}) {
  const stage = (rawStage || "consultation") as ProjectStage;
  const current = stageIndex(stage);
  const next = nextStageOf(stage);
  const prev = prevStageOf(stage);
  const movable = canEdit && status === "active";
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const handoverValue = expectedHandover ? expectedHandover.slice(0, 10) : "";
  const [handover, setHandover] = useState(handoverValue);

  const needsReason = Boolean(pending && pending.kind !== "next");
  const reasonOk = !needsReason || note.trim().length >= STAGE_MIN_REASON;

  const send = async (body: Parameters<typeof extrasApi.setStage>[1], ok: string) => {
    setBusy(true);
    try {
      const t = await extrasApi.setStage(projectId, body);
      onUpdated(t);
      setPending(null);
      setNote("");
      toast.success(ok);
    } catch (err) {
      const e = errInfo(err);
      toast.error(e.message || "Couldn't update the stage");
      if (e.code === "STAGE_CHANGED") {
        setPending(null);
        onStale?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmMove = () => {
    if (!pending) return;
    const verb = pending.kind === "back" ? "Moved back to" : "Moved to";
    send({ stage: pending.to, from: stage, note: note.trim() || undefined }, `${verb} ${stageLabel(pending.to)} — the customer has been told`);
  };

  const pickStep = (to: ProjectStage) => {
    if (!movable || to === stage) return;
    const d = stageIndex(to) - current;
    const kind: StageMove = d === 1 ? "next" : d === -1 ? "back" : "jump";
    if (kind === "jump" && !isAdmin) return; // non-admins move one step at a time
    setPending({ to, kind });
    setNote("");
  };

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {/* Track */}
      <ol className="flex items-start" aria-label="Project stages">
        {PROJECT_STAGES.map((s, i) => {
          const done = i < current;
          const here = i === current;
          const d = i - current;
          const clickable = movable && !here && (Math.abs(d) === 1 || isAdmin);
          return (
            <li key={s.value} className="flex-1 flex flex-col items-center relative min-w-0">
              {i > 0 && <span aria-hidden className={cn("absolute top-3 right-1/2 w-full h-0.5", i <= current ? "bg-emerald-500/70" : "bg-slate-700")} />}
              <button
                type="button"
                disabled={!clickable || busy}
                onClick={() => pickStep(s.value)}
                aria-current={here ? "step" : undefined}
                aria-label={`${s.label}${here ? " (current)" : done ? " (done)" : ""}`}
                title={clickable ? (Math.abs(d) === 1 ? `Move to ${s.label}` : `Skip to ${s.label} (admin)`) : s.label}
                className={cn(
                  "relative z-10 flex items-center justify-center rounded-full border-2 text-[11px] font-semibold transition",
                  compact ? "h-6 w-6" : "h-7 w-7",
                  done && "bg-emerald-600 border-emerald-500 text-white",
                  here && "bg-violet-600 border-violet-300 text-white ring-4 ring-violet-500/25",
                  !done && !here && "bg-slate-900 border-slate-600 text-slate-400",
                  clickable && "hover:border-violet-400 cursor-pointer",
                  pending?.to === s.value && "border-amber-400"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </button>
              {!compact && (
                <span className={cn("mt-1.5 text-[10px] sm:text-[11px] text-center leading-tight px-0.5", here ? "text-white font-semibold" : "text-slate-500")}>{s.label}</span>
              )}
            </li>
          );
        })}
      </ol>
      {compact && (
        <p className="text-xs text-slate-300">
          Stage {current + 1} of {PROJECT_STAGES.length}: <span className="text-white font-medium">{stageLabel(stage)}</span>
        </p>
      )}

      {canEdit && status !== "active" && (
        <p className="text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 px-3 py-2">
          {status === "completed" ? "This project is completed. An admin can reopen it to change the stage." : "This project is on hold. Resume it to move the stage."}
        </p>
      )}

      {movable && !pending && (
        <div className="flex flex-wrap items-center gap-2">
          {next ? (
            <button type="button" disabled={busy} onClick={() => setPending({ to: next, kind: "next" })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40">
              Move to {stageLabel(next)} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="text-xs text-emerald-300">Final stage. Mark the project completed when the handover is done.</span>
          )}
          {prev && (
            <button type="button" disabled={busy} onClick={() => setPending({ to: prev, kind: "back" })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:border-slate-500 disabled:opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          {isAdmin && !compact && <span className="text-[11px] text-slate-500">Admins can click any step to skip to it.</span>}
        </div>
      )}

      {movable && pending && (
        <form
          className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reasonOk) confirmMove();
          }}
        >
          <p className="text-xs text-slate-200">
            {pending.kind === "next" ? "Move to" : pending.kind === "back" ? "Move back to" : "Skip to"}{" "}
            <span className="font-semibold text-white">{stageLabel(pending.to)}</span>? The customer is notified.
          </p>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder={needsReason ? "Reason (the customer will see it)" : "Note for the customer (optional)"}
            aria-label={needsReason ? "Reason" : "Note"}
            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
          />
          {needsReason && !reasonOk && <p className="text-[11px] text-slate-500">At least {STAGE_MIN_REASON} characters.</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !reasonOk} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-40">
              {busy ? "Saving…" : "Confirm"}
            </button>
            <button type="button" onClick={() => setPending(null)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">
              Cancel
            </button>
          </div>
        </form>
      )}

      {canEdit && !pending ? (
        <form
          className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400"
          onSubmit={(e) => {
            e.preventDefault();
            send({ stage, from: stage, expectedHandover: handover ? new Date(`${handover}T12:00:00+05:30`).toISOString() : null }, "Expected handover saved");
          }}
        >
          <CalendarClock className="h-3.5 w-3.5" /> Expected handover
          <input type="date" value={handover} onChange={(e) => setHandover(e.target.value)} aria-label="Expected handover" className="px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-white text-xs" />
          {handover !== handoverValue && (
            <button type="submit" disabled={busy} className="px-2 py-1 rounded-md border border-slate-600 text-slate-200 hover:border-slate-400 disabled:opacity-40">
              Save
            </button>
          )}
        </form>
      ) : (
        !canEdit &&
        expectedHandover && (
          <p className="text-[11px] text-slate-400">
            Expected handover: {new Date(expectedHandover).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )
      )}
    </div>
  );
}
