import { apiClient } from "./client";
import type { ApiResponse, Permission, Role } from "@/types";

export interface Department {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  head: { _id: string; name?: string; avatarUrl?: string; designation?: string } | null;
  userCount?: number;
  standard?: boolean; // from the product owner's standard list
  customised?: string[]; // fields this organisation changed (kept when the standard changes)
}

export interface Designation {
  _id: string;
  name: string;
  short: string;
  level: number;
  departments: string[];
  suggestedRole: Role | null;
  isActive: boolean;
  sortOrder: number;
  userCount?: number;
  standard?: boolean;
  customised?: string[];
}

export interface OrgNode {
  _id: string;
  name: string;
  avatarUrl?: string;
  role: Role;
  department?: string;
  designation?: string;
  level: number;
  reportsTo: string | null;
  reports: OrgNode[];
}

export interface TeamMember extends Omit<OrgNode, "reports"> {
  depth: number;
  reportCount: number;
}

export interface PermissionCatalog {
  permissions: { key: Permission; label: string; module?: string }[];
  implied: Partial<Record<Role, Permission[]>>;
  grantableRoles: Role[];
}

export const LEVEL_LABELS: Record<number, string> = {
  1: "Board & top leadership",
  2: "CXO",
  3: "Senior management",
  4: "Upper management",
  5: "Branch & regional",
  6: "Managers",
  7: "Leads & seniors",
  8: "Executives",
  9: "Entry level"
};

type Kind = "departments" | "designations";
const data = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((r) => r.data.data);
const listParams = (opts: { includeInactive?: boolean; counts?: boolean } = {}) => ({
  ...(opts.includeInactive && { includeInactive: "1" }),
  ...(opts.counts && { counts: "1" })
});

/** One of the organisation's modules, with seats (superadmin view). */
export interface OrgModuleRow {
  key: string;
  label: string;
  description: string;
  core: boolean;
  requiresAll: string[];
  neededBy: string[];
  seatLimit: number | null;
  seatsUsed: number | null;
  defaultOn?: boolean; // everyone has it (no per-person grants, no seats)
  orgWide?: boolean; // a setting of the whole organisation (e.g. branding): everyone has it, no seats
  customerOptIn?: boolean; // a superadmin may open it to customers
  customersEnabled?: boolean;
}

export interface UserModules {
  all: boolean; // holds every module (by role default or by choice)
  default: boolean; // following the role's default
  keys: string[];
  effective: string[];
  version: number;
}

export const orgApi = {
  departments: (opts?: { includeInactive?: boolean; counts?: boolean }) =>
    data<Department[]>(apiClient.get("/org/departments", { params: listParams(opts) })),
  designations: (opts?: { includeInactive?: boolean; counts?: boolean }) =>
    data<{ items: Designation[]; minAssignableLevel: number | null }>(apiClient.get("/org/designations", { params: listParams(opts) })),
  chart: () => data<{ roots: OrgNode[]; total: number }>(apiClient.get("/org/chart")),
  team: (userId?: string) => data<{ direct: TeamMember[]; all: TeamMember[] }>(apiClient.get("/org/team", { params: userId ? { userId } : {} })),
  permissions: () => data<PermissionCatalog>(apiClient.get("/org/permissions")),

  // Superadmin only
  create: <T>(kind: Kind, body: Record<string, unknown>) => data<T>(apiClient.post(`/org/${kind}`, body)),
  update: <T>(kind: Kind, id: string, body: Record<string, unknown>) => data<T>(apiClient.patch(`/org/${kind}/${id}`, body)),
  remove: (kind: Kind, id: string) => apiClient.delete(`/org/${kind}/${id}`),
  /** Take the product owner's standard version again (drops this organisation's own changes). */
  reset: (kind: Kind, id: string) => apiClient.post(`/org/${kind}/${id}/reset`),
  merge: (kind: Kind, id: string, into: string) => data<{ usersMoved: number }>(apiClient.post(`/org/${kind}/${id}/merge`, { into })),
  reorder: (kind: Kind, ids: string[]) => apiClient.put(`/org/${kind}/order`, { ids }),
  setUserPermissions: (userId: string, permissions: Permission[]) => apiClient.patch(`/users/${userId}/permissions`, { permissions }),

  // ── Modules (superadmin; module-access-plan.md Phase 4) ──
  modules: () => data<OrgModuleRow[]>(apiClient.get("/org/modules")),
  userModules: (userId: string) => data<UserModules>(apiClient.get(`/users/${userId}/modules`)),
  setUserModules: (userId: string, body: { all: boolean | null; keys: string[] }) => apiClient.patch(`/users/${userId}/modules`, body),
  setModuleCustomers: (key: string, enabled: boolean) => apiClient.patch(`/org/modules/${key}/customers`, { enabled }),
  setModuleMembers: (key: string, body: { add?: string[]; remove?: string[] }) =>
    data<{ changed: number; skipped: number }>(apiClient.post(`/org/modules/${key}/members`, body))
};
