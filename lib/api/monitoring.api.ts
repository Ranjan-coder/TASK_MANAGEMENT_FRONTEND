import apiClient from "./client";
import type { ApiResponse } from "@/types";

export interface Overview {
  projects: { active: number; onHold: number; completed: number };
  customers: { total: number; verified: number; suspended: number; newThisWeek: number };
  waiting: {
    count: number;
    escalated: number;
    longest: { conversationId: string; projectName: string; customerName: string; designerName: string | null; stage: string; waitingSince: string; clockStart: string }[];
  };
  reports: { open: number; overdue: number; last30: number };
  moderation: { open: number; threats: number };
  ratings: { average30: number | null; count30: number; low30: number };
  leads: { new: number };
  replies7d: { count: number; avgMinutes: number | null; fastRate: number | null; fastThresholdMin: number };
}

export interface DesignerRow {
  designer: { _id: string; name: string; avatarUrl?: string; designation?: string; status: string; onLeave: boolean };
  activeProjects: { lead: number; backup: number };
  replies: {
    waits: number;
    avgMinutes: number | null;
    prevAvgMinutes: number | null;
    fastRate: number | null;
    prevFastRate: number | null;
    escalations: number;
    prevEscalations: number;
  };
  rating: { average: number | null; count: number; periodAverage: number | null; prevAverage: number | null };
  reports: { total: number; actionTaken: number; open: number };
  flaggedWords: number;
}

export interface CustomerRow {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  phoneVerified?: boolean;
  status: "active" | "inactive" | "suspended";
  createdAt: string;
  lastLogin?: string;
  projects: { total: number; active: number };
  leads: { total: number; open: number };
  flagged: number;
}

export interface CustomerDetail extends Omit<CustomerRow, "projects" | "leads" | "flagged"> {
  consent?: { termsAcceptedAt: string | null; privacyVersion: string | null };
  projects: { _id: string; name: string; status: string; leadDesigner: string | null; lastActivityAt: string }[];
  leads: { _id: string; campaign: string | null; status: string; message: string; createdAt: string }[];
  reportsMade: { _id: string; ticketNo: number; status: string; reason: string; createdAt: string; reportedUser?: { name: string } }[];
  reportsAbout: { _id: string; ticketNo: number; status: string; reason: string; createdAt: string; reporter?: { name: string } }[];
}

export const monitoringApi = {
  overview: () => apiClient.get<ApiResponse<Overview>>("/admin/monitoring/overview"),
  designers: (days: 7 | 30 | 90) =>
    apiClient.get<ApiResponse<{ days: number; fastThresholdMin: number; designers: DesignerRow[] }>>("/admin/monitoring/designers", { params: { days } }),
  customers: (params: { search?: string; status?: string; verified?: "yes" | "no"; page?: number }) =>
    apiClient.get<ApiResponse<{ total: number; page: number; items: CustomerRow[] }>>("/admin/monitoring/customers", { params }),
  customer: (id: string) => apiClient.get<ApiResponse<CustomerDetail>>(`/admin/monitoring/customers/${id}`)
};
