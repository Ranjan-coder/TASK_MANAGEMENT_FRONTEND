import { apiClient } from "./client";
import type { ApiResponse } from "@/types";

/** The product owner's console (backend routes/platform.routes.js). */

export interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  core: boolean;
  defaultOn?: boolean; // on for everyone unless switched off; no seats
  orgWide?: boolean; // a setting of the whole organisation (e.g. branding); no seats
  staffOnly?: boolean;
  requires: string[];
  requiresAll: string[]; // everything it pulls in when switched on
  neededBy: string[]; // everything that stops working without it
}

export interface OrgModule {
  key: string;
  core: boolean;
  enabled: boolean;
  expiresAt: string | null;
  seatLimit: number | null;
  seatsUsed: number | null; // people holding it (counts only)
  effective: boolean; // on, not expired, and everything it needs is on
}

export interface OrgUsage {
  staff: number;
  customers: number;
  active: number;
  activeLast30Days: number;
}

export interface PlatformOrg {
  _id: string;
  name: string;
  slug: string;
  displayName: string | null; // shown instead of the product name while "branding" is on
  status: "active" | "suspended";
  createdAt: string;
  entitlementVersion: number;
  modules: OrgModule[];
  usage: OrgUsage;
}

export interface PlatformAuditEntry {
  _id: string;
  action: string;
  targetId: string;
  actor?: { _id: string; name: string } | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateOrgPayload {
  name: string;
  slug: string;
  modules: string[];
  superadmin: { name: string; email: string; password: string };
}

const data = <T,>(p: Promise<{ data: ApiResponse<T> }>) => p.then((r) => r.data.data);

export const platformApi = {
  modules: () => data<ModuleInfo[]>(apiClient.get("/platform/modules")),
  organisations: (params: { search?: string; status?: string } = {}) =>
    data<PlatformOrg[]>(apiClient.get("/platform/organisations", { params })),
  organisation: (id: string) => data<PlatformOrg>(apiClient.get(`/platform/organisations/${id}`)),

  /** The first superadmin's initial password is turned into an authKey here; it never reaches the server. */
  createOrganisation: async ({ superadmin: { password, ...admin }, ...rest }: CreateOrgPayload) => {
    const { prepareNewPassword } = await import("@/lib/auth/credentials");
    const { authKey, kdfSalt } = await prepareNewPassword(password);
    return data<PlatformOrg>(apiClient.post("/platform/organisations", { ...rest, superadmin: { ...admin, authKey, kdfSalt } }));
  },

  updateOrganisation: (id: string, patch: { name?: string; status?: "active" | "suspended"; displayName?: string | null }) =>
    data<PlatformOrg>(apiClient.patch(`/platform/organisations/${id}`, patch)),

  setModule: (id: string, key: string, patch: { enabled?: boolean; expiresAt?: string | null; seatLimit?: number | null }) =>
    data<{ organisation: PlatformOrg; pulledIn: string[] }>(apiClient.put(`/platform/organisations/${id}/modules/${key}`, patch)),

  audit: () => data<PlatformAuditEntry[]>(apiClient.get("/platform/audit"))
};

// ── Standard departments and designations (every organisation's starting list) ──

/** How a standard item is used: companies with a copy, and how many changed it themselves. */
interface TemplateUsage {
  companies: number;
  customised: number;
}

export interface TemplateDepartment extends TemplateUsage {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface TemplateDesignation extends TemplateUsage {
  _id: string;
  name: string;
  short: string;
  level: number;
  departments: string[];
  suggestedRole: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** What a change reached: companies updated, and companies that kept their own value. */
export interface TemplateReach {
  companies: number;
  kept?: number;
  changed?: string[];
}

type TemplateKind = "departments" | "designations";

export const templateApi = {
  list: () => data<{ departments: TemplateDepartment[]; designations: TemplateDesignation[] }>(apiClient.get("/platform/org-template")),
  create: (kind: TemplateKind, body: Record<string, unknown>) => data<TemplateReach & { item: { _id: string } }>(apiClient.post(`/platform/org-template/${kind}`, body)),
  update: (kind: TemplateKind, id: string, body: Record<string, unknown>) => data<TemplateReach>(apiClient.patch(`/platform/org-template/${kind}/${id}`, body)),
  remove: (kind: TemplateKind, id: string) => data<{ detached: number }>(apiClient.delete(`/platform/org-template/${kind}/${id}`))
};
