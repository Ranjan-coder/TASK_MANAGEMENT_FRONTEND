"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "../../../store/authStore";
import { dashboardApi } from "../../../lib/api/dashboard.api";
import {
  Sparkles,
  Smile,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  Layers,
  Plus,
  Coffee,
  Quote,
  Target,
  Zap,
  Award
} from "lucide-react";

const JOKES_AND_QUOTES = [
  {
    type: "Work Humor 😂",
    text: "Behind every successful project is a deadline that was quietly moved back twice.",
    author: "Modern Office Law"
  },
  {
    type: "Dev Wit 💻",
    text: "Why do programmers prefer dark mode? Because light attracts bugs.",
    author: "Dev Wisdom"
  },
  {
    type: "Motivation 🚀",
    text: "Success is the sum of small efforts, repeated day in and day out. Let's crush today's sprint!",
    author: "Robert Collier"
  },
  {
    type: "Coffee & Code ☕",
    text: "Coffee: because adulting without a caffeine buffer is a high-risk deployment to production.",
    author: "Senior Engineer"
  },
  {
    type: "Work Humor 😂",
    text: "My code didn't work, so I added a console.log. Now it works and I'm too terrified to remove it.",
    author: "Anonymous Coder"
  },
  {
    type: "Energy Boost ⚡",
    text: "Don't count the days, make the days count. Ship that feature and take the win!",
    author: "Muhammad Ali"
  },
  {
    type: "Design & UX 🎨",
    text: "A user interface is like a joke. If you have to explain it, it’s probably not that good.",
    author: "Martin LeBlanc"
  },
  {
    type: "Dev Wit 💻",
    text: "Git commit -m 'Fixed the bug that fixed the bug that created the original bug.'",
    author: "Git Chronicles"
  },
  {
    type: "Work Humor 😂",
    text: "Wi-Fi went down for 5 minutes today. I met my coworkers in the kitchen. They seem like nice people.",
    author: "Remote Worker"
  },
  {
    type: "Motivation 🚀",
    text: "The best way to predict the future is to build it. Start something legendary today!",
    author: "Peter Drucker"
  },
  {
    type: "Teamwork 🎯",
    text: "Nothing inspires agile velocity quite like the manager asking 'Can we demo this by 4 PM?'",
    author: "Scrum Legend"
  },
  {
    type: "Energy Boost ⚡",
    text: "Keep your code clean, your coffee hot, and your ambitions unstoppable!",
    author: "Daily Fuel"
  }
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  todo: { label: "To Do", color: "text-slate-300", bg: "bg-slate-500", border: "border-slate-700" },
  in_progress: { label: "In Progress", color: "text-blue-400", bg: "bg-blue-500", border: "border-blue-500/30" },
  in_review: { label: "In Review", color: "text-amber-400", bg: "bg-amber-500", border: "border-amber-500/30" },
  completed: { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-500", border: "border-emerald-500/30" },
  blocked: { label: "Blocked", color: "text-rose-400", bg: "bg-rose-500", border: "border-rose-500/30" },
  cancelled: { label: "Cancelled", color: "text-slate-500", bg: "bg-slate-600", border: "border-slate-800" }
};

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string; glow: string }> = {
  critical: { label: "Critical", bg: "bg-rose-500/15 border-rose-500/30", text: "text-rose-400", glow: "shadow-rose-500/10" },
  high: { label: "High", bg: "bg-orange-500/15 border-orange-500/30", text: "text-orange-400", glow: "shadow-orange-500/10" },
  medium: { label: "Medium", bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-400", glow: "shadow-amber-500/10" },
  low: { label: "Low", bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-400", glow: "shadow-emerald-500/10" }
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  // Pick random joke on initial load
  const [jokeIndex, setJokeIndex] = useState(0);
  const [isRotatingJoke, setIsRotatingJoke] = useState(false);

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * JOKES_AND_QUOTES.length);
    setJokeIndex(randomIndex);
  }, []);

  const handleNextJoke = () => {
    setIsRotatingJoke(true);
    setTimeout(() => {
      setJokeIndex((prev) => (prev + 1) % JOKES_AND_QUOTES.length);
      setIsRotatingJoke(false);
    }, 150);
  };

  const currentJoke = JOKES_AND_QUOTES[jokeIndex];

  // Dynamic time-based greeting
  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { text: "Good morning", icon: "🌅", tag: "Start strong today!" };
    if (hour >= 12 && hour < 17) return { text: "Good afternoon", icon: "☀️", tag: "Keep up the great momentum!" };
    if (hour >= 17 && hour < 22) return { text: "Good evening", icon: "🌆", tag: "Wrapping up today's goals!" };
    return { text: "Late night hustle", icon: "🌙", tag: "Remember to get some rest!" };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardApi.getSummary().then((r) => r.data.data)
  });

  const { data: teamData } = useQuery({
    queryKey: ["team-performance"],
    queryFn: () => dashboardApi.getTeamPerformance().then((r) => r.data.data),
    enabled: user?.role === "admin" || user?.role === "superadmin"
  });

  const statusBreakdown = data?.statusBreakdown ?? {};
  const priorityBreakdown = data?.priorityBreakdown ?? {};
  const overdueTasks = data?.overdueTasks ?? 0;
  const recentTasks = data?.recentTasks ?? [];

  const totalTasks = Object.values(statusBreakdown).reduce((a: number, b) => a + (b as number), 0);
  const completedTasks = statusBreakdown.completed ?? 0;
  const inProgressTasks = statusBreakdown.in_progress ?? 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl animate-pulse">
        <div className="h-40 rounded-3xl bg-slate-900/60 border border-slate-800" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-900/60 border border-slate-800" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl pb-20">
      {/* 🌟 Top Hero Greeting Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-violet-950/40 border border-slate-800/90 p-6 sm:p-8 shadow-2xl shadow-black/40">
        {/* Subtle Background Glows */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl sm:text-2xl">{timeGreeting.icon}</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {timeGreeting.tag}
              </span>
              {user?.department && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {user.department} Department
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {timeGreeting.text},{" "}
              <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-blue-400 bg-clip-text text-transparent">
                {user?.name || "Team Member"}
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
              Here is your operations summary for today. You have{" "}
              <span className="text-white font-semibold">{inProgressTasks} task{inProgressTasks === 1 ? "" : "s"} in progress</span> and{" "}
              <span className="text-emerald-400 font-semibold">{completionRate}% total completion rate</span>.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            {isAdmin && (
              <Link
                href="/tasks/new"
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>New Task</span>
              </Link>
            )}

            <Link
              href="/tasks"
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition flex items-center gap-2"
            >
              <span>Explore Tasks</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 😄 Daily Spark & Work Humor Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900/95 via-violet-950/20 to-slate-900/95 border border-violet-500/30 p-5 shadow-xl shadow-black/30 group">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400 shrink-0 shadow-inner">
              <Smile className="h-5 w-5" />
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {currentJoke.type}
                </span>
                <span className="text-slate-600 text-xs">•</span>
                <span className="text-[11px] text-slate-500 truncate">{currentJoke.author}</span>
              </div>

              <p
                className={`text-sm text-slate-200 font-medium italic transition-opacity duration-150 leading-relaxed ${
                  isRotatingJoke ? "opacity-30" : "opacity-100"
                }`}
              >
                "{currentJoke.text}"
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNextJoke}
            title="Get another quote or joke"
            className="self-end sm:self-center px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium transition flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRotatingJoke ? "animate-spin text-violet-400" : ""}`} />
            <span>Next Spark</span>
          </button>
        </div>
      </div>

      {/* 📊 KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tasks */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-5 shadow-xl shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Tasks</span>
            <div className="w-8 h-8 rounded-xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center text-violet-400 text-sm">
              📋
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3 tracking-tight">{totalTasks}</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
            <Layers className="h-3.5 w-3.5 text-violet-400" />
            <span>Across all active categories</span>
          </div>
        </div>

        {/* Completed Tasks */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-5 shadow-xl shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-sm">
              ✅
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3 tracking-tight">{completedTasks}</p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-2 font-medium">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{completionRate}% success rate</span>
          </div>
        </div>

        {/* In Progress */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-5 shadow-xl shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">In Progress</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 text-sm">
              ⚡
            </div>
          </div>
          <p className="text-3xl font-black text-white mt-3 tracking-tight">{inProgressTasks}</p>
          <div className="flex items-center gap-1.5 text-xs text-blue-400 mt-2 font-medium">
            <Zap className="h-3.5 w-3.5" />
            <span>Active in current sprint</span>
          </div>
        </div>

        {/* Overdue */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/80 p-5 shadow-xl shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overdue</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${overdueTasks > 0 ? "bg-rose-500/20 border border-rose-500/40 text-rose-400" : "bg-slate-800 border border-slate-700 text-slate-500"}`}>
              ⚠️
            </div>
          </div>
          <p className={`text-3xl font-black mt-3 tracking-tight ${overdueTasks > 0 ? "text-rose-400" : "text-white"}`}>
            {overdueTasks}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
            <AlertTriangle className={`h-3.5 w-3.5 ${overdueTasks > 0 ? "text-rose-400" : "text-slate-500"}`} />
            <span>{overdueTasks > 0 ? "Needs immediate action" : "All schedules on track"}</span>
          </div>
        </div>
      </div>

      {/* 📈 Charts & Distribution Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Status Breakdown (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Task Status Distribution</h2>
              <p className="text-xs text-slate-400 mt-0.5">Workflow stages across your organization</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
              {totalTasks} Tasks
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {Object.keys(STATUS_CONFIG).map((statusKey) => {
              const count = (statusBreakdown[statusKey] as number) ?? 0;
              const config = STATUS_CONFIG[statusKey];
              const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;

              return (
                <div key={statusKey} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${config.bg}`} />
                      <span className="text-slate-300">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{count}</span>
                      <span className="text-slate-600 text-[11px]">({pct}%)</span>
                    </div>
                  </div>

                  <div className="h-2 w-full bg-slate-950/80 rounded-full overflow-hidden border border-slate-800/80">
                    <div
                      className={`h-full ${config.bg} transition-all duration-700 rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority Matrix (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20 space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Priority Breakdown</h2>
              <Target className="h-4 w-4 text-violet-400" />
            </div>
            <p className="text-xs text-slate-400">Tasks categorized by urgency level</p>
          </div>

          <div className="grid grid-cols-2 gap-3 my-auto">
            {Object.keys(PRIORITY_CONFIG).map((pKey) => {
              const count = (priorityBreakdown[pKey] as number) ?? 0;
              const config = PRIORITY_CONFIG[pKey];

              return (
                <div
                  key={pKey}
                  className={`p-4 rounded-xl border ${config.bg} ${config.glow} shadow-sm space-y-1 transition hover:scale-[1.02]`}
                >
                  <p className={`text-xs font-bold uppercase tracking-wider ${config.text}`}>
                    {config.label}
                  </p>
                  <p className="text-2xl font-extrabold text-white">{count}</p>
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-400 shrink-0" />
            <span>High & Critical items take highest dispatch priority.</span>
          </div>
        </div>
      </div>

      {/* 📋 Recent Tasks Section */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Recent Activity & Tasks</h2>
            <p className="text-xs text-slate-400 mt-0.5">Recently updated items requiring review or execution</p>
          </div>

          <Link
            href="/tasks"
            className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentTasks.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 space-y-2">
            <p>No tasks created yet.</p>
            {isAdmin && (
              <Link
                href="/tasks/new"
                className="inline-block px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition"
              >
                Create your first task
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {recentTasks.map(
              (task: {
                _id: string;
                title: string;
                status: string;
                priority: string;
                dueDate?: string;
                category?: string;
              }) => {
                const priorityStyle = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
                const statusStyle = STATUS_CONFIG[task.status] || STATUS_CONFIG.todo;

                return (
                  <Link
                    key={task._id}
                    href={`/tasks/${task._id}`}
                    className="py-3.5 px-2 -mx-2 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/50 transition group"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-200 group-hover:text-violet-300 transition truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        {task.category && <span className="text-slate-400 font-medium">{task.category}</span>}
                        {task.category && <span>•</span>}
                        {task.dueDate ? (
                          <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                        ) : (
                          <span>No due date</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${priorityStyle.bg} ${priorityStyle.text} capitalize`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${statusStyle.border} bg-slate-950/60 ${statusStyle.color} capitalize flex items-center gap-1.5`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.bg}`} />
                        {statusStyle.label}
                      </span>
                    </div>
                  </Link>
                );
              }
            )}
          </div>
        )}
      </div>

      {/* 🏆 Team Performance Leaderboard (Admin & Superadmin only) */}
      {teamData && teamData.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Team Member Performance</h2>
              <p className="text-xs text-slate-400 mt-0.5">Task completion velocity and throughput metrics</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800/80 text-[11px] uppercase tracking-wider">
                  <th className="text-left pb-3 font-semibold">Team Member</th>
                  <th className="text-center pb-3 font-semibold">Total Assigned</th>
                  <th className="text-center pb-3 font-semibold">Completed</th>
                  <th className="text-center pb-3 font-semibold">Overdue</th>
                  <th className="text-right pb-3 font-semibold">Efficiency Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {teamData.map(
                  (member: {
                    userId: string;
                    name: string;
                    email: string;
                    total: number;
                    completed: number;
                    overdue: number;
                    completionRate: number;
                  }) => {
                    const isTop = member.completionRate >= 75;
                    const isMed = member.completionRate >= 40 && member.completionRate < 75;

                    return (
                      <tr key={member.userId} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-white font-bold text-[11px] shadow-sm">
                              {member.name?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div>
                              <p className="text-slate-200 font-semibold">{member.name}</p>
                              <p className="text-[11px] text-slate-500">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 text-center font-semibold text-slate-300">{member.total}</td>
                        <td className="py-3.5 text-center font-semibold text-emerald-400">{member.completed}</td>
                        <td
                          className={`py-3.5 text-center font-semibold ${
                            member.overdue > 0 ? "text-rose-400" : "text-slate-500"
                          }`}
                        >
                          {member.overdue}
                        </td>
                        <td className="py-3.5 text-right">
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md border ${
                              isTop
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : isMed
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                            }`}
                          >
                            {member.completionRate}%
                          </span>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
