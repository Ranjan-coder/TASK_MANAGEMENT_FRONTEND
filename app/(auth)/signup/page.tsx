"use client";

import { useEffect, useRef, useState } from "react";
import { paymentsApi } from "@/lib/api/payments.api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { homeRouteFor } from "@/lib/utils";
import { PhoneVerification } from "@/components/auth/PhoneVerification";
import { prepareNewPassword, finishSignIn } from "@/lib/auth/credentials";
import { setKeyStorageTrusted } from "@/lib/crypto/keyStore";
import {
  customerAuthApi,
  apiErrorMessage,
  isValidIndianMobile,
  type PhoneVerificationStep,
  type VerifiedSession
} from "@/lib/api/customerAuth.api";

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    phone: z.string().refine(isValidIndianMobile, "Enter a valid 10-digit Indian mobile number"),
    email: z.string().trim().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v, "Please accept the Terms and Privacy Policy"),
    projectAlerts: z.boolean()
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

type SignupFormData = z.infer<typeof signupSchema>;

const inputClass =
  "w-full px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-sm disabled:opacity-60";

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phoneStep, setPhoneStep] = useState<PhoneVerificationStep | null>(null);
  // Referral invite (?ref=CODE): checked with the server, which returns only the friend's first name
  const [referral, setReferral] = useState<{ code: string; firstName?: string; reward?: string } | null>(null);
  const [refInput, setRefInput] = useState("");
  const [showRefInput, setShowRefInput] = useState(false);
  const checkCode = async (code: string) => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return;
    try {
      const r = await paymentsApi.checkReferral(c);
      if (r.valid) setReferral({ code: c, firstName: r.referrerFirstName, reward: r.friendReward });
      else {
        setReferral(null);
        toast.error("That referral code isn't valid");
      }
    } catch {
      /* not critical for signup */
    }
  };
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && /^[A-Za-z0-9-]{4,20}$/.test(ref)) checkCode(ref);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const wrapKeyRef = useRef<CryptoKey | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { acceptTerms: false, projectAlerts: false }
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      // The server always creates a customer account; no role is sent.
      // The password stays in the browser — only the derived authKey is sent.
      const { authKey, kdfSalt, wrapKey } = await prepareNewPassword(data.password);
      wrapKeyRef.current = wrapKey;
      setKeyStorageTrusted(true);
      const res = await customerAuthApi.register({
        name: data.name,
        email: data.email,
        phone: data.phone,
        authKey,
        kdfSalt,
        acceptTerms: true,
        projectAlerts: data.projectAlerts,
        ...(referral && { referralCode: referral.code })
      });
      setPhoneStep(res.data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Registration failed. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerified = async (session: VerifiedSession) => {
    if (session.user) {
      setUser(session.user);
      if (wrapKeyRef.current) await finishSignIn(session.user._id, wrapKeyRef.current);
      wrapKeyRef.current = null;
      toast.success(`Welcome to Bonito, ${session.user.name.split(" ")[0]}!`);
      router.push(homeRouteFor(session.user));
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-500/30 mb-3">
            <span className="text-white font-black text-2xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {phoneStep ? "Verify your mobile number" : "Create your Bonito account"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {phoneStep
              ? "One last step to secure your account."
              : "See our latest offers and chat with your design team."}
          </p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 shadow-2xl [&_label]:text-slate-300 [&_p]:text-slate-400 [&_strong]:text-slate-200">
          {phoneStep ? (
            <PhoneVerification step={phoneStep} onVerified={handleVerified} />
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="signup-name" className="block text-sm font-medium mb-1.5">Full name</label>
                <input {...register("name")} id="signup-name" type="text" autoComplete="name" placeholder="Asha Mehta" disabled={isLoading} className={inputClass} />
                {errors.name && <p className="text-xs !text-red-400 mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label htmlFor="signup-phone" className="block text-sm font-medium mb-1.5">Mobile number</label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 rounded-xl bg-slate-700/50 border border-slate-600 text-slate-300 text-sm">+91</span>
                  <input {...register("phone")} id="signup-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" disabled={isLoading} className={inputClass} />
                </div>
                {errors.phone && <p className="text-xs !text-red-400 mt-1">{errors.phone.message}</p>}
              </div>

              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium mb-1.5">Email</label>
                <input {...register("email")} id="signup-email" type="email" autoComplete="email" placeholder="you@example.com" disabled={isLoading} className={inputClass} />
                {errors.email && <p className="text-xs !text-red-400 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input
                    {...register("password")}
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    disabled={isLoading}
                    className={`${inputClass} pr-16`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {errors.password && <p className="text-xs !text-red-400 mt-1">{errors.password.message}</p>}
              </div>

              <div>
                <label htmlFor="signup-confirm-password" className="block text-sm font-medium mb-1.5">Confirm password</label>
                <input
                  {...register("confirmPassword")}
                  id="signup-confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  disabled={isLoading}
                  className={inputClass}
                />
                {errors.confirmPassword && <p className="text-xs !text-red-400 mt-1">{errors.confirmPassword.message}</p>}
              </div>

              <div>
                <label htmlFor="signup-terms" className="flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer">
                  <input {...register("acceptTerms")} id="signup-terms" type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" disabled={isLoading} />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms" target="_blank" className="text-violet-400 hover:text-violet-300 underline">Terms of Use</Link>{" "}
                    and{" "}
                    <Link href="/privacy" target="_blank" className="text-violet-400 hover:text-violet-300 underline">Privacy Policy</Link>,
                    and consent to Bonito using my details to provide its services.
                  </span>
                </label>
                {errors.acceptTerms && <p className="text-xs !text-red-400 mt-1">{errors.acceptTerms.message}</p>}
              </div>

              <label htmlFor="signup-alerts" className="flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer">
                <input {...register("projectAlerts")} id="signup-alerts" type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" disabled={isLoading} />
                <span>
                  Optional: send me a WhatsApp message when my designer replies and I haven&apos;t seen it. You can change this any time in Settings.
                </span>
              </label>

              {referral ? (
                <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 px-3 py-2">
                  🎁 Invited by {referral.firstName || "a friend"} ({referral.code}){referral.reward ? ` — you get ${referral.reward}` : ""}.
                </p>
              ) : showRefInput ? (
                <div className="flex gap-2">
                  <input value={refInput} onChange={(e) => setRefInput(e.target.value.slice(0, 20))} placeholder="BON-XXXXXX" aria-label="Referral code" className="flex-1 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs font-mono uppercase" />
                  <button type="button" onClick={() => checkCode(refInput)} className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-200">Apply</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowRefInput(true)} className="text-xs text-violet-300 hover:underline">Have a referral code?</button>
              )}

              <button
                type="submit"
                id="signup-submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-60 text-white font-semibold text-sm transition-all"
              >
                {isLoading ? "Creating account..." : "Create account"}
              </button>

              <p className="text-center text-sm">
                Already have an account?{" "}
                <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium">Sign in</Link>
              </p>
              <p className="text-center text-xs">Bonito team members get their account from an admin.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
