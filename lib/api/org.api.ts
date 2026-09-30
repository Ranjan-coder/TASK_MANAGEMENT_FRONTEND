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
  permissions: { key: Permission; label: string }[];
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
  merge: (kind: Kind, id: string, into: string) => data<{ usersMoved: number }>(apiClient.post(`/org/${kind}/${id}/merge`, { into })),
  reorder: (kind: Kind, ids: string[]) => apiClient.put(`/org/${kind}/order`, { ids }),
  setUserPermissions: (userId: string, permissions: Permission[]) => apiClient.patch(`/users/${userId}/permissions`, { permissions })
};
