"use client";

import { memo } from "react";
import { parseMentions } from "@/lib/chat/mentions";
import { hasFormatting, parseFormatting, type Inline } from "@/lib/chat/format";
import { cn } from "@/lib/utils";
import { useMentions } from "./MentionContext";

/** Plain text with @mention chips (lib/chat/mentions.ts). */
function WithMentions({ text }: { text: string }) {
  const { myId, nameOf } = useMentions();
  return (
    <>
      {parseMentions(text).map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        const mine = seg.kind === "mention" && seg.userId === myId;
        const label = seg.kind === "all" ? `@${seg.which}` : `@${nameOf(seg.userId) ?? "someone"}`;
        return (
          <span
            key={i}
            className={cn(
              "rounded px-1 font-medium",
              mine || seg.kind === "all" ? "bg-amber-400/20 text-amber-200" : "bg-violet-500/20 text-violet-200"
            )}
          >
            {label}
          </span>
        );
      })}
    </>
  );
}

/** One line of inline formatting; mentions work inside bold, italic and strike. */
function Line({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.kind === "code") return <code key={i} className="rounded bg-slate-950/60 border border-slate-700/60 px-1 py-px text-[0.85em] font-mono text-emerald-200">{s.text}</code>;
        const inner = <WithMentions text={s.text} />;
        if (s.kind === "bold") return <strong key={i} className="font-semibold text-white">{inner}</strong>;
        if (s.kind === "italic") return <em key={i}>{inner}</em>;
        if (s.kind === "strike") return <s key={i} className="text-slate-400">{inner}</s>;
        return <span key={i}>{inner}</span>;
      })}
    </>
  );
}

const lines = (rows: Inline[][]) =>
  rows.map((spans, i) => (
    <span key={i}>
      {i > 0 && <br />}
      <Line spans={spans} />
    </span>
  ));

/**
 * Decrypted message text: formatting (lib/chat/format.ts) and @mention chips.
 * Built from text segments only, so nothing in a message becomes HTML.
 */
export const MessageText = memo(function MessageText({ text }: { text: string }) {
  if (!hasFormatting(text)) {
    return (
      <span className="whitespace-pre-wrap break-words">
        <WithMentions text={text} />
      </span>
    );
  }
  return (
    <div className="space-y-1.5 break-words">
      {parseFormatting(text).map((b, i) => {
        if (b.kind === "code")
          return (
            <pre key={i} className="whitespace-pre-wrap rounded-lg bg-slate-950/70 border border-slate-700/60 px-3 py-2 text-xs font-mono text-emerald-100 overflow-x-auto">
              {b.text}
            </pre>
          );
        if (b.kind === "quote")
          return (
            <blockquote key={i} className="border-l-2 border-violet-400/60 pl-2.5 text-slate-300">
              {lines(b.lines)}
            </blockquote>
          );
        if (b.kind === "list")
          return (
            <ul key={i} className="list-disc pl-5 space-y-0.5">
              {b.items.map((spans, j) => (
                <li key={j}>
                  <Line spans={spans} />
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="whitespace-pre-wrap">
            {lines(b.lines)}
          </p>
        );
      })}
    </div>
  );
});
