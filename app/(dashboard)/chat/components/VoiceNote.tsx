"use client";

import { useEffect, useState } from "react";
import { Play, Loader2, Mic, Lock } from "lucide-react";
import { fetchDecrypted, formatDuration } from "@/lib/chat/files";
import type { ChatAttachment } from "@/types/chat";

/** A voice note in a message: decrypted when first played, then a normal audio player. */
export function VoiceNote({ attachment, sessionKey }: { attachment: ChatAttachment; sessionKey: CryptoKey | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );

  if (url) {
    // eslint-disable-next-line jsx-a11y/media-has-caption -- a person's voice note; no captions exist
    return <audio controls autoPlay src={url} className="h-10 w-64 max-w-full" aria-label="Voice note" />;
  }

  return (
    <button
      disabled={!sessionKey || busy}
      onClick={async (e) => {
        e.stopPropagation();
        if (!sessionKey) return;
        setBusy(true);
        setError(false);
        try {
          setUrl(URL.createObjectURL(await fetchDecrypted(attachment, sessionKey)));
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
      className="flex items-center gap-3 px-3 py-2 rounded-full bg-slate-700/60 border border-slate-600/50 hover:border-violet-500/40 transition disabled:opacity-60 w-60 max-w-full"
      aria-label={`Play voice note${attachment.durationSec ? `, ${formatDuration(attachment.durationSec)}` : ""}`}
    >
      <span className="h-8 w-8 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
        {busy ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : <Play className="h-4 w-4 text-white fill-white" />}
      </span>
      <span className="flex-1 flex items-center gap-1.5 text-xs text-slate-300">
        <Mic className="h-3.5 w-3.5 text-violet-300" aria-hidden />
        Voice note
      </span>
      <span className="text-[11px] text-slate-400 tabular-nums">
        {error ? <span className="text-rose-400">Couldn&apos;t play</span> : attachment.durationSec ? formatDuration(attachment.durationSec) : <Lock className="h-3 w-3" />}
      </span>
    </button>
  );
}
