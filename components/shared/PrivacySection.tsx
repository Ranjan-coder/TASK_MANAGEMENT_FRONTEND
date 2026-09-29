"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { downloadMyData, type ExportProgress } from "@/lib/privacy/exportData";

/** Settings → Privacy & data (DPDP Act): download your data, ask for deletion. */
export function PrivacySection() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const isCustomer = user?.role === "customer";
  const status = useQuery({
    queryKey: ["deletion-status"],
    queryFn: async () => (await apiClient.get("/privacy/deletion")).data.data as { status: string; note?: string; createdAt: string } | null,
    enabled: isCustomer
  });

  const download = async () => {
    if (!user) return;
    try {
      await downloadMyData(user._id, setProgress);
      toast.success("Your data has been downloaded");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't prepare your data"));
    } finally {
      setProgress(null);
    }
  };

  const requestDeletion = async () => {
    setSending(true);
    try {
      const res = await apiClient.post("/privacy/deletion", { reason: reason.trim() });
      toast.success(res.data.message);
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["deletion-status"] });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send the request"));
    } finally {
      setSending(false);
    }
  };

  const cancel = async () => {
    try {
      await apiClient.delete("/privacy/deletion");
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["deletion-status"] });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't cancel"));
    }
  };

  const pending = status.data?.status === "pending";

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white flex items-center gap-2"><FileDown className="h-4 w-4 text-violet-300" /> Download your data</h2>
        <p className="text-xs text-slate-400">
          A file with your account details, projects, requests, ratings, reports and notifications. Your chats are end-to-end encrypted, so they&apos;re decrypted here on this device and added to the file — they never leave it unencrypted.
        </p>
        <button type="button" onClick={download} disabled={Boolean(progress)} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-50">
          {progress ? progress.step + "…" : "Download my data"}
        </button>
      </section>

      {isCustomer && (
        <section className="space-y-2 pt-4 border-t border-slate-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><Trash2 className="h-4 w-4 text-rose-300" /> Delete your account</h2>
          {pending ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-2">
              <p>Your deletion request from {new Date(status.data!.createdAt).toLocaleDateString("en-IN")} is being processed. We&apos;ll finish within 30 days.</p>
              <button type="button" onClick={cancel} className="underline">Cancel the request</button>
            </div>
          ) : (
            <>
              {status.data?.status === "rejected" && status.data.note && (
                <p className="text-xs text-amber-200">Your last request couldn&apos;t be completed yet: {status.data.note}</p>
              )}
              <p className="text-xs text-slate-400">
                We remove your name, email, mobile number, photo, consultation requests and notifications, and take you out of your project chats. Messages you sent stay in the project record under &ldquo;Deleted customer&rdquo;, still encrypted. Download your data first if you want a copy.
              </p>
              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)} className="px-4 py-2 rounded-xl border border-rose-500/40 text-rose-200 text-xs font-semibold hover:bg-rose-500/10">
                  Request account deletion
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 1000))} rows={2} placeholder="Reason (optional)" className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs" />
                  <div className="flex gap-2">
                    <button type="button" onClick={requestDeletion} disabled={sending} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold disabled:opacity-50">
                      {sending ? "Sending…" : "Yes, delete my account"}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs">Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <p className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-2">
        <ShieldCheck className="h-3.5 w-3.5" /> Read how we handle your data in the <Link href="/privacy" target="_blank" className="text-violet-300 underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
