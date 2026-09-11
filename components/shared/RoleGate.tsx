"use client";

import { useAuthStore } from "@/store/authStore";
import { Role } from "@/types";
import { ReactNode } from "react";

interface RoleGateProps {
  allowedRoles: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { user } = useAuthStore();

  if (!user || !allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
