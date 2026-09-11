"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { ApiResponse, User, Role } from "@/types";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
  role: z.enum(["user", "admin", "superadmin"]),
  department: z.string().optional(),
  designation: z.string().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

const ROLES: { value: Role; label: string; desc: string; icon: string; color: string }[] = [
  {
    value: "user",
    label: "Team Member",
    desc: "Create & manage your assigned tasks",
    icon: "👤",
    color: "blue",
  },
  {
    value: "admin",
    label: "Admin",
    desc: "Manage users and oversee projects",
    icon: "🛡️",
    color: "violet",
  },
  {
    value: "superadmin",
    label: "Super Admin",
    desc: "Full system access and control",
    icon: "⚡",
    color: "amber",
  },
];

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>("user");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: "user" },
  });

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setValue("role", role);
  };

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      // Register
      await apiClient.post<ApiResponse<User>>("/auth/register", {
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        department: data.department || undefined,
        designation: data.designation || undefined,
      });

      // Auto-login after registration
      const loginRes = await apiClient.post<ApiResponse<{ user: User; requires2FA?: boolean; tempToken?: string }>>("/auth/login", {
        email: data.email,
        password: data.password,
      });

      if (loginRes.data.data.requires2FA) {
        toast.success("Account created! Please verify your 2FA.");
        router.push("/login");
        return;
      }

      if (loginRes.data.data.user) {
        setUser(loginRes.data.data.user);
        toast.success(`Welcome, ${data.name}! Your account is ready.`);
        router.push("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-500/30 mb-3">
            <span className="text-white font-black text-2xl">T</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create your account</h1>
          <p className="text-slate-400 text-sm mt-1">Join TaskManager and start collaborating</p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-6 shadow-2xl space-y-5">

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select your role
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => {
                const isSelected = selectedRole === r.value;
                const colorMap: Record<string, string> = {
                  blue: isSelected ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30" : "border-slate-700 hover:border-blue-500/50",
                  violet: isSelected ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30" : "border-slate-700 hover:border-violet-500/50",
                  amber: isSelected ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30" : "border-slate-700 hover:border-amber-500/50",
                };
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => handleRoleSelect(r.value)}
                    className={`relative flex flex-col items-center text-center p-3 rounded-xl border transition-all duration-200 cursor-pointer ${colorMap[r.color]}`}
                  >
                    <span className="text-2xl mb-1">{r.icon}</span>
                    <span className="text-xs font-semibold text-white leading-tight">{r.label}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{r.desc}</span>
                  </button>
                );
              })}
            </div>
            {errors.role && <p className="text-xs text-red-400 mt-1">{errors.role.message}</p>}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
              <input
                {...register("name")}
                id="signup-name"
                type="text"
                placeholder="John Doe"
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-sm disabled:opacity-60"
              />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Work Email</label>
              <input
                {...register("email")}
                id="signup-email"
                type="email"
                placeholder="you@company.com"
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-sm disabled:opacity-60"
              />
              {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
            </div>

            {/* Department + Designation */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Department <span className="text-slate-500">(optional)</span></label>
                <input
                  {...register("department")}
                  id="signup-department"
                  type="text"
                  placeholder="Engineering"
                  disabled={isLoading}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-sm disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Designation <span className="text-slate-500">(optional)</span></label>
                <input
                  {...register("designation")}
                  id="signup-designation"
                  type="text"
                  placeholder="Developer"
                  disabled={isLoading}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-sm disabled:opacity-60"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  {...register("password")}
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-sm disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  id="signup-confirm-password"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Re-enter your password"
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-sm disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  tabIndex={-1}
                >
                  {showConfirm ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword.message}</p>}
            </div>

            <button
              type="submit"
              id="signup-submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-60 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Creating account...
                </span>
              ) : "Create Account"}
            </button>

            <p className="text-center text-slate-500 text-sm">
              Already have an account?{" "}
              <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
