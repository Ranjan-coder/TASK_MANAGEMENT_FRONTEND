import apiClient from "./client";
import type { ApiResponse } from "@/types";

/** Project contacts (project-contacts-plan.md): who a customer talks to about what. */
export type ContactTopic = "design" | "site" | "payments" | "general" | "custom";

export interface ContactPerson {
  _id: string;
  name: string;
  avatarUrl: string;
  designation: string;
  onLeave: boolean;
}

/** A resolved contact, as customers see it (team → company → project, merged by the server). */
export interface ProjectContact {
  key: string;
  topic: ContactTopic;
  label: string;
  source: "team" | "company" | "project";
  person: ContactPerson;
  phone: string;
  whatsapp: boolean;
  email: string;
  hours: string;
  /** In this project chat: "Ask in chat" can @mention them */
  inChat: boolean;
}

/** One row of an editable list (a project's own, or the company defaults). */
export interface ContactInput {
  topic: ContactTopic;
  label: string;
  user: string;
  phone: string;
  whatsapp: boolean;
  email: string;
  hours: string;
}
export interface EditableContact extends ContactInput {
  /** null: this person has left or is suspended (the layer below shows instead) */
  person: ContactPerson | null;
}

export interface ContactCandidate {
  _id: string;
  name: string;
  designation: string;
  avatarUrl: string;
  email: string;
  phone: string;
}

export interface ProjectContactsView {
  contacts: ProjectContact[];
  /** Only for admins and the project's manager */
  editable?: { contacts: EditableContact[]; rev: number };
}

const data = <T,>(p: Promise<{ data: ApiResponse<T> }>) => p.then((r) => r.data.data);

export const contactsApi = {
  forProject: (projectId: string) => data<ProjectContactsView>(apiClient.get(`/projects/${projectId}/contacts`)),
  saveProject: (projectId: string, contacts: ContactInput[], rev: number) =>
    data<ProjectContactsView>(apiClient.put(`/projects/${projectId}/contacts`, { contacts, rev })),
  projectCandidates: (projectId: string, search: string) =>
    data<ContactCandidate[]>(apiClient.get(`/projects/${projectId}/contacts/candidates`, { params: { search: search || undefined } })),

  company: () => data<{ contacts: EditableContact[]; rev: number }>(apiClient.get("/admin/settings/project-contacts")),
  saveCompany: (contacts: ContactInput[], rev: number) =>
    data<{ contacts: EditableContact[]; rev: number }>(apiClient.put("/admin/settings/project-contacts", { contacts, rev })),
  companyCandidates: (search: string) =>
    data<ContactCandidate[]>(apiClient.get("/admin/settings/project-contacts/candidates", { params: { search: search || undefined } }))
};
