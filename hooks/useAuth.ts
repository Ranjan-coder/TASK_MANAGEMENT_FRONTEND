import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { apiClient } from "@/lib/api/client";
import { ApiResponse, User } from "@/types";

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
    try {
      await apiClient.post("/auth/logout");
    } finally {
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
