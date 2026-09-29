"use client";

import { useEffect, useState } from "react";
import { KeyRound, Copy, Check, AlertTriangle, Loader2, X, History } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { createRecoveryKey, restoreWithRecoveryKey, InvalidRecoveryKeyError } from "@/lib/crypto/keyBundle";
import { loadKeyMeta, loadKeyring } from "@/lib/crypto/keyStore";
import { fetchKeyBundle } from "@/lib/api/chat.api";

// ── Create / replace ──────────────────────────────────────────────────────────

/**
 * Recovery key section for the encryption dialog. The key is shown exactly
 * once; after that only the user's saved copy can restore messages.
 */
export function RecoveryKeySection() {
  const user = useAuthStore((s) => s.user);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadKeyMeta(user._id)
      .then((m) => setHasKey(Boolean(m?.hasRecoveryKey)))
      .catch(() => setHasKey(false));
  }, [user]);

  const create = async () => {
    if (!user) return;
    setBusy(true);
    try {
      setShownKey(await createRecoveryKey(user._id));
      setSaved(false);
      setConfirmReplace(false);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't create a recovery key");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!shownKey) return;
    try {
      await navigator.clipboard.writeText(shownKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the text instead");
    }
  };

  if (shownKey) {
    return (
      <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
        <p className="text-sm font-semibold text-white">Your recovery key</p>
        <p className="text-xs text-slate-300">
          Write it down or store it in a password manager. It's the only way to read older messages if you forget your
          password. Bonito can't show it again or recover it for you.
        </p>
        <div className="flex items-start gap-2">
          <code className="flex-1 font-mono text-sm tracking-wide text-white bg-slate-950/70 border border-slate-700 rounded-lg p-3 break-all select-all">
            {shownKey}
          </code>
          <button onClick={copy} aria-label="Copy recovery key" className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <label htmlFor="recovery-saved" className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input id="recovery-saved" type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-violet-600" />
          I've saved my recovery key somewhere safe
        </label>
        <button
          disabled={!saved}
          onClick={() => {
            setShownKey(null);
            setHasKey(true);
          }}
          className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-slate-800 pt-4">
      <p className="flex items-center gap-2 text-sm font-medium text-white">
        <KeyRound className="h-4 w-4 text-violet-400" /> Recovery key
        {hasKey !== null && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasKey ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"}`}>
            {hasKey ? "Set up" : "Not set up"}
          </span>
        )}
      </p>
      <p className="text-xs text-slate-400">
        If you ever reset your password, your recovery key restores your older messages.
      </p>

      {confirmReplace ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Your old recovery key will stop working.
          </p>
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="px-3 py-1.5 rounded-lg bg-amber-500/30 text-amber-100 text-xs font-medium">
              {busy ? "Creating..." : "Replace it"}
            </button>
            <button onClick={() => setConfirmReplace(false)} className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => (hasKey ? setConfirmReplace(true) : create())}
          disabled={busy || hasKey === null}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 text-xs font-medium disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {hasKey ? "Create a new recovery key" : "Create recovery key"}
        </button>
      )}
    </div>
  );
}

// ── Restore ───────────────────────────────────────────────────────────────────

export function RestoreRecoveryDialog({ onClose, onRestored }: { onClose: () => void; onRestored?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const restored = await restoreWithRecoveryKey(user._id, code);
      toast.success(restored > 0 ? "Older messages restored" : "Your keys are already up to date");
      onRestored?.();
      onClose();
      // Re-open chats with the restored keys
      window.location.reload();
    } catch (err) {
      setError(err instanceof InvalidRecoveryKeyError ? err.message : "Couldn't restore. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4" aria-labelledby="restore-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="restore-title" className="text-base font-semibold text-white">Restore older messages</h2>
            <p className="text-xs text-slate-400 mt-0.5">Enter the recovery key you saved when you set it up.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>
          <label htmlFor="recovery-code" className="block text-xs font-medium text-slate-300 mb-1.5">Recovery key</label>
          <textarea
            id="recovery-code"
            rows={3}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-…"
            spellCheck={false}
            autoComplete="off"
            className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700 text-white font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          {error && <p role="alert" className="text-xs text-red-400 mt-1.5">{error}</p>}
        </div>
        <button type="submit" disabled={busy || !code.trim()} className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold">
          {busy ? "Restoring..." : "Restore"}
        </button>
      </form>
    </div>
  );
}

// ── Banner in Chat ────────────────────────────────────────────────────────────

const NUDGE_DISMISSED = "bonito.recoveryNudgeDismissed";

/**
 * - Recovery copy exists but this bundle doesn't know the key (typically right
 *   after a password reset) → offer to restore older messages.
 * - Staff without any recovery key → a dismissible reminder to create one.
 */
export function RecoveryBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<"restore" | "nudge" | null>(null);
  const [showRestore, setShowRestore] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      if (!(await loadKeyring(user._id))) return; // locked: the unlock prompt comes first
      const [meta, server] = await Promise.all([loadKeyMeta(user._id), fetchKeyBundle()]);
      if (!active) return;
      if (server.recoveryAvailable && !meta?.hasRecoveryKey) setMode("restore");
      else if (!server.recoveryAvailable && user.role !== "customer") {
        let dismissed = false;
        try {
          dismissed = localStorage.getItem(NUDGE_DISMISSED) === "1";
        } catch {}
        if (!dismissed) setMode("nudge");
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  if (!mode) return null;

  return (
    <>
      <div className="mx-3 mt-2.5 p-3 rounded-xl bg-violet-500/10 border border-violet-500/25 flex items-start gap-2.5 shrink-0">
        {mode === "restore" ? <History className="h-4 w-4 text-violet-300 shrink-0 mt-0.5" /> : <KeyRound className="h-4 w-4 text-violet-300 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-violet-200">
            {mode === "restore" ? "Restore older messages" : "Create a recovery key"}
          </p>
          <p className="text-[11px] text-violet-200/70">
            {mode === "restore"
              ? "Use your recovery key to read messages from before your password reset."
              : "So you never lose messages if you forget your password."}
          </p>
          <button
            onClick={() => (mode === "restore" ? setShowRestore(true) : onOpenSettings())}
            className="mt-1.5 text-[11px] font-semibold text-violet-300 hover:text-violet-200"
          >
            {mode === "restore" ? "Enter recovery key" : "Set it up"}
          </button>
        </div>
        {mode === "nudge" && (
          <button
            aria-label="Dismiss"
            onClick={() => {
              try {
                localStorage.setItem(NUDGE_DISMISSED, "1");
              } catch {}
              setMode(null);
            }}
            className="text-violet-300/70 hover:text-violet-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showRestore && <RestoreRecoveryDialog onClose={() => setShowRestore(false)} />}
    </>
  );
}
