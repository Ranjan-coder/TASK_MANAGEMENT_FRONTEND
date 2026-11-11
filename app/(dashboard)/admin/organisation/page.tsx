"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ArrowUp, ArrowDown, Pencil, Trash2, Merge, Plus, X, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useDepartments, useDesignations, useInvalidateOrg } from "@/hooks/useOrg";
import { orgApi, LEVEL_LABELS, type Department, type Designation } from "@/lib/api/org.api";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { SearchSelect, type SelectOption } from "@/components/shared/SearchSelect";
import { ModuleMembers } from "@/components/shared/ModuleMembers";
import { UserPicker, type PickedUser } from "@/components/admin/UserPicker";
import type { Role } from "@/types";

const input = "px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
const btn = "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-30";
const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const SUGGESTABLE: Role[] = ["user", "marketing", "leadership", "admin"];

type Kind = "departments" | "designations";
type Tab = Kind | "modules";

/**
 * Admin → Organisation. Superadmins manage both lists (D3); admins see them with
 * how many people hold each. Renames reach every holder at once (server bulk update).
 */
export default function OrganisationPage() {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "superadmin";
  const [tab, setTab] = useState<Tab>("departments");
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
            Departments and designations used across the app. {isSuper ? "Changes reach everyone in your organisation who holds them, and no other organisation." : "Only a superadmin can change these lists."}{" "}
            Items marked <span className="text-sky-300">Standard</span> also get updates from the product owner, except anything you changed.
          </p>
        </div>
      </div>

      <div className="flex gap-2" role="tablist">
        {(isSuper ? (["departments", "designations", "modules"] as const) : (["departments", "designations"] as const)).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("px-4 py-2 rounded-lg border text-sm capitalize", tab === k ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {k}
            {k !== "modules" && <span className="text-slate-500"> ({k === "departments" ? depts.departments.length : desigs.designations.length})</span>}
          </button>
        ))}
      </div>

      {tab === "modules" && isSuper ? (
        <ModuleMembers />
      ) : tab === "departments" ? (
        <DepartmentsTab items={depts.departments} designations={desigs.designations} isSuper={isSuper} busy={run.isPending} act={act} />
      ) : (
        <DesignationsTab items={desigs.designations} departments={depts.departments} isSuper={isSuper} busy={run.isPending} act={act} />
      )}
    </div>
  );
}

type Act = (fn: () => Promise<unknown>, ok: string) => void;

const FIELD_LABELS: Record<string, string> = { name: "name", description: "description", isActive: "in use", short: "short name", level: "level", suggestedRole: "suggested role", departments: "departments" };

/**
 * From the product owner's standard list: the product owner's changes reach it,
 * except fields this organisation changed (listed). "Reset" takes the standard
 * version again.
 */
function StandardBadge({ kind, item, isSuper, busy, act }: { kind: Kind; item: { _id: string; name: string; standard?: boolean; customised?: string[] }; isSuper: boolean; busy: boolean; act: Act }) {
  if (!item.standard) return null;
  const own = item.customised ?? [];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 ml-2 align-middle">
      <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-[10px] text-sky-300" title="From the standard list: updates from the product owner reach it">Standard</span>
      {own.length > 0 && (
        <>
          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300" title="Your changes are kept when the standard list changes">
            Your {own.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
          </span>
          {isSuper && (
            <button
              className="text-[10px] text-sky-300 hover:text-sky-200 underline-offset-2 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={() =>
                window.confirm(`Reset “${item.name}” to the standard version? Your own ${own.map((f) => FIELD_LABELS[f] ?? f).join(", ")} will be replaced, and future standard changes will reach it again.`) &&
                act(() => orgApi.reset(kind, item._id), "Reset to the standard version")
              }
            >
              Reset to standard
            </button>
          )}
        </>
      )}
    </span>
  );
}

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


/**
 * Department id → its designations, built in one pass over the list (O(total links)).
 * Titles with no department ("any department") are kept under ANY. Every screen
 * below reads from this index instead of filtering the whole list per row.
 */
const ANY = "__any__";
const indexByDepartment = (items: Designation[]) => {
  const m = new Map<string, Designation[]>();
  const add = (k: string, g: Designation) => {
    const list = m.get(k);
    if (list) list.push(g);
    else m.set(k, [g]);
  };
  for (const g of items) {
    if (g.departments.length === 0) add(ANY, g);
    else for (const d of g.departments) add(d, g);
  }
  return m;
};

