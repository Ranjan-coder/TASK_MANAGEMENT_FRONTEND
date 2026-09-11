"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "../../../lib/api/auth.api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md bg-slate-800/60 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Forgot Password</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Enter your email and we&apos;ll send a reset link
          </p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-white font-semibold text-lg mb-2">Check your inbox</h2>
            <p className="text-slate-400 text-sm mb-6">
              If <strong className="text-slate-300">{email}</strong> is registered, you&apos;ll receive a reset link within a few minutes.
            </p>
            <Link href="/login" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              id="forgot-password-submit"
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold transition-all duration-200"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <p className="text-center text-slate-500 text-sm">
              Remember your password?{" "}
              <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
