"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Plus, Workflow as WorkflowIcon, Save, Upload, Sparkles } from "lucide-react";
import { workflowApi, flowError, type CustomerFlowView, type DiffSummary, type EditorState, type MergeConflict, type StageDef, type WorkflowTree } from "@/lib/api/workflow.api";
import { StageCard, SummaryCard, PreviewCard, input, clone, LIMITS } from "@/components/workflow/EditorParts";
import { cn } from "@/lib/utils";
import { StageReport } from "@/components/workflow/StageReport";
import { useAuthStore } from "@/store/authStore";
import { can } from "@/lib/permissions";

/**
 * Project workflow (project-workflow-plan.md §10). Admins edit everything; the
 * people handling a stage edit that stage. Changes are saved as a draft and only
 * reach projects when published; running projects stay on their version until
 * moved.
 */
export default function WorkflowPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  // Leadership reads the report only; the editor is for admins and stage handlers
  const reportOnly = me?.role === "leadership";
  const canReport = can(me, "performance.view");
  const { data: state, refetch } = useQuery({ queryKey: ["workflow-editor"], queryFn: workflowApi.editor, enabled: Boolean(me) && !reportOnly });
  const [tree, setTree] = useState<WorkflowTree | null>(null);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [preview, setPreview] = useState<CustomerFlowView | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "versions" | "report">("edit");
  const [conflicts, setConflicts] = useState<MergeConflict[]>([]);

  // Working copy = the draft if there is one, else the current version
  useEffect(() => {
    if (!state) return;
    setTree(clone(state.draft ?? state.tree));
    setRevision(state.draftRevision);
    setPreview(state.preview);
    setDirty(false);
  }, [state]);

  const all = state?.canEdit === "all";
  const mine = useMemo(() => new Set(Array.isArray(state?.canEdit) ? state!.canEdit : []), [state]);
  const canEditStage = (s: StageDef) => all || Boolean(s.key && mine.has(s.key));
  const readOnly = !all && mine.size === 0;

  const change = (fn: (t: WorkflowTree) => void) =>
    setTree((t) => {
      const next = clone(t!);
      fn(next);
      setDirty(true);
      return next;
    });

  const save = async (): Promise<number | null> => {
    if (!tree) return null;
    setBusy(true);
    try {
      const out = await workflowApi.saveDraft(tree, revision);
      setTree(clone(out.draft));
      setRevision(out.draftRevision);
      setSummary(out.summary);
      setPreview(out.preview);
      setDirty(false);
      toast.success("Draft saved");
      return out.draftRevision;
    } catch (err) {
      const e = flowError(err, "Couldn't save the draft");
      toast.error(e.message);
      if (e.code === "DRAFT_CHANGED") refetch();
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const rev = dirty ? await save() : revision;
    if (rev === null) return;
    if (!window.confirm("Publish these changes? New projects follow them at once; running projects stay on their version until moved.")) return;
    setBusy(true);
    try {
      const out = await workflowApi.publish(rev);
      toast.success(`Version ${out.version} published${out.projectsOnOlderVersions ? ` · ${out.projectsOnOlderVersions} project(s) still on older versions` : ""}`);
      setSummary(null);
      qc.invalidateQueries({ queryKey: ["workflow-versions"] });
      await refetch();
    } catch (err) {
      toast.error(flowError(err, "Couldn't publish").message);
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Throw away the draft and go back to the current version?")) return;
    try {
      await workflowApi.discardDraft(revision);
      setSummary(null);
      await refetch();
      toast.success("Draft discarded");
    } catch (err) {
      toast.error(flowError(err).message);
    }
  };

  const applyOffer = async () => {
    if (dirty && !window.confirm("Your unsaved changes will be included in the merge only if saved. Continue without them?")) return;
    setBusy(true);
    try {
      const out = await workflowApi.applyOffer();
      setTree(clone(out.draft));
      setRevision(out.draftRevision);
      setPreview(out.preview);
      setConflicts(out.conflicts);
      setDirty(false);
      toast.success(out.conflicts.length ? `Merged into the draft: ${out.conflicts.length} item(s) to check` : "Merged into the draft. Review it and publish.");
      qc.invalidateQueries({ queryKey: ["workflow-editor"] });
    } catch (err) {
      toast.error(flowError(err, "Couldn't take the update").message);
    } finally {
      setBusy(false);
    }
  };
  const dismissOffer = async () => {
    if (!window.confirm("Dismiss this update? You won't be asked about this version again.")) return;
    try {
      await workflowApi.dismissOffer();
      await refetch();
    } catch (err) {
      toast.error(flowError(err).message);
    }
  };

  if (reportOnly)
    return (
      <div className="max-w-6xl mx-auto space-y-5">
        <h1 className="text-2xl font-bold text-white">Project workflow</h1>
        <StageReport />
      </div>
    );

  if (!state || !tree) return <div className="max-w-5xl mx-auto"><div className="h-40 rounded-2xl bg-slate-900 animate-pulse" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <WorkflowIcon className="h-5 w-5 text-violet-300" />
        </div>
        <div className="flex-1 min-w-[240px]">
          <h1 className="text-2xl font-bold text-white">Project workflow</h1>
          <p className="text-sm text-slate-400">
            Version {state.version}
            {state.draft && " · draft in progress"}
            {state.olderProjects > 0 && ` · ${state.olderProjects} project(s) on older versions`}
            {readOnly ? " · view only" : all ? "" : ` · you can edit: ${tree.stages.filter((s) => s.key && mine.has(s.key)).map((s) => s.name).join(", ")}`}
          </p>
        </div>
        <div className="flex gap-2" role="tablist">
          {(canReport ? (["edit", "versions", "report"] as const) : (["edit", "versions"] as const)).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("px-3 py-1.5 rounded-lg border text-sm", tab === t ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
              {t === "edit" ? "Stages" : t === "versions" ? "Versions & projects" : "Time in stage"}
            </button>
          ))}
        </div>
      </div>

      {state.offer && (
        <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4 space-y-2">
          <p className="text-sm text-sky-100 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>
              <b>New version available:</b> {state.offer.templateName} v{state.offer.toVersion} (you started from v{state.offer.fromVersion}).
            </span>
          </p>
          <SummaryCard summary={state.offer.summary} title="What the update changes" />
          {state.offer.pending ? (
            <p className="text-xs text-sky-200">It&apos;s merged into your draft: review it and publish.</p>
          ) : (
            <div className="flex gap-2">
              <button disabled={busy} onClick={applyOffer} className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold disabled:opacity-40">Review & merge into a draft</button>
              <button disabled={busy} onClick={dismissOffer} className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-300">Not now</button>
            </div>
          )}
          <p className="text-[11px] text-slate-400">Your own changes are kept. Nothing changes for your projects until you publish.</p>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1.5">
          <p className="text-sm font-semibold text-amber-100">Changed on both sides: your version was kept</p>
          <ul className="text-xs text-amber-100/90 space-y-1">
            {conflicts.map((c, i) => (
              <li key={i}>
                <b>{c.name}</b> · {c.field === "removed" ? "the update removes it, but you had changed it" : `${c.field}: yours “${String(c.ours ?? "—")}”, the update “${String(c.theirs ?? "—")}”`}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-amber-200/80">Change anything you&apos;d rather take from the update, then publish.</p>
        </div>
      )}

      {tab === "report" ? (
        <StageReport />
      ) : tab === "versions" ? (
        <VersionsTab state={state} onMoved={() => refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {tree.stages.map((s, i) => (
              <StageCard
                key={s.key || `new-${i}`}
                stage={s}
                index={i}
                count={tree.stages.length}
                editable={!readOnly && canEditStage(s)}
                structural={all}
                companyFields
                open={open === (s.key || `new-${i}`)}
                onToggle={() => setOpen(open === (s.key || `new-${i}`) ? null : s.key || `new-${i}`)}
                onChange={(fn) => change((t) => fn(t.stages[i]))}
                onMove={(d) =>
                  change((t) => {
                    const [x] = t.stages.splice(i, 1);
                    t.stages.splice(i + d, 0, x);
                  })
                }
                onRemove={() => window.confirm(`Remove the stage "${s.name}"? Projects in it will need a new place when moved to the new version.`) && change((t) => void t.stages.splice(i, 1))}
              />
            ))}
            {all && tree.stages.length < LIMITS.stages && (
              <button onClick={() => change((t) => void t.stages.push({ name: `New stage ${t.stages.length + 1}`, subStages: [] }))} className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-sm text-slate-400 hover:border-violet-500 hover:text-violet-300 inline-flex items-center justify-center gap-1.5">
                <Plus className="h-4 w-4" /> Add a stage
              </button>
            )}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-4 self-start">
            {!readOnly && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
                <button disabled={busy || !dirty} onClick={save} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 disabled:opacity-40">
                  <Save className="h-4 w-4" /> {dirty ? "Save draft" : "Draft saved"}
                </button>
                <button disabled={busy || (!dirty && !state.draft)} onClick={publish} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-40">
                  <Upload className="h-4 w-4" /> Publish
                </button>
                {all && state.draft && (
                  <button disabled={busy} onClick={discard} className="w-full text-xs text-slate-500 hover:text-rose-300">
                    Discard draft
                  </button>
                )}
                <p className="text-[11px] text-slate-500">New projects follow a published version at once. Running projects stay where they are until moved (Versions & projects).</p>
              </div>
            )}
            {summary && !summary.empty && <SummaryCard summary={summary} />}
            {preview && <PreviewCard preview={preview} />}
          </aside>
        </div>
      )}
    </div>
  );
}

// ── Versions & moving projects ────────────────────────────────────────────────

function VersionsTab({ state, onMoved }: { state: EditorState; onMoved: () => void }) {
  const { data: versions, refetch } = useQuery({ queryKey: ["workflow-versions"], queryFn: workflowApi.versions });
  const [from, setFrom] = useState<number | null>(null);
  const { data: plan } = useQuery({ queryKey: ["workflow-migrate", from], queryFn: () => workflowApi.migrationPlan(from!), enabled: from !== null });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setMapping({}), [from]);

  const move = async () => {
    if (from === null) return;
    setBusy(true);
    try {
      const out = await workflowApi.migrate(from, mapping);
      toast.success(`${out.moved} project(s) moved to version ${out.toVersion}`);
      setFrom(null);
      refetch();
      onMoved();
    } catch (err) {
      toast.error(flowError(err, "Couldn't move the projects").message);
    } finally {
      setBusy(false);
    }
  };

  const ready = plan && plan.removed.every((r) => mapping[r.key]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-white flex items-center gap-1.5"><History className="h-4 w-4" /> Versions</h2>
        <ul className="divide-y divide-slate-800">
          {(versions || []).map((v) => (
            <li key={v.version} className="py-2 flex items-center gap-3 text-xs">
              <span className={cn("font-semibold", v.version === state.version ? "text-emerald-300" : "text-white")}>v{v.version}</span>
              <span className="flex-1 text-slate-400">
                {new Date(v.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {v.publishedBy && ` · ${v.publishedBy}`}
                {v.source === "standard" && " · starting copy"}
                {v.changes && ` · +${v.changes.added} −${v.changes.removed} ~${v.changes.renamed + v.changes.changed}`}
              </span>
              <span className="text-slate-300">{v.projects} project(s)</span>
              {v.version !== state.version && v.projects > 0 && (
                <button onClick={() => setFrom(v.version)} className="px-2 py-1 rounded-md bg-violet-600/80 text-white">Move to v{state.version}</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {from !== null && plan && (
        <section className="rounded-2xl border border-violet-500/40 bg-slate-900/70 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Move projects from v{plan.fromVersion} to v{plan.toVersion}</h2>
          {plan.removed.length === 0 ? (
            <p className="text-xs text-slate-300">Every step still exists. Projects keep their place.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-300">These steps no longer exist. Where should projects there go?</p>
              {plan.removed.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-40 shrink-0">{r.name}</span>→
                  <select className={cn(input, "py-1 text-xs")} value={mapping[r.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [r.key]: e.target.value }))}>
                    <option value="">Choose a step…</option>
                    {plan.targets.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Each project gets a “workflow updated” entry in its history. Customers aren&apos;t notified one by one.</p>
          <div className="flex gap-2">
            <button disabled={busy || !ready} onClick={move} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold disabled:opacity-40">Move projects</button>
            <button onClick={() => setFrom(null)} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300">Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}