/** Chosen departments as removable chips, plus a searchable "add" picker. */
function DepartmentChips({ value, onChange, departments, deptName }: { value: string[]; onChange: (v: string[]) => void; departments: Department[]; deptName: Map<string, string> }) {
  const chosen = useMemo(() => new Set(value), [value]);
  const options = useMemo(() => departments.filter((d) => d.isActive && !chosen.has(d._id)).map((d) => ({ value: d._id, label: d.name })), [departments, chosen]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-400">Departments:</span>
      {value.map((d) => (
        <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-200">
          {deptName.get(d) ?? "?"}
          <button type="button" aria-label={`Remove ${deptName.get(d)}`} onClick={() => onChange(value.filter((x) => x !== d))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <SearchSelect
        className="w-56"
        value={null}
        onChange={(id) => id && onChange([...value, id])}
        options={options}
        placeholder={value.length ? "+ Add department" : "Any department (+ limit to…)"}
      />
    </div>
  );
}

const LevelSelect = ({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(input, className)} aria-label="Level">
    {Object.entries(LEVEL_LABELS).map(([l, label]) => <option key={l} value={l}>Level {l} · {label}</option>)}
  </select>
);

/**
 * Adds a designation. With `departmentId` it belongs to that department from the
 * start (the form under a department); otherwise departments can be picked here.
 */
function AddDesignationForm({ departments, deptName, departmentId, busy, act, onDone }: { departments: Department[]; deptName: Map<string, string>; departmentId?: string; busy: boolean; act: Act; onDone?: () => void }) {
  const [draft, setDraft] = useState({ name: "", short: "", level: "8", suggestedRole: "", departments: departmentId ? [departmentId] : ([] as string[]) });
  const name = draft.name.trim();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.length < 2) return;
        const where = departmentId ? ` in ${deptName.get(departmentId)}` : "";
        act(
          () =>
            orgApi.create("designations", {
              name,
              short: draft.short.trim(),
              level: Number(draft.level),
              departments: draft.departments,
              ...(draft.suggestedRole && { suggestedRole: draft.suggestedRole })
            }),
          `Designation “${name}” added${where}`
        );
        // Keep the level and departments: several titles are often added in a row
        setDraft({ ...draft, name: "", short: "" });
        onDone?.();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 60) })} placeholder="New designation, e.g. Area Manager" className={cn(input, "flex-1 min-w-[200px]")} aria-label="New designation name" />
        <input value={draft.short} onChange={(e) => setDraft({ ...draft, short: e.target.value.slice(0, 12) })} placeholder="Short (AM)" className={cn(input, "w-28")} aria-label="Abbreviation" />
        <LevelSelect value={draft.level} onChange={(level) => setDraft({ ...draft, level })} />
        <select value={draft.suggestedRole} onChange={(e) => setDraft({ ...draft, suggestedRole: e.target.value })} className={input} aria-label="Suggested role">
          <option value="">No suggested role</option>
          {SUGGESTABLE.map((r) => <option key={r} value={r}>Suggest {ROLE_LABELS[r]}</option>)}
        </select>
        <button type="submit" disabled={name.length < 2 || busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40"><Plus className="h-4 w-4" /> Add</button>
      </div>
      {!departmentId && <DepartmentChips value={draft.departments} onChange={(v) => setDraft({ ...draft, departments: v })} departments={departments} deptName={deptName} />}
    </form>
  );
}

/**
 * A department's head (an active staff member; checked again by the server) and a
 * short description. Saves only what changed.
 */
function DepartmentDetails({ d, busy, act }: { d: Department; busy: boolean; act: Act }) {
  const initialHead: PickedUser[] = d.head ? [{ _id: d.head._id, name: d.head.name ?? "Unknown" }] : [];
  const [head, setHead] = useState<PickedUser[]>(initialHead);
  const [description, setDescription] = useState(d.description ?? "");
  const headId = head[0]?._id ?? null;
  const patch: { head?: string | null; description?: string } = {};
  if (headId !== (d.head?._id ?? null)) patch.head = headId;
  if (description.trim() !== (d.description ?? "")) patch.description = description.trim();
  const dirty = Object.keys(patch).length > 0;

  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-800"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) act(() => orgApi.update("departments", d._id, patch), `${d.name} saved`);
      }}
    >
      <UserPicker id={`head-${d._id}`} label="Department head" kind="staff" value={head} onChange={setHead} placeholder="Search staff…" />
      <label className="block text-xs text-slate-400 space-y-1">
        <span className="block">Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} rows={2} placeholder="What this team does (optional)" className={cn(input, "w-full resize-y")} />
        <span className="block text-right text-[10px] text-slate-500">{description.length}/300</span>
      </label>
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" disabled={!dirty || busy} className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40">Save details</button>
        {dirty && (
          <button type="button" onClick={() => { setHead(initialHead); setDescription(d.description ?? ""); }} className="px-4 py-1.5 rounded-lg border border-slate-700 text-sm text-slate-300">Undo</button>
        )}
      </div>
    </form>
  );
}

