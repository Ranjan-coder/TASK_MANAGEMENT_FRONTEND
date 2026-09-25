"use client";

import { useState, useEffect } from "react";
import { computeFingerprint } from "@/lib/crypto/e2e";
import { ShieldCheck, ShieldAlert, Copy, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SafetyNumbersDialogProps {
  myPublicKey: string;
  theirPublicKey: string;
  theirName: string;
  onClose: () => void;
}

export function SafetyNumbersDialog({
  myPublicKey,
  theirPublicKey,
  theirName,
  onClose
}: SafetyNumbersDialogProps) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    computeFingerprint(myPublicKey, theirPublicKey)
      .then((fp) => {
        setFingerprint(fp);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [myPublicKey, theirPublicKey]);

  const copy = () => {
    if (!fingerprint) return;
    navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Split fingerprint into rows of 4 groups for visual display
  const chunks = fingerprint ? fingerprint.split(" ") : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold text-white text-sm">Safety Numbers</span>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-slate-400 text-xs leading-relaxed">
            Compare these numbers with <span className="text-white font-medium">{theirName}</span> using a
            trusted out-of-band channel (call, in person). If they match, your conversation is
            verified — no man-in-the-middle.
          </p>

          {/* Fingerprint grid */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 sm:p-4">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
              </div>
            ) : fingerprint ? (
              <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                {chunks.map((chunk, ci) => (
                  <span
                    key={ci}
                    className="font-mono text-xs sm:text-sm font-bold text-violet-300 tracking-wider sm:tracking-widest bg-violet-600/10 border border-violet-500/20 px-2 py-1 rounded-lg"
                  >
                    {chunk}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-center text-rose-400 text-sm">Failed to compute fingerprint</p>
            )}
          </div>

          {/* Verified toggle */}
          <button
            onClick={() => setVerified((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition",
              verified
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600"
            )}
          >
            <div
              className={cn(
                "h-5 w-5 rounded-full border-2 flex items-center justify-center transition",
                verified ? "bg-emerald-500 border-emerald-400" : "border-slate-500"
              )}
            >
              {verified && <Check className="h-3 w-3 text-white" />}
            </div>
            <span className="text-sm font-medium">
              {verified ? "✅ Conversation verified" : "Mark as verified"}
            </span>
          </button>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
