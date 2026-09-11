"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../../../lib/api/dashboard.api";

const ACTION_COLORS: Record<string, string> = {
  user_created: "bg-green-500/20 text-green-400",
  user_deleted: "bg-red-500/20 text-red-400",
  user_role_changed: "bg-violet-500/20 text-violet-400",
  user_status_changed: "bg-amber-500/20 text-amber-400",
  user_login: "bg-blue-500/20 text-blue-400",
  task_created: "bg-green-500/20 text-green-400",
  task_deleted: "bg-red-500/20 text-red-400",
  "2fa_enabled": "bg-emerald-500/20 text-emerald-400",
  "2fa_disabled": "bg-orange-500/20 text-orange-400",
  password_reset_completed: "bg-amber-500/20 text-amber-400",
  all_sessions_revoked: "bg-red-500/20 text-red-400"
};

interface AuditLog {
  _id: string;
  action: string;
  actor?: { name: string; email: string; role: string };
  targetType: string;
  targetId: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, actionFilter, targetTypeFilter],
    queryFn: () =>
      dashboardApi
        .getAuditLogs({ page, limit: 25, action: actionFilter || undefined, targetType: targetTypeFilter || undefined })
        .then((r) => r.data)
  });

  const logs: AuditLog[] = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
        <p className="text-slate-400 text-sm mt-0.5">Tamper-evident log of all sensitive system actions</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Actions</option>
          <option value="user_login">User Login</option>
          <option value="user_created">User Created</option>
          <option value="user_deleted">User Deleted</option>
          <option value="user_role_changed">Role Changed</option>
          <option value="user_status_changed">Status Changed</option>
          <option value="task_created">Task Created</option>
          <option value="task_deleted">Task Deleted</option>
          <option value="2fa_enabled">2FA Enabled</option>
          <option value="2fa_disabled">2FA Disabled</option>
          <option value="password_reset_completed">Password Reset</option>
          <option value="all_sessions_revoked">Sessions Revoked</option>
        </select>

        <select
          value={targetTypeFilter}
          onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Target Types</option>
          <option value="User">User</option>
          <option value="Task">Task</option>
          <option value="Comment">Comment</option>
        </select>

        {(actionFilter || targetTypeFilter) && (
          <button onClick={() => { setActionFilter(""); setTargetTypeFilter(""); setPage(1); }} className="text-slate-400 hover:text-white text-sm">
            Clear ✕
          </button>
        )}

        <span className="ml-auto text-slate-500 text-sm self-center">{meta.total ?? 0} total events</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">{[...Array(8)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-slate-800" />)}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 border border-slate-800 rounded-2xl bg-slate-800/20">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-slate-500">No audit events found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/40">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr className="text-slate-500">
                <th className="text-left px-5 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Actor</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Target</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">IP Address</th>
                <th className="text-left px-4 py-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {logs.map((log) => (
                <tr key={log._id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ACTION_COLORS[log.action] ?? "bg-slate-600/30 text-slate-400"}`}>
                      {log.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 hidden sm:table-cell">
                    {log.actor ? (
                      <div>
                        <p className="text-slate-300 text-xs font-medium">{log.actor.name}</p>
                        <p className="text-slate-600 text-xs">{log.actor.email}</p>
                      </div>
                    ) : (
                      <span className="text-slate-600 text-xs">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <span className="text-slate-400 text-xs">{log.targetType}</span>
                    <p className="text-slate-600 text-xs truncate max-w-24">{String(log.targetId)}</p>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs hidden lg:table-cell">{log.ipAddress ?? "—"}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleDateString()}{" "}
                    <span className="text-slate-600">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40 text-sm transition"
          >
            ← Prev
          </button>
          <span className="px-4 py-2 text-slate-400 text-sm">
            Page {page} of {meta.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(p + 1, meta.pages))}
            disabled={page === meta.pages}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40 text-sm transition"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
