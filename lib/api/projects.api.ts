import apiClient from "./client";
import type { Conversation, WrappedKeyInput } from "@/types/chat";

export type ProjectStatus = "active" | "on_hold" | "completed";

export interface PersonRef {
  _id: string;
  name: string;
  avatarUrl?: string;
  email?: string;
  phone?: string;
}

/** A project chat as the admin sees it (people populated). */
export interface AdminProject extends Omit<Conversation, "project"> {
  project: {
    status: ProjectStatus;
    customers: PersonRef[];
    leadDesigner: PersonRef;
    backupDesigner: PersonRef | null;
    manager: PersonRef | null;
    createdAt: string;
  };
}

export interface ProjectTeamInput {
  customerIds: string[];
  leadDesignerId: string;
  backupDesignerId: string | null;
  managerId: string | null;
  staffIds: string[];
}

export const projectsApi = {
  list: (status?: ProjectStatus) =>
    apiClient.get<{ data: AdminProject[] }>("/admin/projects", { params: status ? { status } : {} }).then((r) => r.data.data),

  create: (body: ProjectTeamInput & { name: string; encryptedGroupKeys: Record<string, WrappedKeyInput> }) =>
    apiClient.post<{ data: AdminProject }>("/admin/projects", body).then((r) => r.data.data),

  update: (id: string, body: ProjectTeamInput & { name?: string; status?: ProjectStatus }) =>
    apiClient.put<{ data: AdminProject }>(`/admin/projects/${id}`, body).then((r) => r.data.data)
};
