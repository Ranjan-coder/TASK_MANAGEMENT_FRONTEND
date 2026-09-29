import apiClient from "./client";
import type { ApiResponse } from "@/types";

export const PROJECT_STAGES = [
  { value: "consultation", label: "Consultation" },
  { value: "site_measurement", label: "Site measurement" },
  { value: "design", label: "Design" },
  { value: "quotation", label: "Quotation" },
  { value: "production", label: "Production" },
  { value: "installation", label: "Installation" },
  { value: "handover", label: "Handover" }
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number]["value"];
export const stageLabel = (s?: string) => PROJECT_STAGES.find((x) => x.value === s)?.label ?? "Consultation";

export interface Timeline {
  stage: ProjectStage;
  stageHistory: { stage: ProjectStage; at: string; note: string }[];
  expectedHandover: string | null;
}

export interface MyProject extends Timeline {
  _id: string;
  name: string;
  status: "active" | "on_hold" | "completed";
  leadDesigner: { name: string; avatarUrl?: string } | null;
  lastActivityAt: string;
}

export interface DesignApproval {
  _id: string;
  conversation: string;
  message: string;
  title: string;
  status: "pending" | "approved" | "changes_requested" | "withdrawn";
  comment: string;
  requestedBy: { _id: string; name: string } | null;
  decidedBy: { _id: string; name: string } | null;
  decidedAt: string | null;
  createdAt: string;
  attachment?: { originalName?: string };
}

export interface QuickReply {
  _id: string;
  title: string;
  text: string;
  shared: boolean;
  canEdit: boolean;
}

export interface Testimonial {
  _id: string;
  customerName: string;
  location: string;
  quote: string;
  rating: number | null;
  projectType: string;
  photo: { url: string } | null;
  portfolioSlug: string | null;
}

export interface AdminTestimonial extends Omit<Testimonial, "portfolioSlug" | "photo"> {
  photo?: { url: string; publicId: string } | null;
  portfolioItem?: { _id: string; name: string; slug: string } | null;
  consentConfirmed: boolean;
  isPublished: boolean;
  order: number;
}

export type LeadStatus = "new" | "contacted" | "converted" | "closed";
export interface AdminLead {
  _id: string;
  customer: { _id: string; name: string; email: string; phone?: string; phoneVerified?: boolean } | null;
  campaign: { _id: string; title: string } | null;
  message: string;
  status: LeadStatus;
  handledBy: { name: string } | null;
  contactedAt: string | null;
  closedAt: string | null;
  notes: { by: { name: string } | null; text: string; at: string }[];
  createdAt: string;
}

export const extrasApi = {
  myProjects: () => apiClient.get<ApiResponse<MyProject[]>>("/projects/mine").then((r) => r.data.data),
  setStage: (conversationId: string, body: { stage: ProjectStage; note?: string; expectedHandover?: string | null }) =>
    apiClient.patch<ApiResponse<Timeline & { conversationId: string }>>(`/projects/${conversationId}/stage`, body).then((r) => r.data.data),

  approvals: (conversationId: string) =>
    apiClient.get<ApiResponse<DesignApproval[]>>(`/chat/conversations/${conversationId}/approvals`).then((r) => r.data.data),
  requestApproval: (conversationId: string, messageId: string, title: string) =>
    apiClient.post<ApiResponse<DesignApproval>>(`/chat/conversations/${conversationId}/approvals`, { messageId, title }).then((r) => r.data.data),
  decide: (approvalId: string, decision: "approved" | "changes_requested", comment = "") =>
    apiClient.post<ApiResponse<DesignApproval>>(`/chat/approvals/${approvalId}/decision`, { decision, comment }).then((r) => r.data.data),
  withdraw: (approvalId: string) => apiClient.post<ApiResponse<DesignApproval>>(`/chat/approvals/${approvalId}/withdraw`).then((r) => r.data.data),

  quickReplies: () => apiClient.get<ApiResponse<QuickReply[]>>("/quick-replies").then((r) => r.data.data),
  addQuickReply: (body: { title: string; text: string; shared?: boolean }) => apiClient.post("/quick-replies", body),
  deleteQuickReply: (id: string) => apiClient.delete(`/quick-replies/${id}`),

  testimonials: () => apiClient.get<ApiResponse<Testimonial[]>>("/testimonials").then((r) => r.data.data),
  adminTestimonials: () => apiClient.get<ApiResponse<AdminTestimonial[]>>("/admin/testimonials").then((r) => r.data.data),
  saveTestimonial: (id: string | null, body: Record<string, unknown>) =>
    id ? apiClient.put(`/admin/testimonials/${id}`, body) : apiClient.post("/admin/testimonials", body),
  deleteTestimonial: (id: string) => apiClient.delete(`/admin/testimonials/${id}`),

  leads: (params: { status?: LeadStatus; campaign?: string; search?: string; page?: number }) =>
    apiClient
      .get<ApiResponse<{ items: AdminLead[]; total: number; page: number; pageSize: number; counts: Partial<Record<LeadStatus, number>>; campaigns: { _id: string | null; title: string; total: number; converted: number }[] }>>(
        "/admin/leads",
        { params }
      )
      .then((r) => r.data.data),
  updateLead: (id: string, body: { status?: LeadStatus; note?: string; assignToMe?: true }) =>
    apiClient.patch<ApiResponse<AdminLead>>(`/admin/leads/${id}`, body).then((r) => r.data.data)
};
