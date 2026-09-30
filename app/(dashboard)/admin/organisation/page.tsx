"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ArrowUp, ArrowDown, Pencil, Trash2, Merge, Plus, X, Check } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useDepartments, useDesignations, useInvalidateOrg } from "@/hooks/useOrg";
import { orgApi, LEVEL_LABELS, type Department, type Designation } from "@/lib/api/org.api";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { SearchSelect, type SelectOption } from "@/components/shared/SearchSelect";
import type { Role } from "@/types";

const input = "px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
const btn = "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-30";
const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const SUGGESTABLE: Role[] = ["user", "marketing", "leadership", "admin"];

type Kind = "departments" | "designations";

/**
 * Admin → Organisation. Superadmins manage both lists (D3); admins see them with
 * how many people hold each. Renames reach every holder at once (server bulk update).
 */
export default function OrganisationPage() {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "superadmin";
  const [tab, setTab] = useState<Kind>("departments");
  const opts = { includeInactive: isSuper, counts: true };
  const depts = useDepartments(opts);
  const desigs = useDesignations(opts);
  const invalidate = useInvalidateOrg();

  const run = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(errMsg(err, "That didn't work"))
  });
  const act = (fn: () => Promise<unknown>, ok: string) => run.mutate(fn, { onSuccess: () => toast.success(ok) });

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Organisation</h1>
          <p className="text-sm text-slate-400">
            Departments and designations used across the app. {isSuper ? "Changes reach everyone who holds them." : "Only a superadmin can change these lists."}
          </p>
        </div>
      </div>

      <div className="flex gap-2" role="tablist">
        {(["departments", "designations"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("px-4 py-2 rounded-lg border text-sm capitalize", tab === k ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {k} <span className="text-slate-500">({k === "departments" ? depts.departments.length : desigs.designations.length})</span>
          </button>
        ))}
      </div>

      {tab === "departments" ? (
        <DepartmentsTab items={depts.departments} isSuper={isSuper} busy={run.isPending} act={act} />
      ) : (
        <DesignationsTab items={desigs.designations} departments={depts.departments} isSuper={isSuper} busy={run.isPending} act={act} />
      )}
    </div>
  );
}

type Act = (fn: () => Promise<unknown>, ok: string) => void;

/** Swap with a neighbour and send the full order (one bulk write on the server). */
const moved = <T extends { _id: string }>(items: T[], i: number, dir: -1 | 1) => {
  const ids = items.map((x) => x._id);
  const j = i + dir;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
};

function Row({ children, inactive }: { children: React.ReactNode; inactive?: boolean }) {
  return <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3", inactive && "opacity-60")}>{children}</li>;
}

interface MergeItem {
  _id: string;
  name: string;
  short?: string;
  isActive?: boolean;
  userCount?: number;
}

/**
 * "Merge" opens a centred dialog with a searchable picker. (An inline native
 * <select> with 20+ options is drawn by the browser and could cover the address bar.)
 */
