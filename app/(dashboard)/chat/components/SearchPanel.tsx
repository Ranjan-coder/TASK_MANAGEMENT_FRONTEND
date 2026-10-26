"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Paperclip, AtSign, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ChatSearch, type SearchFilters } from "@/lib/chat/chatSearch";
import { mentionsToPlain } from "@/lib/chat/mentions";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";
import { useMentions } from "./MentionContext";

interface Props {
  messages: readonly Message[];
  myId: string;
  members: { id: string; name: string }[];
  hasMore: boolean;
  /** Loads one older page into the chat (resolves when done) */
  loadOlder: () => Promise<void>;
  onPick: (messageId: string) => void;
  onClose: () => void;
}

const PAGES_PER_CLICK = 5;

/** Bold the parts of `text` that start with a query word (display only, never HTML). */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-amber-400/30 text-amber-100 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * Search inside this chat (chat-features-plan.md CH-S). Runs on this device
 * over the messages it has decrypted; "Search older messages" loads more
 * history so it can be searched too. The server never sees the query.
 */
export function SearchPanel({ messages, myId, members, hasMore, loadOlder, onPick, onClose }: Props) {
  const { nameOf } = useMentions();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const engine = useRef(new ChatSearch()).current;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const textOf = useMemo(
    () => (m: Message) =>
      [m.decryptedContent ? mentionsToPlain(m.decryptedContent, nameOf) : "", ...(m.attachments || []).map((a) => a.originalName)].join(" "),
    [nameOf]
  );

  // Index follows the chat: only new or edited messages are tokenised again
  const results = useMemo(() => {
    engine.sync(messages, textOf);
    return engine.search(query, filters, messages, myId);
  }, [engine, messages, textOf, query, filters, myId]);

  const searchOlder = async () => {
    setLoadingOlder(true);
    try {
      for (let i = 0; i < PAGES_PER_CLICK; i++) await loadOlder();
    } finally {
      setLoadingOlder(false);
    }
  };

  const active = Boolean(query.trim() || filters.from || filters.hasFile || filters.mentionsMe);

  return (
    <aside className="h-full flex flex-col bg-slate-950 border-l border-slate-800" aria-label="Search this chat">
      <div className="h-14 px-4 flex items-center gap-2 border-b border-slate-800 shrink-0">
        <Search className="h-4 w-4 text-slate-500 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Search this chat"
          aria-label="Search this chat"
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button onClick={onClose} aria-label="Close search" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-slate-800/70 shrink-0">
        <select
          value={filters.from ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || null }))}
          aria-label="From"
          className="h-7 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 px-2 max-w-[10rem]"
        >
          <option value="">From anyone</option>
          {members.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === myId ? "Me" : p.name}
            </option>
          ))}
        </select>
        {(
          [
            ["hasFile", "Files", <Paperclip key="f" className="h-3 w-3" />],
            ["mentionsMe", "Mentions me", <AtSign key="m" className="h-3 w-3" />]
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            aria-pressed={Boolean(filters[key])}
            onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
            className={cn(
              "h-7 px-2.5 rounded-lg border text-xs flex items-center gap-1 transition",
              filters[key] ? "bg-violet-600/30 border-violet-500/50 text-violet-100" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {active && results.length === 0 && <p className="px-4 py-6 text-sm text-slate-500 text-center">No matches in the messages loaded here.</p>}
        <ul>
          {results.map((m) => (
            <li key={m._id}>
              <button onClick={() => onPick(m._id)} className="w-full text-left px-4 py-2.5 hover:bg-slate-800/70 border-b border-slate-800/50">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-slate-300 truncate">{m.sender._id === myId ? "You" : m.sender.name}</span>
                  <span className="text-slate-500 shrink-0">{format(new Date(m.createdAt), "d MMM, HH:mm")}</span>
                </div>
                <p className="text-sm text-slate-200 line-clamp-2 break-words">
                  <Highlight text={textOf(m) || "📎 File"} query={query} />
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Honest about scope: only what this device has loaded and decrypted */}
      <div className="px-4 py-2.5 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between gap-2 shrink-0">
        <span>
          Searched {engine.size} message{engine.size === 1 ? "" : "s"} on this device
        </span>
        {hasMore && (
          <button onClick={searchOlder} disabled={loadingOlder} className="flex items-center gap-1 font-semibold text-violet-300 hover:text-violet-200 disabled:opacity-60">
            {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            Search older messages
          </button>
        )}
      </div>
    </aside>
  );
}
