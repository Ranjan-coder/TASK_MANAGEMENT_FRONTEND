"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getSocket } from "@/lib/socket";
import type { ScanResult } from "@/lib/moderation/normalize";

/**
 * "This message may come across as offensive. Send anyway?" — asked on the
 * device before an abusive message is encrypted and sent (plan §6.4).
 * Returns a confirm() that resolves true (send) or false (cancel).
 */
export function useOffensiveConfirm() {
  const [pending, setPending] = useState<ScanResult | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmOffensive = useCallback(
    (scan: ScanResult) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setPending(scan);
      }),
    []
  );

  const answer = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && answer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  const offensiveDialog = pending ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="offensive-title" aria-describedby="offensive-body" className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-2xl">
        <h2 id="offensive-title" className="text-base font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-300" /> Send anyway?
        </h2>
        <p id="offensive-body" className="mt-2 text-sm text-slate-300">
          {pending.severity === "threat"
            ? "This message may read as a threat. If you send it, Bonito management will be alerted straight away."
            : "This message may come across as offensive."}{" "}
          Words like this are counted, and the chat is flagged for review if it keeps happening.
        </p>
        <p className="mt-2 text-[11px] text-slate-500">Checked on your device only — your message stays encrypted.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => answer(true)} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800">
            Send anyway
          </button>
          <button type="button" autoFocus onClick={() => answer(false)} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500">
            Edit message
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmOffensive, offensiveDialog };
}

const ackKey = (conversationId: string) => `bonito:moderation-ack:${conversationId}`;

/**
 * The "moving towards abusive language" popup for everyone in a flagged
 * project chat: shown live when the alert fires, or on the next open.
 */
export function ModerationWarningPopup({ conversationId, warningAt, active }: { conversationId: string; warningAt?: string | null; active: boolean }) {
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !warningAt) return;
    let acked = "";
    try {
      acked = localStorage.getItem(ackKey(conversationId)) || "";
    } catch {
      /* no storage: show it */
    }
    if (acked !== warningAt) setShownFor(warningAt);
  }, [conversationId, warningAt, active]);

  useEffect(() => {
    const socket = getSocket();
    const onWarning = (e: { conversationId: string; at: string }) => {
      if (e.conversationId === conversationId) setShownFor(new Date(e.at).toISOString());
    };
    socket.on("moderation:warning", onWarning);
    return () => {
      socket.off("moderation:warning", onWarning);
    };
  }, [conversationId]);

  if (!shownFor) return null;

  const close = () => {
    try {
      localStorage.setItem(ackKey(conversationId), shownFor);
    } catch {
      /* ignore */
    }
    setShownFor(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="modwarn-title" className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl text-center">
        <AlertTriangle className="h-10 w-10 text-amber-300 mx-auto" />
        <h2 id="modwarn-title" className="mt-3 text-base font-semibold text-white">Please keep it respectful</h2>
        <p className="mt-2 text-sm text-slate-300">
          This conversation is moving towards abusive language. This chat has been flagged for review by Bonito management.
        </p>
        <p className="mt-2 text-xs text-slate-500">If something upset you, you can report it with the ⚑ button at the top of the chat.</p>
        <button type="button" autoFocus onClick={close} className="mt-5 px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500">
          I understand
        </button>
      </div>
    </div>
  );
}
