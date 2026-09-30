"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Users as UsersIcon } from "lucide-react";
import { usersApi } from "../../../../lib/api/users.api";
import { tasksApi } from "../../../../lib/api/tasks.api";
import { orgApi } from "@/lib/api/org.api";
import { useAuthStore } from "../../../../store/authStore";
import { OrgFields, type OrgValue } from "@/components/shared/OrgFields";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Permission, User } from "@/types";

const errMsg = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const idOf = (v: User["reportsTo"]) => (!v ? null : typeof v === "string" ? v : v._id);
const ROLE_ORDER = ["customer", "user", "marketing", "leadership", "admin", "superadmin"] as const;

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.userId as string;
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isSuperAdmin = currentUser?.role === "superadmin";

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["user", userId],
    queryFn: () => usersApi.getUser(userId).then((r) => r.data.data)
  });

  const { data: userTasks } = useQuery({
    queryKey: ["user-tasks", userId],
    queryFn: () => tasksApi.getTasks({ assignedTo: userId, limit: 10 }).then((r) => r.data.data)
  });

  const isStaff = user && user.role !== "customer";
  const { data: team } = useQuery({
    queryKey: ["org", "team", userId],
    queryFn: () => orgApi.team(userId),
    enabled: Boolean(isStaff)
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [org, setOrg] = useState<OrgValue>({ departmentId: null, designationId: null, reportsTo: null });

  const startEdit = () => {
    if (!user) return;
    setName(user.name);
    setOrg({ departmentId: user.departmentId ?? null, designationId: user.designationId ?? null, reportsTo: idOf(user.reportsTo) });
    setEditing(true);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["user", userId] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["org"] });
  };

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("No user");
      // Send only what changed (the API checks each field's rules)
      const body: Record<string, unknown> = {};
      if (name !== user.name) body.name = name;
      if (user.role !== "customer") {
        if (org.departmentId !== (user.departmentId ?? null)) body.departmentId = org.departmentId;
        if (org.designationId !== (user.designationId ?? null)) body.designationId = org.designationId;
        if (org.reportsTo !== idOf(user.reportsTo)) body.reportsTo = org.reportsTo;
      }
      return usersApi.updateUser(userId, body);
    },
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast.success("Saved");
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't save"))
  });

  const roleMutation = useMutation({
    mutationFn: (role: string) => usersApi.updateRole(userId, role),
    onSuccess: () => {
      refresh();
      toast.success("Role changed — they've been signed out everywhere");
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't change the role"))
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-4"><div className="h-40 rounded-2xl bg-slate-800" /><div className="h-64 rounded-2xl bg-slate-800" /></div>;
  }
  if (!user) return <div className="text-slate-400">User not found.</div>;

  const manager = user.reportsTo && typeof user.reportsTo === "object" ? user.reportsTo : null;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Profile Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-700 flex items-center justify-center text-2xl text-white font-bold">
              {user.name?.[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{user.name}</h1>
              <p className="text-slate-400 text-sm">{user.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">{ROLE_LABELS[user.role] ?? user.role}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full ${user.status === "active" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{user.status}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => (editing ? setEditing(false) : startEdit())}
              className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 transition text-sm"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>

        {/* Edit Form */}
        {editing && (
          <div className="mt-5 pt-5 border-t border-slate-700 space-y-4">
            <div>
              <label htmlFor="edit-user-name" className="block text-xs font-medium text-slate-400 mb-1.5">Name</label>
              <input
                id="edit-user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {isStaff && (
              <OrgFields
                value={org}
                onChange={(patch) => setOrg((o) => ({ ...o, ...patch }))}
                excludeUserId={user._id}
                labelClass="block text-xs font-medium text-slate-400 mb-1.5"
              />
            )}
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition disabled:opacity-60"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
          {[
            { label: "Department", value: user.department || "—" },
            { label: "Designation", value: user.designation || "—" },
            {
              label: "Reports to",
              value: manager ? (
                <Link href={`/users/${manager._id}`} className="hover:text-violet-400">{manager.name}</Link>
              ) : (
                "—"
              )
            },
            { label: "Last Login", value: user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "Never" },
            { label: "Joined", value: new Date(user.createdAt).toLocaleDateString() }
          ].map((item) => (
            <div key={item.label}>
              <p className="text-slate-500 text-xs uppercase tracking-wider font-medium mb-1">{item.label}</p>
              <p className="text-slate-300 text-sm">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Role Change (superadmin only) */}
        {isSuperAdmin && user._id !== currentUser?._id && (
          <div className="mt-5 pt-5 border-t border-slate-700 flex flex-wrap items-center gap-2">
            <p className="text-slate-400 text-sm mr-1">Change Role:</p>
            {ROLE_ORDER.map((role) => (
              <button
                key={role}
                onClick={() => {
                  if (window.confirm(`Change ${user.name}'s role to ${ROLE_LABELS[role]}? They'll be signed out everywhere.`)) roleMutation.mutate(role);
                }}
                disabled={user.role === role || roleMutation.isPending}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${user.role === role ? "bg-violet-600 text-white" : "border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"}`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        )}
      </div>

      {isSuperAdmin && <PermissionsPanel user={user} onSaved={refresh} />}

      {/* Direct reports */}
      {isStaff && team && team.all.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-violet-400" /> Team
            <span className="text-xs font-normal text-slate-500">{team.direct.length} direct · {team.all.length} in total</span>
          </h2>
          <div className="divide-y divide-slate-700/60">
            {team.direct.map((p) => (
              <Link key={p._id} href={`/users/${p._id}`} className="py-2.5 flex items-center justify-between hover:text-violet-300">
                <span className="text-slate-300 text-sm">{p.name}</span>
                <span className="text-xs text-slate-500">
                  {[p.designation, p.department].filter(Boolean).join(" · ")}
                  {p.reportCount > 0 && ` · ${p.reportCount} reports`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Assigned Tasks */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Assigned Tasks</h2>
        {!userTasks || userTasks.length === 0 ? (
          <p className="text-slate-500 text-sm">No tasks assigned.</p>
        ) : (
          <div className="divide-y divide-slate-700/60">
            {userTasks.map((task: { _id: string; title: string; status: string; priority: string; dueDate?: string }) => (
              <div key={task._id} className="py-3 flex items-center justify-between">
                <p className="text-slate-300 text-sm truncate">{task.title}</p>
                <span className="text-xs text-slate-500 capitalize ml-4 flex-shrink-0">{task.status.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Superadmin: add-on permissions for one person (e.g. Finance confirms payments). */
function PermissionsPanel({ user, onSaved }: { user: User; onSaved: () => void }) {
  const { data: catalog } = useQuery({ queryKey: ["org", "permissions"], queryFn: orgApi.permissions, staleTime: 10 * 60 * 1000 });
  const [picked, setPicked] = useState<Set<Permission>>(new Set(user.permissions ?? []));
  useEffect(() => setPicked(new Set(user.permissions ?? [])), [user.permissions]);

  const save = useMutation({
    mutationFn: () => orgApi.setUserPermissions(user._id, [...picked]),
    onSuccess: () => {
      onSaved();
      toast.success("Permissions updated — they apply on their next click");
    },
    onError: (err) => toast.error(errMsg(err, "Couldn't update permissions"))
  });

  if (!catalog) return null;
  const grantable = catalog.grantableRoles.includes(user.role);
  const implied = new Set(catalog.implied[user.role] ?? []);
  const changed = [...picked].sort().join() !== [...(user.permissions ?? [])].sort().join();

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-violet-400" /> Extra permissions
      </h2>
      {!grantable ? (
        <p className="text-slate-500 text-sm">
          {user.role === "customer" ? "Customers can't be given staff permissions." : "Admins and superadmins already have every permission."}
        </p>
      ) : (
        <>
          <p className="text-slate-500 text-sm mb-4">
            Give one extra ability without a bigger role. Anyone with an extra permission must use two-factor sign-in.
          </p>
          <div className="space-y-2">
            {catalog.permissions.map((p) => {
              const fromRole = implied.has(p.key);
              return (
                <label key={p.key} className="flex items-start gap-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-violet-500"
                    checked={fromRole || picked.has(p.key)}
                    disabled={fromRole}
                    onChange={(e) =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(p.key);
                        else next.delete(p.key);
                        return next;
                      })
                    }
                  />
                  <span>
                    {p.label}
                    {fromRole && <span className="ml-2 text-xs text-slate-500">(included in {ROLE_LABELS[user.role]})</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <button
            onClick={() => save.mutate()}
            disabled={!changed || save.isPending}
            className="mt-4 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition disabled:opacity-40"
          >
            {save.isPending ? "Saving..." : "Save permissions"}
          </button>
        </>
      )}
    </div>
  );
}
