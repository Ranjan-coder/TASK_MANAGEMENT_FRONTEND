"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { ChatUnlock } from "@/app/(dashboard)/chat/components/ChatUnlock";
import { usePlannerKey } from "@/hooks/usePlanner";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { plannerApi } from "@/lib/api/planner.api";
import { forgetVault } from "@/lib/crypto/vault";
import { prepareCurrentPassword } from "@/lib/auth/credentials";

/**
 * Opens the Planner: everything in it is end-to-end encrypted with a key that only
 * this person's own keys can open. When their keys are locked on this device
 * (e.g. new browser), the same unlock prompt as Chat appears.
 */
export function PlannerGate({ children }: { children: (key: CryptoKey) => React.ReactNode }) {
  const { state, retry } = usePlannerKey();

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin" /> Opening your Planner…
      </div>
    );
  }
  if (state.status === "locked") {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <p className="text-sm text-slate-400 max-w-md text-center">
          Your Planner is end-to-end encrypted. Enter your password to unlock it on this device.
        </p>
        <ChatUnlock onUnlocked={retry} />
      </div>
    );
  }
  if (state.status === "unrecoverable") return <StartOver onDone={retry} />;
  if (state.status === "error") {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-sm text-red-400">{state.message}</p>
        <button onClick={retry} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-200 text-sm">
          Try again
        </button>
      </div>
    );
  }
  return (
    <>
      <p className="flex items-center gap-1.5 text-[11px] text-emerald-400/80">
        <ShieldCheck className="h-3.5 w-3.5" /> End-to-end encrypted. Only you (and people you invite to a meeting) can read this. Times are visible to the server so it can remind you.
      </p>
      {children(state.key)}
    </>
  );
}

/**
 * The Planner was encrypted with keys this account no longer has (e.g. a password
 * reset without a recovery key). Nobody can read those items any more — not the
 * server, not an admin. The person can restore their keys, or start over.
 */
function StartOver({ onDone }: { onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    try {
      // The password never leaves the browser: it is turned into the sign-in key here
      const cred = await prepareCurrentPassword(password);
      await plannerApi.resetVault(cred.legacy ? { password: cred.password } : { authKey: cred.authKey });
      setPassword("");
      forgetVault();
      toast.success("Your Planner was reset. You can start using it again.");
      onDone();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status === 401 ? "That password is incorrect." : "Couldn't reset your Planner. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-lg mx-auto rounded-2xl bg-slate-900 border border-amber-500/30 p-5 space-y-3 my-8">
      <h2 className="text-white font-semibold">Your Planner can't be opened on this account</h2>
      <p className="text-sm text-slate-300">
        It was encrypted with keys this account no longer has, for example after a password reset. If you saved your recovery key, restore it in{" "}
        <Link href="/settings?section=encryption" className="text-violet-300 underline">Settings → Chat encryption</Link>, then come back.
      </p>
      <p className="text-sm text-slate-400">
        Otherwise you can start over. Your old notes, todos and reminders can't be read by anyone, so they will be deleted. Meetings you were invited to stay.
      </p>
      <label className="block text-xs text-slate-400">
        Type DELETE to start over
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
      </label>
      <label className="block text-xs text-slate-400">
        Your password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-sm" />
      </label>
      <button onClick={reset} disabled={typed !== "DELETE" || !password || busy} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-sm font-semibold">
        {busy ? "Resetting…" : "Start over"}
      </button>
    </div>
  );
}
