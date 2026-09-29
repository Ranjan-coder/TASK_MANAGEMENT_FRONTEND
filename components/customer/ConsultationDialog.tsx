"use client";

import { useState } from "react";
import { CalendarCheck, X } from "lucide-react";
import { toast } from "sonner";
import { contentApi, type PublicCampaign } from "@/lib/api/content.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";

/** "Book a free consultation" from a campaign — creates a lead for the Bonito team. */
export function ConsultationDialog({ campaign, onClose }: { campaign: PublicCampaign; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await contentApi.requestConsultation(campaign._id, message.trim());
      toast.success(res.message);
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't send your request. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="consult-title">
      <form onSubmit={submit} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-violet-600/20 text-violet-300 flex items-center justify-center">
              <CalendarCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 id="consult-title" className="text-base font-semibold text-white">Book a free consultation</h2>
              <p className="text-xs text-slate-400">About: {campaign.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Our design team will call you on your registered mobile number within one working day (Tue–Sun, 10 AM–7 PM).
        </p>
        <div>
          <label htmlFor="consult-message" className="block text-xs font-medium text-slate-300 mb-1.5">
            Anything we should know? <span className="text-slate-500">(optional)</span>
          </label>
          <textarea
            id="consult-message"
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. 3BHK in Whitefield, looking at kitchen and wardrobes"
            className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold">
          {busy ? "Sending..." : "Request a call back"}
        </button>
      </form>
    </div>
  );
}
