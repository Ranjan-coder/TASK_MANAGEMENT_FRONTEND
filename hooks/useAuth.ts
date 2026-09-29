import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { apiClient } from "@/lib/api/client";
import { ApiResponse, User } from "@/types";
import { forgetDeviceKeys } from "@/lib/auth/credentials";
import { disablePush } from "@/lib/pwa";

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiClient.get<ApiResponse<User>>("/auth/me");
        setUser(res.data.data);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [setUser, setLoading]);

  const handleLogout = async () => {
    // This device should stop getting notifications once signed out
    await disablePush().catch(() => {});
    try {
      await apiClient.post("/auth/logout");
    } finally {
      await forgetDeviceKeys().catch(() => {});
      logout();
      window.location.href = "/login";
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    logout: handleLogout
  };
}
