"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Search, X, BadgeCheck, ShieldOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { monitoringApi, type CustomerRow } from "@/lib/api/monitoring.api";
import { usersApi } from "@/lib/api/users.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn } from "@/lib/utils";

const when = (d?: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATUS_STYLE: Record<string, string> = {
  active: "text-emerald-300",
  inactive: "text-slate-400",
  suspended: "text-rose-300"
};

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [verified, setVerified] = useState<"" | "yes" | "no">("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", debounced, status, verified, page],
    queryFn: async () =>
      (await monitoringApi.customers({ search: debounced || undefined, status: status || undefined, verified: verified || undefined, page })).data.data
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-sky-600/20 border border-sky-500/30 flex items-center justify-center">
          <Users className="h-5 w-5 text-sky-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-sm text-slate-400">{data ? `${data.total} customer accounts` : "Customer accounts"}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone" aria-label="Search customers" className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status" className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={verified} onChange={(e) => { setVerified(e.target.value as "" | "yes" | "no"); setPage(1); }} aria-label="Phone verification" className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200">
          <option value="">Phone: any</option>
          <option value="yes">Phone verified</option>
          <option value="no">Not verified</option>
        </select>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto">
        {isLoading ? (
          <p className="p-5 text-sm text-slate-400">Loading…</p>
        ) : !data?.items.length ? (
          <p className="p-5 text-sm text-slate-400">No customers match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                <th className="py-2 px-3 font-medium">Customer</th>
                <th className="py-2 px-3 font-medium">Phone</th>
                <th className="py-2 px-3 font-medium text-right">Projects</th>
                <th className="py-2 px-3 font-medium text-right">Requests</th>
                <th className="py-2 px-3 font-medium">Joined</th>
                <th className="py-2 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c._id} onClick={() => setOpenId(c._id)} className="border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer">
                  <td className="py-2.5 px-3">
                    <button type="button" className="text-left" onClick={() => setOpenId(c._id)}>
                      <span className="block text-slate-100">{c.name}</span>
                      <span className="block text-[11px] text-slate-500">{c.email}</span>
                    </button>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {c.phone || "—"}
                    {c.phoneVerified && <BadgeCheck className="inline h-3.5 w-3.5 ml-1 text-emerald-400" aria-label="verified" />}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{c.projects.total}{c.projects.active ? <span className="text-slate-500"> ({c.projects.active} active)</span> : null}</td>
                  <td className="py-2.5 px-3 text-right text-slate-300">{c.leads.total}{c.leads.open ? <span className="text-amber-300"> · {c.leads.open} open</span> : null}</td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{when(c.createdAt)}</td>
                  <td className={cn("py-2.5 px-3 text-xs capitalize", STATUS_STYLE[c.status])}>
                    {c.status}
                    {c.flagged > 0 && <span className="ml-1 text-amber-300 normal-case">· flagged {c.flagged}×</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex justify-center items-center gap-3 text-xs text-slate-300">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40">Previous</button>
          Page {page} of {pages}
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40">Next</button>
        </div>
      )}

      {openId && <CustomerDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CustomerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({ queryKey: ["admin-customer", id], queryFn: async () => (await monitoringApi.customer(id)).data.data });
  const setStatus = useMutation({
    mutationFn: (status: CustomerRow["status"]) => usersApi.updateStatus(id, status),
    onSuccess: (_r, status) => {
      toast.success(status === "suspended" ? "Customer suspended and signed out everywhere" : "Customer reactivated");
      qc.invalidateQueries({ queryKey: ["admin-customer", id] });
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't change the status"))
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="cust-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-xl h-full overflow-y-auto bg-slate-900 border-l border-slate-700 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="cust-title" className="text-lg font-semibold text-white">{c?.name || "Customer"}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {isLoading || !c ? (
          <p className="p-5 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="p-5 space-y-5 text-sm">
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-slate-500">Email</dt><dd className="text-slate-200">{c.email}</dd>
              <dt className="text-slate-500">Phone</dt><dd className="text-slate-200">{c.phone || "—"} {c.phoneVerified ? <span className="text-emerald-300">(verified)</span> : <span className="text-amber-300">(not verified)</span>}</dd>
              <dt className="text-slate-500">Joined</dt><dd className="text-slate-200">{when(c.createdAt)}</dd>
              <dt className="text-slate-500">Last sign-in</dt><dd className="text-slate-200">{when(c.lastLogin)}</dd>
              <dt className="text-slate-500">Terms accepted</dt><dd className="text-slate-200">{c.consent?.termsAcceptedAt ? `${when(c.consent.termsAcceptedAt)} (privacy ${c.consent.privacyVersion})` : "—"}</dd>
              <dt className="text-slate-500">Status</dt><dd className={cn("capitalize", STATUS_STYLE[c.status])}>{c.status}</dd>
            </dl>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">Projects ({c.projects.length})</h3>
              {c.projects.length ? (
                <ul className="space-y-1 text-xs">
                  {c.projects.map((p) => (
                    <li key={p._id} className="flex justify-between bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2">
                      <span className="text-slate-200">{p.name} <span className="text-slate-500">· lead {p.leadDesigner || "—"}</span></span>
                      <span className="text-slate-400 capitalize">{p.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No projects yet. Create one in Admin → Projects.</p>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">Consultation requests ({c.leads.length})</h3>
              {c.leads.length ? (
                <ul className="space-y-1 text-xs">
                  {c.leads.map((l) => (
                    <li key={l._id} className="bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2">
                      <span className="text-slate-200">{l.campaign || "General enquiry"}</span> <span className="text-slate-500">· {l.status} · {when(l.createdAt)}</span>
                      {l.message && <span className="block text-slate-400 mt-0.5">{l.message}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">None.</p>
              )}
            </section>

            {(c.reportsMade.length > 0 || c.reportsAbout.length > 0) && (
              <section>
                <h3 className="text-xs font-semibold text-slate-300 mb-1">Reports</h3>
                <ul className="space-y-0.5 text-xs text-slate-300">
                  {c.reportsMade.map((r) => (
                    <li key={r._id}>#{r.ticketNo} · reported {r.reportedUser?.name} · {r.status.replace("_", " ")} · {when(r.createdAt)}</li>
                  ))}
                  {c.reportsAbout.map((r) => (
                    <li key={r._id} className="text-amber-200">#{r.ticketNo} · flagged by {r.reporter?.name} · {r.status.replace("_", " ")} · {when(r.createdAt)}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-t border-slate-800 pt-4">
              {c.status === "suspended" ? (
                <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate("active")} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 text-emerald-200 text-xs hover:bg-emerald-500/10 disabled:opacity-40">
                  <ShieldCheck className="h-4 w-4" /> Reactivate account
                </button>
              ) : (
                <button
                  type="button"
                  disabled={setStatus.isPending}
                  onClick={() => confirm(`Suspend ${c.name}? They'll be signed out on every device and can't sign in until reactivated.`) && setStatus.mutate("suspended")}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/40 text-rose-200 text-xs hover:bg-rose-500/10 disabled:opacity-40"
                >
                  <ShieldOff className="h-4 w-4" /> Suspend account
                </button>
              )}
              <p className="mt-2 text-[11px] text-slate-500">Recorded in the audit log. Their project chats and history are kept.</p>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
