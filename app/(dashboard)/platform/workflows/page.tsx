"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitBranch, Plus, Star } from "lucide-react";
import { workflowApi, flowError } from "@/lib/api/workflow.api";
import { cn } from "@/lib/utils";

/**
 * Product owner: standard project workflows (project-workflow-plan.md W1, W7).
 * New companies start from the default one; companies that started from a workflow
 * are offered its new versions and decide themselves.
 */
export default function StandardWorkflowsPage() {
  const router = useRouter();
  const { data: list, isLoading } = useQuery({ queryKey: ["platform-workflows"], queryFn: workflowApi.templates });
  const [name, setName] = useState("");
  const [copyOf, setCopyOf] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const t = await workflowApi.createTemplate({ name: name.trim(), copyOf: copyOf || null });
      toast.success("Created as a draft");
      router.push(`/platform/workflows/${t._id}`);
    } catch (err) {
      toast.error(flowError(err, "Couldn't create it").message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <GitBranch className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Standard workflows</h1>
          <p className="text-sm text-slate-400">New companies start from the default. Companies are offered your updates and choose whether to take them.</p>
        </div>
      </div>

      <form
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) create();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="New standard workflow, e.g. Modular kitchen" aria-label="Name" className="flex-1 min-w-[220px] px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
        <select value={copyOf} onChange={(e) => setCopyOf(e.target.value)} aria-label="Start from" className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-sm text-slate-200">
          <option value="">Start from the Basic stages</option>
          {(list || []).filter((t) => t.currentVersion > 0).map((t) => <option key={t._id} value={t._id}>Copy of {t.name}</option>)}
        </select>
        <button type="submit" disabled={busy || name.trim().length < 2} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40">
          <Plus className="h-4 w-4" /> Create
        </button>
      </form>

      {isLoading ? (
        <div className="h-32 rounded-2xl bg-slate-900 animate-pulse" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(list || []).map((t) => (
            <li key={t._id}>
              <Link href={`/platform/workflows/${t._id}`} className={cn("block rounded-2xl border p-4 hover:border-violet-500/50", t.archived ? "border-slate-800 opacity-60" : "border-slate-800 bg-slate-900/70")}>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-white flex-1 truncate">{t.name}</p>
                  {t.defaultForNewCompanies && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-200">
                      <Star className="h-3 w-3" /> Default for new companies
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {t.currentVersion ? `v${t.currentVersion}` : "Not published yet"}
                  {t.hasDraft && " · draft in progress"} · {t.companies} compan{t.companies === 1 ? "y" : "ies"}
                  {t.archived && " · archived"}
                </p>
                {t.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
