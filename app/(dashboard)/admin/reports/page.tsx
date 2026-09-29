"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, X, ShieldCheck, MessageSquareQuote, Star, History } from "lucide-react";
import { toast } from "sonner";
import {
  reportsApi,
  STATUS_LABEL,
  ACTION_LABEL,
  type ReportStatus,
  type ReportDirection,
  type ReportAction
} from "@/lib/api/reports.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const TABS: (ReportStatus | "all")[] = ["submitted", "under_review", "action_taken", "dismissed", "all"];
const STATUS_STYLE: Record<ReportStatus, string> = {
  submitted: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  under_review: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  action_taken: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  dismissed: "bg-slate-500/15 text-slate-300 border-slate-500/30"
};
const DIRECTION_LABEL: Record<ReportDirection, string> = {
  customer_to_staff: "Customer → staff",
  staff_to_customer: "Staff → customer"
};
const when = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const ageHours = (d: string) => (Date.now() - new Date(d).getTime()) / 3_600_000;

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportStatus | "all">("submitted");
  const [direction, setDirection] = useState<ReportDirection | "">("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", tab, direction],
    queryFn: async () =>
      (await reportsApi.adminList({ status: tab === "all" ? undefined : tab, direction: direction || undefined })).data.data
  });

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center">
          <Flag className="h-5 w-5 text-rose-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-slate-400">Reports from customers about staff, and flags from staff about customers. Aim to review within 48 hours.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn("px-3 py-1.5 rounded-lg border text-xs", tab === t ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300 hover:border-slate-500")}
          >
            {t === "all" ? "All" : STATUS_LABEL[t]}
            {t !== "all" && data?.counts?.[t] ? <span className="ml-1.5 text-slate-400">{data.counts[t]}</span> : null}
          </button>
        ))}
        <select value={direction} onChange={(e) => setDirection(e.target.value as ReportDirection | "")} aria-label="Direction" className="ml-auto px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200">
          <option value="">Both directions</option>
          <option value="customer_to_staff">Customer → staff</option>
          <option value="staff_to_customer">Staff → customer</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.items.length ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-8 text-center">No reports here.</p>
      ) : (
        <ul className="space-y-2">
          {data.items.map((r) => {
            const overdue = r.status === "submitted" && ageHours(r.createdAt) > 48;
            return (
              <li key={r._id}>
                <button onClick={() => setOpenId(r._id)} className="w-full text-left bg-slate-900/80 border border-slate-800 hover:border-slate-600 rounded-xl p-4 flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-white w-16">#{r.ticketNo}</span>
                  <span className="flex-1 min-w-[200px]">
                    <span className="block text-sm text-slate-100">
                      {r.reportedUser?.name} <span className="text-slate-400">— {r.reasonLabel}</span>
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {DIRECTION_LABEL[r.direction]} · by {r.reporter?.name} · {r.conversation?.name} · {when(r.createdAt)}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {r.evidenceCount} messages · {r.attachmentCount} screenshots
                  </span>
                  {overdue && <span className="text-[11px] text-rose-300">Over 48 h</span>}
                  <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openId && <ReportDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ReportDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data: r, isLoading } = useQuery({ queryKey: ["admin-report", id], queryFn: async () => (await reportsApi.adminGet(id)).data.data });
  const [note, setNote] = useState("");
  const [action, setAction] = useState<ReportAction | "">("");

  const review = useMutation({
    mutationFn: async (body: Parameters<typeof reportsApi.adminReview>[1]) => (await reportsApi.adminReview(id, body)).data.data,
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin-report", id], updated);
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      setNote("");
      setAction("");
      toast.success("Report updated");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update the report"))
  });

  const involved = r && me && [r.reporter?._id, r.reportedUser?._id].includes(me._id);
  const closed = r && (r.status === "action_taken" || r.status === "dismissed");
  const withNote = (body: Parameters<typeof reportsApi.adminReview>[1]) => review.mutate(note.trim() ? { ...body, note: note.trim() } : body);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="report-drawer-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl h-full overflow-y-auto bg-slate-900 border-l border-slate-700 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="report-drawer-title" className="text-lg font-semibold text-white">
            Report {r ? `#${r.ticketNo}` : ""}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading || !r ? (
          <p className="p-5 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="p-5 space-y-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status]}</span>
              <span className="text-xs text-slate-400">{DIRECTION_LABEL[r.direction]} · {r.reasonLabel} · {when(r.createdAt)}</span>
            </div>

            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-slate-500">Reported by</dt>
              <dd className="text-slate-200">{r.reporter?.name} · {r.reporter?.email}{r.reporter?.phone ? ` · ${r.reporter.phone}` : ""}</dd>
              <dt className="text-slate-500">About</dt>
              <dd className="text-slate-200">{r.reportedUser?.name} · {r.reportedUser?.email} · {r.reportedUser?.role}{r.reportedUser?.status !== "active" ? ` (${r.reportedUser?.status})` : ""}</dd>
              <dt className="text-slate-500">Project</dt>
              <dd className="text-slate-200">{r.conversation?.name}</dd>
              {r.reviewer && (<><dt className="text-slate-500">Reviewer</dt><dd className="text-slate-200">{r.reviewer.name}</dd></>)}
            </dl>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">What happened</h3>
              <p className="text-slate-200 whitespace-pre-wrap bg-slate-950/50 border border-slate-800 rounded-lg p-3">{r.description}</p>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5"><MessageSquareQuote className="h-3.5 w-3.5" /> Chat messages ({r.evidenceMessages.length})</h3>
              {r.evidenceMessages.length === 0 ? (
                <p className="text-xs text-slate-500">None selected. Admins can only see messages a participant chose to share.</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.evidenceMessages.map((m) => (
                    <li key={m.message} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                      <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
                        <span className="text-slate-200">{m.sender?.name}</span> · {when(m.sentAt)}
                        {m.edited && <span>(edited)</span>}
                        {m.verified && (
                          <span className="inline-flex items-center gap-1 text-emerald-300" title="Checked with message franking: sent by this person and unaltered">
                            <ShieldCheck className="h-3 w-3" /> Verified message
                          </span>
                        )}
                      </p>
                      <p className="text-slate-100 whitespace-pre-wrap break-words mt-1">{m.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {r.attachments.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-slate-300 mb-1">Screenshots ({r.attachments.length}) <span className="font-normal text-amber-300/80">· unverified uploads</span></h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {r.attachments.map((a, i) => (
                    <a key={a.publicId} href={a.url} target="_blank" rel="noopener noreferrer" className="block aspect-video rounded-lg overflow-hidden border border-slate-700 bg-slate-950 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    </a>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Links expire after 10 minutes — reopen the report to refresh them.</p>
              </section>
            )}

            <section className="bg-slate-950/40 border border-slate-800 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> About {r.reportedUser?.name}</h3>
              <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                <span>Reports: {Object.values(r.history.reportCounts).reduce((a, b) => a + (b || 0), 0)} total{r.history.reportCounts.action_taken ? `, ${r.history.reportCounts.action_taken} with action` : ""}</span>
                {r.history.rating && (
                  <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {r.history.rating.average} ({r.history.rating.count})</span>
                )}
                {r.history.responseTimes90d && (
                  <span>
                    90 days: {r.history.responseTimes90d.periods} waits, avg {r.history.responseTimes90d.avgReplyMinutes ?? "—"} min, {r.history.responseTimes90d.escalations} escalations
                  </span>
                )}
              </div>
              {r.history.pastReports.length > 0 && (
                <ul className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                  {r.history.pastReports.map((p) => (
                    <li key={p._id}>#{p.ticketNo} · {p.reasonLabel} · {STATUS_LABEL[p.status]} · {when(p.createdAt)}</li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">Response from {r.reportedUser?.name}</h3>
              {r.response?.text ? (
                <p className="text-slate-200 whitespace-pre-wrap bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                  {r.response.text}
                  <span className="block text-[11px] text-slate-500 mt-1">{when(r.response.at)}</span>
                </p>
              ) : r.responseRequestedAt ? (
                <p className="text-xs text-slate-400">Asked {when(r.responseRequestedAt)} — no response yet.</p>
              ) : (
                <p className="text-xs text-slate-500">Not asked yet. They only see the report once you ask (reason and shared messages, not the description or screenshots).</p>
              )}
            </section>

            {r.notes.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-slate-300 mb-1">Internal notes</h3>
                <ul className="space-y-1">
                  {r.notes.map((n, i) => (
                    <li key={i} className="text-xs text-slate-300"><span className="text-slate-500">{n.by?.name} · {when(n.at)}:</span> {n.text}</li>
                  ))}
                </ul>
              </section>
            )}

            {r.resolution?.at && (
              <p className="text-xs text-slate-300">
                Closed by {r.resolution.by?.name} {when(r.resolution.at)}
                {r.resolution.action ? ` — ${ACTION_LABEL[r.resolution.action]}` : ""}
              </p>
            )}

            {involved ? (
              <p className="text-xs text-amber-300 border border-amber-500/30 rounded-lg p-3">This report involves you, so another admin must review it.</p>
            ) : (
              <section className="border-t border-slate-800 pt-4 space-y-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                  rows={2}
                  placeholder="Internal note (never shown to the customer or the reported person)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <div className="flex flex-wrap gap-2">
                  {note.trim() && <Btn onClick={() => review.mutate({ note: note.trim() })} disabled={review.isPending}>Add note</Btn>}
                  {r.status === "submitted" && <Btn onClick={() => withNote({ status: "under_review" })} disabled={review.isPending}>Start review</Btn>}
                  {!closed && !r.responseRequestedAt && (
                    <Btn onClick={() => withNote({ requestResponse: true })} disabled={review.isPending}>Ask {r.reportedUser?.name.split(" ")[0]} to respond</Btn>
                  )}
                  {closed && <Btn onClick={() => withNote({ status: "under_review" })} disabled={review.isPending}>Reopen</Btn>}
                </div>
                {!closed && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={action} onChange={(e) => setAction(e.target.value as ReportAction | "")} aria-label="Action taken" className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-xs text-white">
                      <option value="">Choose action…</option>
                      {(Object.keys(ACTION_LABEL) as ReportAction[]).map((a) => (
                        <option key={a} value={a}>{ACTION_LABEL[a]}</option>
                      ))}
                    </select>
                    <Btn tone="primary" onClick={() => action && withNote({ status: "action_taken", action })} disabled={!action || review.isPending}>Close: action taken</Btn>
                    <Btn onClick={() => withNote({ status: "dismissed" })} disabled={review.isPending}>Dismiss</Btn>
                  </div>
                )}
                {action === "warning" && <p className="text-[11px] text-slate-400">{r.reportedUser?.name} will get a “formal warning” notification.</p>}
                {action === "reassign" && <p className="text-[11px] text-slate-400">Change the team in Admin → Projects.</p>}
                {action === "suspension" && <p className="text-[11px] text-slate-400">This records the decision. Suspend the account itself in Users.</p>}
                <p className="text-[11px] text-slate-500">The person who reported is told only “action has been taken” or “no further action”.</p>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Btn({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "primary" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-2 rounded-lg text-xs disabled:opacity-40",
        tone === "primary" ? "bg-violet-600 text-white hover:bg-violet-500" : "border border-slate-700 text-slate-200 hover:border-slate-500"
      )}
    >
      {children}
    </button>
  );
}
