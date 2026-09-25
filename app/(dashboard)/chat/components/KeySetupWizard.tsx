"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { generateKeyPair, computeFingerprint } from "@/lib/crypto/e2e";
import { savePrivateKey, loadPrivateKey, savePublicKey, deletePrivateKey, ensureUserKeys } from "@/lib/crypto/keyStore";
import { publishPublicKey, fetchPublicKey } from "@/lib/api/chat.api";
import { ShieldCheck, Key, RefreshCw, Loader2, Copy, Check, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

interface KeySetupWizardProps {
  onComplete?: () => void;
  onClose?: () => void;
}

type Step = "loading" | "intro" | "generating" | "done" | "rotate_confirm";

export function KeySetupWizard({ onComplete, onClose }: KeySetupWizardProps) {
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>("loading");
  const [publicKeyB64, setPublicKeyB64] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check on mount if user already has an existing key, auto-syncing with server
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    (async () => {
      try {
        const { publicKeyB64: pubKey } = await ensureUserKeys(user._id);
        if (pubKey) {
          const fp = await computeFingerprint(pubKey, pubKey);
          if (isMounted) {
            setPublicKeyB64(pubKey);
            setFingerprint(fp);
            setStep("done");
            return;
          }
        }
        if (isMounted) setStep("intro");
      } catch {
        if (isMounted) setStep("intro");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const generateAndPublish = async (isRotation = false) => {
    if (!user) return;
    setStep("generating");
    try {
      // 1. Generate new ECDH P-256 key pair
      const { publicKeyB64: pubKey, privateKey } = await generateKeyPair();

      // 2. Store private key & public key in IndexedDB (never leaves browser)
      if (isRotation) await deletePrivateKey(user._id);
      await savePrivateKey(user._id, privateKey);
      await savePublicKey(user._id, pubKey);

      // 3. Publish public key to server
      await publishPublicKey(pubKey);

      // 4. Update authStore
      useAuthStore.getState().setUser({ ...user, publicKey: pubKey });

      // 5. Compute self-fingerprint for display
      const fp = await computeFingerprint(pubKey, pubKey);
      setPublicKeyB64(pubKey);
      setFingerprint(fp);
      setStep("done");
      toast.success(isRotation ? "Encryption keys rotated" : "Encryption keys set up!");
      onComplete?.();
    } catch (err: any) {
      toast.error(err.message || "Key setup failed");
      setStep("intro");
    }
  };

  const copyFingerprint = () => {
    if (!fingerprint) return;
    navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {step === "loading" && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
          <p className="text-slate-400 text-xs">Checking encryption keys…</p>
        </div>
      )}

      {step === "intro" && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 sm:p-6 space-y-5 shadow-2xl relative">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-3 pr-8">
            <div className="h-11 w-11 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
              <Key className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Set Up Chat Encryption</h3>
              <p className="text-slate-400 text-xs mt-0.5">One-time setup for end-to-end encrypted messages</p>
            </div>
          </div>

          <div className="space-y-3">
            <FeatureRow icon="🔑" text="Your private key is generated in your browser and never leaves your device" />
            <FeatureRow icon="🔒" text="All messages are encrypted before sending — the server only sees ciphertext" />
            <FeatureRow icon="🛡️" text="ECDH P-256 + AES-256-GCM with HKDF key derivation" />
            <FeatureRow icon="📱" text="Keys are stored in IndexedDB and survive page refreshes" />
          </div>

          <button
            onClick={() => generateAndPublish(false)}
            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition flex items-center justify-center gap-2 shadow-md shadow-violet-600/20"
          >
            <ShieldCheck className="h-4 w-4" />
            Generate My Encryption Keys
          </button>
        </div>
      )}

      {step === "generating" && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
          <div className="h-14 w-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold">Generating Keys…</p>
            <p className="text-slate-400 text-xs mt-1">ECDH P-256 + HKDF derivation in progress</p>
          </div>
        </div>
      )}

      {step === "rotate_confirm" && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Rotate Encryption Keys?</h3>
              <p className="text-slate-400 text-xs mt-0.5">This will replace your current key pair</p>
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <p className="text-amber-300 text-xs leading-relaxed">
              ⚠️ After rotation, existing DM sessions will need to be re-established.
              Old messages will not be re-decryptable with the new key.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep("done")}
              className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => generateAndPublish(true)}
              className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition"
            >
              Rotate Keys
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl relative">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-3 pr-8">
            <div className="h-11 w-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Encryption Keys Active</h3>
              <p className="text-emerald-400 text-xs mt-0.5 font-medium">Your chats are end-to-end encrypted</p>
            </div>
          </div>

          {fingerprint && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Your Safety Fingerprint (SHA-256)
              </p>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 font-mono text-xs text-slate-300 leading-loose tracking-widest break-all">
                {fingerprint}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-500">Compare with contacts to verify security</p>
                <button
                  onClick={copyFingerprint}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-300 hover:text-white bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => setStep("rotate_confirm")}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Rotate Keys
            </button>
            <button
              onClick={() => {
                onComplete?.();
                onClose?.();
              }}
              className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base shrink-0 mt-0.5">{icon}</span>
      <p className="text-slate-300 text-xs leading-relaxed">{text}</p>
    </div>
  );
}
