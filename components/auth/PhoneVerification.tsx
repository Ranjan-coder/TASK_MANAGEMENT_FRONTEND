"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  customerAuthApi,
  apiErrorMessage,
  apiErrorCode,
  isValidIndianMobile,
  type PhoneVerificationStep,
  type VerifiedSession
} from "@/lib/api/customerAuth.api";

interface Props {
  step: PhoneVerificationStep;
  onVerified: (session: VerifiedSession) => void;
  onCancel?: () => void;
}

/**
 * Mobile OTP step used after sign-up and when an unverified customer signs in.
 * Handles adding a number (older accounts), the 6-digit code with auto-submit,
 * and a resend countdown.
 */
export function PhoneVerification({ step, onVerified, onCancel }: Props) {
  const [needsPhone, setNeedsPhone] = useState(step.needsPhone);
  const [phoneMasked, setPhoneMasked] = useState(step.phoneMasked);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(step.otpSent ? "" : step.otpMessage || "");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(step.resendAfterSeconds || 0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (!needsPhone) codeRef.current?.focus();
  }, [needsPhone]);

  const sendCode = async (withPhone?: string) => {
    setError("");
    setBusy(true);
    try {
      const res = await customerAuthApi.sendOtp({
        verificationToken: step.verificationToken,
        ...(withPhone ? { phone: withPhone } : {})
      });
      setPhoneMasked(res.data.data.phoneMasked);
      setResendIn(res.data.data.resendAfterSeconds);
      setNeedsPhone(false);
      setCode("");
      toast.success(`Code sent to ${res.data.data.phoneMasked}`);
    } catch (err) {
      const wait = (err as any)?.response?.data?.errors?.[0]?.resendAfterSeconds;
      if (wait) setResendIn(wait);
      setError(apiErrorMessage(err, "Could not send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!/^\d{6}$/.test(value) || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await customerAuthApi.verifyOtp({ verificationToken: step.verificationToken, code: value });
      onVerified(res.data.data);
    } catch (err) {
      const remaining = (err as any)?.response?.data?.errors?.[0]?.attemptsRemaining;
      const base = apiErrorMessage(err, "That code didn't work.");
      setError(remaining ? `${base} ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : base);
      setCode("");
      if (apiErrorCode(err) === "STEP_TOKEN_INVALID") onCancel?.();
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  if (needsPhone) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isValidIndianMobile(phone)) {
            setError("Enter a valid 10-digit Indian mobile number");
            return;
          }
          sendCode(phone);
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Add your mobile number. We&apos;ll send a 6-digit code to verify it.
        </p>
        <div className="space-y-1">
          <label htmlFor="verify-phone" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Mobile number
          </label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
              +91
            </span>
            <Input
              id="verify-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
        </div>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending..." : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        verify(code);
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Enter the 6-digit code sent to <strong className="text-slate-900 dark:text-slate-200">{phoneMasked}</strong>.
      </p>
      <div className="space-y-1">
        <label htmlFor="verify-code" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Verification code
        </label>
        <Input
          id="verify-code"
          ref={codeRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
          className="text-center text-lg tracking-[0.5em] font-mono h-11"
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            if (next.length === 6) verify(next);
          }}
          disabled={busy}
        />
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? "Verifying..." : "Verify"}
      </Button>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-blue-600 dark:text-blue-400 disabled:text-slate-400 disabled:cursor-not-allowed"
          disabled={resendIn > 0 || busy}
          onClick={() => sendCode()}
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
        </button>
        <button
          type="button"
          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          onClick={() => {
            setNeedsPhone(true);
            setError("");
          }}
        >
          Change number
        </button>
      </div>
      {onCancel && (
        <Button type="button" variant="ghost" className="w-full text-xs" onClick={onCancel}>
          Back to sign in
        </Button>
      )}
    </form>
  );
}
