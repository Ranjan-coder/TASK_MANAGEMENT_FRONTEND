"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Network, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { templateApi, type TemplateDepartment, type TemplateDesignation, type TemplateReach } from "@/lib/api/platform.api";
import { LEVEL_LABELS } from "@/lib/api/org.api";
import { ROLE_LABELS } from "@/lib/permissions";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const input = "px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
const btn = "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-30";
const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const SUGGESTABLE: Role[] = ["user", "marketing", "leadership", "admin"];
const companies = (n: number) => `${n} compan${n === 1 ? "y" : "ies"}`;

type Kind = "departments" | "designations";
type Run = (fn: () => Promise<TemplateReach | { detached: number } | unknown>, done: (r: never) => string) => void;

/** What a change reached, in words: "Updated in 12 companies; 2 kept their own." */
const reachText = (r: TemplateReach) =>
  `Updated in ${companies(r.companies)}${r.kept ? `; ${companies(r.kept)} kept their own version` : ""}.`;

/**
 * Product owner → Standard structure: the departments and designations every
 * organisation starts with. A change here reaches every organisation, except
 * fields an organisation changed itself; a new item is added to every one.
 */
export default function StandardStructurePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Kind>("departments");
  const list = useQuery({ queryKey: ["platform", "org-template"], queryFn: templateApi.list });
  const mutation = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform", "org-template"] });
      qc.invalidateQueries({ queryKey: ["platform", "audit"] });
    },
    onError: (err) => toast.error(errMsg(err, "That didn't work"))
  });
  const run: Run = (fn, done) => mutation.mutate(fn, { onSuccess: (r) => toast.success(done(r as never)) });

  const depts = list.data?.departments ?? [];
  const desigs = list.data?.designations ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Network className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Standard structure</h1>
          <p className="text-sm text-slate-400">
            The departments and designations every organisation starts with. Changes here reach every organisation, except anything an organisation changed itself. New items are added to every organisation.
          </p>
        </div>
      </div>

      <div className="flex gap-2" role="tablist">
        {(["departments", "designations"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("px-4 py-2 rounded-lg border text-sm capitalize", tab === k ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {k} <span className="text-slate-500">({k === "departments" ? depts.length : desigs.length})</span>
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="h-60 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : tab === "departments" ? (
        <DepartmentsTab items={depts} busy={mutation.isPending} run={run} />
      ) : (
        <DesignationsTab items={desigs} departments={depts} busy={mutation.isPending} run={run} />
      )}
    </div>
  );
}

function Usage({ companies: n, customised }: { companies: number; customised: number }) {
  return (
    <span>
      in {companies(n)}
      {customised > 0 && <span className="text-amber-300/80"> · {customised} changed it</span>}
    </span>
  );
}

function RemoveButton({ kind, item, busy, run }: { kind: Kind; item: { _id: string; name: string; companies: number }; busy: boolean; run: Run }) {
  return (
    <button
      className={cn(btn, "hover:text-rose-300")}
      disabled={busy}
      aria-label={`Remove ${item.name}`}
      onClick={() =>
        window.confirm(
          `Remove “${item.name}” from the standard list?\n\nThe ${companies(item.companies)} that have it keep it as their own item (people may hold it). To take it out of use everywhere, deactivate it instead.`
        ) && run(() => templateApi.remove(kind, item._id), () => `Removed “${item.name}” from the standard list`)
      }
    >
      <Trash2 className="h-3 w-3" />
    </button>
  );
}

function ActiveToggle({ kind, item, busy, run }: { kind: Kind; item: { _id: string; name: string; isActive: boolean; companies: number }; busy: boolean; run: Run }) {
  const next = !item.isActive;
  return (
    <button
      className={btn}
      disabled={busy}
      onClick={() =>
        (next || window.confirm(`Deactivate “${item.name}” in ${companies(item.companies)}? People keep it, but it can't be given to anyone new.`)) &&
        run(() => templateApi.update(kind, item._id, { isActive: next }), (r: TemplateReach) => `${next ? "Reactivated" : "Deactivated"}. ${reachText(r)}`)
      }
    >
      {item.isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}

function RenameField({ kind, item, busy, run }: { kind: Kind; item: { _id: string; name: string }; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  if (!editing)
    return (
      <button className={btn} disabled={busy} onClick={() => { setName(item.name); setEditing(true); }}>
        <Pencil className="h-3 w-3" /> Rename
      </button>
    );
  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (n.length >= 2 && n !== item.name) run(() => templateApi.update(kind, item._id, { name: n }), (r: TemplateReach) => `Renamed. ${reachText(r)}`);
        setEditing(false);
      }}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className={cn(input, "py-1 text-xs w-44")} aria-label="New name" />
      <button type="submit" className={btn}><Check className="h-3 w-3" /></button>
      <button type="button" className={btn} onClick={() => setEditing(false)} aria-label="Cancel"><X className="h-3 w-3" /></button>
    </form>
  );
}

