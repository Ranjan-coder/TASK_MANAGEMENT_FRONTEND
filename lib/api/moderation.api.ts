import apiClient from "./client";
import type { ApiResponse } from "@/types";

export type Severity = "mild" | "abusive" | "threat";

export interface IncidentSummary {
  _id: string;
  conversation: { _id: string; name: string; project?: { status: string } } | null;
  trigger: "threshold" | "threat";
  severity: Severity;
  hitCount: number;
  windowSize: number;
  threshold: number;
  offenders: { user: { _id: string; name: string; role: string } | null; hits: number; messages: number }[];
  status: "open" | "resolved";
  evidenceRequestedAt: string | null;
  createdAt: string;
  lastFlagAt: string | null;
}

export interface IncidentDetail extends Omit<IncidentSummary, "conversation"> {
  conversation: { _id: string; name: string; status?: string; memberCount: number } | null;
  team: { _id: string; name: string; email?: string; phone?: string; role: string; projectRole: string }[];
  reports: { _id: string; ticketNo: number; status: string; reason: string; reporter: { name: string } | null; reportedUser: { name: string } | null; createdAt: string }[];
  resolvedBy: { name: string } | null;
  resolvedAt: string | null;
  resolutionNote: string;
}

export interface Term {
  _id: string;
  term: string;
  display: string;
  severity: Severity;
  language: "en" | "hi" | "hinglish" | "other";
  active: boolean;
}

export const moderationApi = {
  incidents: (status?: "open" | "resolved") =>
    apiClient.get<ApiResponse<{ items: IncidentSummary[]; counts: Record<string, number> }>>("/admin/moderation/incidents", { params: { status } }),
  incident: (id: string) => apiClient.get<ApiResponse<IncidentDetail>>(`/admin/moderation/incidents/${id}`),
  act: (id: string, action: "resolve" | "request_evidence", note?: string) =>
    apiClient.patch<ApiResponse<IncidentDetail>>(`/admin/moderation/incidents/${id}`, { action, ...(note ? { note } : {}) }),
  terms: () => apiClient.get<ApiResponse<{ terms: Term[]; stats: { days: number; prevented: number; sentAnyway: number } }>>("/admin/moderation/lexicon"),
  addTerm: (body: { display: string; severity: Severity; language: Term["language"] }) => apiClient.post<ApiResponse<Term>>("/admin/moderation/lexicon", body),
  updateTerm: (id: string, body: { severity?: Severity; active?: boolean }) => apiClient.patch<ApiResponse<Term>>(`/admin/moderation/lexicon/${id}`, body),
  deleteTerm: (id: string) => apiClient.delete(`/admin/moderation/lexicon/${id}`)
};
