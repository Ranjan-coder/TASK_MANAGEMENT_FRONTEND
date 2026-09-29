"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IndianRupee, X, Plus, Trash2, CheckCircle2, Clock, FileUp, Receipt as ReceiptIcon, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { paymentsApi, inr, toPaise, METHOD_LABEL, type AdminMilestone, type PayMethod } from "@/lib/api/payments.api";
import { slaApi } from "@/lib/api/sla.api";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn } from "@/lib/utils";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const input = "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";

/** Admin: payment schedules, confirming payments, receipts and invoices (R9). */
export default function PaymentsAdminPage() {
  const [filter, setFilter] = useState<"all" | "verifying" | "overdue">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "verifying" || f === "overdue") setFilter(f);
  }, []);
  const { data, isLoading } = useQuery({ queryKey: ["admin-payments", filter], queryFn: () => paymentsApi.adminList(filter === "all" ? undefined : filter) });

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
          <IndianRupee className="h-5 w-5 text-emerald-300" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl font-bold text-white">Payments</h1>
          <p className="text-sm text-slate-400">Customers pay by UPI or bank transfer and tell us the reference. Check it against the bank statement, then confirm to issue the receipt.</p>
        </div>
        <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:border-slate-500">
          <Settings2 className="h-4 w-4" /> Payment details
        </button>
      </div>

      <div className="flex gap-2">
        {(["all", "verifying", "overdue"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn("px-3 py-1.5 rounded-lg border text-xs", filter === f ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {f === "all" ? "All" : f === "verifying" ? "To confirm" : "Overdue"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          {!data?.rows.length ? (
            <p className="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-6 text-center">No payment schedules{filter !== "all" ? " here" : " yet"}.</p>
          ) : (
            <ul className="space-y-2">
              {data.rows.map((r) => {
                const pct = r.summary.contractValuePaise ? Math.round((r.summary.paidPaise / r.summary.contractValuePaise) * 100) : 0;
                return (
                  <li key={r.projectId}>
                    <button onClick={() => setOpenId(r.projectId)} className="w-full text-left bg-slate-900/80 border border-slate-800 hover:border-slate-600 rounded-xl p-4 flex flex-wrap items-center gap-3">
                      <span className="flex-1 min-w-[200px]">
                        <span className="block text-sm text-white">{r.projectName}</span>
                        <span className="block text-[11px] text-slate-400">{r.customers.map((c) => c.name).join(", ")} · lead {r.leadDesigner || "—"}</span>
                      </span>
                      <span className="text-xs text-slate-300 w-40">
                        {inr(r.summary.paidPaise)} / {inr(r.summary.contractValuePaise)}
                        <span className="block h-1.5 mt-1 rounded-full bg-slate-800 overflow-hidden"><span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                      </span>
                      {r.summary.verifying > 0 && <span className="px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-200 text-[11px]">{r.summary.verifying} to confirm</span>}
                      {r.summary.overdue > 0 && <span className="px-2 py-0.5 rounded-full border border-rose-500/40 text-rose-200 text-[11px]">{r.summary.overdue} overdue</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {filter === "all" && data?.withoutSchedule.length ? (
            <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <h2 className="text-xs font-semibold text-slate-300 mb-2">Projects without a payment schedule</h2>
              <ul className="flex flex-wrap gap-2">
                {data.withoutSchedule.map((p) => (
                  <li key={p.projectId}>
                    <button onClick={() => setOpenId(p.projectId)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500">
                      <Plus className="h-3.5 w-3.5" /> {p.projectName}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {openId && <ScheduleDrawer projectId={openId} onClose={() => setOpenId(null)} />}
      {showSettings && <PaymentSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

interface Line {
  _id?: string;
  title: string;
  amount: string;
  dueDate: string;
  locked: boolean;
}

function ScheduleDrawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-payment", projectId], queryFn: () => paymentsApi.adminGet(projectId) });
  const [contract, setContract] = useState("");
  const [gst, setGst] = useState("18");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    const f = data.finance;
    if (f) {
      setContract(String(f.contractValuePaise / 100));
      setGst(String(f.gstRatePct));
      setNotes(f.notes);
      setLines(f.milestones.map((m) => ({ _id: m._id, title: m.title, amount: String(m.amountPaise / 100), dueDate: m.dueDate ? m.dueDate.slice(0, 10) : "", locked: m.status !== "upcoming" })));
    }
  }, [data]);

  const refresh = (next: typeof data) => {
    qc.setQueryData(["admin-payment", projectId], next);
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
  };

  const contractPaise = toPaise(contract);
  const total = lines.reduce((a, l) => a + (toPaise(l.amount) || 0), 0);
  const preset = (splits: [string, number][]) => {
    if (!contractPaise) return toast.error("Enter the contract value first");
    setLines(splits.map(([title, pct]) => ({ title: `${title} (${pct}%)`, amount: String(Math.round((contractPaise * pct) / 100) / 100), dueDate: "", locked: false })));
  };

  const save = useMutation({
    mutationFn: () =>
      paymentsApi.save(projectId, {
        contractValuePaise: contractPaise ?? 0,
        gstRatePct: Number(gst) || 0,
        notes,
        milestones: lines.map((l) => ({ _id: l._id, title: l.title.trim(), amountPaise: toPaise(l.amount) ?? 0, dueDate: l.dueDate ? new Date(`${l.dueDate}T12:00:00+05:30`).toISOString() : null }))
      }),
    onSuccess: (res) => {
      toast.success(res.message);
      loaded.current = false;
      refresh(res.data);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save"))
  });

  const milestones = data?.finance?.milestones ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="pay-drawer" onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl h-full overflow-y-auto bg-slate-900 border-l border-slate-700">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="pay-drawer" className="text-lg font-semibold text-white">{data?.projectName || "Payments"}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="p-5 space-y-6">
            {milestones.some((m) => m.status === "verifying" || m.status === "paid") && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Payments</h3>
                {milestones.filter((m) => m.status !== "upcoming" || m.lastClaimRejection).map((m) => (
                  <MilestoneActions key={m._id} projectId={projectId} m={m} onDone={refresh} />
                ))}
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-300">Schedule</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-300">
                  Contract value (₹, incl. GST)
                  <input value={contract} onChange={(e) => setContract(e.target.value)} inputMode="decimal" className={cn(input, "mt-1")} placeholder="500000" />
                </label>
                <label className="text-xs text-slate-300">
                  GST %
                  <select value={gst} onChange={(e) => setGst(e.target.value)} className={cn(input, "mt-1")}>
                    {["0", "5", "12", "18", "28"].map((g) => <option key={g} value={g}>{g}%</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="text-slate-500 self-center">Quick split:</span>
                <button type="button" onClick={() => preset([["Booking", 10], ["Design sign-off", 40], ["Handover", 50]])} className="px-2 py-1 rounded border border-slate-700 text-slate-300">10 / 40 / 50</button>
                <button type="button" onClick={() => preset([["Booking", 10], ["Design sign-off", 40], ["Production start", 40], ["Handover", 10]])} className="px-2 py-1 rounded border border-slate-700 text-slate-300">10 / 40 / 40 / 10</button>
              </div>
              <ul className="space-y-2">
                {lines.map((l, i) => (
                  <li key={l._id || i} className="grid grid-cols-[1fr_110px_140px_32px] gap-2 items-center">
                    <input value={l.title} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, title: e.target.value.slice(0, 80) } : x)))} className={input} placeholder="Milestone" aria-label="Milestone name" />
                    <input value={l.amount} disabled={l.locked} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" className={cn(input, "disabled:opacity-60")} aria-label="Amount in rupees" title={l.locked ? "This line has a payment, so its amount is locked" : undefined} />
                    <input type="date" value={l.dueDate} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} className={input} aria-label="Due date" />
                    <button type="button" disabled={l.locked} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line" className="text-slate-500 hover:text-rose-400 disabled:opacity-30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setLines([...lines, { title: "", amount: "", dueDate: "", locked: false }])} className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add milestone
              </button>
              <p className={cn("text-xs", contractPaise != null && total > contractPaise ? "text-rose-300" : "text-slate-400")}>
                Milestones total {inr(total)}{contractPaise != null ? ` of ${inr(contractPaise)}` : ""}
                {contractPaise != null && total !== contractPaise && total <= contractPaise ? ` · ${inr(contractPaise - total)} not scheduled yet` : ""}
              </p>
              <label className="block text-xs text-slate-300">
                Note for the customer <span className="text-slate-500">(optional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} className={cn(input, "mt-1")} placeholder="Amounts include GST. Production starts after the design payment." />
              </label>
              <button type="button" disabled={save.isPending || contractPaise == null} onClick={() => save.mutate()} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40">
                {save.isPending ? "Saving…" : "Save schedule"}
              </button>
              <p className="text-[11px] text-slate-500">Lines with a payment can&apos;t be removed or change amount. Customers get reminders 3 days before a due date and when it&apos;s overdue.</p>
            </section>

            {milestones.filter((m) => m.status === "upcoming").length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-300">Record a payment received directly</h3>
                {milestones.filter((m) => m.status === "upcoming").map((m) => (
                  <MilestoneActions key={m._id} projectId={projectId} m={m} onDone={refresh} />
                ))}
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function MilestoneActions({ projectId, m, onDone }: { projectId: string; m: AdminMilestone; onDone: (d: Awaited<ReturnType<typeof paymentsApi.adminGet>>) => void }) {
  const [mode, setMode] = useState<"idle" | "confirm" | "reject">("idle");
  const [method, setMethod] = useState<PayMethod>(m.claim?.method ?? "bank_transfer");
  const [reference, setReference] = useState(m.claim?.reference ?? "");
  const [amount, setAmount] = useState(String((m.claim?.amountPaise ?? m.amountPaise) / 100));
  const [paidOn, setPaidOn] = useState((m.claim?.paidOn ?? new Date().toISOString()).slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<{ message: string; data: Awaited<ReturnType<typeof paymentsApi.adminGet>> }>) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(res.message);
      onDone(res.data);
      setMode("idle");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update"));
    } finally {
      setBusy(false);
    }
  };

  const amountPaise = toPaise(amount);
  const mismatch = m.claim && amountPaise !== m.amountPaise;

  return (
    <div className={cn("rounded-xl border p-3 text-xs space-y-2", m.status === "verifying" ? "border-amber-500/40 bg-amber-500/5" : m.status === "paid" ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800")}>
      <div className="flex flex-wrap items-center gap-2">
        {m.status === "paid" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : m.status === "verifying" ? <Clock className="h-4 w-4 text-amber-300" /> : <IndianRupee className="h-4 w-4 text-slate-500" />}
        <span className="text-sm text-white flex-1">{m.title} · {inr(m.amountPaise)}</span>
        {m.status === "paid" && (
          <Link href={`/receipts/${projectId}/${m._id}`} className="inline-flex items-center gap-1 text-slate-300 hover:underline"><ReceiptIcon className="h-3.5 w-3.5" /> {m.paid?.receiptNo}</Link>
        )}
      </div>
      {m.status === "verifying" && m.claim && (
        <p className="text-amber-100">
          Customer says: {inr(m.claim.amountPaise)} by {METHOD_LABEL[m.claim.method]}{m.claim.reference ? ` · ref ${m.claim.reference}` : ""} on {fmt(m.claim.paidOn)}
        </p>
      )}
      {m.status === "paid" && m.paid && (
        <p className="text-slate-300">{inr(m.paid.amountPaise)} · {METHOD_LABEL[m.paid.method]}{m.paid.reference ? ` · ${m.paid.reference}` : ""} · paid {fmt(m.paid.paidOn)} · confirmed by {m.paid.confirmedBy?.name}</p>
      )}
      {m.lastClaimRejection && m.status === "upcoming" && <p className="text-slate-500">Last claim rejected: {m.lastClaimRejection.note}</p>}

      {mode === "confirm" && (
        <div className="grid grid-cols-2 gap-2">
          <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className={input} aria-label="Method">
            {(Object.keys(METHOD_LABEL) as PayMethod[]).map((k) => <option key={k} value={k}>{METHOD_LABEL[k]}</option>)}
          </select>
          <input value={reference} onChange={(e) => setReference(e.target.value.slice(0, 60))} placeholder="UTR / reference" className={input} aria-label="Reference" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={input} aria-label="Amount received (₹)" />
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={input} aria-label="Paid on" />
          {mismatch && <p className="col-span-2 text-amber-300">The amount differs from the milestone ({inr(m.amountPaise)}). The receipt shows what was actually received.</p>}
          <div className="col-span-2 flex gap-2">
            <button type="button" disabled={busy || !amountPaise} onClick={() => run(() => paymentsApi.confirm(projectId, m._id, { method, reference: reference.trim(), amountPaise: amountPaise!, paidOn: new Date(`${paidOn}T12:00:00+05:30`).toISOString() }))} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-40">
              Confirm — found in bank statement
            </button>
            <button type="button" onClick={() => setMode("idle")} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200">Cancel</button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <div className="space-y-2">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="e.g. We couldn't find this UTR — please check and resend" className={input} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || note.trim().length < 10} onClick={() => run(() => paymentsApi.reject(projectId, m._id, note.trim()))} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white disabled:opacity-40">Tell the customer</button>
            <button type="button" onClick={() => setMode("idle")} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200">Cancel</button>
          </div>
        </div>
      )}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          {(m.status === "verifying" || m.status === "upcoming") && (
            <button type="button" onClick={() => setMode("confirm")} className="px-3 py-1.5 rounded-lg bg-emerald-600/80 text-white">{m.status === "verifying" ? "Confirm" : "Record payment"}</button>
          )}
          {m.status === "verifying" && <button type="button" onClick={() => setMode("reject")} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200">Can&apos;t find it</button>}
          {(m.status === "verifying" || m.status === "upcoming") && (
            <button type="button" disabled={busy} onClick={() => confirm(`Waive "${m.title}"? The customer won't need to pay it.`) && run(() => paymentsApi.waive(projectId, m._id))} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400">Waive</button>
          )}
          {m.status === "paid" && (
            <>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(() => paymentsApi.uploadInvoice(projectId, m._id, f)); }} />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200">
                <FileUp className="h-3.5 w-3.5" /> {m.invoice ? `Replace invoice (${m.invoice.fileName})` : "Upload GST invoice (PDF)"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentSettings({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["reply-time-settings"], queryFn: async () => (await slaApi.getSettings()).data.data });
  const empty = { companyName: "", companyAddress: "", gstin: "", upiId: "", bankName: "", accountName: "", accountNumber: "", ifsc: "", instructions: "" };
  const [form, setForm] = useState(empty);
  useEffect(() => {
    const p = (data as unknown as { payments?: typeof empty })?.payments;
    if (p) setForm({ ...empty, ...p });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () => apiClient.put("/admin/settings", { payments: form }),
    onSuccess: () => {
      toast.success("Payment details saved");
      qc.invalidateQueries({ queryKey: ["reply-time-settings"] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save"))
  });
  const F = ({ k, label, placeholder, mono }: { k: keyof typeof empty; label: string; placeholder?: string; mono?: boolean }) => (
    <label className="block text-xs text-slate-300">
      {label}
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={placeholder} className={cn(input, "mt-1", mono && "font-mono")} />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="pay-settings">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="w-full max-w-lg max-h-full sm:max-h-[92vh] overflow-y-auto bg-slate-900 sm:rounded-2xl border border-slate-700">
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900">
          <h2 id="pay-settings" className="text-lg font-semibold text-white">Payment details</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-400">Shown to customers on their Payments page and receipts. Changes are recorded in the audit log — double-check account numbers.</p>
          {F({ k: "companyName", label: "Company name", placeholder: "Bonito Interiors Pvt Ltd" })}
          {F({ k: "companyAddress", label: "Address (for receipts)" })}
          {F({ k: "gstin", label: "GSTIN", placeholder: "29ABCDE1234F1Z5", mono: true })}
          {F({ k: "upiId", label: "UPI ID", placeholder: "bonito@okhdfc", mono: true })}
          <div className="grid grid-cols-2 gap-3">
            {F({ k: "bankName", label: "Bank" })}
            {F({ k: "accountName", label: "Account name" })}
            {F({ k: "accountNumber", label: "Account number", mono: true })}
            {F({ k: "ifsc", label: "IFSC", placeholder: "HDFC0001234", mono: true })}
          </div>
          {F({ k: "instructions", label: "Instructions (optional)", placeholder: "Add your project name in the payment note." })}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200">Cancel</button>
          <button type="submit" disabled={save.isPending} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium disabled:opacity-40">{save.isPending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
