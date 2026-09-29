import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useNotificationStore } from "@/store/notificationStore";
import { getSocket } from "@/lib/socket";
import { ApiResponse, Notification } from "@/types";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { notificationTarget, URGENT_TYPES } from "@/lib/notifications";

const toasted = new Set<string>();

export function useNotifications() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<{ notifications: Notification[]; unreadCount: number }>>(
        "/notifications"
      );
      setNotifications(res.data.data.notifications, res.data.data.unreadCount);
      return res.data.data;
    }
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewNotification = (notification: Notification) => {
      // Several components use this hook; toast each notification once
      if (toasted.has(notification._id)) return;
      toasted.add(notification._id);
      addNotification(notification);
      if (notification.type === "sla_reminder") return; // shown as a popup instead
      const target = notificationTarget(notification, useAuthStore.getState().user?.role);
      const urgent = URGENT_TYPES.has(notification.type);
      (urgent ? toast.warning : toast.info)(notification.title, {
        description: notification.message,
        duration: urgent ? 12_000 : undefined,
        action: target ? { label: "Open", onClick: () => routerRef.current.push(target) } : undefined
      });
    };

    socket.on("notification:new", handleNewNotification);

    return () => {
      socket.off("notification:new", handleNewNotification);
    };
  }, [addNotification]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      markAsRead(id);
    } catch {
      toast.error("Failed to mark notification as read");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.patch("/notifications/read-all");
      markAllAsRead();
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead
  };
}
