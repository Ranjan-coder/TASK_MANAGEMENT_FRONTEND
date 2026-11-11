"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { orgApi, type OrgModuleRow } from "@/lib/api/org.api";
import { usersApi } from "@/lib/api/users.api";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { seatLabel } from "./ModuleAccessPanel";
import type { User } from "@/types";

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** Same rule as the server (moduleAccess.service holdsAll). */
const holdsAll = (u: User) => u.role === "superadmin" || u.moduleAccess?.all === true || (u.moduleAccess?.all == null && u.role === "admin");
const holds = (u: User, key: string) => holdsAll(u) || Boolean(u.moduleAccess?.keys?.includes(key));

/**
 * Superadmin → Organisation → Modules: seats per module, and who has each one.
 * Changes are sent as one batch (add / remove lists): one seat claim on the server.
 */
export function ModuleMembers() {
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["org", "modules"], queryFn: orgApi.modules, staleTime: 60_000 });
  const staff = useQuery({
    queryKey: ["users", "staff-for-modules"],
    queryFn: async () => (await usersApi.getUsers({ role: "staff", status: "active", limit: 100 })).data.data as User[]
  });
  const rows = (catalog.data || []).filter((m) => !m.core && !m.defaultOn && !m.orgWide);
  const forEveryone = (catalog.data || []).filter((m) => m.defaultOn || m.orgWide);
  const [key, setKey] = useState<string | null>(null);
  const selected = rows.find((m) => m.key === key) || rows[0];

  return (
    <div className="space-y-4">
      {forEveryone.length > 0 && <EveryoneModules rows={forEveryone} onChanged={() => qc.invalidateQueries({ queryKey: ["org", "modules"] })} />}
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <ul className="space-y-1.5" aria-label="Modules">
        {rows.map((m) => (
          <li key={m.key}>
            <button
              onClick={() => setKey(m.key)}
              className={cn("w-full text-left rounded-xl border px-3 py-2", selected?.key === m.key ? "border-violet-500/50 bg-violet-600/15" : "border-slate-800 hover:border-slate-600")}
            >
              <span className="block text-sm text-white">{m.label}</span>
              <span className={cn("block text-[11px]", m.seatLimit != null && (m.seatsUsed ?? 0) >= m.seatLimit ? "text-amber-300" : "text-slate-500")}>{seatLabel(m)}</span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="text-sm text-slate-500">Your organisation has only the core modules.</li>}
      </ul>
      {selected && staff.data && (
        <Members
          key={selected.key}
          module={selected}
          people={staff.data}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["org", "modules"] });
            qc.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      )}
    </div>
    </div>
  );
}

/**
 * Modules everyone in the organisation has (e.g. Planner). Some can also be opened
 * to customers; only the superadmin decides that.
 */
function EveryoneModules({ rows, onChanged }: { rows: OrgModuleRow[]; onChanged: () => void }) {
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => orgApi.setModuleCustomers(key, enabled),
    onSuccess: (_r, v) => {
      onChanged();
      toast.success(v.enabled ? "Customers can now use it" : "Customers can no longer use it");
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't change it"))
  });
  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-white">For everyone on your team</h3>
      <ul className="space-y-2">
        {rows.map((m) => (
          <li key={m.key} className="flex flex-wrap items-center gap-3">
            <span className="flex-1 min-w-[200px]">
              <span className="text-sm text-white">{m.label}</span>
              <span className="block text-xs text-slate-500">{m.description}</span>
            </span>
            {m.customerOptIn && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-violet-600"
                  checked={Boolean(m.customersEnabled)}
                  disabled={toggle.isPending}
                  onChange={(e) => toggle.mutate({ key: m.key, enabled: e.target.checked })}
                />
                Customers can use it too
              </label>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Members({ module: m, people, onSaved }: { module: OrgModuleRow; people: User[]; onSaved: () => void }) {
  const [search, setSearch] = useState("");
  const initial = useMemo(() => new Set(people.filter((u) => holds(u, m.key)).map((u) => u._id)), [people, m.key]);
  const [picked, setPicked] = useState<Set<string>>(initial);
  useEffect(() => setPicked(initial), [initial]);

  // In-memory filter (≤100 people): no request per keystroke
  const q = search.trim().toLowerCase();
  const shown = people.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  const add = [...picked].filter((id) => !initial.has(id));
  const remove = [...initial].filter((id) => !picked.has(id));

  const save = useMutation({
    mutationFn: () => orgApi.setModuleMembers(m.key, { ...(add.length && { add }), ...(remove.length && { remove }) }),
    onSuccess: (r) => {
      onSaved();
      toast.success(`${m.label}: ${r.changed} ${r.changed === 1 ? "person" : "people"} updated`);
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't update"))
  });

  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
      <div>
        <h3 className="text-white font-semibold">{m.label}</h3>
        <p className="text-xs text-slate-400">{m.description}</p>
        {m.requiresAll.length > 0 && <p className="text-[11px] text-slate-500 mt-1">Giving it also gives what it needs; taking it away also removes what depends on it.</p>}
      </div>
      <label className="relative block">
        <span className="sr-only">Search people</span>
        <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
      </label>
      <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl">
        {shown.map((u) => {
          const locked = u.role === "superadmin";
          return (
            <li key={u._id}>
              <label className={cn("flex items-center gap-3 px-3 py-2 text-sm", locked ? "opacity-60" : "cursor-pointer")}>
                <input
                  type="checkbox"
                  className="accent-violet-600"
                  disabled={locked}
                  checked={picked.has(u._id)}
                  onChange={(e) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(u._id);
                      else next.delete(u._id);
                      return next;
                    })
                  }
                />
                <span className="flex-1 min-w-0">
                  <span className="text-white block truncate">{u.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {ROLE_LABELS[u.role]}
                    {holdsAll(u) && !locked && " · has every module"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{add.length || remove.length ? `${add.length} to add, ${remove.length} to remove` : "No changes"}</span>
        <button
          onClick={() => save.mutate()}
          disabled={(!add.length && !remove.length) || save.isPending}
          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold"
        >
          {save.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </section>
  );
}
