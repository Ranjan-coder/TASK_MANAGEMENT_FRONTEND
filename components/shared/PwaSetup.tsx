"use client";

import { useEffect } from "react";
import { initPwa } from "@/lib/pwa";

/** Registers the service worker once (installable app + push). */
export function PwaSetup() {
  useEffect(() => {
    initPwa();
  }, []);
  return null;
}
