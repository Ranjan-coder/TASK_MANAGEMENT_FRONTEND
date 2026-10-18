"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Save, Star, Upload } from "lucide-react";
import { workflowApi, flowError, type CustomerFlowView, type DiffSummary, type WorkflowTree } from "@/lib/api/workflow.api";
import { StageCard, SummaryCard, PreviewCard, clone, LIMITS } from "@/components/workflow/EditorParts";

/**
 * Product owner: edit one standard workflow. Same editor as companies use, without
 * departments and handlers (each company chooses those). Publishing offers the new
 * version to companies that use it; nothing is pushed.
 */
export default function StandardWorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: t, refetch } = useQuery({ queryKey: ["platform-workflow", id], queryFn: () => workflowApi.template(id) });
  const [tree, setTree] = useState<WorkflowTree | null>(null);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [preview, setPreview] = useState<CustomerFlowView | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState({ name: "", description: "" });

  useEffect(() => {
    if (!t) return;
    setTree(clone(t.draft ?? t.tree));
    setRevision(t.draftRevision);
    setPreview(t.preview);
    setMeta({ name: t.name, description: t.description });
    setDirty(false);
  }, [t]);

  const change = (fn: (x: WorkflowTree) => void) =>
    setTree((cur) => {
      const next = clone(cur!);
      fn(next);
      setDirty(true);
      return next;
    });

  const save = async (): Promise<number | null> => {
    if (!tree) return null;
    setBusy(true);
    try {
      const out = await workflowApi.saveTemplateDraft(id, tree, revision);
      setTree(clone(out.draft));
      setRevision(out.draftRevision);
      setSummary(out.summary);
      setPreview(out.preview);
      setDirty(false);
      toast.success("Draft saved");
      return out.draftRevision;
    } catch (err) {
      toast.error(flowError(err, "Couldn't save").message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const rev = dirty ? await save() : revision;
    if (rev === null) return;
    if (!window.confirm("Publish this version? Companies using this workflow will be offered the update; new companies get it if this is the default.")) return;
    setBusy(true);
    try {
      const out = await workflowApi.publishTemplate(id, rev);
      toast.success(`Version ${out.version} published`);
      setSummary(null);
      qc.invalidateQueries({ queryKey: ["platform-workflows"] });
      await refetch();
    } catch (err) {
      toast.error(flowError(err, "Couldn't publish").message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["platform-workflows"] });
      await refetch();
    } catch (err) {
      toast.error(flowError(err).message);
    } finally {
      setBusy(false);
    }
  };

  if (!t || !tree) return <div className="max-w-5xl mx-auto"><div className="h-40 rounded-2xl bg-slate-900 animate-pulse" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Link href="/platform/workflows" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Standard workflows
      </Link>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
        <label className="text-xs text-slate-400 space-y-1">
          <span>Name</span>
          <input value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value.slice(0, 80) }))} className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span>Description</span>
          <input value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value.slice(0, 300) }))} className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
        </label>
        <button disabled={busy || (meta.name === t.name && meta.description === t.description)} onClick={() => run(() => workflowApi.updateTemplate(id, meta), "Saved")} className="px-3 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 disabled:opacity-40">
          Save details
        </button>
        <p className="sm:col-span-3 text-xs text-slate-400">
          {t.currentVersion ? `Published v${t.currentVersion}` : "Not published yet"}
          {t.draft && " · draft in progress"}
          {t.defaultForNewCompanies ? " · the default for new companies" : ""}
          {t.archived ? " · archived" : ""}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {tree.stages.map((s, i) => (
            <StageCard
              key={s.key || `new-${i}`}
              stage={s}
              index={i}
              count={tree.stages.length}
              editable
              structural
              companyFields={false}
              open={open === (s.key || `new-${i}`)}
              onToggle={() => setOpen(open === (s.key || `new-${i}`) ? null : s.key || `new-${i}`)}
              onChange={(fn) => change((x) => fn(x.stages[i]))}
              onMove={(d) =>
                change((x) => {
                  const [y] = x.stages.splice(i, 1);
                  x.stages.splice(i + d, 0, y);
                })
              }
              onRemove={() => window.confirm(`Remove "${s.name}"?`) && change((x) => void x.stages.splice(i, 1))}
            />
          ))}
          {tree.stages.length < LIMITS.stages && (
            <button onClick={() => change((x) => void x.stages.push({ name: `New stage ${x.stages.length + 1}`, subStages: [] }))} className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-sm text-slate-400 hover:border-violet-500 hover:text-violet-300 inline-flex items-center justify-center gap-1.5">
              <Plus className="h-4 w-4" /> Add a stage
            </button>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 self-start">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <button disabled={busy || !dirty} onClick={save} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 disabled:opacity-40">
              <Save className="h-4 w-4" /> {dirty ? "Save draft" : "Draft saved"}
            </button>
            <button disabled={busy || (!dirty && !t.draft)} onClick={publish} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-40">
              <Upload className="h-4 w-4" /> Publish
            </button>
            {!t.defaultForNewCompanies && t.currentVersion > 0 && !t.archived && (
              <button disabled={busy} onClick={() => run(() => workflowApi.setDefaultTemplate(id), "New companies will start from this workflow")} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-amber-500/40 text-sm text-amber-200">
                <Star className="h-4 w-4" /> Make default for new companies
              </button>
            )}
            {!t.defaultForNewCompanies && (
              <button disabled={busy} onClick={() => run(() => workflowApi.updateTemplate(id, { archived: !t.archived }), t.archived ? "Restored" : "Archived")} className="w-full text-xs text-slate-500 hover:text-slate-200">
                {t.archived ? "Restore" : "Archive"}
              </button>
            )}
            <p className="text-[11px] text-slate-500">Departments and handlers are each company&apos;s own choice, so they aren&apos;t part of a standard workflow.</p>
          </div>
          {summary && !summary.empty && <SummaryCard summary={summary} />}
          {preview && <PreviewCard preview={preview} />}
        </aside>
      </div>
    </div>
  );
}
