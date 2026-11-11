"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { ICONS } from "@/lib/icons";

/**
 * Two different names (module-access-plan.md, Phase 5):
 * - The app's name: the product (APP_NAME, NEXT_PUBLIC_APP_NAME), or, after sign-in,
 *   the organisation's brand name when the product owner has switched on its
 *   "branding" module and set a display name (useAppName).
 * - The organisation's name: whoever the person deals with (their designer's
 *   company). Comes from /auth/me; never hard-coded, since the app serves many.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Serenx";

/**
 * The Serenx logo. It belongs to the product, so it is the same for every
 * organisation and every person: branding changes only the name, never this.
 * Icons for the browser, phone home screens and notifications are generated from
 * the same file (scripts/genIcons.js).
 */
export const PRODUCT_LOGO = ICONS.icon192;

export function ProductLogo({ className = "h-9 w-9" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a small static icon; no optimisation needed
  return <img src={PRODUCT_LOGO} alt="Serenx" width={192} height={192} className={`${className} shrink-0 select-none`} draggable={false} />;
}

/** The app's name as this person sees it: their organisation's brand, or the product. */
export const appNameNow = () => useAuthStore.getState().user?.organisation?.brandName || APP_NAME;

/** Same, as a hook (re-renders when the profile loads). */
export const useAppName = () => useAuthStore((s) => s.user?.organisation?.brandName) || APP_NAME;

/** Inline in JSX text: <AppName /> */
export function AppName() {
  return <>{useAppName()}</>;
}

/**
 * Keeps the browser tab title on the brand name after sign-in (page metadata is
 * the same for everyone, so it can only name the product). Re-applied on navigation.
 */
export function useBrandedTitle() {
  const name = useAppName();
  const pathname = usePathname();
  useEffect(() => {
    if (name !== APP_NAME) document.title = name;
  }, [name, pathname]);
}

const FALLBACK = "your organisation";

/** The signed-in person's organisation name, for plain strings (toasts, URLs). */
export const orgNameNow = (fallback = FALLBACK) => useAuthStore.getState().user?.organisation?.name || fallback;

/** Same, as a hook (re-renders when the profile loads). */
export const useOrgName = (fallback = FALLBACK) => useAuthStore((s) => s.user?.organisation?.name) || fallback;

/** Inline in JSX text: <OrgName /> */
export function OrgName({ fallback = FALLBACK }: { fallback?: string }) {
  return <>{useOrgName(fallback)}</>;
}
