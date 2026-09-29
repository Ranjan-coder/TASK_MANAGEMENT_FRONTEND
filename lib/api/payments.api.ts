import apiClient from "./client";
import type { ApiResponse } from "@/types";

export type PayMethod = "upi" | "bank_transfer" | "cheque" | "cash" | "card";
export const METHOD_LABEL: Record<PayMethod, string> = { upi: "UPI", bank_transfer: "Bank transfer", cheque: "Cheque", cash: "Cash", card: "Card" };
export type MilestoneStatus = "upcoming" | "verifying" | "paid" | "waived";

/** ₹ from paise, Indian grouping (₹5,00,000). */
export const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
/** Rupees typed by a person → paise (null if not a valid amount). */
export const toPaise = (rupees: string): number | null => {
  const clean = rupees.replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
};

export interface Summary {
  contractValuePaise: number;
  scheduledPaise: number;
  paidPaise: number;
  balancePaise: number;
  overdue: number;
  verifying: number;
  next: { _id: string; title: string; amountPaise: number; dueDate: string | null; status: MilestoneStatus } | null;
}

export interface CustomerMilestone {
  _id: string;
  title: string;
  amountPaise: number;
  dueDate: string | null;
  status: MilestoneStatus;
  overdue: boolean;
  claim: { method: PayMethod; reference: string; amountPaise: number; paidOn: string } | null;
  lastClaimRejection: { note: string; at: string } | null;
  paid: { amountPaise: number; method: PayMethod; reference: string; paidOn: string; receiptNo: string } | null;
  hasInvoice: boolean;
}

export interface CustomerSchedule {
  projectId: string;
  projectName: string;
  notes: string;
  gstRatePct: number;
  summary: Summary;
  milestones: CustomerMilestone[];
}

export interface PayTo {
  companyName: string;
  upiId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  instructions: string;
}

export interface Receipt {
  receiptNo: string;
  issuedAt: string;
  company: { name: string; address: string; gstin: string };
  customerNames: string[];
  projectName: string;
  milestone: string;
  amountPaise: number;
  gstRatePct: number;
  taxablePaise: number;
  gstPaise: number;
  method: string;
  reference: string;
  paidOn: string;
  hasInvoice: boolean;
}

export interface AdminMilestone {
  _id: string;
  title: string;
  amountPaise: number;
  dueDate: string | null;
  status: MilestoneStatus;
  claim?: { method: PayMethod; reference: string; amountPaise: number; paidOn: string; note: string; at: string };
  lastClaimRejection?: { note: string; at: string };
  paid?: { amountPaise: number; method: PayMethod; reference: string; paidOn: string; receiptNo: string; confirmedBy?: { name: string }; confirmedAt: string };
  invoice?: { publicId: string; fileName: string; uploadedAt: string };
}

export interface AdminFinance {
  projectId: string;
  projectName: string;
  finance: { contractValuePaise: number; gstRatePct: number; notes: string; milestones: AdminMilestone[]; summary: Summary } | null;
}

export interface AdminPaymentRow {
  projectId: string;
  projectName: string;
  status: string;
  customers: { name: string; phone?: string }[];
  leadDesigner: string | null;
  summary: Summary;
}

export interface MyReferrals {
  enabled: boolean;
  referrerReward: string;
  friendReward: string;
  terms: string;
  code: string | null;
  link: string | null;
  needsVerification: boolean;
  referrals: { _id: string; friend: string; status: "signed_up" | "qualified" | "rewarded" | "rejected"; createdAt: string; rewardedAt: string | null }[];
  counts: { joined: number; qualified: number; rewarded: number };
}

export interface AdminReferral {
  _id: string;
  status: "signed_up" | "qualified" | "rewarded" | "rejected";
  code: string;
  referrer: { _id: string; name: string; email: string; phone?: string } | null;
  referred: { _id: string; name: string; email: string; phone?: string; phoneVerified?: boolean; status: string; createdAt: string } | null;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  handledBy: { name: string } | null;
  note: string;
  createdAt: string;
}

