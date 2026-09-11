"use client";

import { useState } from "react";
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
import { ApiResponse, User } from "@/types";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
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
      const res = await apiClient.post<ApiResponse<{ requires2FA?: boolean; tempToken?: string; user?: User }>>(
        "/auth/login",
        data
      );

      if (res.data.data.requires2FA) {
        setRequires2FA(true);
        setTempToken(res.data.data.tempToken || "");
        toast.info("Two-Factor Authentication Required");
      } else if (res.data.data.user) {
        setUser(res.data.data.user);
        toast.success("Welcome back!");
        router.push("/dashboard");
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
      setUser(res.data.data.user);
      toast.success("2FA Verified Successfully");
      router.push("/dashboard");
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
          <CardTitle className="text-xl">Sign in to TaskManager</CardTitle>
          <CardDescription>
            {!requires2FA
              ? "Enter your organizational credentials to continue"
              : "Enter the 6-digit code from your authenticator app"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!requires2FA ? (
            <form onSubmit={handleSubmit(onLoginSubmit)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Work Email
                </label>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  {...register("email")}
                  disabled={isLoading}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Input
                  type="password"
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
                Back to email login
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
