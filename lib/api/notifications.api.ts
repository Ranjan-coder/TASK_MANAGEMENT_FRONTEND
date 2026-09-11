import apiClient from "./client";

export const notificationsApi = {
  getNotifications: (params: { page?: number; limit?: number } = {}) =>
    apiClient.get("/notifications", { params }),

  markRead: (id: string) =>
    apiClient.patch(`/notifications/${id}/read`),

  markAllRead: () => apiClient.patch("/notifications/read-all"),

  deleteNotification: (id: string) =>
    apiClient.delete(`/notifications/${id}`)
};
