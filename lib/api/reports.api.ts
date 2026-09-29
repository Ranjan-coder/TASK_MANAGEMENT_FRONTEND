import apiClient from "./client";
import type { ApiResponse } from "@/types";

export type ReportDirection = "customer_to_staff" | "staff_to_customer";
export type ReportStatus = "submitted" | "under_review" | "action_taken" | "dismissed";
export type ReportAction = "note" | "warning" | "reassign" | "suspension";

export const REASONS: Record<ReportDirection, { value: string; label: string }[]> = {
  customer_to_staff: [
    { value: "rude", label: "Rude / disrespectful" },
    { value: "slow_responses", label: "Very slow responses" },
    { value: "unprofessional", label: "Unprofessional behaviour" },
    { value: "poor_quality", label: "Poor quality of work" },
    { value: "harassment", label: "Harassment" },
    { value: "other", label: "Other" }
  ],
  staff_to_customer: [
    { value: "abusive_language", label: "Abusive language" },
    { value: "threats", label: "Threats" },
    { value: "harassment", label: "Harassment" },
    { value: "inappropriate_requests", label: "Inappropriate requests" },
    { value: "other", label: "Other" }
  ]
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  action_taken: "Action taken",
  dismissed: "Dismissed"
};

export const ACTION_LABEL: Record<ReportAction, string> = {
  note: "Note only",
  warning: "Formal warning",
  reassign: "Reassign designer",
  suspension: "Suspension"
};

export interface EvidenceReveal {
  messageId: string;
  text: string;
  frankingKey: string;
}

export interface NewReport {
  conversationId: string;
  reportedUserId: string;
  reason: string;
  description: string;
  evidence: EvidenceReveal[];
}

export interface MyReport {
  _id: string;
  ticketNo: number;
  status: ReportStatus;
  outcome: string;
  reasonLabel: string;
  reportedUser: { _id: string; name: string } | null;
  projectName: string;
  evidenceCount: number;
  createdAt: string;
}

export interface ReportAboutMe {
  _id: string;
  ticketNo: number;
  status: ReportStatus;
  reasonLabel: string;
  projectName: string;
  messages: { text: string; sentAt: string; mine: boolean }[];
  responseRequestedAt: string;
  response: { text: string; at: string } | null;
  canRespond: boolean;
}

export interface Person {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  designation?: string;
  avatarUrl?: string;
  status?: string;
}

export interface AdminReportSummary {
  _id: string;
  ticketNo: number;
  status: ReportStatus;
  direction: ReportDirection;
  reasonLabel: string;
  reporter: Person;
  reportedUser: Person;
  conversation: { _id: string; name: string } | null;
  evidenceCount: number;
  attachmentCount: number;
  responseRequestedAt: string | null;
  createdAt: string;
}

export interface AdminReportDetail extends Omit<AdminReportSummary, "evidenceCount" | "attachmentCount"> {
  description: string;
  evidenceMessages: { message: string; sender: Person; text: string; sentAt: string; edited: boolean; verified: boolean }[];
  attachments: { publicId: string; url: string; width?: number; height?: number }[];
  notes: { by: { name: string } | null; text: string; at: string }[];
  reviewer: Person | null;
  response?: { text?: string; at?: string };
  resolution?: { action: ReportAction | null; note?: string; at?: string; by?: { name: string } };
  history: {
    pastReports: { _id: string; ticketNo: number; reasonLabel: string; status: ReportStatus; createdAt: string }[];
    reportCounts: Partial<Record<ReportStatus, number>>;
    rating: { average: number; count: number } | null;
    responseTimes90d: { periods: number; escalations: number; avgReplyMinutes: number | null } | null;
  };
}

export interface MyRating {
  designer: { _id: string; name: string; avatarUrl?: string } | null;
  rating: { stars: number; tags: string[]; comment: string; updatedAt: string } | null;
  promptDue: boolean;
}

export const RATING_TAGS = [
  { value: "responsive", label: "Responsive" },
  { value: "creative", label: "Creative" },
  { value: "professional", label: "Professional" },
  { value: "knowledgeable", label: "Knowledgeable" }
];

export const reportsApi = {
  create: (data: NewReport, screenshots: File[]) => {
    const form = new FormData();
    form.append("data", JSON.stringify(data));
    screenshots.forEach((f) => form.append("screenshots", f));
    return apiClient.post<ApiResponse<{ _id: string; ticketNo: number; status: ReportStatus }>>("/reports", form, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  },
  mine: () => apiClient.get<ApiResponse<MyReport[]>>("/reports/mine"),
  aboutMe: () => apiClient.get<ApiResponse<ReportAboutMe[]>>("/reports/about-me"),
  respond: (id: string, text: string) => apiClient.post(`/reports/${id}/response`, { text }),

  adminList: (params: { status?: ReportStatus; direction?: ReportDirection; page?: number }) =>
    apiClient.get<ApiResponse<{ items: AdminReportSummary[]; total: number; page: number; counts: Partial<Record<ReportStatus, number>> }>>(
      "/admin/reports",
      { params }
    ),
  adminGet: (id: string) => apiClient.get<ApiResponse<AdminReportDetail>>(`/admin/reports/${id}`),
  adminReview: (id: string, body: { status?: ReportStatus; action?: ReportAction; note?: string; requestResponse?: true }) =>
    apiClient.patch<ApiResponse<AdminReportDetail>>(`/admin/reports/${id}`, body),

  myRating: (conversationId: string) => apiClient.get<ApiResponse<MyRating>>(`/ratings/${conversationId}/mine`),
  rate: (conversationId: string, body: { stars: number; tags: string[]; comment: string }) =>
    apiClient.put(`/ratings/${conversationId}`, body),
  ownSummary: () =>
    apiClient.get<ApiResponse<{ count: number; average: number | null; tags: Record<string, number>; minimum: number }>>("/ratings/me")
};
