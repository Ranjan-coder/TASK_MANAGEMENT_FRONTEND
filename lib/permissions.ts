import type { Permission, User } from "@/types";

/**
 * What the signed-in person may do beyond their role. The API sends
 * `effectivePermissions` (admins hold everything; leadership its read-only set);
 * this only decides what the app shows — the API re-checks every request.
 */
export const can = (user: User | null | undefined, ...perms: Permission[]) =>
  Boolean(user && (user.role === "superadmin" || user.role === "admin" || perms.some((p) => user.effectivePermissions?.includes(p))));

export const isAdmin = (user: User | null | undefined) => Boolean(user && (user.role === "superadmin" || user.role === "admin"));

export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  marketing: "Marketing",
  user: "Staff",
  leadership: "Leadership",
  customer: "Customer"
};

/**
 * Admin screens that add-on permissions can open, and which permission opens each.
 * Anyone holding one of the listed permissions may visit.
 */
export const ROUTE_PERMISSIONS: { prefix: string; perms: Permission[] }[] = [
  { prefix: "/admin/overview", perms: ["performance.view"] },
  { prefix: "/admin/performance", perms: ["performance.view"] },
  { prefix: "/admin/payments", perms: ["payments.view", "payments.confirm"] },
  { prefix: "/admin/projects", perms: ["projects.view"] },
  { prefix: "/admin/leads", perms: ["leads.view", "leads.manage"] }
];
