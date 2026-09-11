import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useNotificationStore } from "@/store/notificationStore";
import { getSocket } from "@/lib/socket";
import { ApiResponse, Notification } from "@/types";
import { toast } from "sonner";

export function useNotifications() {
  const { notifications, unreadCount, setNotifications, addNotification, markAsRead, markAllAsRead } =
    useNotificationStore();

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
      addNotification(notification);
      toast.info(notification.title, {
        description: notification.message
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
