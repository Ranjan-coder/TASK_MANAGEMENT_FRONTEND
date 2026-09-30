"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../../../lib/api/users.api";
import type { CreateUserPayload } from "../../../lib/api/users.api";
import type { User } from "../../../types";
import { useAuthStore } from "../../../store/authStore";
import Link from "next/link";
import { OrgFields, type OrgValue } from "@/components/shared/OrgFields";
import { useDepartments, useDesignations } from "@/hooks/useOrg";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/types";

const EMPTY_FORM: CreateUserPayload = { name: "", email: "", password: "", role: "user", departmentId: null, designationId: null, reportsTo: null };
const ADMIN_CREATABLE: Role[] = ["user", "marketing", "customer"];

/** Waits until typing pauses before searching (one request, not one per key). */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  admin: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  marketing: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  user: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  leadership: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  customer: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
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
  const [deptFilter, setDeptFilter] = useState("");
  const [desigFilter, setDesigFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserPayload>(EMPTY_FORM);
  // Once the admin picks a role themselves, a designation no longer changes it
  const [roleTouched, setRoleTouched] = useState(false);
  const [createError, setCreateError] = useState("");
  const debouncedSearch = useDebounced(search);
  const { departments } = useDepartments();
  const { designations } = useDesignations();

  const { data, isLoading } = useQuery({
    queryKey: ["users", debouncedSearch, roleFilter, statusFilter, deptFilter, desigFilter],
    queryFn: () =>
      usersApi
        .getUsers({
          search: debouncedSearch,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          departmentId: deptFilter || undefined,
          designationId: desigFilter || undefined
        })
        .then((r) => r.data),
    placeholderData: (prev) => prev // keep the table while the next page loads
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
      setCreateForm(EMPTY_FORM);
      setRoleTouched(false);
      setCreateError("");
    },
    onError: (err: unknown) => {
      setCreateError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create user");
    }
  });

  const isSuperAdmin = currentUser?.role === "superadmin";
  const creatableRoles: Role[] = isSuperAdmin ? ["user", "marketing", "customer", "leadership", "admin", "superadmin"] : ADMIN_CREATABLE;
  const isCustomerForm = createForm.role === "customer";

  // A designation suggests a role (D4: it never grants access by itself); the admin can change it
  const suggestRole = (role: Role) => {
    if (!roleTouched && creatableRoles.includes(role)) setCreateForm((f) => ({ ...f, role }));
  };

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
          <option value="marketing">Marketing</option>
          <option value="user">Staff</option>
          <option value="leadership">Leadership</option>
          <option value="customer">Customer</option>
        </select>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          aria-label="Filter by department"
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 max-w-[12rem]"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>
        <select
          value={desigFilter}
          onChange={(e) => setDesigFilter(e.target.value)}
          aria-label="Filter by designation"
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 max-w-[12rem]"
        >
          <option value="">All Designations</option>
          {designations.map((g) => (
            <option key={g._id} value={g._id}>{g.short ? `${g.name} (${g.short})` : g.name}</option>
          ))}
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
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Department · Designation</th>
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
                  <td className="px-4 py-4 hidden md:table-cell">
                    <p className="text-slate-300">{u.department || "—"}</p>
                    {u.designation && <p className="text-slate-500 text-xs">{u.designation}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${ROLE_BADGE[u.role] ?? ""}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
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
                          disabled={!isSuperAdmin && !["user", "marketing", "customer"].includes(u.role)}
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
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
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
              {!isCustomerForm && (
                <OrgFields
                  value={{ departmentId: createForm.departmentId ?? null, designationId: createForm.designationId ?? null, reportsTo: createForm.reportsTo ?? null }}
                  onChange={(patch: Partial<OrgValue>) => setCreateForm((f) => ({ ...f, ...patch }))}
                  onSuggestRole={suggestRole}
                />
              )}
              <div>
                <label htmlFor="create-user-role" className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                <select
                  id="create-user-role"
                  value={createForm.role}
                  onChange={(e) => {
                    setRoleTouched(true);
                    const role = e.target.value as Role;
                    // Customers have no department, designation or manager
                    setCreateForm((f) => ({ ...f, role, ...(role === "customer" && { departmentId: null, designationId: null, reportsTo: null }) }));
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {creatableRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1.5">
                  The role decides what they can do in the app. Picking a designation suggests one — check it before creating.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowCreateModal(false); setCreateError(""); }} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 transition text-sm">
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
