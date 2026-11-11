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

export interface ResetChoice {
  chooseOrganisation: true;
  organisations: { slug: string; name: string }[];
  resetToken: string;
}

export interface VerifiedSession {
  user?: User;
  requires2FA?: boolean;
  tempToken?: string;
}

export const customerAuthApi = {
  sendOtp: (data: { verificationToken: string; phone?: string }) =>
    apiClient.post<{ data: { phoneMasked: string; resendAfterSeconds: number } }>("/customer/auth/otp/send", data),

  verifyOtp: (data: { verificationToken: string; code: string }) =>
    apiClient.post<{ data: VerifiedSession }>("/customer/auth/otp/verify", data),

  requestPasswordResetOtp: (data: { phone: string }) =>
    apiClient.post<{ data: { resendAfterSeconds: number }; message: string }>("/customer/auth/password/otp", data),

  // Several organisations on one phone: the first call answers with chooseOrganisation,
  // and the second sends resetToken + the chosen organisation code instead of the code
  resetPasswordWithOtp: (
    data: { authKey: string; kdfSalt: string } & ({ phone: string; code: string } | { resetToken: string; organisation: string })
  ) => apiClient.post<{ data: ResetChoice | null; message: string }>("/customer/auth/password/reset", data)
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
