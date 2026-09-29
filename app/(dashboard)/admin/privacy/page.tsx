"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn } from "@/lib/utils";

interface DeletionRow {
  _id: string;
  status: "pending" | "cancelled" | "completed" | "rejected";
  reason: string;
  note: string;
  createdAt: string;
  handledAt: string | null;
  handledBy: { name: string } | null;
  user: { _id: string; name: string; email: string; phone?: string; createdAt: string } | null;
  openReports?: number;
  activeProjects?: number;
  summary?: Record<string, number>;
}

const STATUS_STYLE: Record<DeletionRow["status"], string> = {
  pending: "border-amber-500/40 text-amber-200",
  completed: "border-emerald-500/40 text-emerald-200",
  rejected: "border-rose-500/40 text-rose-200",
  cancelled: "border-slate-600 text-slate-400"
};
const when = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const daysLeft = (d: string) => 30 - Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

/** Admin → Privacy: customers' account deletion requests (DPDP Act, 30-day target). */
export default function PrivacyAdminPage() {
  const [status, setStatus] = useState<DeletionRow["status"] | "">("pending");
  const { data, isLoading } = useQuery({
    queryKey: ["deletion-requests", status],
    queryFn: async () => (await apiClient.get("/admin/privacy/deletion-requests", { params: { status: status || undefined } })).data.data as DeletionRow[]
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Privacy requests</h1>
          <p className="text-sm text-slate-400">Customers asking to delete their account and data. Complete each within 30 days (DPDP Act 2023).</p>
        </div>
      </div>
      <div className="flex gap-2">
        {(["pending", "completed", "rejected", "cancelled", ""] as const).map((s) => (
          <button key={s || "all"} onClick={() => setStatus(s)} aria-pressed={status === s} className={cn("px-3 py-1.5 rounded-lg border text-xs capitalize", status === s ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {s || "All"}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.length ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-8 text-center">No requests.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => (
            <RequestItem key={r._id} row={r} />
          ))}
        </ul>
      )}
      <section className="text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
        <p className="font-semibold text-slate-200">Automatic clean-up (runs every 6 hours)</p>
        <p>Sign-in codes after 90 days · reply-time records after 90 days · read notifications after 180 days · report evidence (messages and screenshots) 1 year after a report is closed · edited/deleted chat originals after 1 year.</p>
      </section>
    </div>
  );
}

function RequestItem({ row }: { row: DeletionRow }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const act = useMutation({
    mutationFn: async (decision: "approve" | "reject") => (await apiClient.patch(`/admin/privacy/deletion-requests/${row._id}`, { decision, note: note.trim() })).data,
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["deletion-requests"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update the request"))
  });
  const left = daysLeft(row.createdAt);

  return (
    <li className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-[200px]">
          <p className="text-white">{row.user?.name}</p>
          <p className="text-[11px] text-slate-400">{row.user?.email}{row.user?.phone ? ` · ${row.user.phone}` : ""} · customer since {when(row.user?.createdAt)}</p>
        </div>
        <span className={cn("px-2 py-0.5 rounded-full border text-[11px] capitalize", STATUS_STYLE[row.status])}>{row.status}</span>
      </div>
      <p className="text-xs text-slate-300">Requested {when(row.createdAt)}{row.reason ? ` — “${row.reason}”` : ""}</p>
      {row.status === "pending" && (
        <>
          <p className={cn("text-xs", left <= 5 ? "text-rose-300" : "text-slate-400")}>{left > 0 ? `${left} days left to complete` : "Overdue"}</p>
          {(row.openReports || row.activeProjects) ? (
            <p className="text-xs text-amber-200 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {row.activeProjects ? `${row.activeProjects} active project${row.activeProjects > 1 ? "s" : ""}` : ""}
              {row.activeProjects && row.openReports ? " and " : ""}
              {row.openReports ? `${row.openReports} open report${row.openReports > 1 ? "s" : ""}` : ""}. Settle these or tell the customer why their data must be kept for now.
            </p>
          ) : null}
          {rejecting ? (
            <div className="space-y-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={2} placeholder="Explain to the customer (e.g. an open payment dispute must be settled first)" className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs" />
              <div className="flex gap-2">
                <button type="button" disabled={act.isPending || note.trim().length < 10} onClick={() => act.mutate("reject")} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs disabled:opacity-40">Send and reject</button>
                <button type="button" onClick={() => setRejecting(false)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => confirm(`Delete ${row.user?.name}'s personal data now? This can't be undone.`) && act.mutate("approve")}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40"
              >
                Delete their data
              </button>
              <button type="button" onClick={() => setRejecting(true)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200">Can&apos;t delete yet…</button>
            </div>
          )}
        </>
      )}
      {row.status === "completed" && row.summary && (
        <p className="text-[11px] text-slate-500">
          Done {when(row.handledAt)} by {row.handledBy?.name}: left {row.summary.projectsLeft} project chat(s), removed {row.summary.leadsDeleted} request(s), {row.summary.notificationsDeleted} notification(s), {row.summary.devicesRemoved} device(s).
        </p>
      )}
      {row.status === "rejected" && <p className="text-[11px] text-slate-400">Told the customer: {row.note}</p>}
    </li>
  );
}
