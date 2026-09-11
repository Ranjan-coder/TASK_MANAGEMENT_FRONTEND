"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { usersApi } from "../../../../lib/api/users.api";
import { tasksApi } from "../../../../lib/api/tasks.api";
import { useAuthStore } from "../../../../store/authStore";

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.userId as string;
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isSuperAdmin = currentUser?.role === "superadmin";

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => usersApi.getUser(userId).then((r) => r.data.data)
  });

  const { data: userTasks } = useQuery({
    queryKey: ["user-tasks", userId],
    queryFn: () => tasksApi.getTasks({ assignedTo: userId, limit: 10 }).then((r) => r.data.data)
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", department: "", designation: "" });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => usersApi.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      setEditing(false);
    }
  });

  const roleMutation = useMutation({
    mutationFn: (role: string) => usersApi.updateRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user", userId] })
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-4"><div className="h-40 rounded-2xl bg-slate-800" /><div className="h-64 rounded-2xl bg-slate-800" /></div>;
  }
  if (!user) return <div className="text-slate-400">User not found.</div>;

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
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">{user.role}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full ${user.status === "active" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{user.status}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(!editing); setForm({ name: user.name, department: user.department ?? "", designation: user.designation ?? "" }); }}
              className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 transition text-sm"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>

        {/* Edit Form */}
        {editing && (
          <div className="mt-5 pt-5 border-t border-slate-700 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["name", "department", "designation"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 capitalize">{field}</label>
                  <input
                    value={form[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => updateMutation.mutate(form)}
              disabled={updateMutation.isPending}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition disabled:opacity-60"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          {[
            { label: "Department", value: user.department ?? "—" },
            { label: "Designation", value: user.designation ?? "—" },
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
        {isSuperAdmin && user._id !== currentUser._id && (
          <div className="mt-5 pt-5 border-t border-slate-700 flex items-center gap-3">
            <p className="text-slate-400 text-sm">Change Role:</p>
            {["user", "admin", "superadmin"].map((role) => (
              <button
                key={role}
                onClick={() => roleMutation.mutate(role)}
                disabled={user.role === role || roleMutation.isPending}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${user.role === role ? "bg-violet-600 text-white" : "border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"}`}
              >
                {role}
              </button>
            ))}
          </div>
        )}
      </div>

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
