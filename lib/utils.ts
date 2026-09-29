import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString?: string | Date): string {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatDateTime(dateString?: string | Date): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function getInitials(name?: string): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

/**
 * Where a signed-in user should land. Accounts that must change their password
 * go straight to Settings → Security; customers start on the portal home;
 * marketing (no task access) starts in the content manager.
 */
export function homeRouteFor(user?: { role?: string; mustChangePassword?: boolean } | null): string {
  if (!user) return "/login";
  if (user.mustChangePassword) return "/settings?section=security";
  if (user.role === "customer") return "/home";
  if (user.role === "marketing") return "/admin/campaigns";
  return "/dashboard";
}

// Staff-app areas that customers and marketing accounts cannot use
export const RESTRICTED_FOR_LIMITED_ROLES = ["/dashboard", "/tasks", "/users", "/audit-logs"];

// Customer-portal-only areas
export const CUSTOMER_ONLY_ROUTES = ["/home"];

// Content manager (campaigns, catalog): superadmin, admin, marketing only
export const CONTENT_MANAGER_ROUTES = ["/admin"];
export const CONTENT_MANAGER_ROLES = ["superadmin", "admin", "marketing"];

// Project set-up: admins only
export const ADMIN_ONLY_ROUTES = ["/admin/projects", "/admin/reply-times", "/admin/reports", "/admin/moderation", "/admin/overview", "/admin/performance", "/admin/customers", "/admin/privacy", "/admin/payments", "/admin/referrals"];

/**
 * Right-sized image from Cloudinary: modern format (WebP/AVIF), automatic quality and
 * at most `width` px wide (served at 2× for sharp phone screens). Only public
 * res.cloudinary.com "image/upload" URLs are changed — signed/private links and
 * anything else are returned as-is, since a transform would break their signature.
 */
export function sizedImage(url: string | undefined | null, width: number): string {
  if (!url) return "";
  const marker = "/image/upload/";
  if (!url.startsWith("https://res.cloudinary.com/") || !url.includes(marker)) return url;
  return url.replace(marker, `${marker}f_auto,q_auto,c_limit,w_${Math.round(width * 2)}/`);
}
