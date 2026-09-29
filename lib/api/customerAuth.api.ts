import apiClient from "./client";
import type { User } from "@/types";

export interface PhoneVerificationStep {
  requiresPhoneVerification: true;
  verificationToken: string;
  needsPhone: boolean;
  phoneMasked: string | null;
  otpSent: boolean;
  resendAfterSeconds: number;
  otpMessage?: string;
}

export interface CustomerRegisterPayload {
  name: string;
  email: string;
  phone: string;
  authKey: string;
  kdfSalt: string;
  acceptTerms: true;
  projectAlerts?: boolean;
  referralCode?: string;
}

export interface VerifiedSession {
  user?: User;
  requires2FA?: boolean;
  tempToken?: string;
}

export const customerAuthApi = {
  register: (data: CustomerRegisterPayload) =>
    apiClient.post<{ data: PhoneVerificationStep }>("/customer/auth/register", data),

  sendOtp: (data: { verificationToken: string; phone?: string }) =>
    apiClient.post<{ data: { phoneMasked: string; resendAfterSeconds: number } }>("/customer/auth/otp/send", data),

  verifyOtp: (data: { verificationToken: string; code: string }) =>
    apiClient.post<{ data: VerifiedSession }>("/customer/auth/otp/verify", data),

  requestPasswordResetOtp: (data: { phone: string }) =>
    apiClient.post<{ data: { resendAfterSeconds: number }; message: string }>("/customer/auth/password/otp", data),

  resetPasswordWithOtp: (data: { phone: string; code: string; authKey: string; kdfSalt: string }) =>
    apiClient.post("/customer/auth/password/reset", data)
};

/** First human-readable error message from an API error response. */
export function apiErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  const detail = Array.isArray(data?.errors) ? data.errors.find((e: any) => e?.message)?.message : undefined;
  return detail || data?.message || fallback;
}

export function apiErrorCode(err: any): string | undefined {
  return err?.response?.data?.errors?.[0]?.code;
}

/** Same rule as the server: 10-digit Indian mobile, optional +91 / 0 prefix. */
export function isValidIndianMobile(value: string): boolean {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits);
}
