"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  Search,
  Plus,
  ChevronDown,
  User,
  Settings,
  LogOut
} from "lucide-react";

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [imgError, setImgError] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute clean page title
  const getPageTitle = () => {
    if (pathname === "/dashboard") return "Dashboard";
    if (pathname === "/tasks/new") return "Create New Task";
    if (pathname.startsWith("/tasks/")) return "Task Details";
    if (pathname === "/tasks") return "Tasks";
    if (pathname === "/users") return "Team Members";
    if (pathname === "/notifications") return "Notifications";
    if (pathname === "/audit-logs") return "Audit Logs";
    if (pathname === "/settings") return "Settings";
    return "Workspace";
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/tasks?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/tasks");
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 select-none">
      {/* Left: Clean Page Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
          {getPageTitle()}
        </h1>
      </div>

      {/* Center: Global Search Bar */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
        <form onSubmit={handleSearchSubmit} className="relative w-full flex items-center">
          <button
            type="submit"
            title="Search tasks"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition"
          >
            <Search className="h-4 w-4" />
          </button>

          <input
            type="text"
            placeholder="Search tasks, categories, tags... (Press Enter)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-14 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition shadow-inner"
          />

          <button
            type="submit"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-700 transition"
          >
            Search
          </button>
        </form>
      </div>

      {/* Right: Quick Action + Notification Bell + Profile Menu */}
      <div className="flex items-center gap-3">
        {/* Quick New Task Button */}
        {isAdmin && pathname !== "/tasks/new" && (
          <Link
            href="/tasks/new"
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-semibold shadow-md shadow-violet-500/20 transition hover:shadow-violet-500/30"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Task</span>
          </Link>
        )}

        {/* Notification Bell */}
        <NotificationBell />

        <div className="h-5 w-px bg-slate-800" />

        {/* User Profile Trigger & Clean Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex items-center gap-2.5 p-1.5 rounded-xl border transition-all ${
              isMenuOpen
                ? "bg-slate-800 border-violet-500/50 ring-2 ring-violet-500/20 shadow-md"
                : "border-transparent hover:bg-slate-800/80 hover:border-slate-700/80"
            }`}
          >
            {/* Avatar with online status */}
            <div className="relative">
              {user?.avatarUrl && !imgError ? (
                <img
                  src={user.avatarUrl}
                  alt={user?.name || "User Avatar"}
                  onError={() => setImgError(true)}
                  className="w-8 h-8 rounded-xl object-cover border border-violet-500/30 ring-1 ring-violet-500/20 shadow-sm"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 border border-violet-500/30 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                  {user?.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
            </div>

            {/* Name + Chevron */}
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[110px] leading-tight">
                {user?.name || "User"}
              </span>
              <span className="text-[10px] text-slate-400 capitalize leading-tight mt-0.5">
                {user?.role || "Staff"}
              </span>
            </div>

            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                isMenuOpen ? "rotate-180 text-violet-400" : ""
              }`}
            />
          </button>

          {/* Clean Profile Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-slate-900/95 backdrop-blur-2xl border border-slate-800 shadow-2xl shadow-black/60 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Header Info */}
              <div className="px-3 py-2.5 border-b border-slate-800/80 mb-1">
                <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-600/20 text-violet-300 border border-violet-500/30 capitalize">
                    {user?.role || "user"}
                  </span>
                </div>
              </div>

              {/* Profile & Settings Link */}
              <div className="space-y-0.5">
                <Link
                  href="/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
                >
                  <Settings className="h-3.5 w-3.5 text-violet-400" />
                  <span>Profile & Settings</span>
                </Link>
              </div>

              {/* Sign Out Action */}
              <div className="border-t border-slate-800/80 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
