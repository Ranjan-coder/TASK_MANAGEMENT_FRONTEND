"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Bell,
  Settings,
  ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Tasks", href: "/tasks", icon: CheckSquare },
    {
      label: "Users",
      href: "/users",
      icon: Users,
      roles: ["admin", "superadmin"]
    },
    { label: "Notifications", href: "/notifications", icon: Bell },
    {
      label: "Audit Logs",
      href: "/audit-logs",
      icon: ShieldAlert,
      roles: ["superadmin"]
    },
    { label: "Settings", href: "/settings", icon: Settings }
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col h-full shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-violet-600/30">
            T
          </div>
          <div>
            <span className="font-bold text-base text-white tracking-tight block">TaskManager</span>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Enterprise Hub</span>
          </div>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => !item.roles || (user && item.roles.includes(user.role)))
          .map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-violet-600/15 text-violet-400 border border-violet-500/30 font-semibold shadow-sm shadow-violet-500/10"
                    : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-violet-400" : "text-slate-400")} />
                {item.label}
              </Link>
            );
          })}
      </div>

      {/* User Info & Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/60">
        <Link href="/settings" className="flex items-center gap-3 group hover:opacity-90 transition">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user?.name || "Avatar"}
              className="h-9 w-9 rounded-xl object-cover border border-violet-500/40 ring-1 ring-violet-500/30"
            />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 border border-violet-500/30 flex items-center justify-center font-bold text-xs uppercase text-white shadow-sm">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200 group-hover:text-violet-300 transition truncate">{user?.name || "User"}</p>
            <p className="text-xs text-slate-400 capitalize truncate">
              {user?.role || "Staff"} {user?.department ? `· ${user.department}` : ""}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
