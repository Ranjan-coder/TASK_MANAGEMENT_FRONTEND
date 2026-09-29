import apiClient from "./client";

export const authApi = {
  prelogin: (data: { identifier: string }) => apiClient.post("/auth/prelogin", data),

  login: (data: { identifier: string; authKey: string; password?: string }) =>
    apiClient.post("/auth/login", data),

  verify2FA: (data: { tempToken: string; code: string }) =>
    apiClient.post("/auth/2fa/verify", data),

  setup2FA: () => apiClient.post("/auth/2fa/setup"),

  enable2FA: (data: { code: string }) => apiClient.post("/auth/2fa/enable", data),

  disable2FA: (data: { authKey?: string; password?: string; code: string }) => apiClient.post("/auth/2fa/disable", data),

  changePassword: (data: {
    currentAuthKey?: string;
    currentPassword?: string;
    newAuthKey: string;
    newKdfSalt: string;
    keyBundle?: { ciphertext: string; iv: string };
  }) =>
    apiClient.post("/auth/change-password", data),

  logout: () => apiClient.post("/auth/logout"),

  refreshToken: () => apiClient.post("/auth/refresh"),

  getMe: () => apiClient.get("/auth/me"),

  forgotPassword: (data: { email: string }) =>
    apiClient.post("/auth/forgot-password", data),

  resetPassword: (token: string, data: { authKey: string; kdfSalt: string }) =>
    apiClient.post(`/auth/reset-password/${token}`, data),

  getSessions: () => apiClient.get("/auth/sessions"),

  revokeSession: (sessionId: string) =>
    apiClient.delete(`/auth/sessions/${sessionId}`),

  revokeAllSessions: () => apiClient.post("/auth/sessions/revoke-all"),

  revokeOtherSessions: () => apiClient.post("/auth/sessions/revoke-others")
};
