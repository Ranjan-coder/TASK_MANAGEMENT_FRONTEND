import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
});

/**
 * One refresh at a time (single flight). When the 15-minute session expires, a page
 * usually has several requests in flight; each used to start its own refresh. The
 * server rotates the refresh token and treats an old one as stolen, so the second
 * parallel refresh ended the session (a random sign-out). Now every 401 waits for
 * the same refresh, then retries.
 */
let refreshing: Promise<void> | null = null;
const refreshOnce = () => {
  if (!refreshing) {
    refreshing = axios
      .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then(() => undefined)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

/** Go to sign-in once, without a history entry (repeated full reloads raced the app's start-up). */
let leaving = false;
const goToLogin = () => {
  if (typeof window === "undefined" || leaving || window.location.pathname.startsWith("/login")) return;
  leaving = true;
  window.location.replace("/login");
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 and token refresh
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (originalRequest.url?.includes("/auth/refresh") || originalRequest.url?.includes("/auth/login") || originalRequest.url?.includes("/auth/logout")) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        await refreshOnce();
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Signed out from another device (Settings → Devices): remove this
        // browser's copy of the chat keys too.
        if ((refreshError as any)?.response?.data?.errors?.[0]?.code === "DEVICE_SIGNED_OUT") {
          const { forgetDeviceKeys } = await import("@/lib/auth/credentials");
          await forgetDeviceKeys().catch(() => {});
        }
        goToLogin();
        return Promise.reject(refreshError);
      }
    }

    // Server-side gates from accessPolicy.js
    if (error.response?.status === 403 && typeof window !== "undefined") {
      const code = error.response?.data?.errors?.[0]?.code;
      if (code === "PASSWORD_CHANGE_REQUIRED" || code === "TWO_FACTOR_REQUIRED") {
        if (!window.location.pathname.startsWith("/settings")) {
          window.location.href = "/settings?section=security";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
