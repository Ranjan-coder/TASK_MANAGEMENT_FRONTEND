"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { apiClient } from "@/lib/api/client";

/**
 * Opens the live connection (chat messages, notifications, reminders) while
 * signed in. The server reads the sign-in cookie; when it rejects the
 * connection (e.g. the 15-minute access token expired), a normal API call
 * renews the session and we reconnect.
 */
export function LiveConnection() {
  const userId = useAuthStore((s) => s.user?._id);

  useEffect(() => {
    if (!userId) {
      disconnectSocket();
      return;
    }
    const socket = connectSocket();
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onConnect = () => {
      attempts = 0;
    };
    // Rejections by the server's sign-in check aren't retried by socket.io itself
    const onError = (err: Error & { type?: string }) => {
      if (err.type === "TransportError") return; // network: socket.io retries on its own
      attempts += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await apiClient.get("/auth/me"); // refreshes the session if needed (signs out if it can't)
        } catch {
          return;
        }
        if (!socket.connected) socket.connect();
      }, delay);
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onError);
    return () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };
  }, [userId]);

  return null;
}
