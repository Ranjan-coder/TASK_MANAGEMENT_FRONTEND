"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Gift, Share2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { paymentsApi } from "@/lib/api/payments.api";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; style: string }> = {
  signed_up: { label: "Joined", style: "border-sky-500/40 text-sky-200" },
  qualified: { label: "Project started — reward coming", style: "border-amber-500/40 text-amber-200" },
  rewarded: { label: "Reward given", style: "border-emerald-500/40 text-emerald-200" },
  rejected: { label: "Not eligible", style: "border-slate-600 text-slate-400" }
};

/** Customer: refer a friend (R9). */
export default function ReferPage() {
  const { data, isLoading } = useQuery({ queryKey: ["my-referrals"], queryFn: paymentsApi.myReferrals });

  const shareText = data?.link ? `I'm doing my home interiors with Bonito. Sign up with my code ${data.code} — ${data.friendReward}: ${data.link}` : "";
  const share = async () => {
    if (!data?.link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bonito Interiors", text: shareText, url: data.link });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard?.writeText(shareText);
      toast.success("Invite copied");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-6">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      {isLoading || !data ? (
        <div className="h-40 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />
      ) : !data.enabled ? (
        <p className="text-sm text-slate-300">Referrals aren&apos;t running at the moment.</p>
      ) : (
        <>
          <section className="rounded-2xl bg-gradient-to-br from-violet-600/25 to-slate-900 border border-violet-500/30 p-5 space-y-3">
            <Gift className="h-7 w-7 text-amber-300" aria-hidden />
            <h1 className="text-2xl font-bold text-white">Refer a friend</h1>
            <p className="text-sm text-slate-200">
              You get <strong>{data.referrerReward}</strong>. Your friend gets <strong>{data.friendReward}</strong>.
            </p>
            {data.needsVerification || !data.code ? (
              <p className="text-sm text-amber-200">Verify your mobile number to get your referral code.</p>
            ) : (
              <>
                <button type="button" onClick={() => navigator.clipboard?.writeText(data.code!).then(() => toast.success("Code copied"))} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-950/70 border border-slate-700 text-white font-mono text-lg tracking-wider">
                  {data.code} <Copy className="h-4 w-4 text-slate-400" />
                </button>
                <div className="flex flex-wrap gap-2">
                  <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
                    <MessageCircle className="h-4 w-4" /> Share on WhatsApp
                  </a>
                  <button type="button" onClick={share} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-600 text-slate-100 text-sm">
                    <Share2 className="h-4 w-4" /> Share link
                  </button>
                </div>
              </>
            )}
            {data.terms && <p className="text-[11px] text-slate-400">{data.terms}</p>}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Your referrals</h2>
            <p className="text-xs text-slate-400">
              {data.counts.joined} joined · {data.counts.qualified} started a project · {data.counts.rewarded} rewarded
            </p>
            {data.referrals.length === 0 ? (
              <p className="text-sm text-slate-400">No one yet — share your code with friends planning their interiors.</p>
            ) : (
              <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl">
                {data.referrals.map((r) => (
                  <li key={r._id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="text-white">{r.friend} <span className="text-xs text-slate-500">· {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></span>
                    <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", STATUS[r.status].style)}>{STATUS[r.status].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