function DepartmentsTab({ items, busy, run }: { items: TemplateDepartment[]; busy: boolean; run: Run }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  return (
    <section className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (n.length >= 2) run(() => templateApi.create("departments", { name: n }), (r: TemplateReach) => `“${n}” added to the standard list and to ${companies(r.companies)}.`);
          setName("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="New standard department, e.g. Customer Success" className={cn(input, "flex-1")} aria-label="New department name" />
        <button type="submit" disabled={name.trim().length < 2 || busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40"><Plus className="h-4 w-4" /> Add to all</button>
      </form>
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60">
        {items.map((d) => (
          <li key={d._id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !d.isActive && "opacity-60")}>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm text-white">{d.name}{!d.isActive && <span className="ml-2 text-xs text-slate-500">(not in use)</span>}</p>
              <p className="text-xs text-slate-500"><Usage companies={d.companies} customised={d.customised} /></p>
              {d.description && editing !== d._id && <p className="text-xs text-slate-400 mt-0.5">{d.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <RenameField kind="departments" item={d} busy={busy} run={run} />
              <button className={btn} onClick={() => { setDescription(d.description); setEditing(editing === d._id ? null : d._id); }}>Description</button>
              <ActiveToggle kind="departments" item={d} busy={busy} run={run} />
              <RemoveButton kind="departments" item={d} busy={busy} run={run} />
            </div>
            {editing === d._id && (
              <form
                className="w-full flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => templateApi.update("departments", d._id, { description: description.trim() }), (r: TemplateReach) => `Saved. ${reachText(r)}`);
                  setEditing(null);
                }}
              >
                <input value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} placeholder="What this team does" className={cn(input, "flex-1 min-w-[240px]")} aria-label="Description" />
                <button type="submit" disabled={busy || description.trim() === d.description} className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40">Save</button>
                <button type="button" onClick={() => setEditing(null)} className="px-4 py-1.5 rounded-lg border border-slate-700 text-sm text-slate-300">Cancel</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface DesigForm {
  name: string;
  short: string;
  level: string;
  suggestedRole: string;
  departments: string[];
}

/** Level, abbreviation, suggested role and departments (the add form and the edit form). */
function DesignationFields({ form, set, departments, deptName, withName }: { form: DesigForm; set: (f: DesigForm) => void; departments: TemplateDepartment[]; deptName: Map<string, string>; withName?: boolean }) {
  const chosen = useMemo(() => new Set(form.departments), [form.departments]);
  return (
    <div className="space-y-2 w-full">
      <div className="flex flex-wrap gap-2">
        {withName && <input value={form.name} onChange={(e) => set({ ...form, name: e.target.value.slice(0, 60) })} placeholder="New standard designation, e.g. Area Manager" className={cn(input, "flex-1 min-w-[200px]")} aria-label="Designation name" />}
        <input value={form.short} onChange={(e) => set({ ...form, short: e.target.value.slice(0, 12) })} placeholder="Short (AM)" className={cn(input, "w-28")} aria-label="Abbreviation" />
        <select value={form.level} onChange={(e) => set({ ...form, level: e.target.value })} className={input} aria-label="Level">
          {Object.entries(LEVEL_LABELS).map(([l, label]) => <option key={l} value={l}>Level {l} · {label}</option>)}
        </select>
        <select value={form.suggestedRole} onChange={(e) => set({ ...form, suggestedRole: e.target.value })} className={input} aria-label="Suggested role">
          <option value="">No suggested role</option>
          {SUGGESTABLE.map((r) => <option key={r} value={r}>Suggest {ROLE_LABELS[r]}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400">Departments:</span>
        {form.departments.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-200">
            {deptName.get(id) ?? "?"}
            <button type="button" aria-label={`Remove ${deptName.get(id)}`} onClick={() => set({ ...form, departments: form.departments.filter((x) => x !== id) })}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <SearchSelect
          className="w-56"
          value={null}
          onChange={(id) => id && set({ ...form, departments: [...form.departments, id] })}
          options={departments.filter((d) => d.isActive && !chosen.has(d._id)).map((d) => ({ value: d._id, label: d.name }))}
          placeholder={form.departments.length ? "+ Add department" : "Any department (+ limit to…)"}
        />
      </div>
    </div>
  );
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

function DesignationsTab({ items, departments, busy, run }: { items: TemplateDesignation[]; departments: TemplateDepartment[]; busy: boolean; run: Run }) {
  const deptName = useMemo(() => new Map(departments.map((d) => [d._id, d.name])), [departments]);
  // Grouped by level in one pass (the list comes sorted by level, then order)
  const groups = useMemo(() => {
    const m = new Map<number, TemplateDesignation[]>();
    for (const g of items) {
      const list = m.get(g.level);
      if (list) list.push(g);
      else m.set(g.level, [g]);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);
  const empty: DesigForm = { name: "", short: "", level: "8", suggestedRole: "", departments: [] };
  const [draft, setDraft] = useState<DesigForm>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<DesigForm>(empty);

  return (
    <section className="space-y-3">
      <form
        className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = draft.name.trim();
          if (name.length < 2) return;
          run(
            () => templateApi.create("designations", { name, short: draft.short.trim(), level: Number(draft.level), departments: draft.departments, ...(draft.suggestedRole && { suggestedRole: draft.suggestedRole }) }),
            (r: TemplateReach) => `“${name}” added to the standard list and to ${companies(r.companies)}.`
          );
          setDraft({ ...draft, name: "", short: "" });
        }}
      >
        <DesignationFields form={draft} set={setDraft} departments={departments} deptName={deptName} withName />
        <button type="submit" disabled={draft.name.trim().length < 2 || busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40"><Plus className="h-4 w-4" /> Add to all</button>
      </form>

      {groups.map(([level, list]) => (
        <div key={level} className="rounded-xl border border-slate-800 bg-slate-900/60">
          <h2 className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Level {level} · {LEVEL_LABELS[level]}</h2>
          <ul className="divide-y divide-slate-800">
            {list.map((g) => (
              <li key={g._id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !g.isActive && "opacity-60")}>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm text-white">
                    {g.name}
                    {g.short && <span className="ml-2 text-xs text-violet-300">{g.short}</span>}
                    {!g.isActive && <span className="ml-2 text-xs text-slate-500">(not in use)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {g.departments.length ? g.departments.map((d) => deptName.get(d) ?? "?").join(", ") : "any department"}
                    {g.suggestedRole && ` · suggests ${ROLE_LABELS[g.suggestedRole as Role]}`} · <Usage companies={g.companies} customised={g.customised} />
                  </p>
                </div>
                {editing !== g._id && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RenameField kind="designations" item={g} busy={busy} run={run} />
                    <button className={btn} onClick={() => { setForm({ name: g.name, short: g.short, level: String(g.level), suggestedRole: g.suggestedRole ?? "", departments: g.departments }); setEditing(g._id); }}>Details</button>
                    <ActiveToggle kind="designations" item={g} busy={busy} run={run} />
                    <RemoveButton kind="designations" item={g} busy={busy} run={run} />
                  </div>
                )}
                {editing === g._id && (
                  <form
                    className="w-full space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      // Only what changed is sent, so only that reaches organisations
                      const patch: Record<string, unknown> = {};
                      if (form.short.trim() !== g.short) patch.short = form.short.trim();
                      if (Number(form.level) !== g.level) patch.level = Number(form.level);
                      if ((form.suggestedRole || null) !== g.suggestedRole) patch.suggestedRole = form.suggestedRole || null;
                      if (!sameSet(form.departments, g.departments)) patch.departments = form.departments;
                      if (Object.keys(patch).length) run(() => templateApi.update("designations", g._id, patch), (r: TemplateReach) => `Saved. ${reachText(r)}`);
                      setEditing(null);
                    }}
                  >
                    <DesignationFields form={form} set={setForm} departments={departments} deptName={deptName} />
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40">Save for all</button>
                      <button type="button" onClick={() => setEditing(null)} className="px-4 py-1.5 rounded-lg border border-slate-700 text-sm text-slate-300">Cancel</button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
