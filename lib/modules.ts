import type { User } from "@/types";
import catalog from "@/lib/generated/modules.json";

/**
 * Which modules the signed-in person's organisation has (module-access-plan.md,
 * Phase 3). The API enforces the same rule on every request; this only decides
 * what the app shows. `user.organisation.modules` comes from /auth/me and sign-in.
 */
export type ModuleKey =
  | "core"
  | "organisation"
  | "privacy"
  | "tasks"
  | "projects"
  | "chat"
  | "customer_portal"
  | "leads"
  | "marketing"
  | "payments"
  | "referrals"
  | "performance"
  | "reports"
  | "moderation"
  | "planner"
  | "branding";

// Per-user cache: Set lookups are O(1); rebuilt only when the module list changes
let cachedFor: string[] | undefined;
let cachedSet = new Set<string>();

export function hasModule(user: User | null | undefined, key: ModuleKey): boolean {
  if (!user) return false;
  if (user.role === "platform_owner") return false; // no organisation, no modules
  // Personal list (organisation AND own grants) when known, else the organisation's
  const list = user.modules ?? user.organisation?.modules;
  // Not loaded yet (older response): show it; the API still refuses if it's off
  if (!list) return true;
  if (list !== cachedFor) {
    cachedFor = list;
    cachedSet = new Set(list);
  }
  return cachedSet.has(key);
}

/**
 * Screens and the module each belongs to, generated from the backend registry
 * (backend/scripts/genModules.js) and already sorted longest first, so the first
 * prefix that matches is the most specific one.
 */
const PAGE_MODULES = catalog.pages as [string, ModuleKey][];

/** Module catalog (labels, default-on, staff-only, customer opt-in), same as the API's. */
export const MODULE_CATALOG = catalog.modules;

/** The module a screen belongs to, or null for core screens. */
export function moduleForPage(pathname: string): ModuleKey | null {
  for (const [prefix, key] of PAGE_MODULES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  return null;
}

export const canOpenPage = (user: User | null | undefined, pathname: string) => {
  const key = moduleForPage(pathname);
  return !key || hasModule(user, key);
};
