"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { computeFingerprint } from "@/lib/crypto/e2e";
import { loadKeyring, latestKey } from "@/lib/crypto/keyStore";
import { addNewKeyVersion } from "@/lib/crypto/keyBundle";
import { ShieldCheck, RefreshCw, Loader2, Copy, Check, AlertTriangle, X, Lock } from "lucide-react";
import { RecoveryKeySection } from "./RecoveryKey";
import { toast } from "sonner";

interface KeySetupWizardProps {
  onClose?: () => void;
}

type Step = "loading" | "locked" | "ready" | "rotate_confirm" | "rotating";

/**
 * Encryption status for the signed-in user. Keys are created and synced
 * automatically at sign-in (keyBundle.ts), so this only shows the safety
 * fingerprint and lets the user replace their key if they think it was exposed.
 */
export function KeySetupWizard({ onClose }: KeySetupWizardProps) {
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<Step>("loading");
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!user) return;
    const keys = await loadKeyring(user._id);
    if (!keys) {
      setStep("locked");
      return;
    }
    const current = latestKey(keys);
    setVersion(current.version);
    setFingerprint(await computeFingerprint(current.publicKeyB64, current.publicKeyB64));
    setStep("ready");
  };

  useEffect(() => {
    load().catch(() => setStep("locked"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const rotate = async () => {
    if (!user) return;
    setStep("rotating");
    try {
      await addNewKeyVersion(user._id);
      toast.success("New encryption key created. Your existing messages stay readable.");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Couldn't create a new key");
      setStep("ready");
    }
  };

  const copy = async () => {
    if (!fingerprint) return;
    try {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the text instead");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4 text-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">End-to-end encryption</h2>
            <p className="text-xs text-slate-400">Your messages can only be read by the people in the chat.</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {step === "loading" && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {step === "locked" && (
        <p className="flex items-center gap-2 text-sm text-amber-300">
          <Lock className="h-4 w-4" /> Your chat keys are locked on this device. Open Chat to unlock them with your password.
        </p>
      )}

      {(step === "ready" || step === "rotate_confirm" || step === "rotating") && (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-400">Your safety fingerprint (key version {version})</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-[11px] leading-relaxed font-mono break-all text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 select-all">
                {fingerprint}
              </code>
              <button onClick={copy} aria-label="Copy fingerprint" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Your keys sync to every device you sign in on, protected by your password.</p>
          </div>

          {step === "ready" && (
            <button
              onClick={() => setStep("rotate_confirm")}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Create a new encryption key
            </button>
          )}

          {step === "rotate_confirm" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="flex items-center gap-2 text-sm text-amber-300 font-medium">
                <AlertTriangle className="h-4 w-4" /> Create a new key?
              </p>
              <p className="text-xs text-amber-200/80">
                Do this if you think your device or password was exposed. New messages will use the new key; existing
                messages stay readable. Your contacts will see that your key changed.
              </p>
              <div className="flex gap-2">
                <button onClick={rotate} className="px-3 py-1.5 rounded-lg bg-amber-500/30 hover:bg-amber-500/40 text-amber-100 text-xs font-medium">
                  Create new key
                </button>
                <button onClick={() => setStep("ready")} className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === "rotating" && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Creating your new key…
            </p>
          )}

          <RecoveryKeySection />
        </>
      )}
    </div>
  );
}
