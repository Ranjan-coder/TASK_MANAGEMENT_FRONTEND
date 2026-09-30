"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import {
  homeRouteFor,
  RESTRICTED_FOR_LIMITED_ROLES,
  CUSTOMER_ONLY_ROUTES,
  CONTENT_MANAGER_ROUTES,
  CONTENT_MANAGER_ROLES,
  ADMIN_ONLY_ROUTES,
  LIMITED_ROLES
} from "@/lib/utils";
import { can, ROUTE_PERMISSIONS } from "@/lib/permissions";
import type { User } from "@/types";

/** Admin screens opened by an add-on permission (or leadership) for this person. */
const openedByPermission = (user: User, within: (routes: string[]) => boolean) =>
  ROUTE_PERMISSIONS.some((r) => within([r.prefix]) && can(user, ...r.perms));

/**
 * Client-side routing guard for the staff app. The API enforces the same rules
 * (accessPolicy.js); this only keeps users away from screens that would fail.
 */
export function AccountGate() {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    if (user.mustChangePassword) {
      if (!pathname.startsWith("/settings")) router.replace(homeRouteFor(user));
      return;
    }

    const within = (routes: string[]) => routes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    const limited = LIMITED_ROLES.includes(user.role);
    const viaPermission = openedByPermission(user, within);
    if (limited && within(RESTRICTED_FOR_LIMITED_ROLES)) {
      router.replace(homeRouteFor(user));
    } else if (user.role !== "customer" && within(CUSTOMER_ONLY_ROUTES)) {
      router.replace(homeRouteFor(user));
    } else if (!CONTENT_MANAGER_ROLES.includes(user.role) && within(CONTENT_MANAGER_ROUTES) && !viaPermission) {
      router.replace(homeRouteFor(user));
    } else if (!["superadmin", "admin"].includes(user.role) && within(ADMIN_ONLY_ROUTES) && !viaPermission) {
      router.replace(homeRouteFor(user));
    }
  }, [user, pathname, router]);

  return null;
}
