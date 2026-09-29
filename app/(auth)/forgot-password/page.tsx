"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authApi } from "../../../lib/api/auth.api";
import { customerAuthApi, apiErrorMessage, isValidIndianMobile } from "../../../lib/api/customerAuth.api";
import { prepareNewPassword } from "../../../lib/auth/credentials";
import { passwordPolicyError } from "../../../lib/crypto/passwordKeys";

type Mode = "email" | "phone";
type PhoneStage = "enter-phone" | "enter-code";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition";
const buttonClass =
  "w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold transition-all duration-200";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Email reset link
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  // Mobile OTP reset
  const [phone, setPhone] = useState("");
  const [phoneStage, setPhoneStage] = useState<PhoneStage>("enter-phone");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const requestCode = async () => {
    setError("");
    if (!isValidIndianMobile(phone)) {
      setError("Enter a valid 10-digit Indian mobile number");
      return;
    }
    setLoading(true);
    try {
      const res = await customerAuthApi.requestPasswordResetOtp({ phone });
      setResendIn(res.data.data.resendAfterSeconds || 30);
      setPhoneStage("enter-code");
      toast.success(res.data.message);
    } catch (err) {
      setError(apiErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code");
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return setError(policyError);
    if (newPassword !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      const { authKey, kdfSalt } = await prepareNewPassword(newPassword);
      await customerAuthApi.resetPasswordWithOtp({ phone, code, authKey, kdfSalt });
      toast.success("Password reset. Please sign in with your new password.");
      router.push("/login");
    } catch (err) {
      const remaining = (err as any)?.response?.data?.errors?.[0]?.attemptsRemaining;
      const base = apiErrorMessage(err, "Could not reset the password.");
      setError(remaining ? `${base} ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : base);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md bg-slate-800/60 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">Forgot password</h1>
          <p className="text-slate-400 mt-1 text-sm">Reset it with your email or your mobile number</p>
        </div>

        <div role="tablist" aria-label="Reset method" className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-xl bg-slate-900/60">
          {(["email", "phone"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              onClick={() => switchMode(m)}
              className={`py-2 rounded-lg text-sm font-medium transition ${
                mode === m ? "bg-violet-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "email" ? "Email" : "Mobile number"}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {mode === "email" &&
          (sent ? (
            <div className="text-center">
              <h2 className="text-white font-semibold text-lg mb-2">Check your inbox</h2>
              <p className="text-slate-400 text-sm mb-6">
                If <strong className="text-slate-300">{email}</strong> is registered, you&apos;ll receive a reset link within a few minutes.
              </p>
              <Link href="/login" className="text-violet-400 hover:text-violet-300 text-sm">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input id="forgot-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
              </div>
              <button type="submit" disabled={loading} id="forgot-password-submit" className={buttonClass}>
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          ))}

        {mode === "phone" && phoneStage === "enter-phone" && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              requestCode();
            }}
          >
            <div>
              <label htmlFor="forgot-phone" className="block text-sm font-medium text-slate-300 mb-1.5">Mobile number</label>
              <div className="flex gap-2">
                <span className="flex items-center px-3 rounded-xl bg-slate-700/50 border border-slate-600 text-slate-300 text-sm">+91</span>
                <input id="forgot-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" className={inputClass} />
              </div>
            </div>
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? "Sending..." : "Send code"}
            </button>
          </form>
        )}

        {mode === "phone" && phoneStage === "enter-code" && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-slate-400 text-sm">If this number is registered, we&apos;ve sent a 6-digit code to it.</p>
            <div>
              <label htmlFor="forgot-code" className="block text-sm font-medium text-slate-300 mb-1.5">Verification code</label>
              <input
                id="forgot-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className={`${inputClass} text-center tracking-[0.5em] font-mono text-lg`}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="forgot-new-password" className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
              <input id="forgot-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 number" className={inputClass} />
            </div>
            <div>
              <label htmlFor="forgot-confirm-password" className="block text-sm font-medium text-slate-300 mb-1.5">Confirm new password</label>
              <input id="forgot-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={loading} className={buttonClass}>
              {loading ? "Resetting..." : "Reset password"}
            </button>
            <div className="flex justify-between text-xs">
              <button type="button" disabled={resendIn > 0 || loading} onClick={requestCode} className="text-violet-400 disabled:text-slate-500">
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </button>
              <button type="button" onClick={() => setPhoneStage("enter-phone")} className="text-slate-400 hover:text-slate-200">
                Change number
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-slate-500 text-sm mt-6">
          Remember your password?{" "}
          <Link href="/login" className="text-violet-400 hover:text-violet-300">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
