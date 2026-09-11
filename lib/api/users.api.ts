import apiClient from "./client";

export interface UserFilters {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  department?: string;
  search?: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role?: "superadmin" | "admin" | "user";
  department?: string;
  designation?: string;
}

export interface UpdateUserPayload {
  name?: string;
  department?: string;
  designation?: string;
  avatarUrl?: string;
}

export const usersApi = {
  getUsers: (filters: UserFilters = {}) =>
    apiClient.get("/users", { params: filters }),

  getUser: (id: string) => apiClient.get(`/users/${id}`),

  createUser: (data: CreateUserPayload) => apiClient.post("/users", data),

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
