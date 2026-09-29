"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Palmtree } from "lucide-react";
import { toast } from "sonner";
import { usersApi } from "@/lib/api/users.api";
import { useAuthStore } from "@/store/authStore";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";

/** Staff leave switch: while on leave, customer-reply reminders go to the backup designer. */
export function LeaveStatus() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const current = user?.availability;
  const activeLeave = current?.status === "on_leave" && (!current.until || new Date(current.until) > new Date());
  const [until, setUntil] = useState(current?.until ? current.until.slice(0, 10) : "");

  const save = useMutation({
    mutationFn: (onLeave: boolean) =>
      usersApi.updateProfile({
        availability: onLeave
          ? // End of the chosen day in IST
            { status: "on_leave", until: until ? new Date(`${until}T23:59:59+05:30`).toISOString() : null }
          : { status: "available", until: null }
      }),
    onSuccess: (r, onLeave) => {
      setUser(r.data.data);
      toast.success(onLeave ? "Marked as on leave" : "Welcome back — you're available");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't update your status"))
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="pt-6 border-t border-slate-800">
      <h2 className="text-base font-semibold text-white flex items-center gap-2">
        <Palmtree className="h-4 w-4 text-emerald-300" /> Leave
      </h2>
      <p className="text-xs text-slate-400 mt-1">
        While you're on leave, reminders about waiting customers go to your project's backup designer.
      </p>
      {activeLeave ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs">
            On leave{current?.until ? ` until ${new Date(current.until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
          </span>
          <button
            type="button"
            onClick={() => save.mutate(false)}
            disabled={save.isPending}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-50"
          >
            I'm back
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-300">
            Back after (optional)
            <input
              type="date"
              min={today}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="block mt-1 px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>
          <button
            type="button"
            onClick={() => save.mutate(true)}
            disabled={save.isPending}
            className="px-3 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-medium disabled:opacity-50"
          >
            Mark me on leave
          </button>
        </div>
      )}
    </div>
  );
}
