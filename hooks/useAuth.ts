import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { apiClient } from "@/lib/api/client";
import { ApiResponse, User } from "@/types";
import { forgetDeviceKeys } from "@/lib/auth/credentials";
import { disablePush } from "@/lib/pwa";
import { beginLeaving, isLeaving, leaveTo } from "@/lib/auth/session";
import { disconnectSocket } from "@/lib/socket";

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

  useEffect(() => {
    const checkAuth = async () => {
      if (isLeaving()) return; // signing out: don't ask (or replace the user) any more
      const me = await fetchMe();
      if (isLeaving()) return;
      setUser(me);
      setLoading(false);
    };

    checkAuth();
  }, [setUser, setLoading]);

  /**
   * Sign out (lib/auth/session.ts). The signed-in user is NOT cleared first:
   * that re-rendered the app without a user (a customer briefly saw the staff
   * frame) and the re-mounted parts asked /auth/me → 401 → refresh → 401, then
   * /login loaded twice. Now: sign out, block further requests, tidy this
   * device, and leave once — the page load clears everything in memory.
   */
  const handleLogout = async () => {
    if (isLeaving()) return; // double click
    // This device should stop getting notifications once signed out
    await disablePush().catch(() => {});
    try {
      await apiClient.post("/auth/logout");
    } catch {
      /* already signed out / offline: still leave */
    }
    beginLeaving();
    disconnectSocket();
    await forgetDeviceKeys().catch(() => {});
    leaveTo("/login");
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    logout: handleLogout
  };
}
