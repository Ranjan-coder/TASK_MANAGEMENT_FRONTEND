import apiClient from "./client";

export const authApi = {
  register: (data: { name: string; email: string; password: string; role: string; department?: string; designation?: string }) =>
    apiClient.post("/auth/register", data),

  login: (data: { email: string; password: string }) =>
    apiClient.post("/auth/login", data),

  verify2FA: (data: { tempToken: string; code: string }) =>
    apiClient.post("/auth/2fa/verify", data),

  setup2FA: () => apiClient.post("/auth/2fa/setup"),

  enable2FA: (data: { code: string }) => apiClient.post("/auth/2fa/enable", data),

  disable2FA: (data: { password: string }) => apiClient.post("/auth/2fa/disable", data),

  logout: () => apiClient.post("/auth/logout"),

  refreshToken: () => apiClient.post("/auth/refresh"),

  getMe: () => apiClient.get("/auth/me"),

  forgotPassword: (data: { email: string }) =>
    apiClient.post("/auth/forgot-password", data),

  resetPassword: (token: string, data: { password: string }) =>
    apiClient.post(`/auth/reset-password/${token}`, data),

  getSessions: () => apiClient.get("/auth/sessions"),

  revokeSession: (sessionId: string) =>
    apiClient.delete(`/auth/sessions/${sessionId}`),

  revokeAllSessions: () => apiClient.post("/auth/sessions/revoke-all")
};
