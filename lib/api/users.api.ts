import type { OrgRole } from "@/types";
import apiClient from "./client";

export interface UserFilters {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  department?: string;
  departmentId?: string;
  designationId?: string;
  search?: string;
}

/** What the admin fills in; the password is converted before sending (see createUser). */
export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role?: OrgRole;
  departmentId?: string | null;
  designationId?: string | null;
  reportsTo?: string | null;
  referralCode?: string; // customers only
}

export interface UpdateUserPayload {
  name?: string;
  departmentId?: string | null;
  designationId?: string | null;
  reportsTo?: string | null;
  avatarUrl?: string;
  availability?: { status: "available" | "on_leave"; until?: string | null };
  notificationPrefs?: { whatsapp: boolean; sms: boolean };
}

export const usersApi = {
  getUsers: (filters: UserFilters = {}) =>
    apiClient.get("/users", { params: filters }),

  getUser: (id: string) => apiClient.get(`/users/${id}`),

  /**
   * The initial password never reaches the server: it's converted to an authKey
   * in the admin's browser. The new user must change it at first sign-in.
   */
  createUser: async ({ password, referralCode, ...rest }: CreateUserPayload) => {
    const { prepareNewPassword } = await import("@/lib/auth/credentials");
    const { authKey, kdfSalt } = await prepareNewPassword(password);
    const referral = rest.role === "customer" && referralCode ? { referralCode } : {};
    return apiClient.post("/users", { ...rest, ...referral, authKey, kdfSalt });
  },

  updateUser: (id: string, data: UpdateUserPayload) =>
    apiClient.patch(`/users/${id}`, data),

  updateProfile: (data: UpdateUserPayload) =>
    apiClient.patch("/users/profile", data),

  updateRole: (id: string, role: string) =>
    apiClient.patch(`/users/${id}/role`, { role }),

  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/users/${id}/status`, { status }),

  deleteUser: (id: string) => apiClient.delete(`/users/${id}`)
};
