import apiClient from "./client";
import type { Task, TaskStatus, TaskPriority } from "../../types";

/** Shape the backend expects when creating / updating a task.
 *  assignedTo / watchers are user ID strings, not populated User objects. */
export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignedTo?: string[];
  watchers?: string[];
  dueDate?: string | null;
  startDate?: string | null;
  tags?: string[];
  category?: string;
  parentTask?: string | null;
}

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

  createTask: (data: CreateTaskPayload) => apiClient.post("/tasks", data),

  updateTask: (id: string, data: Partial<CreateTaskPayload> & { status?: TaskStatus }) =>
    apiClient.patch(`/tasks/${id}`, data),

  updateStatus: (id: string, status: TaskStatus) =>
    apiClient.patch(`/tasks/${id}/status`, { status }),

  reassignTask: (id: string, assignedTo: string[]) =>
    apiClient.patch(`/tasks/${id}/reassign`, { assignedTo }),

  getTaskActivity: (id: string) => apiClient.get(`/tasks/${id}/activity`),

  deleteTask: (id: string) => apiClient.delete(`/tasks/${id}`)
};
