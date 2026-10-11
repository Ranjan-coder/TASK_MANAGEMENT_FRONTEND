"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, Pencil, Users, Contact, Activity, Palette } from "lucide-react";
import { platformApi, type ModuleInfo, type OrgModule, type PlatformOrg } from "@/lib/api/platform.api";
import { STATUS_STYLE } from "@/components/platform/helpers";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

const input = "px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** Product owner → one organisation: status and modules (with end dates and seats). */
export default function PlatformOrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ["platform", "org", orgId], queryFn: () => platformApi.organisation(orgId) });
  const catalog = useQuery({ queryKey: ["platform", "modules"], queryFn: platformApi.modules, staleTime: Infinity });
  const labels = useMemo(() => new Map((catalog.data || []).map((m) => [m.key, m.label])), [catalog.data]);

  const refresh = (fresh?: PlatformOrg) => {
    if (fresh) qc.setQueryData(["platform", "org", orgId], fresh);
    qc.invalidateQueries({ queryKey: ["platform", "orgs"] });
    qc.invalidateQueries({ queryKey: ["platform", "audit"] });
  };

  const update = useMutation({
    mutationFn: (patch: { name?: string; status?: "active" | "suspended"; displayName?: string | null }) => platformApi.updateOrganisation(orgId, patch),
    onSuccess: (fresh) => {
      refresh(fresh);
      toast.success("Saved");
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't save"))
  });

  if (org.isLoading || !org.data || !catalog.data) {
    return <div className="max-w-5xl mx-auto h-60 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />;
  }
  const o = org.data;
  const suspended = o.status === "suspended";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Organisations
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[220px] space-y-1">
          <Rename name={o.name} busy={update.isPending} onSave={(name) => update.mutate({ name })} />
          <p className="text-sm text-slate-400">
            Organisation code <span className="font-mono text-slate-200">{o.slug}</span> · created{" "}
            {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <span className={cn("px-2.5 py-1 rounded-full border text-xs capitalize", STATUS_STYLE[o.status])}>{o.status}</span>
        <button
          disabled={update.isPending}
          onClick={() => {
            const msg = suspended
              ? `Reactivate ${o.name}? Its people can sign in again.`
              : `Suspend ${o.name}? Everyone in it is signed out and can't use the app until you reactivate it.`;
            if (window.confirm(msg)) update.mutate({ status: suspended ? "active" : "suspended" });
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm disabled:opacity-50",
            suspended ? "border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10" : "border-red-500/50 text-red-300 hover:bg-red-500/10"
          )}
        >
          {suspended ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          {suspended ? "Reactivate" : "Suspend"}
        </button>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Usage">
        <Stat icon={Users} label="Staff" value={o.usage.staff} />
        <Stat icon={Contact} label="Customers" value={o.usage.customers} />
        <Stat icon={CheckCircle2} label="Active accounts" value={o.usage.active} />
        <Stat icon={Activity} label="Signed in, last 30 days" value={o.usage.activeLast30Days} />
      </section>

      <Branding
        key={o.displayName ?? ""}
        displayName={o.displayName}
        moduleOn={Boolean(o.modules.find((m) => m.key === "branding")?.effective)}
        busy={update.isPending}
        onSave={(displayName) => update.mutate({ displayName })}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Modules</h2>
        <p className="text-xs text-slate-500">
          Switching a module on also switches on what it needs. Switching one off keeps people&apos;s own access, so switching it back on restores it.
        </p>
        <ul className="divide-y divide-slate-800 border border-slate-800 rounded-2xl bg-slate-900">
          {catalog.data.map((info) => {
            const state = o.modules.find((m) => m.key === info.key);
            return state ? <ModuleRow key={info.key} orgId={orgId} info={info} state={state} labels={labels} onChanged={refresh} /> : null;
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
      <Icon className="h-4 w-4 text-slate-500" />
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

/**
 * The name this organisation's people see in place of the product name, once they
 * have signed in. Only used while the "Company branding" module is on.
 */
function Branding({ displayName, moduleOn, busy, onSave }: { displayName: string | null; moduleOn: boolean; busy: boolean; onSave: (v: string | null) => void }) {
  const [value, setValue] = useState(displayName ?? "");
  const trimmed = value.trim();
  const dirty = trimmed !== (displayName ?? "");
  const invalid = trimmed !== "" && (trimmed.length < 2 || /[<>]/.test(trimmed));
  const shown = moduleOn && displayName ? displayName : APP_NAME;
  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3" aria-labelledby="branding-h">
      <h2 id="branding-h" className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
        <Palette className="h-4 w-4" /> Branding
      </h2>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !invalid) onSave(trimmed || null);
        }}
      >
        <label className="text-xs text-slate-400 space-y-1 flex-1 min-w-[220px]">
          <span className="block">Display name</span>
          <input className={cn(input, "w-full")} value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} placeholder={APP_NAME} aria-invalid={invalid} />
        </label>
        <button disabled={!dirty || invalid || busy} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-sm">
          Save
        </button>
      </form>
      {invalid && <p className="text-xs text-red-300">Use 2–60 characters, without &lt; or &gt;.</p>}
      <p className="text-xs text-slate-500">
        Its people see <span className="text-slate-200 font-medium">{shown}</span> after they sign in.{" "}
        {moduleOn
          ? "Leave the name empty to show the product name."
          : `Switch on Company branding below to use the display name; until then everyone sees ${APP_NAME}.`}
      </p>
    </section>
  );
}

function Rename({ name, busy, onSave }: { name: string; busy: boolean; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing) {
    return (
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        {name}
        <button onClick={() => { setValue(name); setEditing(true); }} aria-label="Rename" className="text-slate-500 hover:text-white"><Pencil className="h-4 w-4" /></button>
      </h1>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length >= 2 && value.trim() !== name) onSave(value.trim());
        setEditing(false);
      }}
    >
      <input autoFocus aria-label="Organisation name" className={cn(input, "text-lg")} value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} />
      <button disabled={busy} className="px-3 rounded-lg bg-violet-600 text-white text-sm">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="px-3 rounded-lg border border-slate-700 text-slate-300 text-sm">Cancel</button>
    </form>
  );
}

