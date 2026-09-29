"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { currentPushSubscription, enablePush, isIos, isStandalone, pushSupported } from "@/lib/pwa";

const DISMISS_KEY = "bonito:alerts-prompt-dismissed";

/**
 * Home card: "Know when your designer replies". Offers push on this device
 * (and points to WhatsApp alerts in Settings). Hidden once on or dismissed.
 */
export function AlertsPrompt({ hasProjects }: { hasProjects: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage blocked: still fine to show */
    }
    if (!hasProjects || dismissed) return;
    (async () => {
      const on = Boolean(await currentPushSubscription()) && typeof Notification !== "undefined" && Notification.permission === "granted";
      const possible = pushSupported() || (isIos() && !isStandalone());
      setShow(!on && possible && (typeof Notification === "undefined" || Notification.permission !== "denied"));
    })();
  }, [hasProjects]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      const r = await enablePush();
      if (r === "enabled") {
        toast.success("Done — we'll let you know when your designer replies");
        setShow(false);
      } else if (r === "denied") toast.error("Notifications are blocked for this site in your browser settings.");
      else if (r === "unsupported" && isIos()) toast.info("On iPhone: tap Share → Add to Home Screen, open Bonito from there, then turn this on.");
      else toast.error("Notifications aren't available on this browser.");
    } catch {
      toast.error("Couldn't turn on notifications");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex gap-3 p-4 rounded-2xl bg-violet-600/10 border border-violet-500/25">
      <BellRing className="h-5 w-5 text-violet-300 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <p className="text-sm font-semibold text-white">Know when your designer replies</p>
        <p className="text-xs text-slate-300">
          Get a notification on this phone, or a WhatsApp alert — <Link href="/settings?section=notifications" className="underline">choose in Settings</Link>.
        </p>
        <button type="button" onClick={turnOn} disabled={busy} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-50">
          Turn on notifications
        </button>
      </div>
      <button type="button" onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 text-slate-400 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
