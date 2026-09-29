"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Save, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { paymentsApi, type AdminReferral } from "@/lib/api/payments.api";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { cn } from "@/lib/utils";

const STATUS: Record<AdminReferral["status"], { label: string; style: string }> = {
  signed_up: { label: "Signed up", style: "border-sky-500/40 text-sky-200" },
  qualified: { label: "Qualified — reward due", style: "border-amber-500/40 text-amber-200" },
  rewarded: { label: "Rewarded", style: "border-emerald-500/40 text-emerald-200" },
  rejected: { label: "Rejected", style: "border-slate-600 text-slate-400" }
};
const when = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const input = "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm";

/** Admin: referral programme and rewards (R9). */
export default function ReferralsAdminPage() {
  const [status, setStatus] = useState<AdminReferral["status"] | "">("qualified");
  const { data, isLoading } = useQuery({ queryKey: ["admin-referrals", status], queryFn: () => paymentsApi.adminReferrals(status || undefined) });

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center">
          <Gift className="h-5 w-5 text-amber-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Referrals</h1>
          <p className="text-sm text-slate-400">A referral qualifies when the friend has verified their phone and their first payment is confirmed. Then give the reward and mark it here.</p>
        </div>
      </div>

      {data?.programme && <Programme initial={data.programme} />}

      <div className="flex gap-2 flex-wrap">
        {(["qualified", "signed_up", "rewarded", "rejected", ""] as const).map((s) => (
          <button key={s || "all"} onClick={() => setStatus(s)} aria-pressed={status === s} className={cn("px-3 py-1.5 rounded-lg border text-xs", status === s ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}>
            {s ? STATUS[s].label.split(" —")[0] : "All"} {s && data?.counts?.[s] ? <span className="text-slate-400">{data.counts[s]}</span> : null}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.rows.length ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl p-8 text-center">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {data.rows.map((r) => (
            <ReferralItem key={r._id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReferralItem({ r }: { r: AdminReferral }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const act = useMutation({
    mutationFn: (action: "reward" | "reject") => paymentsApi.actOnReferral(r._id, action, note.trim()),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update"))
  });
  const open = r.status === "signed_up" || r.status === "qualified";
  return (
    <li className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <p className="text-white">
            {r.referrer?.name} <span className="text-slate-500">referred</span> {r.referred?.name}
            {r.referred?.phoneVerified && <BadgeCheck className="inline h-3.5 w-3.5 ml-1 text-emerald-400" aria-label="phone verified" />}
          </p>
          <p className="text-[11px] text-slate-400">
            {r.code} · joined {when(r.createdAt)}{r.qualifiedAt ? ` · first payment ${when(r.qualifiedAt)}` : ""}{r.rewardedAt ? ` · rewarded ${when(r.rewardedAt)}` : ""}
          </p>
          <p className="text-[11px] text-slate-500">Referrer: {r.referrer?.phone || r.referrer?.email} · Friend: {r.referred?.phone || r.referred?.email}</p>
          {r.note && <p className="text-xs text-slate-300 mt-1">{r.handledBy?.name}: {r.note}</p>}
        </div>
        <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", STATUS[r.status].style)}>{STATUS[r.status].label}</span>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 items-center">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder={r.status === "qualified" ? "e.g. ₹5,000 voucher emailed" : "Reason (e.g. same household)"} className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs" />
          {r.status === "qualified" && (
            <button type="button" disabled={act.isPending} onClick={() => act.mutate("reward")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40">Reward given</button>
          )}
          <button type="button" disabled={act.isPending} onClick={() => confirm("Reject this referral?") && act.mutate("reject")} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300">Reject</button>
        </div>
      )}
    </li>
  );
}

function Programme({ initial }: { initial: { enabled: boolean; referrerReward: string; friendReward: string; terms: string } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const save = useMutation({
    mutationFn: () => apiClient.put("/admin/settings", { referrals: form }),
    onSuccess: () => {
      toast.success("Referral programme saved");
      qc.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save"))
  });
  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Programme</h2>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-violet-500 h-4 w-4" /> Running
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">
          Reward for the customer who refers
          <input value={form.referrerReward} maxLength={120} onChange={(e) => setForm({ ...form, referrerReward: e.target.value })} className={cn(input, "mt-1")} />
        </label>
        <label className="text-xs text-slate-300">
          Reward for the friend
          <input value={form.friendReward} maxLength={120} onChange={(e) => setForm({ ...form, friendReward: e.target.value })} className={cn(input, "mt-1")} />
        </label>
      </div>
      <label className="block text-xs text-slate-300">
        Terms shown to customers
        <textarea value={form.terms} maxLength={600} rows={2} onChange={(e) => setForm({ ...form, terms: e.target.value })} className={cn(input, "mt-1")} />
      </label>
      <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium disabled:opacity-40">
        <Save className="h-3.5 w-3.5" /> Save programme
      </button>
    </section>
  );
}