function DepartmentsTab({ items, designations, isSuper, busy, act }: { items: Department[]; designations: Designation[]; isSuper: boolean; busy: boolean; act: Act }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const byDept = useMemo(() => indexByDepartment(designations), [designations]);
  const deptName = useMemo(() => new Map(items.map((d) => [d._id, d.name])), [items]);
  const anyCount = byDept.get(ANY)?.length ?? 0;

  return (
    <section className="space-y-3">
      {isSuper && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) act(() => orgApi.create("departments", { name: name.trim() }), `Department “${name.trim()}” added. Open it to add its designations.`);
            setName("");
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="New department, e.g. Customer Success" className={cn(input, "flex-1")} aria-label="New department name" />
          <button type="submit" disabled={name.trim().length < 2 || busy} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-40"><Plus className="h-4 w-4" /> Add</button>
        </form>
      )}
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60">
        {items.map((d, i) => {
          const titles = byDept.get(d._id) ?? [];
          const isOpen = open === d._id;
          return (
            <Row key={d._id} inactive={!d.isActive}>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm text-white">
                  {d.name}
                  {!d.isActive && <span className="ml-2 text-xs text-slate-500">(not in use)</span>}
                  <StandardBadge kind="departments" item={d} isSuper={isSuper} busy={busy} act={act} />
                </p>
                <p className="text-xs text-slate-500">{d.userCount ?? 0} {d.userCount === 1 ? "person" : "people"}{d.head?.name && ` · head: ${d.head.name}`}</p>
                {d.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{d.description}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button className={btn} onClick={() => setOpen(isOpen ? null : d._id)} aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {isSuper ? "Details & designations" : "Designations"} ({titles.length})
                </button>
                {isSuper && (
                  <>
                    <button className={btn} disabled={i === 0 || busy} onClick={() => act(() => orgApi.reorder("departments", moved(items, i, -1)), "Order saved")} aria-label={`Move ${d.name} up`}><ArrowUp className="h-3 w-3" /></button>
                    <button className={btn} disabled={i === items.length - 1 || busy} onClick={() => act(() => orgApi.reorder("departments", moved(items, i, 1)), "Order saved")} aria-label={`Move ${d.name} down`}><ArrowDown className="h-3 w-3" /></button>
                    <RenameField value={d.name} onSave={(n) => act(() => orgApi.update("departments", d._id, { name: n }), "Renamed")} />
                    <button className={btn} disabled={busy} onClick={() => act(() => orgApi.update("departments", d._id, { isActive: !d.isActive }), d.isActive ? "Deactivated" : "Reactivated")}>{d.isActive ? "Deactivate" : "Reactivate"}</button>
                    <MergeControl kind="departments" item={d} others={items.filter((x) => x._id !== d._id)} act={act} busy={busy} />
                    {(d.userCount ?? 0) === 0 && (
                      <button className={cn(btn, "hover:text-rose-300")} disabled={busy} onClick={() => window.confirm(`Delete “${d.name}”?`) && act(() => orgApi.remove("departments", d._id), "Deleted")} aria-label={`Delete ${d.name}`}><Trash2 className="h-3 w-3" /></button>
                    )}
                  </>
                )}
              </div>
              {isOpen && (
                <div className="w-full rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-3">
                  {isSuper && <DepartmentDetails key={`${d.head?._id ?? ""}|${d.description ?? ""}`} d={d} busy={busy} act={act} />}
                  {titles.length === 0 ? (
                    <p className="text-xs text-slate-500">No designations only for {d.name} yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {[...titles].sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder).map((g) => (
                        <li key={g._id} className={cn("flex items-center gap-2 text-sm", !g.isActive && "opacity-60")}>
                          <span className="w-16 shrink-0 text-[11px] text-slate-500">Level {g.level}</span>
                          <span className="text-white">{g.name}</span>
                          {g.short && <span className="text-xs text-violet-300">{g.short}</span>}
                          <span className="text-xs text-slate-500">· {g.userCount ?? 0} {g.userCount === 1 ? "person" : "people"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {anyCount > 0 && <p className="text-[11px] text-slate-500">Plus {anyCount} designation{anyCount === 1 ? "" : "s"} usable in any department (see the Designations tab).</p>}
                  {isSuper && d.isActive && (
                    <div className="pt-2 border-t border-slate-800">
                      <p className="text-xs text-slate-400 mb-2">Add a designation to {d.name}</p>
                      <AddDesignationForm departments={items} deptName={deptName} departmentId={d._id} busy={busy} act={act} />
                    </div>
                  )}
                </div>
              )}
            </Row>
          );
        })}
      </ul>
    </section>
  );
}

function DesignationsTab({ items, departments, isSuper, busy, act }: { items: Designation[]; departments: Department[]; isSuper: boolean; busy: boolean; act: Act }) {
  const deptName = useMemo(() => new Map(departments.map((d) => [d._id, d.name])), [departments]);
  const byDept = useMemo(() => indexByDepartment(items), [items]);
  // Position of each title in the full list, for reordering: O(1) per row instead of indexOf
  const position = useMemo(() => new Map(items.map((g, i) => [g._id, i])), [items]);
  const [filter, setFilter] = useState<string>(""); // "" = all, ANY = any department, else a department id

  // Grouped by level (the list comes sorted by level, then order); one pass, in place
  const groups = useMemo(() => {
    const shown = filter ? byDept.get(filter) ?? [] : items;
    const m = new Map<number, Designation[]>();
    for (const g of shown) {
      const list = m.get(g.level);
      if (list) list.push(g);
      else m.set(g.level, [g]);
    }
    for (const list of m.values()) list.sort((a, b) => (position.get(a._id) ?? 0) - (position.get(b._id) ?? 0));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [items, byDept, filter, position]);

  return (
    <section className="space-y-3">
      {isSuper && <AddDesignationForm departments={departments} deptName={deptName} busy={busy} act={act} />}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="desig-filter" className="text-xs text-slate-400">Show</label>
        <select id="desig-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className={cn(input, "py-1.5")}>
          <option value="">All designations ({items.length})</option>
          <option value={ANY}>Any department ({byDept.get(ANY)?.length ?? 0})</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name} ({byDept.get(d._id)?.length ?? 0})</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500">Levels 1–2 can only be given by a superadmin. Admins can give titles below their own level. The suggested role is only pre-filled when someone is created — it never grants access by itself.</p>

      {groups.length === 0 && <p className="text-sm text-slate-500 px-1">No designations here yet.</p>}
      {groups.map(([level, list]) => (
        <div key={level} className="rounded-xl border border-slate-800 bg-slate-900/60">
          <h2 className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Level {level} · {LEVEL_LABELS[level]}</h2>
          <ul className="divide-y divide-slate-800">
            {list.map((g) => (
              <DesignationRow key={g._id} g={g} all={items} i={position.get(g._id) ?? 0} departments={departments} deptName={deptName} isSuper={isSuper} busy={busy} act={act} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function DesignationRow({ g, all, i, departments, deptName, isSuper, busy, act }: { g: Designation; all: Designation[]; i: number; departments: Department[]; deptName: Map<string, string>; isSuper: boolean; busy: boolean; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ short: g.short, level: String(g.level), suggestedRole: g.suggestedRole ?? "", departments: g.departments });
  // Reorder only within the same level (the list is shown grouped by level)
  const sameLevelUp = i > 0 && all[i - 1].level === g.level;
  const sameLevelDown = i < all.length - 1 && all[i + 1].level === g.level;
  const swap = (j: number) => {
    const ids = all.map((x) => x._id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act(() => orgApi.reorder("designations", ids), "Order saved");
  };

  return (
    <Row inactive={!g.isActive}>
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm text-white">
          {g.name}
          {g.short && <span className="ml-2 text-xs text-violet-300">{g.short}</span>}
          {!g.isActive && <span className="ml-2 text-xs text-slate-500">(not in use)</span>}
          <StandardBadge kind="designations" item={g} isSuper={isSuper} busy={busy} act={act} />
        </p>
        <p className="text-xs text-slate-500">
          {g.userCount ?? 0} {g.userCount === 1 ? "person" : "people"} · {g.departments.length ? g.departments.map((d) => deptName.get(d) ?? "?").join(", ") : "any department"}
          {g.suggestedRole && ` · suggests ${ROLE_LABELS[g.suggestedRole]}`}
        </p>
      </div>
      {isSuper && !editing && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={btn} disabled={!sameLevelUp || busy} onClick={() => swap(i - 1)} aria-label={`Move ${g.name} up`}><ArrowUp className="h-3 w-3" /></button>
          <button className={btn} disabled={!sameLevelDown || busy} onClick={() => swap(i + 1)} aria-label={`Move ${g.name} down`}><ArrowDown className="h-3 w-3" /></button>
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
          <LevelSelect value={form.level} onChange={(level) => setForm({ ...form, level })} />
          <select value={form.suggestedRole} onChange={(e) => setForm({ ...form, suggestedRole: e.target.value })} className={input} aria-label="Suggested role">
            <option value="">No suggested role</option>
            {SUGGESTABLE.map((r) => <option key={r} value={r}>Suggest {ROLE_LABELS[r]}</option>)}
          </select>
          <div className="sm:col-span-3">
            <DepartmentChips value={form.departments} onChange={(v) => setForm({ ...form, departments: v })} departments={departments} deptName={deptName} />
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
