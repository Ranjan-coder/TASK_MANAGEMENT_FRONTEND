import apiClient from "./client";
import type { Task, TaskStatus } from "../../types";

export interface TaskFilters {
  page?: number;
  limit?: number;
  status?: TaskStatus;
  priority?: string;
  category?: string;
  assignedTo?: string;
  search?: string;
}

export const tasksApi = {
  getTasks: (filters: TaskFilters = {}) =>
    apiClient.get("/tasks", { params: filters }),

  getTask: (id: string) => apiClient.get(`/tasks/${id}`),

  createTask: (data: Partial<Task>) => apiClient.post("/tasks", data),

  updateTask: (id: string, data: Partial<Task>) =>
    apiClient.patch(`/tasks/${id}`, data),

  updateStatus: (id: string, status: TaskStatus) =>
    apiClient.patch(`/tasks/${id}/status`, { status }),

  reassignTask: (id: string, assignedTo: string[]) =>
    apiClient.patch(`/tasks/${id}/reassign`, { assignedTo }),

  getTaskActivity: (id: string) => apiClient.get(`/tasks/${id}/activity`),

  deleteTask: (id: string) => apiClient.delete(`/tasks/${id}`)
};
