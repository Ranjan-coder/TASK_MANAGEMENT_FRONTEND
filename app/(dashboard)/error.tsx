"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * If one screen fails, only the content area shows this: the sidebar / top bar
 * keep working and "Try again" re-renders the screen in place (no page reload,
 * nothing else lost). Without it, one error took the whole app down.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Screen error:", error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center space-y-3">
      <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" aria-hidden />
      <h2 className="text-base font-semibold text-white">This screen ran into a problem</h2>
      <p className="text-sm text-slate-400">Your other work is safe. Try again, or go back to the start.</p>
      <div className="flex justify-center gap-2 pt-1">
        <button type="button" onClick={() => reset()} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium">
          Try again
        </button>
        <Link href="/" className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800">
          Go to start
        </Link>
      </div>
    </div>
  );
}
