import apiClient from "./client";
import type { Conversation, WrappedKeyInput } from "@/types/chat";
import type { ProjectStage } from "./projectExtras.api";
import type { StaffFlowView } from "./workflow.api";

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
    stage?: ProjectStage; // missing on older projects = the first stage
    expectedHandover?: string | null;
  };
  /** The project's place in its company workflow (sent with the admin list) */
  flowView?: StaffFlowView & { version: number };
}

export interface StageCount {
  stage: ProjectStage;
  label: string;
  count: number;
}

export interface ProjectTeamInput {
  customerIds: string[];
  leadDesignerId: string;
  backupDesignerId: string | null;
  managerId: string | null;
  staffIds: string[];
}

export const projectsApi = {
  list: (status?: ProjectStatus, stage?: ProjectStage) =>
    apiClient
      .get<{ data: AdminProject[] }>("/admin/projects", { params: { ...(status && { status }), ...(stage && { stage }) } })
      .then((r) => r.data.data),

  /** How many projects are at each stage (one grouped query on the server). */
  stageCounts: (status?: ProjectStatus) =>
    apiClient.get<{ data: StageCount[] }>("/admin/projects/stages", { params: status ? { status } : {} }).then((r) => r.data.data),

  create: (body: ProjectTeamInput & { name: string; encryptedGroupKeys: Record<string, WrappedKeyInput> }) =>
    apiClient.post<{ data: AdminProject }>("/admin/projects", body).then((r) => r.data.data),

  update: (id: string, body: ProjectTeamInput & { name?: string; status?: ProjectStatus }) =>
    apiClient.put<{ data: AdminProject }>(`/admin/projects/${id}`, body).then((r) => r.data.data)
};
