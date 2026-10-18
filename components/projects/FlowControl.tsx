"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, X, AlertTriangle, ListChecks, Wrench } from "lucide-react";
import { toast } from "sonner";
import { workflowApi, flowError, type ProjectFlowResult, type StaffFlowView, type StaffStage } from "@/lib/api/workflow.api";
import { extrasApi } from "@/lib/api/projectExtras.api";
import { cn } from "@/lib/utils";

const MIN_REASON = 5;
type Status = "active" | "on_hold" | "completed";
type Pending =
  | { kind: "next" | "back" | "jump" | "override"; to: string }
  | { kind: "activate"; path: string; label: string }
  | { kind: "extra"; stageKey: string; label: string }
  | null;

/**
 * A project's place in its company workflow, with the controls to move it
 * (project-workflow-plan.md §7). The server applies the same rules and refuses
 * anything not allowed; this shows only what makes sense to offer.
 *
 * Every action sends what's on screen (`from`): if someone else changed the
 * project meanwhile, the server refuses and we reload instead of overwriting.
 */
export function FlowControl({
  projectId,
  view,
  status = "active",
  version,
  canEdit,
  isAdmin = false,
  compact = false,
  expectedHandover = null,
  onChange,
  onStale
}: {
  projectId: string;
  view: StaffFlowView;
  status?: Status;
  version?: number;
  canEdit: boolean;
  isAdmin?: boolean;
  compact?: boolean;
  expectedHandover?: string | null;
  onChange: (r: ProjectFlowResult) => void;
  /** Reload the project (someone else changed it, or a field saved outside the flow) */
  onStale?: () => void;
}) {
  const handoverValue = expectedHandover ? expectedHandover.slice(0, 10) : "";
  const [handover, setHandover] = useState(handoverValue);
  const saveHandover = async () => {
    setBusy(true);
    try {
      await extrasApi.setStage(projectId, { stage: view.stageKey as never, from: view.stageKey as never, expectedHandover: handover ? new Date(`${handover}T12:00:00+05:30`).toISOString() : null });
      toast.success("Expected handover saved");
      onStale?.();
    } catch (err) {
      toast.error(flowError(err, "Couldn't save the date").message);
    } finally {
      setBusy(false);
    }
  };
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [jumpTo, setJumpTo] = useState("");
  const live = canEdit && status === "active";

  // Step key → readable name, and the current stage (O(steps) once per view)
  const { names, current, stepList } = useMemo(() => {
    const m = new Map<string, string>();
    const list: { key: string; label: string; optional: boolean; active: boolean }[] = [];
    for (const s of view.stages) {
      if (!s.any && s.subs.length) {
        for (const sub of s.subs) {
          m.set(sub.path, `${s.name} › ${sub.name}`);
          list.push({ key: sub.path, label: `${s.name} › ${sub.name}`, optional: sub.optional, active: sub.status !== "inactive" });
        }
      } else {
        m.set(s.key, s.name);
        list.push({ key: s.key, label: s.name, optional: false, active: true });
      }
    }
    return { names: m, current: view.stages.find((s) => s.status === "current") as StaffStage, stepList: list };
  }, [view]);

  const optionalAhead = useMemo(
    () =>
      view.stages
        .filter((s) => s.status !== "done")
        .flatMap((s) => s.subs.filter((sub) => sub.optional && sub.status === "inactive").map((sub) => ({ path: sub.path, label: `${s.name} › ${sub.name}` }))),
    [view]
  );

  const run = async (fn: () => Promise<ProjectFlowResult>, ok: string) => {
    setBusy(true);
    try {
      const r = await fn();
      onChange(r);
      setPending(null);
      setNote("");
      toast.success(ok);
    } catch (err) {
      const e = flowError(err);
      toast.error(e.message);
      if (["STEP_CHANGED", "STAGE_CHANGED", "PROJECT_CHANGED"].includes(e.code || "")) {
        setPending(null);
        onStale?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const needsReason = pending && pending.kind !== "next";
  const reasonOk = !needsReason || note.trim().length >= MIN_REASON;
  const blocked = view.blockers.length > 0;
  const nextCrossesStage = view.next ? !view.next.startsWith(`${current?.key}/`) && view.next !== current?.key : false;

  const confirm = () => {
    if (!pending) return;
    const n = note.trim();
    if (pending.kind === "activate") return run(() => workflowApi.activate(projectId, pending.path, n), `Added: ${pending.label}`);
    if (pending.kind === "extra") return run(() => workflowApi.addExtra(projectId, pending.stageKey, n), "Additional work added");
    const label = names.get(pending.to) || pending.to;
    return run(
      () => workflowApi.move(projectId, { to: pending.to, from: view.stepKey, note: n || undefined, override: pending.kind === "override" }),
      pending.kind === "back" ? `Moved back to ${label}` : `Moved to ${label}`
    );
  };

  const subDot = (st: string) =>
    st === "done" ? (
      <Check className="h-3 w-3 text-emerald-400" />
    ) : st === "current" ? (
      <span className="h-2 w-2 rounded-full bg-violet-400 ring-4 ring-violet-500/20" />
    ) : (
      <span className="h-2 w-2 rounded-full border border-slate-500" />
    );

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {/* Stage track */}
      <ol className="flex items-start" aria-label="Project stages">
        {view.stages.map((s, i) => (
          <li key={s.key} className="flex-1 flex flex-col items-center relative min-w-0">
            {i > 0 && <span aria-hidden className={cn("absolute top-3 right-1/2 w-full h-0.5", s.status !== "upcoming" ? "bg-emerald-500/70" : "bg-slate-700")} />}
            <span
              aria-current={s.status === "current" ? "step" : undefined}
              title={s.name}
              className={cn(
                "relative z-10 flex items-center justify-center rounded-full border-2 text-[10px] font-semibold h-6 w-6",
                s.status === "done" && "bg-emerald-600 border-emerald-500 text-white",
                s.status === "current" && "bg-violet-600 border-violet-300 text-white ring-4 ring-violet-500/25",
                s.status === "upcoming" && "bg-slate-900 border-slate-600 text-slate-400"
              )}
            >
              {s.status === "done" ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {!compact && <span className={cn("mt-1 text-[10px] text-center leading-tight px-0.5 truncate max-w-full", s.status === "current" ? "text-white font-semibold" : "text-slate-500")}>{s.name}</span>}
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
          <div className="h-full bg-gradient-to-r from-violet-500 to-emerald-500" style={{ width: `${view.progress.percent}%` }} />
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">
          {current?.name} · step {view.progress.done + 1} of {view.progress.total}
          {version ? ` · v${version}` : ""}
        </span>
      </div>

      {/* Current stage detail */}
      {current && (current.subs.length > 0 || current.checklist.length > 0 || current.extras.length > 0) && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 space-y-2">
          {current.subs.length > 0 && (
            <ul className="space-y-1">
              {current.subs.map((sub) =>
                current.any ? (
                  <li key={sub.path} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="accent-violet-500"
                      disabled={!live || busy || sub.status === "inactive"}
                      checked={sub.status === "done"}
                      onChange={(e) => run(() => workflowApi.tick(projectId, sub.path, e.target.checked), e.target.checked ? `${sub.name} done` : `${sub.name} reopened`)}
                      aria-label={sub.name}
                    />
                    <span className={cn(sub.status === "inactive" ? "text-slate-600" : "text-slate-200")}>{sub.name}</span>
                    {sub.optional && <span className="text-[10px] text-slate-500">{sub.status === "inactive" ? "optional" : "added"}</span>}
                  </li>
                ) : (
                  <li key={sub.path} className={cn("flex items-center gap-2 text-xs", sub.status === "inactive" && "opacity-50")}>
                    <span className="w-3 flex justify-center">{subDot(sub.status)}</span>
                    <span className={cn(sub.status === "current" ? "text-white font-medium" : "text-slate-300")}>{sub.name}</span>
                    {sub.optional && <span className="text-[10px] text-slate-500">{sub.status === "inactive" ? "optional" : "added"}</span>}
                    {sub.showToCustomer && <span className="text-[10px] text-sky-400">customer sees</span>}
                  </li>
                )
              )}
            </ul>
          )}
          {current.checklist.length > 0 && (
            <ul className="space-y-1 border-t border-slate-800 pt-2">
              {current.checklist.map((it) => (
                <li key={it.key} className="flex items-center gap-2 text-xs text-slate-300">
                  <ListChecks className="h-3 w-3 text-slate-500" />
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" className="accent-violet-500" disabled={!live || busy} checked={it.done} onChange={(e) => run(() => workflowApi.checklist(projectId, it.key, e.target.checked), "Checklist updated")} />
                    {it.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {current.extras.length > 0 && (
            <ul className="space-y-1 border-t border-slate-800 pt-2">
              {current.extras.map((x) => (
                <li key={x._id} className="flex items-center gap-2 text-xs">
                  <Wrench className="h-3 w-3 text-amber-400" />
                  <span className={cn("flex-1", x.done ? "text-slate-500 line-through" : "text-slate-200")}>{x.note}</span>
                  {live && !x.done && (
                    <>
                      <button disabled={busy} onClick={() => run(() => workflowApi.updateExtra(projectId, x._id, "done"), "Marked done")} className="text-emerald-300 hover:underline">Done</button>
                      <button disabled={busy} onClick={() => window.confirm("Remove this item?") && run(() => workflowApi.updateExtra(projectId, x._id, "remove"), "Removed")} className="text-slate-500 hover:text-rose-300" aria-label="Remove">
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* What stops the next stage */}
      {blocked && nextCrossesStage && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 space-y-0.5">
          {view.blockers.map((b) => (
            <p key={b.code} className="flex gap-1.5"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {b.message}</p>
          ))}
        </div>
      )}

      {canEdit && status !== "active" && (
        <p className="text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 px-3 py-2">
          {status === "completed" ? "This project is completed." : "This project is on hold. Resume it to move it."}
        </p>
      )}

      {/* Actions */}
      {live && !pending && (
        <div className="flex flex-wrap items-center gap-2">
          {view.next && !(blocked && nextCrossesStage) && (
            <button disabled={busy} onClick={() => setPending({ kind: "next", to: view.next! })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40">
              Next: {names.get(view.next)} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          {view.next && blocked && nextCrossesStage && isAdmin && (
            <button disabled={busy} onClick={() => setPending({ kind: "override", to: view.next! })} className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-200 text-xs">
              Move on anyway…
            </button>
          )}
          {!view.next && <span className="text-xs text-emerald-300">Final step. Mark the project completed when it&apos;s handed over.</span>}
          {view.prev && (
            <button disabled={busy} onClick={() => setPending({ kind: "back", to: view.prev! })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:border-slate-500">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          {current && (
            <button disabled={busy} onClick={() => setPending({ kind: "extra", stageKey: current.key, label: current.name })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:border-slate-500">
              <Plus className="h-3 w-3" /> Additional work
            </button>
          )}
          {optionalAhead.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const o = optionalAhead.find((x) => x.path === e.target.value);
                if (o) setPending({ kind: "activate", path: o.path, label: o.label });
              }}
              aria-label="Add an optional step"
              className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 max-w-[14rem]"
            >
              <option value="">+ Add a step (e.g. Redesign)…</option>
              {optionalAhead.map((o) => <option key={o.path} value={o.path}>{o.label}</option>)}
            </select>
          )}
          {isAdmin && !compact && (
            <select
              value={jumpTo}
              onChange={(e) => {
                setJumpTo("");
                if (e.target.value) setPending({ kind: "jump", to: e.target.value });
              }}
              aria-label="Skip to a step (admin)"
              className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-400 max-w-[12rem]"
            >
              <option value="">Skip to… (admin)</option>
              {stepList.filter((s) => s.active && s.key !== view.stepKey && s.key !== view.next && s.key !== view.prev).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
        </div>
      )}

      {live && pending && (
        <form
          className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reasonOk) confirm();
          }}
        >
          <p className="text-xs text-slate-200">
            {pending.kind === "activate" && <>Add <b className="text-white">{pending.label}</b> to this project? The customer will see it.</>}
            {pending.kind === "extra" && <>Additional work in <b className="text-white">{pending.label}</b>. The customer will see it, and the stage can&apos;t be left until it&apos;s done.</>}
            {pending.kind === "next" && <>Move to <b className="text-white">{names.get(pending.to)}</b>?</>}
            {pending.kind === "back" && <>Move back to <b className="text-white">{names.get(pending.to)}</b>?</>}
            {pending.kind === "jump" && <>Skip to <b className="text-white">{names.get(pending.to)}</b>?</>}
            {pending.kind === "override" && <>Move on to <b className="text-white">{names.get(pending.to)}</b> without finishing this stage? This is recorded.</>}
          </p>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder={pending.kind === "extra" ? "What needs doing (e.g. Add a study table)" : needsReason ? "Reason (the customer may see it)" : "Note for the customer (optional)"}
            aria-label="Note"
            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
          />
          {needsReason && !reasonOk && <p className="text-[11px] text-slate-500">At least {MIN_REASON} characters.</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !reasonOk} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-40">{busy ? "Saving…" : "Confirm"}</button>
            <button type="button" onClick={() => setPending(null)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">Cancel</button>
          </div>
        </form>
      )}

      {canEdit && !pending ? (
        <form
          className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400"
          onSubmit={(e) => {
            e.preventDefault();
            saveHandover();
          }}
        >
          Expected handover
          <input type="date" value={handover} onChange={(e) => setHandover(e.target.value)} aria-label="Expected handover" className="px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-white text-xs" />
          {handover !== handoverValue && (
            <button type="submit" disabled={busy} className="px-2 py-1 rounded-md border border-slate-600 text-slate-200 disabled:opacity-40">Save</button>
          )}
        </form>
      ) : (
        !canEdit &&
        expectedHandover && <p className="text-[11px] text-slate-400">Expected handover: {new Date(expectedHandover).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
      )}
    </div>
  );
}
