"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../../../lib/api/users.api";
import type { CreateUserPayload } from "../../../lib/api/users.api";
import type { User } from "../../../types";
import { useAuthStore } from "../../../store/authStore";
import Link from "next/link";

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  admin: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  user: "bg-slate-500/20 text-slate-300 border-slate-500/30"
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-slate-500/20 text-slate-400",
  suspended: "bg-red-500/20 text-red-400"
};

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserPayload>({ name: "", email: "", password: "", role: "user", department: "", designation: "" });
  const [createError, setCreateError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["users", search, roleFilter, statusFilter],
    queryFn: () =>
      usersApi.getUsers({ search, role: roleFilter || undefined, status: statusFilter || undefined })
        .then((r) => r.data)
  });

  const users: User[] = data?.data ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => usersApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) => usersApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowCreateModal(false);
      setCreateForm({ name: "", email: "", password: "", role: "user", department: "", designation: "" });
    },
    onError: (err: unknown) => {
      setCreateError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create user");
    }
  });

  const isSuperAdmin = currentUser?.role === "superadmin";

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data?.meta?.total ?? 0} total users</p>
        </div>
        <button
          id="create-user-btn"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all"
        >
          + New User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 w-52"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Roles</option>
          <option value="superadmin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">{[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-800" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/40">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr className="text-slate-500">
                <th className="text-left px-5 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Department</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Last Login</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          alt={u.name}
                          className="w-8 h-8 rounded-full object-cover border border-violet-500/30 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-violet-700 flex items-center justify-center text-sm text-white font-medium flex-shrink-0">
                          {u.name?.[0]}
                        </div>
                      )}
                      <div>
                        <Link href={`/users/${u._id}`} className="text-slate-200 font-medium hover:text-violet-400 transition-colors">
                          {u.name}
                        </Link>
                        <p className="text-slate-500 text-xs">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-400 hidden md:table-cell">{u.department ?? "—"}</td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${ROLE_BADGE[u.role] ?? ""}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_BADGE[u.status] ?? ""}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-500 text-xs hidden lg:table-cell">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {u.status === "active" ? (
                        <button
                          onClick={() => statusMutation.mutate({ id: u._id, status: "suspended" })}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          disabled={!isSuperAdmin && u.role !== "user"}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => statusMutation.mutate({ id: u._id, status: "active" })}
                          className="text-xs text-green-400 hover:text-green-300 transition-colors"
                        >
                          Activate
                        </button>
                      )}
                      <Link href={`/users/${u._id}`} className="text-xs text-slate-500 hover:text-violet-400 transition-colors">
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12 text-slate-500">No users found</div>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-5">Create New User</h2>
            {createError && <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{createError}</div>}
            <div className="space-y-4">
              {(["name", "email", "password"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5 capitalize">{field}</label>
                  <input
                    id={`create-user-${field}`}
                    type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                    required
                    value={createForm[field]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as CreateUserPayload["role"] }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="user">User</option>
                    {isSuperAdmin && <option value="admin">Admin</option>}
                    {isSuperAdmin && <option value="superadmin">Super Admin</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Department</label>
                  <input
                    value={createForm.department}
                    onChange={(e) => setCreateForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 transition text-sm">
                Cancel
              </button>
              <button
                id="confirm-create-user"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate(createForm)}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition text-sm disabled:opacity-60"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
