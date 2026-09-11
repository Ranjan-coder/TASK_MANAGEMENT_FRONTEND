import { create } from "zustand";
import { Notification } from "@/types";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[], unreadCount: number) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  decrementUnread: (by?: number) => void;
  resetUnread: () => void;
  setUnreadCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1
    })),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1)
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0
    })),
  decrementUnread: (by = 1) =>
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - by) })),
  resetUnread: () => set({ unreadCount: 0 }),
  setUnreadCount: (count) => set({ unreadCount: count })
}));
