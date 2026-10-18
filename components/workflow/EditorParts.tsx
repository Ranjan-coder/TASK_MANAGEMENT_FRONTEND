"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, GitBranch, Plus, Trash2, X } from "lucide-react";
import type { CustomerFlowView, DiffSummary, StageDef, SubStageDef } from "@/lib/api/workflow.api";
import { useDepartments, useStaffDirectory } from "@/hooks/useOrg";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { cn } from "@/lib/utils";

/**
 * Building blocks of the workflow editor, shared by a company's "Project workflow"
 * page and the product owner's standard workflows (which have no departments or
 * handlers: those belong to each company, so `companyFields` is off there).
 */

export const input = "w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50";
export const small = "px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-30";
export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const LIMITS = { stages: 20, subs: 15, checklist: 10 };
const num = (v: string) => (v === "" ? null : Math.max(0, Math.floor(Number(v))));

export function StageCard({
  stage,
  index,
  count,
  editable,
  structural,
  companyFields,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove
}: {
  stage: StageDef;
  index: number;
  count: number;
  editable: boolean;
  /** Add, remove, reorder stages and change who handles them (admins) */
  structural: boolean;
  /** Department and handlers (companies only) */
  companyFields: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (fn: (s: StageDef) => void) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const subs = stage.subStages;
  const gates = stage.gates || {};

  return (
    <section className={cn("rounded-2xl border bg-slate-900/70", open ? "border-violet-500/40" : "border-slate-800")}>
      <header className="flex items-center gap-2 px-4 py-3">
        <button onClick={onToggle} className="text-slate-400 hover:text-white" aria-expanded={open} aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="h-6 w-6 rounded-full bg-violet-600/30 text-violet-200 text-xs flex items-center justify-center font-semibold">{index + 1}</span>
        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-white truncate">{stage.name}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {subs.length ? `${subs.length} sub-stage(s) · ${stage.subOrder === "any" ? "any order" : "in order"}` : "No sub-stages"}
            {stage.durationDays ? ` · ${stage.durationDays} days` : ""}
            {(gates.approval || gates.payment || gates.checklist?.length) && " · has gates"}
            {!editable && " · view only"}
          </p>
        </button>
        {structural && (
          <div className="flex gap-1">
            <button className={small} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-3 w-3" /></button>
            <button className={small} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-3 w-3" /></button>
            <button className={cn(small, "hover:text-rose-300")} disabled={count === 1} onClick={onRemove} aria-label="Remove stage"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}
      </header>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-800 pt-3">
          <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400 space-y-1">
              <span>Stage name (team)</span>
              <input className={input} value={stage.name} onChange={(e) => onChange((s) => void (s.name = e.target.value.slice(0, 60)))} />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Name the customer sees</span>
              <input className={input} value={stage.customerName ?? ""} placeholder={stage.name} onChange={(e) => onChange((s) => void (s.customerName = e.target.value.slice(0, 60)))} />
            </label>
            <label className="text-xs text-slate-400 space-y-1 sm:col-span-2">
              <span>Description (team)</span>
              <input className={input} value={stage.description ?? ""} onChange={(e) => onChange((s) => void (s.description = e.target.value.slice(0, 300)))} />
            </label>
          </fieldset>

          {companyFields && <CompanyFields stage={stage} canChange={structural} onChange={onChange} />}

          {/* Sub-stages */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-300 flex-1">Sub-stages</h3>
              {subs.length > 0 && (
                <select className={cn(input, "w-auto py-1 text-xs")} disabled={!editable} value={stage.subOrder ?? "sequential"} onChange={(e) => onChange((s) => void (s.subOrder = e.target.value as "sequential" | "any"))} aria-label="Sub-stage order">
                  <option value="sequential">In order</option>
                  <option value="any">Any order (checklist)</option>
                </select>
              )}
            </div>
            {subs.map((sub, j) => (
              <SubRow
                key={sub.key || `n${j}`}
                sub={sub}
                first={j === 0}
                last={j === subs.length - 1}
                editable={editable}
                onChange={(fn) => onChange((s) => fn(s.subStages[j]))}
                onMove={(d) =>
                  onChange((s) => {
                    const [x] = s.subStages.splice(j, 1);
                    s.subStages.splice(j + d, 0, x);
                  })
                }
                onRemove={() => onChange((s) => void s.subStages.splice(j, 1))}
              />
            ))}
            {editable && subs.length < LIMITS.subs && (
              <button onClick={() => onChange((s) => void s.subStages.push({ name: `Step ${s.subStages.length + 1}` }))} className="text-xs text-violet-300 hover:underline inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add a sub-stage
              </button>
            )}
            <p className="text-[11px] text-slate-500">Sub-stages are hidden from customers unless “customer sees” is on. Optional ones (e.g. Redesign) only run when the team adds them to a project; that customer then sees them.</p>
          </div>

          {/* Rules and messages (E1, E3, E4, E5) */}
          <fieldset disabled={!editable} className="space-y-3 rounded-xl border border-slate-800 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-300">Rules & messages</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-400 space-y-1">
                <span>Usual time (days): alerts when a project runs over</span>
                <input className={input} type="number" min={1} max={365} value={stage.durationDays ?? ""} onChange={(e) => onChange((s) => void (s.durationDays = num(e.target.value)))} />
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                <span>Payments linked to this stage are due after (days)</span>
                <input className={input} type="number" min={0} max={90} placeholder="3" value={stage.paymentDueDays ?? ""} onChange={(e) => onChange((s) => void (s.paymentDueDays = num(e.target.value)))} />
              </label>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-slate-400">Before a project can leave this stage:</p>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="accent-violet-500" checked={Boolean(gates.approval)} onChange={(e) => onChange((s) => void (s.gates = { ...(s.gates || {}), approval: e.target.checked }))} />
                The customer has approved a design (in chat) during this stage
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="accent-violet-500" checked={Boolean(gates.payment)} onChange={(e) => onChange((s) => void (s.gates = { ...(s.gates || {}), payment: e.target.checked }))} />
                The payment(s) linked to this stage are confirmed
              </label>
              {(gates.checklist || []).map((it, k) => (
                <div key={it.key || k} className="flex items-center gap-2">
                  <input className={cn(input, "py-1 text-xs")} value={it.label} placeholder="Checklist item, e.g. Site photos uploaded" onChange={(e) => onChange((s) => void (s.gates!.checklist![k].label = e.target.value.slice(0, 120)))} />
                  <button className={small} aria-label="Remove item" onClick={() => onChange((s) => void s.gates!.checklist!.splice(k, 1))}><X className="h-3 w-3" /></button>
                </div>
              ))}
              {editable && (gates.checklist?.length || 0) < LIMITS.checklist && (
                <button onClick={() => onChange((s) => void (s.gates = { ...(s.gates || {}), checklist: [...(s.gates?.checklist || []), { label: "" }] }))} className="text-xs text-violet-300 hover:underline inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add a checklist item
                </button>
              )}
            </div>
            <label className="block text-xs text-slate-400 space-y-1">
              <span>Message to the customer when the project enters this stage</span>
              <textarea className={cn(input, "min-h-[60px]")} value={stage.entryMessage ?? ""} placeholder="e.g. Your furniture is now being made in our factory. This usually takes about 3 weeks." onChange={(e) => onChange((s) => void (s.entryMessage = e.target.value.slice(0, 500)))} />
            </label>
          </fieldset>
        </div>
      )}
    </section>
  );
}

/** Who handles a stage: the company's own choice (admins only change it). */
function CompanyFields({ stage, canChange, onChange }: { stage: StageDef; canChange: boolean; onChange: (fn: (s: StageDef) => void) => void }) {
  const { departments } = useDepartments();
  const { people } = useStaffDirectory();
  const personName = useMemo(() => new Map(people.map((p) => [p._id, p.name])), [people]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-slate-400 space-y-1">
        <span>Department (its head handles this stage)</span>
        <select className={input} disabled={!canChange} value={stage.departmentId ?? ""} onChange={(e) => onChange((s) => void (s.departmentId = e.target.value || null))}>
          <option value="">None</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </label>
      <div className="text-xs text-slate-400 space-y-1">
        <span>Also handled by</span>
        <div className="flex flex-wrap gap-1">
          {(stage.handlers || []).map((h) => (
            <span key={h} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">
              {personName.get(h) || "Someone"}
              {canChange && (
                <button aria-label="Remove handler" onClick={() => onChange((s) => void (s.handlers = (s.handlers || []).filter((x) => x !== h)))}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {canChange && (
          <SearchSelect
            value={null}
            onChange={(id) => id && onChange((s) => void (s.handlers = [...new Set([...(s.handlers || []), id])]))}
            options={people.filter((p) => !(stage.handlers || []).includes(p._id)).map((p) => ({ value: p._id, label: p.name, hint: [p.designation, p.department].filter(Boolean).join(" · ") || undefined }))}
            placeholder="Add a person…"
          />
        )}
      </div>
    </div>
  );
}

function SubRow({ sub, first, last, editable, onChange, onMove, onRemove }: { sub: SubStageDef; first: boolean; last: boolean; editable: boolean; onChange: (fn: (s: SubStageDef) => void) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2 space-y-2">
      <div className="flex gap-2">
        <input className={cn(input, "py-1 text-xs")} disabled={!editable} value={sub.name} aria-label="Sub-stage name" onChange={(e) => onChange((s) => void (s.name = e.target.value.slice(0, 60)))} />
        <input className={cn(input, "py-1 text-xs")} disabled={!editable} value={sub.customerName ?? ""} placeholder="Customer name (optional)" aria-label="Customer name" onChange={(e) => onChange((s) => void (s.customerName = e.target.value.slice(0, 60)))} />
        <input className={cn(input, "py-1 text-xs w-20")} disabled={!editable} type="number" min={1} max={365} value={sub.durationDays ?? ""} placeholder="days" aria-label="Days" onChange={(e) => onChange((s) => void (s.durationDays = num(e.target.value)))} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="accent-violet-500" disabled={!editable} checked={Boolean(sub.optional)} onChange={(e) => onChange((s) => void (s.optional = e.target.checked))} /> Optional (added per project)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="accent-violet-500" disabled={!editable} checked={Boolean(sub.showToCustomer)} onChange={(e) => onChange((s) => void (s.showToCustomer = e.target.checked))} /> Customer sees
        </label>
        {editable && (
          <span className="ml-auto flex gap-1">
            <button className={small} disabled={first} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-3 w-3" /></button>
            <button className={small} disabled={last} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-3 w-3" /></button>
            <button className={cn(small, "hover:text-rose-300")} onClick={onRemove} aria-label="Remove sub-stage"><Trash2 className="h-3 w-3" /></button>
          </span>
        )}
      </div>
    </div>
  );
}

export function SummaryCard({ summary, title = "Changes in this draft" }: { summary: DiffSummary; title?: string }) {
  const line = (label: string, items: string[]) => items.length > 0 && <li><span className="text-slate-500">{label}:</span> {items.join(", ")}</li>;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
      <h2 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" /> {title}</h2>
      <ul className="text-xs text-slate-300 space-y-1">
        {line("Added", summary.added.map((a) => a.name))}
        {line("Removed", summary.removed.map((r) => r.name))}
        {line("Renamed", summary.renamed.map((r) => `${r.from} → ${r.to}`))}
        {line("Changed", summary.changed.map((c) => c.key))}
        {summary.stageOrderChanged && <li>Stage order changed</li>}
      </ul>
      {summary.removedSteps.length > 0 && <p className="text-[11px] text-amber-300">Projects at removed steps will need a new place when moved to this version.</p>}
    </div>
  );
}

export function PreviewCard({ preview }: { preview: CustomerFlowView }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
      <h2 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> What a customer sees</h2>
      <ol className="space-y-1">
        {preview.stages.map((s, i) => (
          <li key={s.key} className="text-xs text-slate-300">
            <span className="text-slate-500">{i + 1}.</span> {s.name}
            {s.subs.length > 0 && <span className="text-slate-500"> · {s.subs.map((x) => x.name).join(", ")}</span>}
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-slate-500">Hidden sub-stages, team names, handlers and rules never reach customers. Optional steps appear only when added to their project.</p>
    </div>
  );
}
