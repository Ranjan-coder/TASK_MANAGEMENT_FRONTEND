"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDuration } from "@/lib/chat/files";

const MAX_SECONDS = 600; // the server refuses longer voice notes
// What each browser can record, best first (Chrome/Firefox: Opus; Safari: AAC in MP4)
const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];

const pickType = () => (typeof MediaRecorder === "undefined" ? null : TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null);

/**
 * Voice notes (P4): tap the mic, talk, then send or bin it. Recording stays in
 * this browser until sent; it's encrypted like any other file before upload.
 */
export function VoiceRecorder({ disabled, onSend }: { disabled?: boolean; onSend: (blob: Blob, durationSec: number, mimeType: string) => Promise<void> }) {
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const sendOnStop = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    recorder.current?.stream.getTracks().forEach((t) => t.stop()); // turn the microphone off
    recorder.current = null;
  };
  useEffect(() => () => cleanup(), []);

  const start = async () => {
    const type = pickType();
    if (!type || !navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser can't record voice notes");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: type });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        const duration = (Date.now() - startedAt.current) / 1000;
        const blob = new Blob(chunks.current, { type: type.split(";")[0] });
        cleanup();
        if (!sendOnStop.current || duration < 1) {
          setState("idle");
          return;
        }
        setState("sending");
        try {
          await onSend(blob, Math.min(duration, MAX_SECONDS), type.split(";")[0]);
        } finally {
          setState("idle");
        }
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      sendOnStop.current = false;
      setSeconds(0);
      rec.start(1000);
      setState("recording");
      tick.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop(true);
      }, 250);
    } catch {
      toast.error("Microphone access was blocked. Allow it in the browser to record.");
    }
  };

  const stop = (send: boolean) => {
    sendOnStop.current = send;
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={start}
        title="Record a voice note"
        aria-label="Record a voice note"
        className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition disabled:opacity-40"
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label="Recording voice note">
      {state === "recording" ? (
        <>
          <span className="flex items-center gap-1.5 px-2 text-xs text-rose-300 tabular-nums" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" aria-hidden />
            {formatDuration(seconds)}
          </span>
          <button type="button" onClick={() => stop(false)} aria-label="Discard recording" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-700">
            <Trash2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => stop(true)} aria-label="Send voice note" className="h-8 w-8 flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white">
            <Send className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <span className="flex items-center gap-1.5 px-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Sending…
        </span>
      )}
    </div>
  );
}
