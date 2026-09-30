"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Search, BadgeCheck, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { extrasApi, type AdminLead, type LeadStatus } from "@/lib/api/projectExtras.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn, CONTENT_MANAGER_ROLES } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { can } from "@/lib/permissions";

const STATUSES: { value: LeadStatus; label: string; style: string }[] = [
  { value: "new", label: "New", style: "bg-sky-500/15 text-sky-200 border-sky-500/30" },
  { value: "contacted", label: "Contacted", style: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  { value: "converted", label: "Converted", style: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  { value: "closed", label: "Closed", style: "bg-slate-500/15 text-slate-300 border-slate-500/30" }
];
const statusMeta = (s: LeadStatus) => STATUSES.find((x) => x.value === s)!;
const when = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const ageHours = (d: string) => (Date.now() - new Date(d).getTime()) / 3_600_000;

/** Consultation requests from campaigns (R2): follow up, record notes, track conversions. */
export default function LeadsPage() {
  const [status, setStatus] = useState<LeadStatus | "">("new");
  const [campaign, setCampaign] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-leads", status, campaign, debounced, page],
    queryFn: () => extrasApi.leads({ status: status || undefined, campaign: campaign || undefined, search: debounced || undefined, page })
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-sky-600/20 border border-sky-500/30 flex items-center justify-center">
          <PhoneCall className="h-5 w-5 text-sky-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Consultation requests</h1>
          <p className="text-sm text-slate-400">From “Book a free consultation” on campaigns. Aim to call new requests within one working day.</p>
        </div>
      </div>

      {data?.campaigns && data.campaigns.length > 0 && (
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <h2 className="text-xs font-semibold text-slate-300 mb-2">Which campaigns bring business</h2>
          <ul className="flex flex-wrap gap-2">
            {data.campaigns.map((c) => (
              <li key={c._id ?? "none"}>
                <button
                  type="button"
                  onClick={() => { setCampaign(campaign === c._id ? "" : c._id ?? ""); setPage(1); }}
                  aria-pressed={campaign === c._id}
                  className={cn("px-3 py-1.5 rounded-lg border text-xs text-left", campaign === c._id ? "border-violet-500/60 bg-violet-600/20 text-white" : "border-slate-700 text-slate-300")}
                >
                  {c.title} · <span className="text-slate-400">{c.total} requests</span> · <span className="text-emerald-300">{c.converted} converted ({c.total ? Math.round((c.converted / c.total) * 100) : 0}%)</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {[{ value: "" as const, label: "All" }, ...STATUSES].map((s) => (
          <button key={s.value || "all"} onClick={() => { setStatus(s.value); setPage(1); }} aria-pressed={status === s.value} className={cn("px-3 py-1.5 rounded-lg border text-xs", status === s.value ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {s.label}
            {s.value && data?.counts?.[s.value] ? <span className="ml-1.5 text-slate-400">{data.counts[s.value]}</span> : null}
          </button>
        ))}
        <div className="relative ml-auto min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or phone" aria-label="Search requests" className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.items.length ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-8 text-center">No requests here.</p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((l) => (
            <LeadItem key={l._id} lead={l} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex justify-center items-center gap-3 text-xs text-slate-300">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40">Previous</button>
          Page {page} of {pages}
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}

function LeadItem({ lead }: { lead: AdminLead }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  // Leadership and "view leads" holders read only; content managers and "work leads" holders update
  const me = useAuthStore((s) => s.user);
  const canWork = Boolean(me && (CONTENT_MANAGER_ROLES.includes(me.role) || can(me, "leads.manage")));
  const update = useMutation({
    mutationFn: (body: Parameters<typeof extrasApi.updateLead>[1]) => extrasApi.updateLead(lead._id, body),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-leads"] });
      toast.success("Request updated");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update"))
  });
  const meta = statusMeta(lead.status);
  const overdue = lead.status === "new" && ageHours(lead.createdAt) > 24;

  return (
    <li className={cn("bg-slate-900/80 border rounded-xl p-4 space-y-2", overdue ? "border-rose-500/40" : "border-slate-800")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm text-white">
            {lead.customer?.name || "Deleted customer"}
            {lead.customer?.phoneVerified && <BadgeCheck className="inline h-3.5 w-3.5 ml-1 text-emerald-400" aria-label="phone verified" />}
          </p>
          <p className="text-[11px] text-slate-400">{lead.campaign?.title || "General enquiry"} · {when(lead.createdAt)}{overdue && <span className="text-rose-300"> · waiting over a day</span>}</p>
          {lead.message && <p className="text-sm text-slate-300 mt-1">“{lead.message}”</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {lead.customer?.phone && (
            <a href={`tel:${lead.customer.phone}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500">
              <Phone className="h-3.5 w-3.5" /> {lead.customer.phone}
            </a>
          )}
          {lead.customer?.email && (
            <a href={`mailto:${lead.customer.email}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500">
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          )}
        </div>
        {canWork ? (
          <select
            value={lead.status}
            onChange={(e) => update.mutate({ status: e.target.value as LeadStatus })}
            aria-label="Status"
            disabled={update.isPending}
            className={cn("px-2 py-1.5 rounded-lg border text-xs bg-transparent", meta.style)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        ) : (
          <span className={cn("px-2 py-1.5 rounded-lg border text-xs", meta.style)}>{meta.label}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {lead.handledBy ? (
          <span>Handled by {lead.handledBy.name}</span>
        ) : canWork ? (
          <button onClick={() => update.mutate({ assignToMe: true })} className="text-violet-300 hover:underline">Take this request</button>
        ) : (
          <span>Not picked up yet</span>
        )}
        {lead.contactedAt && <span>Contacted {when(lead.contactedAt)}</span>}
        {(canWork || lead.notes.length > 0) && (
          <button onClick={() => setOpen(!open)} className="text-slate-300 hover:underline">
            {lead.notes.length ? `${lead.notes.length} note${lead.notes.length > 1 ? "s" : ""}` : "Add note"}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2">
          {lead.notes.map((n, i) => (
            <p key={i} className="text-xs text-slate-300"><span className="text-slate-500">{n.by?.name} · {when(n.at)}:</span> {n.text}</p>
          ))}
          {canWork && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) update.mutate({ note: note.trim() }); }}>
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} placeholder="e.g. Called — site visit Saturday" className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs" />
            <button type="submit" disabled={!note.trim() || update.isPending} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs disabled:opacity-40">Save</button>
          </form>}
        </div>
      )}
    </li>
  );
}
