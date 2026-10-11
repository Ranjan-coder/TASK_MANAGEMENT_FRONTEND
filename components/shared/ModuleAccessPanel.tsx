"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutGrid } from "lucide-react";
import { orgApi, type OrgModuleRow } from "@/lib/api/org.api";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** "3 of 5 seats" / "3 people" for a module row. */
export const seatLabel = (m: Pick<OrgModuleRow, "seatLimit" | "seatsUsed">) =>
  m.seatLimit == null ? `${m.seatsUsed ?? 0} ${m.seatsUsed === 1 ? "person" : "people"}` : `${m.seatsUsed ?? 0} of ${m.seatLimit} seats`;

/**
 * Ticking a module ticks what it needs; unticking one unticks what needs it
 * (both lists come precomputed from the server), so a choice is always usable.
 */
export function toggleModule(selected: Set<string>, row: OrgModuleRow, on: boolean) {
  const next = new Set(selected);
  if (on) [row.key, ...row.requiresAll].forEach((k) => next.add(k));
  else [row.key, ...row.neededBy].forEach((k) => next.delete(k));
  return next;
}

/**
 * Superadmin → a person's modules (module-access-plan.md, Phase 4). A person can
 * use a module only if the organisation has it AND it was given to them here.
 */
export function ModuleAccessPanel({ user, onSaved }: { user: User; onSaved: () => void }) {
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["org", "modules"], queryFn: orgApi.modules, staleTime: 60_000 });
  const current = useQuery({ queryKey: ["user-modules", user._id], queryFn: () => orgApi.userModules(user._id) });
  // On-by-default modules (e.g. Planner) are everyone's already: nothing to grant
  const rows = useMemo(() => (catalog.data || []).filter((m) => !m.core && !m.defaultOn && !m.orgWide), [catalog.data]);

  const [everything, setEverything] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!current.data) return;
    setEverything(current.data.all);
    setPicked(new Set(current.data.all ? rows.map((r) => r.key) : current.data.keys));
  }, [current.data, rows]);

  const save = useMutation({
    mutationFn: () => orgApi.setUserModules(user._id, everything ? { all: true, keys: [] } : { all: false, keys: [...picked] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-modules", user._id] });
      qc.invalidateQueries({ queryKey: ["org", "modules"] });
      onSaved();
      toast.success("Module access saved. It applies straight away.");
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't save module access"))
  });

  if (user.role === "customer" || user.role === "superadmin") {
    return (
      <Panel>
        <p className="text-slate-500 text-sm">
          {user.role === "customer" ? "Customers use the customer portal features your organisation has." : "A superadmin always has every module."}
        </p>
      </Panel>
    );
  }
  if (!catalog.data || !current.data) return <Panel><div className="h-24 animate-pulse rounded-xl bg-slate-900" /></Panel>;

  const savedKeys = current.data.all ? null : [...current.data.keys].sort().join();
  const changed = everything !== current.data.all || (!everything && [...picked].sort().join() !== savedKeys);

  return (
    <Panel>
      <p className="text-slate-500 text-sm mb-4">
        People can only use the modules you give them here, out of those your organisation has. Taking one away also takes what depends on it.
      </p>
      <div className="flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label="Access">
        {[
          { v: true, label: "Every module (including ones added later)" },
          { v: false, label: "Only the modules I choose" }
        ].map((o) => (
          <button
            key={String(o.v)}
            role="radio"
            aria-checked={everything === o.v}
            onClick={() => setEverything(o.v)}
            className={cn("px-3 py-1.5 rounded-lg border text-sm", everything === o.v ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}
          >
            {o.label}
          </button>
        ))}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((m) => {
          const on = everything || picked.has(m.key);
          const full = m.seatLimit != null && (m.seatsUsed ?? 0) >= m.seatLimit && !current.data.effective.includes(m.key);
          return (
            <li key={m.key}>
              <label className={cn("flex gap-2 items-start rounded-lg border px-3 py-2", on ? "border-violet-500/50 bg-violet-600/10" : "border-slate-700", everything ? "opacity-70" : "cursor-pointer")}>
                <input type="checkbox" className="mt-1 accent-violet-600" disabled={everything} checked={on} onChange={(e) => setPicked((s) => toggleModule(s, m, e.target.checked))} />
                <span className="text-sm flex-1">
                  <span className="text-white">{m.label}</span>
                  <span className={cn("block text-[11px]", full ? "text-amber-300" : "text-slate-500")}>
                    {seatLabel(m)}
                    {full && " — full"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => save.mutate()}
        disabled={!changed || save.isPending}
        className="mt-4 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition disabled:opacity-40"
      >
        {save.isPending ? "Saving..." : "Save module access"}
      </button>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-violet-400" /> Module access
      </h2>
      {children}
    </div>
  );
}
