"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, MessageSquare, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useChatStore } from "@/store/chatStore";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { cn, getInitials } from "@/lib/utils";

const TABS = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Chat", href: "/chat", icon: MessageSquare }
];

/**
 * Customer portal frame: two destinations only (Home, Chat).
 * Phones get a bottom tab bar; wider screens get tabs in the header.
 */
export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { totalUnread } = useChatStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const inConversation = pathname.startsWith("/chat/");

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100">
      <header className="h-14 md:h-16 shrink-0 border-b border-slate-800 bg-slate-900/90 backdrop-blur-xl px-4 md:px-6 flex items-center justify-between gap-4 z-30">
        <Link href="/home" className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-white font-black">
            B
          </span>
          <span className="font-bold tracking-tight text-white">Bonito</span>
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-1">
          {TABS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition",
                isActive(href) ? "bg-violet-600/15 text-violet-300" : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {href === "/chat" && totalUnread > 0 && (
                <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-xs font-semibold text-slate-200"
            >
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitials(user?.name)
              )}
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl p-1.5 z-50">
                <div className="px-3 py-2 border-b border-slate-800 mb-1">
                  <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                </div>
                <Link
                  role="menuitem"
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" /> Account settings
                </Link>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => logout()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-rose-400 hover:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 md:p-8 min-w-0">{children}</main>

      {/* Phone tab bar (hidden inside an open conversation to give the chat room) */}
      <nav
        aria-label="Main"
        className={cn(
          "md:hidden shrink-0 border-t border-slate-800 bg-slate-900 grid grid-cols-2 pb-[env(safe-area-inset-bottom)]",
          inConversation && "hidden"
        )}
      >
        {TABS.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium",
              isActive(href) ? "text-violet-300" : "text-slate-400"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
            {href === "/chat" && totalUnread > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
