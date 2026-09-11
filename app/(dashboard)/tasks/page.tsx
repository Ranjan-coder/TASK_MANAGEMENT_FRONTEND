"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { tasksApi } from "../../../lib/api/tasks.api";
import { useAuthStore } from "../../../store/authStore";
import { KanbanBoard } from "../../../components/tasks/KanbanBoard";
import type { Task, TaskStatus } from "../../../types";

const STATUS_OPTIONS = ["todo", "in_progress", "in_review", "completed", "blocked", "cancelled"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-500/20 text-slate-300",
  in_progress: "bg-blue-500/20 text-blue-300",
  in_review: "bg-amber-500/20 text-amber-300",
  completed: "bg-green-500/20 text-green-300",
  blocked: "bg-red-500/20 text-red-300",
  cancelled: "bg-slate-600/20 text-slate-400"
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-amber-500/20 text-amber-400",
  low: "bg-slate-500/20 text-slate-400"
};

/** Inner component — uses useSearchParams, so it must be inside <Suspense> */
function TasksContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";

  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [filters, setFilters] = useState({ status: "", priority: "", search: initialSearch });

  useEffect(() => {
    const currentParam = searchParams.get("search") || "";
    setFilters((f) => ({ ...f, search: currentParam }));
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", filters],
    queryFn: () =>
      tasksApi
        .getTasks({
          status: (filters.status as TaskStatus) || undefined,
          priority: filters.priority || undefined,
          search: filters.search || undefined
        })
        .then((r) => r.data)
  });

  const tasks: Task[] = data?.data ?? [];
  const meta = data?.meta ?? {};

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {meta.total ?? 0} tasks total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
            <button
              id="view-list"
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === "list" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              ☰ List
            </button>
            <button
              id="view-kanban"
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === "kanban" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              ▦ Kanban
            </button>
          </div>
          {isAdmin && (
            <Link
              id="create-task-btn"
              href="/tasks/new"
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all"
            >
              + New Task
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search tasks..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 w-56"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {(filters.status || filters.priority || filters.search) && (
          <button
            onClick={() => setFilters({ status: "", priority: "", search: "" })}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Clear filters ✕
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800/60" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 border border-slate-800 rounded-2xl bg-slate-800/20">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="text-white font-semibold text-lg">No tasks found</h3>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin ? "Create a new task to get started." : "You have no assigned tasks yet."}
          </p>
        </div>
      ) : view === "kanban" ? (
        <KanbanBoard tasks={tasks} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/40">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr className="text-slate-500">
                <th className="text-left px-5 py-3 font-medium">Task</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Priority</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Assignee(s)</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Due</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {tasks.map((task) => {
                const isOverdue =
                  task.dueDate &&
                  new Date(task.dueDate) < new Date() &&
                  !["completed", "cancelled"].includes(task.status);
                return (
                  <tr key={task._id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-4">
                      <Link href={`/tasks/${task._id}`} className="text-slate-200 font-medium hover:text-violet-400 transition-colors line-clamp-1">
                        {task.title}
                      </Link>
                      {task.category && (
                        <p className="text-slate-500 text-xs mt-0.5">{task.category}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[task.status] ?? "bg-slate-600/20 text-slate-400"}`}>
                        {task.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_BADGE[task.priority] ?? "bg-slate-600/20"}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <div className="flex -space-x-2">
                        {(task.assignedTo as { _id: string; name: string; avatarUrl?: string }[])?.slice(0, 3).map((u) => (
                          <div
                            key={u._id}
                            className="w-7 h-7 rounded-full bg-violet-600 border-2 border-slate-800 flex items-center justify-center text-xs text-white font-medium"
                            title={u.name}
                          >
                            {u.name?.[0]}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      {task.dueDate ? (
                        <span className={`text-xs ${isOverdue ? "text-red-400" : "text-slate-400"}`}>
                          {isOverdue && "⚠ "}
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link href={`/tasks/${task._id}`} className="text-slate-500 hover:text-violet-400 transition-colors text-xs">
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Page export — wraps the inner component in <Suspense> to satisfy Next.js 14
 *  App Router requirement for useSearchParams(). */
export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="space-y-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-800/60" />
        ))}
      </div>
    }>
      <TasksContent />
    </Suspense>
  );
}
