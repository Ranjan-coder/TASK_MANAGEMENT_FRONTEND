"use client";

import { useNotifications } from "@/hooks/useNotifications";
import { formatDateTime } from "@/lib/utils";
import { CheckCheck, BellOff, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const handleNotificationClick = (n: any) => {
    if (!n.isRead) {
      markAsRead(n._id);
    }
    onClose();
    if (n.relatedTask?._id || n.relatedTask) {
      const taskId = typeof n.relatedTask === "object" ? n.relatedTask._id : n.relatedTask;
      router.push(`/tasks/${taskId}`);
    } else if (n.actionUrl) {
      router.push(n.actionUrl);
    }
  };

  return (
    <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Header */}
      <div className="p-3.5 px-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-xs text-white">Notifications</h4>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-violet-600/30 border border-violet-500/40 text-violet-300 text-[10px] font-semibold">
              {unreadCount} new
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllAsRead()}
            className="text-[11px] text-violet-400 hover:text-violet-300 font-medium transition flex items-center gap-1 hover:underline"
          >
            <CheckCheck className="h-3 w-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 pr-0.5">
        {notifications.length === 0 ? (
          <div className="py-10 px-4 text-center text-xs text-slate-400 space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-500">
              <BellOff className="h-5 w-5" />
            </div>
            <p className="font-medium text-slate-300">All caught up!</p>
            <p className="text-[11px] text-slate-500">You have no unread notifications.</p>
          </div>
        ) : (
          notifications.slice(0, 8).map((n) => {
            const isUnread = !n.isRead;
            return (
              <div
                key={n._id}
                onClick={() => handleNotificationClick(n)}
                className={`p-3 px-4 text-xs space-y-1 cursor-pointer transition-all duration-150 relative group ${
                  isUnread
                    ? "bg-violet-600/10 hover:bg-violet-600/15"
                    : "hover:bg-slate-800/50 opacity-80 hover:opacity-100"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0 shadow-sm shadow-violet-400/50" />
                    )}
                    <span className={`font-semibold truncate ${isUnread ? "text-white font-bold" : "text-slate-300"}`}>
                      {n.title}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0 whitespace-nowrap">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>

                <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed pl-4">
                  {n.message}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Footer / View All Link */}
      <div className="p-2.5 border-t border-slate-800/80 bg-slate-950/60 text-center">
        <Link
          href="/notifications"
          onClick={onClose}
          className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition flex items-center justify-center gap-1.5 py-1"
        >
          <span>View all notifications</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
