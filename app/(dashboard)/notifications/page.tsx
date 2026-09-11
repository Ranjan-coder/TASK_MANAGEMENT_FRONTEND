"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "../../../lib/api/notifications.api";
import { useNotificationStore } from "../../../store/notificationStore";
import type { Notification } from "../../../types";

const TYPE_ICONS: Record<string, string> = {
  task_assigned: "📋",
  task_updated: "✏️",
  task_status_changed: "🔄",
  comment_added: "💬",
  mentioned: "@",
  due_date_reminder: "⏰",
  task_completed: "✅",
  account_created: "👤"
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const decrementUnread = useNotificationStore((s) => s.decrementUnread);
  const resetUnread = useNotificationStore((s) => s.resetUnread);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-all"],
    queryFn: () => notificationsApi.getNotifications({ limit: 100 }).then((r) => r.data)
  });

  const rawData = data?.data;
  const notifications: Notification[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.notifications)
    ? rawData.notifications
    : [];

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-all"] });
      decrementUnread(1);
    }
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-all"] });
      resetUnread();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.deleteNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications-all"] })
  });

  const unread = notifications.filter((n) => !n.isRead);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-slate-400 text-sm mt-0.5">{unread.length} unread</p>
        </div>
        {unread.length > 0 && (
          <button
            id="mark-all-read"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-800" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20 border border-slate-800 rounded-2xl bg-slate-800/20">
          <div className="text-4xl mb-3">🔔</div>
          <h3 className="text-white font-semibold">All caught up!</h3>
          <p className="text-slate-500 text-sm mt-1">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n._id}
              className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                n.isRead
                  ? "bg-slate-800/30 border-slate-700/50"
                  : "bg-slate-800/70 border-slate-600"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-xl flex-shrink-0">
                {TYPE_ICONS[n.type] ?? "🔔"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-sm font-medium">{n.title}</p>
                <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-slate-600 text-xs mt-1">
                  {new Date(n.createdAt).toLocaleDateString()} · {new Date(n.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                {!n.isRead && (
                  <button
                    onClick={() => markReadMutation.mutate(n._id)}
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap"
                  >
                    Mark read
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(n._id)}
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  Delete
                </button>
              </div>
              {!n.isRead && (
                <div className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