const path = (projectId: string, milestoneId: string) => `/payments/${projectId}/milestones/${milestoneId}`;
const adminPath = (projectId: string, milestoneId: string) => `/admin/payments/${projectId}/milestones/${milestoneId}`;
type PaymentBody = { method: PayMethod; reference: string; amountPaise: number; paidOn: string };

export const paymentsApi = {
  mine: () => apiClient.get<ApiResponse<{ payTo: PayTo; projects: CustomerSchedule[] }>>("/payments/mine").then((r) => r.data.data),
  claim: (projectId: string, milestoneId: string, body: PaymentBody & { note?: string }) =>
    apiClient.post<ApiResponse<CustomerSchedule>>(`${path(projectId, milestoneId)}/claim`, body).then((r) => r.data),
  receipt: (projectId: string, milestoneId: string) => apiClient.get<ApiResponse<Receipt>>(`${path(projectId, milestoneId)}/receipt`).then((r) => r.data.data),
  invoice: (projectId: string, milestoneId: string) =>
    apiClient.get<ApiResponse<{ url: string; fileName: string }>>(`${path(projectId, milestoneId)}/invoice`).then((r) => r.data.data),

  adminList: (filter?: "verifying" | "overdue") =>
    apiClient
      .get<ApiResponse<{ rows: AdminPaymentRow[]; withoutSchedule: { projectId: string; projectName: string; customers: string[] }[] }>>("/admin/payments", { params: { filter } })
      .then((r) => r.data.data),
  adminGet: (projectId: string) => apiClient.get<ApiResponse<AdminFinance>>(`/admin/payments/${projectId}`).then((r) => r.data.data),
  save: (projectId: string, body: { contractValuePaise: number; gstRatePct: number; notes: string; milestones: { _id?: string; title: string; amountPaise: number; dueDate: string | null }[] }) =>
    apiClient.put<ApiResponse<AdminFinance>>(`/admin/payments/${projectId}`, body).then((r) => r.data),
  confirm: (projectId: string, milestoneId: string, body: PaymentBody) =>
    apiClient.post<ApiResponse<AdminFinance & { receiptNo: string }>>(`${adminPath(projectId, milestoneId)}/confirm`, body).then((r) => r.data),
  reject: (projectId: string, milestoneId: string, note: string) =>
    apiClient.post<ApiResponse<AdminFinance>>(`${adminPath(projectId, milestoneId)}/reject`, { note }).then((r) => r.data),
  waive: (projectId: string, milestoneId: string) => apiClient.post<ApiResponse<AdminFinance>>(`${adminPath(projectId, milestoneId)}/waive`).then((r) => r.data),
  uploadInvoice: (projectId: string, milestoneId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post<ApiResponse<AdminFinance>>(`${adminPath(projectId, milestoneId)}/invoice`, form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  },

  myReferrals: () => apiClient.get<ApiResponse<MyReferrals>>("/referrals/mine").then((r) => r.data.data),
  checkReferral: (code: string) =>
    apiClient.get<ApiResponse<{ valid: boolean; referrerFirstName?: string; friendReward?: string }>>(`/customer/auth/referral/${encodeURIComponent(code)}`).then((r) => r.data.data),
  adminReferrals: (status?: string) =>
    apiClient
      .get<ApiResponse<{ rows: AdminReferral[]; counts: Record<string, number>; programme: { enabled: boolean; referrerReward: string; friendReward: string; terms: string } }>>(
        "/admin/referrals",
        { params: { status } }
      )
      .then((r) => r.data.data),
  actOnReferral: (id: string, action: "reward" | "reject", note = "") => apiClient.patch(`/admin/referrals/${id}`, { action, note }).then((r) => r.data)
};

/** upi:// link that opens the customer's UPI app with the amount filled in. */
export const upiLink = (payTo: PayTo, amountPaise: number, note: string) => {
  const params = new URLSearchParams({ pa: payTo.upiId, pn: payTo.companyName || "Bonito", am: (amountPaise / 100).toFixed(2), cu: "INR", tn: note.slice(0, 50) });
  return `upi://pay?${params.toString()}`;
};
