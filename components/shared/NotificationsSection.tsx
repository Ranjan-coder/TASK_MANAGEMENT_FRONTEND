"use client";

import { useEffect, useState } from "react";
import { BellRing, Smartphone, MessageCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { usersApi } from "@/lib/api/users.api";
import { apiErrorMessage } from "@/lib/api/customerAuth.api";
import { canInstall, currentPushSubscription, disablePush, enablePush, isIos, isStandalone, onPwaChange, promptInstall, pushSupported } from "@/lib/pwa";

/** Settings → Notifications: this device's push, the installable app, and (customers) WhatsApp/SMS alerts. */
export function NotificationsSection() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const isCustomer = user?.role === "customer";
  const prefs = user?.notificationPrefs ?? { whatsapp: false, sms: false };

  useEffect(() => {
    const refresh = async () => {
      setInstallable(canInstall());
      setStandalone(isStandalone());
      setPushOn(Boolean(await currentPushSubscription()) && typeof Notification !== "undefined" && Notification.permission === "granted");
    };
    refresh();
    return onPwaChange(refresh);
  }, []);

  const togglePush = async () => {
    setBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast.success("Notifications turned off on this device");
      } else {
        const result = await enablePush();
        if (result === "enabled") {
          setPushOn(true);
          toast.success("You'll get notifications on this device");
        } else if (result === "denied") toast.error("Notifications are blocked. Allow them for this site in your browser settings.");
        else if (result === "unsupported") toast.error(isIos() ? "On iPhone, first add Bonito to your Home Screen, then turn this on there." : "This browser doesn't support notifications.");
        else toast.error("Notifications aren't available right now.");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change notifications"));
    } finally {
      setBusy(false);
    }
  };

  const setPref = async (key: "whatsapp" | "sms", value: boolean) => {
    try {
      const res = await usersApi.updateProfile({ notificationPrefs: { ...{ whatsapp: prefs.whatsapp, sms: prefs.sms }, [key]: value } });
      setUser(res.data.data);
      toast.success(value ? `${key === "whatsapp" ? "WhatsApp" : "SMS"} alerts on` : "Alerts off");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save"));
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-white flex items-center gap-2"><BellRing className="h-4 w-4 text-violet-300" /> Notifications on this device</h2>
        <p className="text-xs text-slate-400">
          {isCustomer ? "Know when your designer replies, even when Bonito isn't open." : "Customer reminders, escalations and alerts, even when Bonito isn't open."} Turn it on for each phone or computer you use.
        </p>
        {pushSupported() || isIos() ? (
          <button type="button" disabled={busy || pushOn === null} onClick={togglePush} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-50">
            {pushOn ? "Turn off on this device" : "Turn on notifications"}
          </button>
        ) : (
          <p className="text-xs text-amber-300">This browser doesn&apos;t support notifications.</p>
        )}
        <p className="text-[11px] text-slate-500">Notifications show the project name, never your messages. Signing out stops them on this device.</p>
      </section>

      {!standalone && (
        <section className="space-y-2 pt-4 border-t border-slate-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><Smartphone className="h-4 w-4 text-violet-300" /> Install the app</h2>
          {installable ? (
            <>
              <p className="text-xs text-slate-400">Add Bonito to your home screen — it opens like an app, no Play Store needed.</p>
              <button type="button" onClick={() => promptInstall()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-slate-100 text-xs font-semibold hover:border-slate-500">
                <Download className="h-3.5 w-3.5" /> Install Bonito
              </button>
            </>
          ) : isIos() ? (
            <p className="text-xs text-slate-400">On iPhone: tap the Share button in Safari, then <strong>Add to Home Screen</strong>.</p>
          ) : (
            <p className="text-xs text-slate-400">Use your browser menu → <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</p>
          )}
        </section>
      )}

      {isCustomer && (
        <section className="space-y-2 pt-4 border-t border-slate-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-300" /> WhatsApp &amp; SMS alerts</h2>
          <p className="text-xs text-slate-400">If a reply from your designer is still unread after about 10 minutes, we&apos;ll send a short alert to {user?.phone || "your mobile"}. At most one every 3 hours per project, and never between 9 PM and 8 AM.</p>
          {!user?.phoneVerified ? (
            <p className="text-xs text-amber-300">Verify your mobile number first.</p>
          ) : (
            <div className="space-y-2">
              {(["whatsapp", "sms"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={Boolean(prefs[k])} onChange={(e) => setPref(k, e.target.checked)} className="accent-violet-500 h-4 w-4" />
                  {k === "whatsapp" ? "WhatsApp" : "SMS"} alerts
                </label>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Alerts only say that your designer replied and link to the app — never the message itself.</p>
        </section>
      )}
    </div>
  );
}
