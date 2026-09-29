import { create } from "zustand";
import { User } from "@/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  // Keep the same object when /auth/me returns identical data: effects keyed on `user`
  // (socket listeners, key loading) would otherwise all re-run on every check.
  setUser: (user) =>
    set((state) =>
      state.user && user && JSON.stringify(state.user) === JSON.stringify(user)
        ? { isAuthenticated: true, isLoading: false }
        : { user, isAuthenticated: !!user, isLoading: false }
    ),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => set({ user: null, isAuthenticated: false, isLoading: false })
}));
