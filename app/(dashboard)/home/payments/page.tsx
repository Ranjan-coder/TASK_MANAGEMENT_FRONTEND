"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, IndianRupee, CheckCircle2, Clock, AlertCircle, FileText, Receipt as ReceiptIcon, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { paymentsApi, inr, toPaise, upiLink, METHOD_LABEL, type CustomerMilestone, type CustomerSchedule, type PayMethod, type PayTo } from "@/lib/api/payments.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn } from "@/lib/utils";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const copy = (text: string, label: string) => navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`)).catch(() => {});

/** Customer: payment schedule per project, how to pay, "I've paid", receipts and invoices (R9). */
export default function PaymentsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["my-payments"], queryFn: paymentsApi.mine });
  const [paying, setPaying] = useState<{ project: CustomerSchedule; milestone: CustomerMilestone } | null>(null);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-6">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Payments</h1>
        <p className="text-sm text-slate-400">Your payment schedule, receipts and invoices.</p>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : isError ? (
        <p className="text-sm text-rose-300">Couldn&apos;t load your payments. Please try again.</p>
      ) : !data?.projects.length ? (
        <p className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-sm text-slate-300">
          No payment schedule yet. Your designer will share it with your quotation.
        </p>
      ) : (
        <>
          {data.projects.map((p) => (
            <ProjectPayments key={p.projectId} project={p} onPay={(m) => setPaying({ project: p, milestone: m })} />
          ))}
          <PayToCard payTo={data.payTo} />
        </>
      )}

      {paying && data && <PayDialog payTo={data.payTo} project={paying.project} milestone={paying.milestone} onClose={() => setPaying(null)} />}
    </div>
  );
}

function ProjectPayments({ project, onPay }: { project: CustomerSchedule; onPay: (m: CustomerMilestone) => void }) {
  const s = project.summary;
  const pct = s.contractValuePaise ? Math.min(100, Math.round((s.paidPaise / s.contractValuePaise) * 100)) : 0;
  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 space-y-4" aria-labelledby={`p-${project.projectId}`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h2 id={`p-${project.projectId}`} className="font-semibold text-white truncate">{project.projectName}</h2>
          <p className="text-xs text-slate-400">Contract value {inr(s.contractValuePaise)}{project.gstRatePct ? ` (incl. ${project.gstRatePct}% GST)` : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-emerald-300">{inr(s.paidPaise)} paid</p>
          <p className="text-xs text-slate-400">{inr(s.balancePaise)} remaining</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Paid so far">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      {project.notes && <p className="text-xs text-slate-400">{project.notes}</p>}

      <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl">
        {project.milestones.map((m) => (
          <li key={m._id} className="p-3 sm:p-4 flex flex-wrap items-center gap-3">
            <StatusIcon m={m} />
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm text-white">{m.title}</p>
              <p className={cn("text-xs", m.overdue ? "text-rose-300" : "text-slate-400")}>
                {m.status === "paid" && m.paid
                  ? `Paid ${fmt(m.paid.paidOn)} · ${METHOD_LABEL[m.paid.method]}`
                  : m.status === "verifying"
                    ? `Checking your payment (${m.claim?.reference || METHOD_LABEL[m.claim?.method || "upi"]})`
                    : m.status === "waived"
                      ? "Not needed"
                      : m.dueDate
                        ? `${m.overdue ? "Was due" : "Due"} ${fmt(m.dueDate)}`
                        : "Due later"}
              </p>
              {m.status === "upcoming" && m.lastClaimRejection && <p className="text-xs text-amber-300 mt-0.5">We couldn&apos;t confirm your last payment: {m.lastClaimRejection.note}</p>}
            </div>
            <p className={cn("text-sm font-semibold", m.status === "waived" ? "text-slate-500 line-through" : "text-white")}>{inr(m.amountPaise)}</p>
            <div className="flex gap-2 w-full sm:w-auto">
              {m.status === "upcoming" && (
                <button type="button" onClick={() => onPay(m)} className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold">
                  Pay / I&apos;ve paid
                </button>
              )}
              {m.status === "paid" && (
                <Link href={`/receipts/${project.projectId}/${m._id}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500">
                  <ReceiptIcon className="h-3.5 w-3.5" /> Receipt
                </Link>
              )}
              {m.hasInvoice && <InvoiceButton projectId={project.projectId} milestoneId={m._id} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusIcon({ m }: { m: CustomerMilestone }) {
  if (m.status === "paid") return <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" aria-label="Paid" />;
  if (m.status === "verifying") return <Clock className="h-5 w-5 text-amber-300 shrink-0" aria-label="Being checked" />;
  if (m.overdue) return <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" aria-label="Overdue" />;
  return <IndianRupee className="h-5 w-5 text-slate-500 shrink-0" aria-hidden />;
}

function InvoiceButton({ projectId, milestoneId }: { projectId: string; milestoneId: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const { url } = await paymentsApi.invoice(projectId, milestoneId);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't open the invoice"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={open} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-50">
      <FileText className="h-3.5 w-3.5" /> Invoice
    </button>
  );
}

function PayToCard({ payTo }: { payTo: PayTo }) {
  const hasBank = payTo.accountNumber && payTo.ifsc;
  if (!payTo.upiId && !hasBank) return null;
  const Row = ({ label, value }: { label: string; value: string }) =>
    value ? (
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-xs text-slate-400">{label}</span>
        <button type="button" onClick={() => copy(value, label)} className="inline-flex items-center gap-1.5 text-sm text-white font-mono hover:text-violet-200" aria-label={`Copy ${label}`}>
          {value} <Copy className="h-3.5 w-3.5 text-slate-500" />
        </button>
      </div>
    ) : null;
  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5" aria-labelledby="payto">
      <h2 id="payto" className="font-semibold text-white">How to pay</h2>
      <p className="text-xs text-slate-400 mb-2">Pay {payTo.companyName} by UPI or bank transfer, then tap &ldquo;I&apos;ve paid&rdquo; with the reference.</p>
      <div className="divide-y divide-slate-800">
        <Row label="UPI ID" value={payTo.upiId} />
        <Row label="Account name" value={payTo.accountName} />
        <Row label="Account number" value={payTo.accountNumber} />
        <Row label="IFSC" value={payTo.ifsc} />
        {payTo.bankName && <div className="py-1.5 text-xs text-slate-400">{payTo.bankName}</div>}
      </div>
      {payTo.instructions && <p className="mt-2 text-xs text-slate-300">{payTo.instructions}</p>}
      <p className="mt-3 text-[11px] text-slate-500">Bonito will never ask you to pay into a personal account or share an OTP. If in doubt, ask in your project chat.</p>
    </section>
  );
}

