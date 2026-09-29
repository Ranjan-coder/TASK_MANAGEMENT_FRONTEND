import apiClient from "./client";
import type { ApiResponse } from "@/types";

/** A customer waiting for a reply, as shown in the designer's popup. */
export interface ReplyReminder {
  slaId: string;
  conversationId: string;
  projectName: string;
  customerName: string;
  waitingSince: string;
  waitingMinutes: number;
  canSnooze: boolean;
  escalated?: boolean;
  snoozedUntil?: string | null;
}

export interface ContactRef {
  _id: string;
  name: string;
  email?: string;
  role?: string;
  designation?: string;
  avatarUrl?: string;
  missing?: boolean;
}

export interface ReplyTimeSettings {
  businessHours: { start: string; end: string; workDays: number[] };
  holidays: { date: string; name: string }[];
  sla: { autoReplyMin: number; remindMin: number; escalateMin: number };
  moderation?: { threshold: number; window: number };
  escalationContacts: ContactRef[];
  defaultEscalationContact: ContactRef;
  updatedAt?: string;
}

export interface DesignerMetrics {
  designer: { _id: string; name: string; avatarUrl?: string; designation?: string } | null;
  periods: number;
  replied: number;
  open: number;
  avgReplyMinutes: number | null;
  fastReplyRate: number | null;
  reminders: number;
  escalations: number;
  rating: { average: number; count: number; recentAverage: number | null; recentCount: number } | null;
}

export const slaApi = {
  pending: () => apiClient.get<ApiResponse<ReplyReminder[]>>("/sla/pending"),
  snooze: (slaId: string) => apiClient.post<ApiResponse<{ snoozedUntil: string }>>(`/sla/${slaId}/snooze`),
  getSettings: () => apiClient.get<ApiResponse<ReplyTimeSettings>>("/admin/settings"),
  updateSettings: (body: {
    businessHours?: ReplyTimeSettings["businessHours"];
    holidays?: ReplyTimeSettings["holidays"];
    sla?: ReplyTimeSettings["sla"];
    escalationContacts?: string[];
    moderation?: { threshold: number; window: number };
  }) => apiClient.put<ApiResponse<ReplyTimeSettings>>("/admin/settings", body),
  metrics: (days = 30) =>
    apiClient.get<ApiResponse<{ days: number; fastThresholdMin: number; designers: DesignerMetrics[] }>>(`/admin/sla/metrics?days=${days}`)
};
