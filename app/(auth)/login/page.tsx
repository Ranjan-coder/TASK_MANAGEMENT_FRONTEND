"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { homeRouteFor } from "@/lib/utils";
import { ApiResponse, User } from "@/types";
import { PhoneVerification } from "@/components/auth/PhoneVerification";
import { prepareLogin, finishSignIn } from "@/lib/auth/credentials";
import { isValidIndianMobile, type PhoneVerificationStep, type VerifiedSession } from "@/lib/api/customerAuth.api";

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email or mobile number")
    .refine((v) => (v.includes("@") ? z.string().email().safeParse(v).success : isValidIndianMobile(v)), {
      message: "Enter a valid email or 10-digit mobile number"
    }),
  password: z.string().min(1, "Password is required")
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [phoneStep, setPhoneStep] = useState<PhoneVerificationStep | null>(null);
  // Derived from the password at submit; opens the chat key bundle once signed in
  const wrapKeyRef = useRef<CryptoKey | null>(null);
  const [trustDevice, setTrustDevice] = useState(true);

  /** Signed in: store the user, unlock chat keys on this device, go home. */
  const completeSignIn = async (signedIn: User, message: string) => {
    setUser(signedIn);
    if (wrapKeyRef.current) await finishSignIn(signedIn._id, wrapKeyRef.current);
    wrapKeyRef.current = null;
    toast.success(message);
    router.push(homeRouteFor(signedIn));
  };

  const handlePhoneVerified = (session: VerifiedSession) => {
    setPhoneStep(null);
    if (session.requires2FA) {
      setRequires2FA(true);
      setTempToken(session.tempToken || "");
      return;
    }
    if (session.user) {
      completeSignIn(session.user, "Mobile number verified. Welcome!");
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });

  const onLoginSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      // The password never leaves the browser: derive the login key from it
      const { body, wrapKey } = await prepareLogin(data.identifier.trim(), data.password, trustDevice);
      wrapKeyRef.current = wrapKey;
      const res = await apiClient.post<
        ApiResponse<{ requires2FA?: boolean; tempToken?: string; user?: User } & Partial<PhoneVerificationStep>>
      >("/auth/login", body);

      if (res.data.data.requiresPhoneVerification) {
        setPhoneStep(res.data.data as PhoneVerificationStep);
      } else if (res.data.data.requires2FA) {
        setRequires2FA(true);
        setTempToken(res.data.data.tempToken || "");
        toast.info("Two-Factor Authentication Required");
      } else if (res.data.data.user) {
        await completeSignIn(res.data.data.user, "Welcome back!");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Invalid credentials");
    } finally {
      setIsLoading(false);
    }
  };

  const onVerify2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode || twoFactorCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.post<ApiResponse<{ user: User }>>("/auth/2fa/verify", {
        tempToken,
        code: twoFactorCode
      });
      await completeSignIn(res.data.data.user, "2FA Verified Successfully");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Invalid 2FA code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-md shadow-lg border-slate-200 dark:border-slate-800">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl mb-2">
            T
          </div>
          <CardTitle className="text-xl">Sign in to Bonito</CardTitle>
          <CardDescription>
            {phoneStep
              ? "Verify your mobile number to continue"
              : !requires2FA
                ? "Use your email or mobile number to continue"
                : "Enter the 6-digit code from your authenticator app"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {phoneStep ? (
            <PhoneVerification step={phoneStep} onVerified={handlePhoneVerified} onCancel={() => setPhoneStep(null)} />
          ) : !requires2FA ? (
            <form onSubmit={handleSubmit(onLoginSubmit)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email or mobile number
                </label>
                <Input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="you@example.com or 98765 43210"
                  {...register("identifier")}
                  disabled={isLoading}
                />
                {errors.identifier && <p className="text-xs text-red-500">{errors.identifier.message}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                  disabled={isLoading}
                />
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
                <div className="flex justify-end pt-1">
                  <Link
                    href="/forgot-password"
                    className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <label htmlFor="login-trust" className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  id="login-trust"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  disabled={isLoading}
                />
                <span>
                  Keep me signed in on this device
                  <span className="block text-[11px] text-slate-500">Untick on shared or office computers.</span>
                </span>
              </label>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-1">
                Don&apos;t have an account?{" "}
                <a href="/signup" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors">
                  Create account
                </a>
              </p>
            </form>
          ) : (
            <form onSubmit={onVerify2FASubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Authenticator Code
                </label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  className="text-center text-lg tracking-widest font-mono"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))}
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Verify Code"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs"
                onClick={() => setRequires2FA(false)}
              >
                Back to sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
