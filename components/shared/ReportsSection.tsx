"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { reportsApi, STATUS_LABEL, RATING_TAGS, type ReportAboutMe } from "@/lib/api/reports.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  under_review: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  action_taken: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  dismissed: "bg-slate-500/15 text-slate-300 border-slate-500/30"
};

const when = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Settings → Reports: reports you made, reports you're asked to respond to, and (staff) your rating. */
export function ReportsSection() {
  const user = useAuthStore((s) => s.user);
  const isStaff = Boolean(user && ["superadmin", "admin", "user"].includes(user.role));
  const mine = useQuery({ queryKey: ["reports-mine"], queryFn: async () => (await reportsApi.mine()).data.data });
  const aboutMe = useQuery({ queryKey: ["reports-about-me"], queryFn: async () => (await reportsApi.aboutMe()).data.data });
  const rating = useQuery({ queryKey: ["own-rating"], queryFn: async () => (await reportsApi.ownSummary()).data.data, enabled: isStaff });

  return (
    <div className="space-y-8">
      {isStaff && (
        <section>
          <h2 className="text-base font-semibold text-white">Your rating</h2>
          {rating.data?.average != null ? (
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5 text-2xl font-bold text-white">
                <Star className="h-6 w-6 fill-amber-400 text-amber-400" /> {rating.data.average.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">from {rating.data.count} customers</span>
              <span className="flex flex-wrap gap-1.5">
                {RATING_TAGS.filter((t) => rating.data!.tags[t.value]).map((t) => (
                  <span key={t.value} className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300">
                    {t.label} · {rating.data!.tags[t.value]}
                  </span>
                ))}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Your average appears once {rating.data?.minimum ?? 3} customers have rated you, so no single rating can be traced back.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold text-white">Reports you&apos;re asked to respond to</h2>
        {aboutMe.data?.length ? (
          <ul className="mt-3 space-y-3">
            {aboutMe.data.map((r) => (
              <AboutMeItem key={r._id} report={r} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-400">Nothing needs your response.</p>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-white">Reports you&apos;ve made</h2>
        {mine.data?.length ? (
          <ul className="mt-3 divide-y divide-slate-800 border border-slate-800 rounded-xl">
            {mine.data.map((r) => (
              <li key={r._id} className="px-4 py-3 text-sm flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white">
                    #{r.ticketNo} · {r.reportedUser?.name || "Someone"} <span className="text-slate-400">— {r.reasonLabel}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {r.projectName} · {when(r.createdAt)}
                  </p>
                  <p className="text-xs text-slate-300 mt-1">{r.outcome}</p>
                </div>
                <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-400">You haven&apos;t made any reports. Use the flag button in a project chat.</p>
        )}
      </section>
    </div>
  );
}

function AboutMeItem({ report }: { report: ReportAboutMe }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await reportsApi.respond(report._id, text.trim());
      toast.success("Response sent to the reviewer");
      queryClient.invalidateQueries({ queryKey: ["reports-about-me"] });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send your response"));
    } finally {
      setSending(false);
    }
  };

  return (
    <li className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="text-white">
          Report #{report.ticketNo} · <span className="text-slate-300">{report.reasonLabel}</span>
        </p>
        <span className={cn("px-2 py-0.5 rounded-full border text-[11px]", STATUS_STYLE[report.status])}>{STATUS_LABEL[report.status]}</span>
      </div>
      <p className="text-xs text-slate-400">{report.projectName}</p>
      {report.messages.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-slate-400">Messages included in the report:</p>
          {report.messages.map((m, i) => (
            <p key={i} className="text-xs text-slate-200 bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-1.5">
              <span className="text-slate-500">
                {m.mine ? "You" : "Other person"} · {new Date(m.sentAt).toLocaleString("en-IN")}:{" "}
              </span>
              {m.text}
            </p>
          ))}
        </div>
      )}
      {report.response ? (
        <p className="text-xs text-slate-300">
          <span className="text-slate-500">Your response ({when(report.response.at)}):</span> {report.response.text}
        </p>
      ) : report.canRespond ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Your side of what happened (at least 10 characters). Only the review team sees this."
            className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || text.trim().length < 10}
            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-500 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send response"}
          </button>
        </div>
      ) : null}
    </li>
  );
}
