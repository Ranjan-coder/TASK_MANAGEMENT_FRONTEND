"use client";

import { ShieldAlert } from "lucide-react";

/** Shown while this person has no key for the conversation yet. */
export function NoKeyBanner({ waitingFor }: { waitingFor: string | null }) {
  return (
    <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
      <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        {waitingFor !== null ? (
          <>
            <p className="text-sm text-amber-300 font-medium">Waiting for {waitingFor || "this person"} to open Chat</p>
            <p className="text-xs text-amber-400/70">
              Messages will be end-to-end encrypted once they sign in to chat for the first time.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-amber-300 font-medium">Getting access to this chat</p>
            <p className="text-xs text-amber-400/70">
              The next member who opens this chat will share its encryption key with you automatically.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** "Asha is typing…" bubble under the last message. */
export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex items-end gap-2 pl-9 mt-1" aria-live="polite">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">
            {names.slice(0, 2).join(", ")} {names.length === 1 ? "is" : "are"} typing
          </span>
          <span className="flex gap-0.5 ml-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
