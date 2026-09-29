"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { paymentsApi, inr } from "@/lib/api/payments.api";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/**
 * Printable payment receipt (customer on the project, or an admin). This is an
 * acknowledgement of payment; the official GST tax invoice is the PDF that
 * accounts upload separately.
 */
export default function ReceiptPage() {
  const { projectId, milestoneId } = useParams<{ projectId: string; milestoneId: string }>();
  const router = useRouter();
  const { data: r, isLoading, isError } = useQuery({ queryKey: ["receipt", projectId, milestoneId], queryFn: () => paymentsApi.receipt(projectId, milestoneId) });

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (isError || !r) return <p className="text-sm text-rose-300">This receipt isn&apos;t available.</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-6">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold">
          <Printer className="h-3.5 w-3.5" /> Print / save as PDF
        </button>
      </div>

      <article className="bg-white text-slate-900 rounded-2xl p-6 sm:p-10 shadow-xl print:shadow-none print:rounded-none print:p-0" aria-label="Payment receipt">
        <header className="flex flex-wrap justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xl font-bold">{r.company.name}</p>
            {r.company.address && <p className="text-xs text-slate-600 whitespace-pre-line max-w-xs">{r.company.address}</p>}
            {r.company.gstin && <p className="text-xs text-slate-600">GSTIN {r.company.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Payment receipt</p>
            <p className="text-sm font-mono">{r.receiptNo}</p>
            <p className="text-xs text-slate-600">Issued {fmt(r.issuedAt)}</p>
          </div>
        </header>

        <dl className="grid grid-cols-[140px_1fr] gap-y-2 py-5 text-sm">
          <dt className="text-slate-500">Received from</dt>
          <dd>{r.customerNames.join(", ")}</dd>
          <dt className="text-slate-500">Project</dt>
          <dd>{r.projectName}</dd>
          <dt className="text-slate-500">For</dt>
          <dd>{r.milestone}</dd>
          <dt className="text-slate-500">Paid on</dt>
          <dd>{fmt(r.paidOn)}</dd>
          <dt className="text-slate-500">Payment method</dt>
          <dd>{r.method}{r.reference ? ` · ref ${r.reference}` : ""}</dd>
        </dl>

        <table className="w-full text-sm border-t border-slate-200">
          <tbody>
            {r.gstRatePct > 0 && (
              <>
                <tr>
                  <td className="py-2 text-slate-600">Value before GST</td>
                  <td className="py-2 text-right">{inr(r.taxablePaise)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">GST @ {r.gstRatePct}%</td>
                  <td className="py-2 text-right">{inr(r.gstPaise)}</td>
                </tr>
              </>
            )}
            <tr className="border-t border-slate-300 font-bold text-base">
              <td className="py-3">Amount received</td>
              <td className="py-3 text-right">{inr(r.amountPaise)}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-6 text-[11px] text-slate-500">
          This receipt confirms the payment above. {r.hasInvoice ? "The GST tax invoice is available in the app under Payments." : "Your GST tax invoice will be shared separately."} Computer-generated; no signature required.
        </p>
      </article>
    </div>
  );
}
