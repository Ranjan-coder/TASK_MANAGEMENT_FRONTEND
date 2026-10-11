"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Plus, X, Search, Users, Contact } from "lucide-react";
import { platformApi, type ModuleInfo, type PlatformOrg } from "@/lib/api/platform.api";
import { passwordPolicyError } from "@/lib/crypto/passwordKeys";
import { ORG_CODE_RE } from "@/lib/auth/credentials";
import { cn } from "@/lib/utils";
import { STATUS_STYLE, describeAction, toggleWithDeps } from "@/components/platform/helpers";

const input = "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** "Alpha Interiors Pvt Ltd" → "alpha-interiors-pvt-ltd" (what the code field suggests). */
const toCode = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * Product owner → Organisations. Each organisation shows its modules and usage
 * counts only — never the people or data inside it (module-access-plan.md, M3).
 */
export default function PlatformPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "suspended">("");
  const [creating, setCreating] = useState(false);

  const orgs = useQuery({ queryKey: ["platform", "orgs"], queryFn: () => platformApi.organisations() });
  const catalog = useQuery({ queryKey: ["platform", "modules"], queryFn: platformApi.modules, staleTime: Infinity });
  const audit = useQuery({ queryKey: ["platform", "audit"], queryFn: platformApi.audit });
  const labels = useMemo(() => new Map((catalog.data || []).map((m) => [m.key, m.label])), [catalog.data]);

  // The list is small: filter in memory as you type, no request per keystroke
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orgs.data || []).filter((o) => (!status || o.status === status) && (!q || o.name.toLowerCase().includes(q) || o.slug.includes(q)));
  }, [orgs.data, search, status]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Globe className="h-5 w-5 text-violet-300" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-white">Organisations</h1>
          <p className="text-sm text-slate-400">Switch modules on for each organisation. You see usage counts, never their people or data.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold">
          <Plus className="h-4 w-4" /> New organisation
        </button>
      </div>

      {creating && catalog.data && <CreateOrg catalog={catalog.data} onClose={() => setCreating(false)} />}

      <div className="flex flex-wrap gap-2">
        <label className="relative flex-1 min-w-[220px]">
          <span className="sr-only">Search organisations</span>
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code" className={cn(input, "pl-9")} />
        </label>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={cn(input, "w-auto")}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {orgs.isLoading ? (
        <div className="h-40 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-400">No organisations match.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((o) => (
            <OrgCard key={o._id} org={o} labels={labels} />
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Recent changes</h2>
        <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl text-sm">
          {(audit.data || []).slice(0, 15).map((a) => (
            <li key={a._id} className="px-4 py-2.5 flex flex-wrap gap-x-3 text-slate-300">
              <span className="text-white">{describeAction(a.action, a.metadata, labels)}</span>
              <span className="text-slate-500">
                {orgs.data?.find((o) => o._id === a.targetId)?.name || "—"} · {a.actor?.name || "system"} ·{" "}
                {new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
          {!audit.data?.length && <li className="px-4 py-3 text-slate-500">Nothing yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function OrgCard({ org, labels }: { org: PlatformOrg; labels: Map<string, string> }) {
  const on = org.modules.filter((m) => !m.core && m.enabled);
  return (
    <li>
      <Link href={`/platform/${org._id}`} className="block rounded-2xl bg-slate-900 border border-slate-800 hover:border-violet-500/50 p-4 space-y-3 transition">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{org.name}</p>
            <p className="text-xs text-slate-500 font-mono">{org.slug}</p>
          </div>
          <span className={cn("px-2 py-0.5 rounded-full border text-[11px] capitalize", STATUS_STYLE[org.status])}>{org.status}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {on.length === 0 && <span className="text-xs text-slate-500">Core modules only</span>}
          {on.map((m) => (
            <span
              key={m.key}
              title={m.effective ? undefined : "Switched on but not in effect (expired, or something it needs is off)"}
              className={cn("px-2 py-0.5 rounded-md text-[11px] border", m.effective ? "border-slate-700 text-slate-300" : "border-amber-500/40 text-amber-300 line-through")}
            >
              {labels.get(m.key) || m.key}
            </span>
          ))}
        </div>
        <p className="flex gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {org.usage.staff} staff</span>
          <span className="inline-flex items-center gap-1"><Contact className="h-3.5 w-3.5" /> {org.usage.customers} customers</span>
          <span>{org.usage.activeLast30Days} signed in, last 30 days</span>
        </p>
      </Link>
    </li>
  );
}

function CreateOrg({ catalog, onClose }: { catalog: ModuleInfo[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [admin, setAdmin] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const toggleable = catalog.filter((m) => !m.core);

  const create = useMutation({
    mutationFn: () => platformApi.createOrganisation({ name: name.trim(), slug, modules: [...selected], superadmin: { ...admin, email: admin.email.trim() } }),
    onSuccess: (org) => {
      toast.success(`${org.name} created. Send ${admin.email} the sign-in details and organisation code "${org.slug}".`);
      qc.invalidateQueries({ queryKey: ["platform"] });
      onClose();
    },
    onError: (err) => setError(errMsg(err, "Couldn't create the organisation"))
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Enter the organisation's name");
    if (!ORG_CODE_RE.test(slug)) return setError("The code must be 3–40 lowercase letters, numbers and dashes");
    if (admin.name.trim().length < 2 || !admin.email.includes("@")) return setError("Enter the first superadmin's name and email");
    const weak = passwordPolicyError(admin.password);
    if (weak) return setError(weak);
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="rounded-2xl bg-slate-900 border border-violet-500/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">New organisation</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-slate-300">
          Name
          <input className={input} value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(toCode(e.target.value)); }} placeholder="Alpha Interiors" />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          Organisation code <span className="text-slate-500">(used at sign-in; can&apos;t be changed)</span>
          <input className={cn(input, "font-mono")} value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} placeholder="alpha-interiors" />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm text-slate-300 mb-1">Modules <span className="text-slate-500">(core modules are always included)</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {toggleable.map((m) => (
            <label key={m.key} className={cn("flex gap-2 items-start rounded-lg border px-3 py-2 cursor-pointer", selected.has(m.key) ? "border-violet-500/50 bg-violet-600/10" : "border-slate-700")}>
              <input type="checkbox" className="mt-1 accent-violet-600" checked={selected.has(m.key)} onChange={(e) => setSelected((s) => toggleWithDeps(s, m, e.target.checked))} />
              <span className="text-sm">
                <span className="text-white">{m.label}</span>
                <span className="block text-xs text-slate-400">{m.description}</span>
                {m.requiresAll.length > 0 && <span className="block text-[11px] text-slate-500">Needs {m.requiresAll.map((k) => catalog.find((c) => c.key === k)?.label || k).join(", ")}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="text-sm text-slate-300 mb-1 sm:col-span-3">First superadmin <span className="text-slate-500">(must change this password at first sign-in)</span></legend>
        <input className={input} aria-label="Superadmin name" placeholder="Full name" value={admin.name} onChange={(e) => setAdmin((a) => ({ ...a, name: e.target.value }))} />
        <input className={input} aria-label="Superadmin email" type="email" placeholder="email@company.com" value={admin.email} onChange={(e) => setAdmin((a) => ({ ...a, email: e.target.value }))} />
        <input className={input} aria-label="Initial password" type="password" autoComplete="new-password" placeholder="Initial password" value={admin.password} onChange={(e) => setAdmin((a) => ({ ...a, password: e.target.value }))} />
      </fieldset>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm">Cancel</button>
        <button type="submit" disabled={create.isPending} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold">
          {create.isPending ? "Creating…" : "Create organisation"}
        </button>
      </div>
    </form>
  );
}
