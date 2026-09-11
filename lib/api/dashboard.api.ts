import apiClient from "./client";

export const dashboardApi = {
  getSummary: () => apiClient.get("/dashboard/summary"),

  getTeamPerformance: () => apiClient.get("/dashboard/team-performance"),

  getAuditLogs: (params: { page?: number; limit?: number; action?: string; targetType?: string } = {}) =>
    apiClient.get("/dashboard/audit-logs", { params })
};
