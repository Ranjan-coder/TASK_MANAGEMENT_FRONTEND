"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { tasksApi } from "../../../../lib/api/tasks.api";
import type { CreateTaskPayload } from "../../../../lib/api/tasks.api";
import { usersApi } from "../../../../lib/api/users.api";
import {
  ArrowLeft,
  Calendar,
  Tag,
  Users as UsersIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers
} from "lucide-react";

const PRIORITIES = [
  { value: "low", label: "Low", color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500", icon: "🟢" },
  { value: "medium", label: "Medium", color: "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:border-amber-500", icon: "🟡" },
  { value: "high", label: "High", color: "border-orange-500/40 bg-orange-500/10 text-orange-400 hover:border-orange-500", icon: "🟠" },
  { value: "critical", label: "Critical", color: "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:border-rose-500", icon: "🔴" }
] as const;

const SUGGESTED_TAGS = ["Feature", "Bug", "Design", "Backend", "Frontend", "Urgent", "API", "Security", "DevOps"];
const SUGGESTED_CATEGORIES = ["Engineering", "Product", "Design", "Marketing", "Operations", "QA"];

export default function NewTaskPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as (typeof PRIORITIES)[number]["value"],
    dueDate: "",
    startDate: "",
    category: "Engineering",
    tags: "",
    assignedTo: [] as string[],
    watchers: [] as string[]
  });

  const [userSearch, setUserSearch] = useState("");
  const [error, setError] = useState("");

  const { data: usersData, isLoading: isUsersLoading } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => usersApi.getUsers({ limit: 100 }).then((r) => r.data.data)
  });
  const users: { _id: string; name: string; email: string; department?: string; designation?: string }[] =
    usersData ?? [];

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const query = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.department?.toLowerCase().includes(query)
    );
  }, [users, userSearch]);

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskPayload) => tasksApi.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      router.push("/tasks");
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "Failed to create task. Please verify inputs and try again.");
    }
  });

  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getTodayStr();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.title.trim()) {
      setError("Task title is required.");
      return;
    }

    if (form.startDate && form.startDate < todayStr) {
      setError("Start date cannot be earlier than today's date.");
      return;
    }

    if (form.dueDate && form.startDate && form.dueDate < form.startDate) {
      setError("Due date cannot be earlier than the start date.");
      return;
    }

    if (form.dueDate && !form.startDate && form.dueDate < todayStr) {
      setError("Due date cannot be earlier than today's date.");
      return;
    }

    createMutation.mutate({
      ...form,
      tags: form.tags
        ? form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
        : [],
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : "",
      startDate: form.startDate ? new Date(form.startDate).toISOString() : ""
    });
  };

  const toggleAssignee = (userId: string) => {
    setForm((f) => ({
      ...f,
      assignedTo: f.assignedTo.includes(userId)
        ? f.assignedTo.filter((id) => id !== userId)
        : [...f.assignedTo, userId]
    }));
  };

  const selectAllAssignees = () => {
    setForm((f) => ({
      ...f,
      assignedTo: filteredUsers.map((u) => u._id)
    }));
  };

  const clearAssignees = () => {
    setForm((f) => ({
      ...f,
      assignedTo: []
    }));
  };

  const addTag = (tag: string) => {
    const currentTags = form.tags
      ? form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      : [];
    if (!currentTags.includes(tag)) {
      setForm((f) => ({
        ...f,
        tags: [...currentTags, tag].join(", ")
      }));
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-24 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/tasks"
            className="h-9 w-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-700 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Create New Task</h1>
            <p className="text-xs text-slate-400 mt-0.5">Define specifications, assign team members, and set milestone dates</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold text-xs transition shadow-lg shadow-violet-500/20 disabled:opacity-60 flex items-center gap-2"
          >
            {createMutation.isPending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Create Task
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-rose-400 text-sm animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Primary Content (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Info Card */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl shadow-black/20">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Task Title <span className="text-violet-400">*</span>
              </label>
              <input
                id="task-title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Build multi-factor authentication endpoints"
                className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition text-sm font-medium"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Description & Specifications
                </label>
                <span className="text-[11px] text-slate-500">Markdown supported</span>
              </div>
              <textarea
                id="task-description"
                rows={6}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Provide detailed instructions, acceptance criteria, or context for the assignees..."
                className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition text-sm resize-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-violet-400" />
                Tags
              </label>
              <input
                id="task-tags"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="Type tags separated by commas..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs mb-2"
              />
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-slate-500 mr-1">Suggestions:</span>
                {SUGGESTED_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Metadata, Timing & Assignees (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Priority & Category Card */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-5 space-y-5 shadow-xl shadow-black/20">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
                Priority Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITIES.map((p) => {
                  const isSelected = form.priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, priority: p.value }))}
                      className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all ${isSelected
                          ? `${p.color} ring-1 ring-violet-500/40 shadow-sm font-semibold`
                          : "border-slate-800 bg-slate-950/40 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                        }`}
                    >
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                Category
              </label>
              <input
                id="task-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Engineering, Operations"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs mb-2"
              />
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border transition ${form.category === cat
                        ? "bg-violet-600/20 border-violet-500 text-violet-300 font-medium"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700/60"
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Configuration */}
            <div className="border-t border-slate-800/80 pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-violet-400" />
                    Start Date
                  </label>
                  <input
                    id="task-start-date"
                    type="date"
                    min={todayStr}
                    value={form.startDate}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setForm((f) => {
                        const updated = { ...f, startDate: newStart };
                        if (f.dueDate && newStart && f.dueDate < newStart) {
                          updated.dueDate = "";
                        }
                        return updated;
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    Due Date
                  </label>
                  <input
                    id="task-due-date"
                    type="date"
                    min={form.startDate || todayStr}
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Assignees Card */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-5 space-y-3.5 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <UsersIcon className="h-3.5 w-3.5 text-blue-400" />
                Assign Team Members ({form.assignedTo.length})
              </label>

              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllAssignees}
                  className="text-violet-400 hover:text-violet-300 font-medium transition"
                >
                  All
                </button>
                <span className="text-slate-700">•</span>
                <button
                  type="button"
                  onClick={clearAssignees}
                  className="text-slate-500 hover:text-slate-300 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Search Assignee */}
            <input
              type="text"
              placeholder="Search by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
            />

            {/* List */}
            {isUsersLoading ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading team members...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">No members match your search</div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {filteredUsers.map((u) => {
                  const isChecked = form.assignedTo.includes(u._id);
                  return (
                    <label
                      key={u._id}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${isChecked
                          ? "bg-violet-600/15 border-violet-500/40 text-white"
                          : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
                          {u.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate leading-tight">{u.name}</p>
                          <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                            {u.email} {u.department ? `· ${u.department}` : ""}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition shrink-0 ml-2 ${isChecked ? "bg-violet-600 border-violet-500 text-white" : "border-slate-700 bg-slate-900"
                          }`}
                      >
                        {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAssignee(u._id)}
                          className="sr-only"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