function ModuleRow({
  orgId,
  info,
  state,
  labels,
  onChanged
}: {
  orgId: string;
  info: ModuleInfo;
  state: OrgModule;
  labels: Map<string, string>;
  onChanged: (fresh: PlatformOrg) => void;
}) {
  const [expiresAt, setExpiresAt] = useState(dateOnly(state.expiresAt));
  const [seatLimit, setSeatLimit] = useState(state.seatLimit?.toString() ?? "");
  const names = (keys: string[]) => keys.map((k) => labels.get(k) || k).join(", ");

  const save = useMutation({
    mutationFn: (patch: { enabled?: boolean; expiresAt?: string | null; seatLimit?: number | null }) => platformApi.setModule(orgId, info.key, patch),
    onSuccess: ({ organisation, pulledIn }) => {
      onChanged(organisation);
      toast.success(pulledIn.length ? `${info.label} is on. Also switched on: ${names(pulledIn)}.` : `${info.label} updated`);
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't change the module"))
  });

  if (info.core) {
    return (
      <li className="px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="text-white text-sm font-medium">{info.label}</p>
          <p className="text-xs text-slate-500">{info.description}</p>
        </div>
        <span className="text-xs text-slate-400">Always on</span>
      </li>
    );
  }

  const dirty = expiresAt !== dateOnly(state.expiresAt) || seatLimit !== (state.seatLimit?.toString() ?? "");
  const saveDetails = () => {
    const seats = seatLimit.trim() === "" ? null : Number(seatLimit);
    if (seats !== null && (!Number.isInteger(seats) || seats < 1)) return toast.error("Seats must be a whole number of at least 1, or empty for unlimited");
    // End of the chosen day, in the viewer's time zone
    const end = expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null;
    save.mutate({ expiresAt: end, seatLimit: seats });
  };

  return (
    <li className="px-4 py-3 flex flex-wrap items-center gap-3">
      <label className="flex items-start gap-3 flex-1 min-w-[220px] cursor-pointer">
        <input
          type="checkbox"
          role="switch"
          aria-label={`${info.label} on`}
          className="mt-1 h-4 w-4 accent-violet-600"
          checked={state.enabled}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ enabled: e.target.checked })}
        />
        <span>
          <span className="text-white text-sm font-medium">{info.label}</span>
          {state.enabled && !state.effective && (
            <span className="ml-2 text-[11px] text-amber-300">not in effect: {state.expiresAt && new Date(state.expiresAt) < new Date() ? "ended" : "something it needs is off"}</span>
          )}
          <span className="block text-xs text-slate-500">{info.description}</span>
          {info.defaultOn && <span className="block text-[11px] text-emerald-300/80">On for everyone by default{info.staffOnly ? " (staff; the organisation may open it to customers)" : ""}</span>}
          {info.requiresAll.length > 0 && <span className="block text-[11px] text-slate-500">Needs {names(info.requiresAll)}</span>}
        </span>
      </label>
      <label className="text-xs text-slate-400 space-y-1">
        <span className="block">Ends</span>
        <input type="date" className={input} value={expiresAt} min={new Date(Date.now() + 86400e3).toISOString().slice(0, 10)} onChange={(e) => setExpiresAt(e.target.value)} />
      </label>
      {!info.defaultOn && !info.orgWide && (
      <label className="text-xs text-slate-400 space-y-1">
        <span className="block">Seats {state.seatsUsed != null && <span className={cn(state.seatLimit != null && state.seatsUsed >= state.seatLimit ? "text-amber-300" : "text-slate-500")}>({state.seatsUsed} in use)</span>}</span>
        <input type="number" min={1} max={100000} placeholder="Unlimited" className={cn(input, "w-28")} value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} />
      </label>
      )}
      <button
        disabled={!dirty || save.isPending}
        onClick={saveDetails}
        className="self-end px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white text-sm"
      >
        Save
      </button>
    </li>
  );
}
