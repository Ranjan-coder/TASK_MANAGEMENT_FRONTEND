import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { apiClient } from "@/lib/api/client";
import { ApiResponse, User } from "@/types";
import { forgetDeviceKeys } from "@/lib/auth/credentials";
import { disablePush } from "@/lib/pwa";

// Several components call useAuth on the same page (shell, top bar, route guard …).
// Share one /auth/me request between them and don't repeat it within 60 s.
let meRequest: Promise<User | null> | null = null;
let meFetchedAt = 0;
const fetchMe = () => {
  if (meRequest && Date.now() - meFetchedAt < 60_000) return meRequest;
  meFetchedAt = Date.now();
  meRequest = apiClient
    .get<ApiResponse<User>>("/auth/me")
    .then((res) => res.data.data)
    .catch(() => {
      meRequest = null; // don't cache failures
      return null;
    });
  return meRequest;
};

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const checkAuth = async () => {
      const me = await fetchMe();
      setUser(me);
      setLoading(false);
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
      meRequest = null;
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