function MergeControl({ kind, item, others, act, busy }: { kind: Kind; item: MergeItem; others: MergeItem[]; act: Act; busy: boolean }) {
  const [into, setInto] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const label = kind === "departments" ? "department" : "designation";
  const options = useMemo<SelectOption[]>(
    () =>
      others.map((o) => ({
        value: o._id,
        label: o.name,
        hint: [o.short, o.isActive === false ? "not in use" : null, `${o.userCount ?? 0} people`].filter(Boolean).join(" · ")
      })),
    [others]
  );
  const target = others.find((o) => o._id === into);
  const close = () => {
    setOpen(false);
    setInto(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className={btn} onClick={() => setOpen(true)} title={`Move everyone to another ${label}, then remove this one`}>
        <Merge className="h-3 w-3" /> Merge
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-[12vh] sm:pt-4 bg-black/60 backdrop-blur-sm" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="merge-title"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="merge-title" className="text-base font-semibold text-white">Merge “{item.name}”</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Everyone in it ({item.userCount ?? 0} {item.userCount === 1 ? "person" : "people"}) moves to the {label} you pick, then “{item.name}” is removed.
                </p>
              </div>
              <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div>
              <label htmlFor="merge-into" className="block text-xs font-medium text-slate-400 mb-1.5">Merge into</label>
              <SearchSelect id="merge-into" value={into} onChange={setInto} options={options} placeholder={`Search ${label}s…`} />
            </div>
            {target && (
              <p className="text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 px-3 py-2">
                “{item.name}” will be replaced by “{target.name}” for everyone. This can&apos;t be undone.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={close} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:border-slate-500">Cancel</button>
              <button
                disabled={!target || busy}
                onClick={() => {
                  if (!target) return;
                  act(() => orgApi.merge(kind, item._id, target._id), `Merged into ${target.name}`);
                  close();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-40"
              >
                <Check className="h-4 w-4" /> Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RenameField({ value, onSave }: { value: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value);
  if (!editing)
    return (
      <button className={btn} onClick={() => { setName(value); setEditing(true); }}>
        <Pencil className="h-3 w-3" /> Rename
      </button>
    );
  return (
    <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== value) onSave(name.trim()); setEditing(false); }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className={cn(input, "py-1 text-xs w-44")} aria-label="New name" />
      <button type="submit" className={btn}><Check className="h-3 w-3" /></button>
      <button type="button" className={btn} onClick={() => setEditing(false)} aria-label="Cancel"><X className="h-3 w-3" /></button>
    </form>
  );
}

function DepartmentsTab({ items, isSuper, busy, act }: { items: Department[]; isSuper: boolean; busy: boolean; act: Act }) {
  const [name, setName] = useState("");
  return (
    <section className="space-y-3">
      {isSuper && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) act(() => orgApi.create("departments", { name: name.trim() }), `Department “${name.trim()}” added`);
            setName("");
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="New department, e.g. Customer Success" className={cn(input, "flex-1")} aria-label="New department name" />
          <button type="submit" disabled={name.trim().length < 2 || busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40"><Plus className="h-4 w-4" /> Add</button>
        </form>
      )}
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60">
        {items.map((d, i) => (
          <Row key={d._id} inactive={!d.isActive}>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm text-white">{d.name}{!d.isActive && <span className="ml-2 text-xs text-slate-500">(not in use)</span>}</p>
              <p className="text-xs text-slate-500">{d.userCount ?? 0} {d.userCount === 1 ? "person" : "people"}{d.head?.name && ` · head: ${d.head.name}`}</p>
            </div>
            {isSuper && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button className={btn} disabled={i === 0 || busy} onClick={() => act(() => orgApi.reorder("departments", moved(items, i, -1)), "Order saved")} aria-label={`Move ${d.name} up`}><ArrowUp className="h-3 w-3" /></button>
                <button className={btn} disabled={i === items.length - 1 || busy} onClick={() => act(() => orgApi.reorder("departments", moved(items, i, 1)), "Order saved")} aria-label={`Move ${d.name} down`}><ArrowDown className="h-3 w-3" /></button>
                <RenameField value={d.name} onSave={(n) => act(() => orgApi.update("departments", d._id, { name: n }), "Renamed")} />
                <button className={btn} disabled={busy} onClick={() => act(() => orgApi.update("departments", d._id, { isActive: !d.isActive }), d.isActive ? "Deactivated" : "Reactivated")}>{d.isActive ? "Deactivate" : "Reactivate"}</button>
                <MergeControl kind="departments" item={d} others={items.filter((x) => x._id !== d._id)} act={act} busy={busy} />
                {(d.userCount ?? 0) === 0 && (
                  <button className={cn(btn, "hover:text-rose-300")} disabled={busy} onClick={() => window.confirm(`Delete “${d.name}”?`) && act(() => orgApi.remove("departments", d._id), "Deleted")} aria-label={`Delete ${d.name}`}><Trash2 className="h-3 w-3" /></button>
                )}
              </div>
            )}
          </Row>
        ))}
      </ul>
    </section>
  );
}

function DesignationsTab({ items, departments, isSuper, busy, act }: { items: Designation[]; departments: Department[]; isSuper: boolean; busy: boolean; act: Act }) {
  const deptName = useMemo(() => new Map(departments.map((d) => [d._id, d.name])), [departments]);
  // Grouped by level (the list comes sorted by level, then order)
  const groups = useMemo(() => {
    const m = new Map<number, Designation[]>();
    for (const g of items) m.set(g.level, [...(m.get(g.level) ?? []), g]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);
  const [draft, setDraft] = useState({ name: "", short: "", level: "8" });

  return (
    <section className="space-y-3">
      {isSuper && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => orgApi.create("designations", { name: draft.name.trim(), short: draft.short.trim(), level: Number(draft.level) }), `Designation “${draft.name.trim()}” added`);
            setDraft({ name: "", short: "", level: draft.level });
          }}
        >
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 60) })} placeholder="New designation, e.g. Area Manager" className={cn(input, "flex-1 min-w-[200px]")} aria-label="New designation name" />
          <input value={draft.short} onChange={(e) => setDraft({ ...draft, short: e.target.value.slice(0, 12) })} placeholder="Short (AM)" className={cn(input, "w-28")} aria-label="Abbreviation" />
          <select value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })} className={input} aria-label="Level">
            {Object.entries(LEVEL_LABELS).map(([l, label]) => <option key={l} value={l}>Level {l} · {label}</option>)}
          </select>
          <button type="submit" disabled={draft.name.trim().length < 2 || busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40"><Plus className="h-4 w-4" /> Add</button>
        </form>
      )}
      <p className="text-xs text-slate-500">Levels 1–2 can only be given by a superadmin. Admins can give titles below their own level. The suggested role is only pre-filled when someone is created — it never grants access by itself.</p>

      {groups.map(([level, list]) => (
        <div key={level} className="rounded-xl border border-slate-800 bg-slate-900/60">
          <h2 className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Level {level} · {LEVEL_LABELS[level]}</h2>
          <ul className="divide-y divide-slate-800">
            {list.map((g) => (
              <DesignationRow key={g._id} g={g} all={items} departments={departments} deptName={deptName} isSuper={isSuper} busy={busy} act={act} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function DesignationRow({ g, all, departments, deptName, isSuper, busy, act }: { g: Designation; all: Designation[]; departments: Department[]; deptName: Map<string, string>; isSuper: boolean; busy: boolean; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ short: g.short, level: String(g.level), suggestedRole: g.suggestedRole ?? "", departments: g.departments });
  const i = all.indexOf(g);
  // Reorder only within the same level (the list is shown grouped by level)
  const sameLevelUp = i > 0 && all[i - 1].level === g.level;
  const sameLevelDown = i < all.length - 1 && all[i + 1].level === g.level;

  return (
    <Row inactive={!g.isActive}>
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm text-white">
          {g.name}
          {g.short && <span className="ml-2 text-xs text-violet-300">{g.short}</span>}
          {!g.isActive && <span className="ml-2 text-xs text-slate-500">(not in use)</span>}
        </p>
        <p className="text-xs text-slate-500">
          {g.userCount ?? 0} {g.userCount === 1 ? "person" : "people"} · {g.departments.length ? g.departments.map((d) => deptName.get(d) ?? "?").join(", ") : "any department"}
          {g.suggestedRole && ` · suggests ${ROLE_LABELS[g.suggestedRole]}`}
        </p>
      </div>
      {isSuper && !editing && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={btn} disabled={!sameLevelUp || busy} onClick={() => { const ids = all.map((x) => x._id); [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]]; act(() => orgApi.reorder("designations", ids), "Order saved"); }} aria-label={`Move ${g.name} up`}><ArrowUp className="h-3 w-3" /></button>
          <button className={btn} disabled={!sameLevelDown || busy} onClick={() => { const ids = all.map((x) => x._id); [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]]; act(() => orgApi.reorder("designations", ids), "Order saved"); }} aria-label={`Move ${g.name} down`}><ArrowDown className="h-3 w-3" /></button>
          <RenameField value={g.name} onSave={(n) => act(() => orgApi.update("designations", g._id, { name: n }), "Renamed")} />
          <button className={btn} onClick={() => { setForm({ short: g.short, level: String(g.level), suggestedRole: g.suggestedRole ?? "", departments: g.departments }); setEditing(true); }}>Details</button>
          <button className={btn} disabled={busy} onClick={() => act(() => orgApi.update("designations", g._id, { isActive: !g.isActive }), g.isActive ? "Deactivated" : "Reactivated")}>{g.isActive ? "Deactivate" : "Reactivate"}</button>
          <MergeControl kind="designations" item={g} others={all.filter((x) => x._id !== g._id)} act={act} busy={busy} />
          {(g.userCount ?? 0) === 0 && (
            <button className={cn(btn, "hover:text-rose-300")} disabled={busy} onClick={() => window.confirm(`Delete “${g.name}”?`) && act(() => orgApi.remove("designations", g._id), "Deleted")} aria-label={`Delete ${g.name}`}><Trash2 className="h-3 w-3" /></button>
          )}
        </div>
      )}
      {isSuper && editing && (
        <form
          className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () => orgApi.update("designations", g._id, { short: form.short.trim(), level: Number(form.level), suggestedRole: form.suggestedRole || null, departments: form.departments }),
              "Saved"
            );
            setEditing(false);
          }}
        >
          <input value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value.slice(0, 12) })} placeholder="Short" className={input} aria-label="Abbreviation" />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className={input} aria-label="Level">
            {Object.entries(LEVEL_LABELS).map(([l, label]) => <option key={l} value={l}>Level {l} · {label}</option>)}
          </select>
          <select value={form.suggestedRole} onChange={(e) => setForm({ ...form, suggestedRole: e.target.value })} className={input} aria-label="Suggested role">
            <option value="">No suggested role</option>
            {SUGGESTABLE.map((r) => <option key={r} value={r}>Suggest {ROLE_LABELS[r]}</option>)}
          </select>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">Departments:</span>
            {form.departments.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-200">
                {deptName.get(d) ?? "?"}
                <button type="button" aria-label={`Remove ${deptName.get(d)}`} onClick={() => setForm({ ...form, departments: form.departments.filter((x) => x !== d) })}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <SearchSelect
              className="w-56"
              value={null}
              onChange={(id) => id && setForm({ ...form, departments: [...form.departments, id] })}
              options={departments.filter((d) => !form.departments.includes(d._id)).map((d) => ({ value: d._id, label: d.name }))}
              placeholder={form.departments.length ? "+ Add department" : "Any department (+ limit to…)"}
            />
          </div>
          <div className="sm:col-span-3 flex gap-2">
            <button type="submit" disabled={busy} className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-1.5 rounded-lg border border-slate-700 text-sm text-slate-300">Cancel</button>
          </div>
        </form>
      )}
    </Row>
  );
}
