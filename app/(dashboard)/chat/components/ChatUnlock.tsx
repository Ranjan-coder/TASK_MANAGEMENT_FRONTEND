"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { unlockChatKeys, WrongPasswordError } from "@/lib/crypto/keyBundle";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shown when there is a valid session but this browser has no copy of the
 * chat keys (e.g. site data was cleared). The password re-opens the encrypted
 * key bundle; nothing is sent to the server except the usual API calls.
 */
export function ChatUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !password) return;
    setBusy(true);
    setError("");
    try {
      const result = await unlockChatKeys(user._id, password);
      if (result === "sign-in-again") {
        toast.info("Please sign in again to finish upgrading your account.");
        await logout();
        return;
      }
      setPassword("");
      toast.success("Chats unlocked");
      onUnlocked();
    } catch (err) {
      setError(err instanceof WrongPasswordError ? "That password is incorrect." : "Couldn't unlock your chats. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4"
      aria-labelledby="chat-unlock-title"
    >
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-xl bg-violet-600/20 text-violet-300 flex items-center justify-center">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <h2 id="chat-unlock-title" className="text-base font-semibold text-white">Unlock your chats</h2>
          <p className="text-xs text-slate-400">Enter your password to open your encrypted messages on this device.</p>
        </div>
      </div>
      <div>
        <label htmlFor="chat-unlock-password" className="block text-xs font-medium text-slate-300 mb-1.5">
          Password
        </label>
        <input
          id="chat-unlock-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          autoFocus
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        {error && <p role="alert" className="text-xs text-red-400 mt-1.5">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={busy || !password}
        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold transition"
      >
        {busy ? "Unlocking..." : "Unlock"}
      </button>
    </form>
  );
}
