"use client";

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationDropdown } from "./NotificationDropdown";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const bellContainerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        bellContainerRef.current &&
        !bellContainerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={bellContainerRef}>
      <button
        type="button"
        id="notification-bell-btn"
        aria-label="Open notifications"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative p-2 rounded-xl transition-all duration-200 border ${
          isOpen
            ? "bg-slate-800 border-violet-500/50 text-violet-300 ring-2 ring-violet-500/20 shadow-md"
            : "border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 hover:border-slate-700/60"
        }`}
      >
        <Bell className={`h-4.5 w-4.5 transition-transform duration-200 ${isOpen ? "scale-110 text-violet-400" : ""}`} />

        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-gradient-to-r from-rose-500 to-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-md shadow-rose-500/30 animate-pulse ring-2 ring-slate-900">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown onClose={() => setIsOpen(false)} />
      )}
    </div>
  );
}