function PayDialog({ payTo, project, milestone, onClose }: { payTo: PayTo; project: CustomerSchedule; milestone: CustomerMilestone; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<PayMethod>("upi");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(String(milestone.amountPaise / 100));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [sending, setSending] = useState(false);
  const needsRef = ["upi", "bank_transfer", "cheque"].includes(method);
  const amountPaise = toPaise(amount);
  const isPhone = typeof navigator !== "undefined" && /android|iphone|ipad/i.test(navigator.userAgent);

  const submit = async () => {
    if (!amountPaise) return toast.error("Enter the amount you paid");
    setSending(true);
    try {
      const res = await paymentsApi.claim(project.projectId, milestone._id, { method, reference: reference.trim(), amountPaise, paidOn: new Date(`${paidOn}T12:00:00+05:30`).toISOString() });
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["my-payments"] });
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="pay-title" className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-700">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h2 id="pay-title" className="text-base font-semibold text-white">{milestone.title} · {inr(milestone.amountPaise)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {payTo.upiId && isPhone && (
            <a href={upiLink(payTo, milestone.amountPaise, `${project.projectName} ${milestone.title}`)} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
              <Smartphone className="h-4 w-4" /> Pay {inr(milestone.amountPaise)} with a UPI app
            </a>
          )}
          <p className="text-xs text-slate-400">After paying, tell us the details so we can match it with our bank statement.</p>
          <label className="block text-xs text-slate-300">
            How did you pay?
            <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm">
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </label>
          {needsRef && (
            <label className="block text-xs text-slate-300">
              {method === "cheque" ? "Cheque number" : "UTR / transaction reference"}
              <input value={reference} onChange={(e) => setReference(e.target.value.slice(0, 60))} inputMode={method === "cheque" ? "numeric" : "text"} placeholder={method === "upi" ? "12-digit UPI reference" : ""} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm font-mono" />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-300">
              Amount paid (₹)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
            </label>
            <label className="block text-xs text-slate-300">
              Paid on
              <input type="date" value={paidOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidOn(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
            </label>
          </div>
          <button type="button" onClick={submit} disabled={sending || !amountPaise || (needsRef && reference.trim().length < 4)} className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-40">
            {sending ? "Sending…" : "I've paid"}
          </button>
          <p className="text-[11px] text-slate-500">You&apos;ll get a receipt once our accounts team confirms it, usually within one working day.</p>
        </div>
      </div>
    </div>
  );
}
