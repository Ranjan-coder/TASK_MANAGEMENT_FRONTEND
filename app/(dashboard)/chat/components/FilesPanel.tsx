"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Image as ImageIcon, FileText, Mic, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetchFiles } from "@/lib/api/chat.api";
import type { ConversationCrypto } from "@/lib/crypto/conversationKeys";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";
import { FilePreview } from "./FilePreview";

type Kind = "image" | "doc" | "audio";
const TABS: { kind: Kind; label: string; icon: typeof ImageIcon }[] = [
  { kind: "image", label: "Photos", icon: ImageIcon },
  { kind: "doc", label: "Files", icon: FileText },
  { kind: "audio", label: "Voice", icon: Mic }
];

/**
 * Everything shared in this chat, by kind (P4): designs, quotes, voice notes.
 * The server lists file details only; each file is opened here with the
 * chat's key when tapped.
 */
export function FilesPanel({ conversationId, crypto, onJump, onClose }: { conversationId: string; crypto: ConversationCrypto | null; onJump: (id: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("image");
  const [items, setItems] = useState<Message[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const page = await fetchFiles(conversationId, kind, cursor);
        // The key for each file (versioned chat keys: older files may use older keys)
        const withKeys = crypto ? await Promise.all(page.messages.map((m) => crypto.decrypt(m))) : page.messages;
        setItems((prev) => (cursor ? [...prev, ...withKeys] : withKeys));
        setNext(page.next);
      } catch {
        toast.error("Couldn't load the files");
      } finally {
        setLoading(false);
      }
    },
    [conversationId, kind, crypto]
  );

  useEffect(() => {
    setItems([]);
    load();
  }, [load]);

  return (
    <aside className="h-full flex flex-col bg-slate-950 border-l border-slate-800" aria-label="Shared files">
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <p className="text-sm font-semibold text-white">Shared in this chat</p>
        <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div role="tablist" className="flex gap-1 px-3 py-2 border-b border-slate-800 shrink-0">
        {TABS.map(({ kind: k, label, icon: Icon }) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn("flex-1 h-8 rounded-lg text-xs flex items-center justify-center gap-1.5 transition", kind === k ? "bg-violet-600/30 text-violet-100" : "text-slate-400 hover:bg-slate-800")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!loading && items.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Nothing shared yet.</p>}
        {items.map((m) => (
          <div key={m._id} className="space-y-1">
            <button onClick={() => onJump(m._id)} className="text-[11px] text-slate-500 hover:text-slate-300">
              {m.sender?.name} · {format(new Date(m.createdAt), "d MMM yyyy, HH:mm")}
            </button>
            {m.attachments.map((a, i) => (
              <FilePreview key={i} attachment={a} sessionKey={m.cryptoKey ?? null} />
            ))}
          </div>
        ))}
        {loading && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-violet-400" aria-label="Loading" />
          </div>
        )}
        {!loading && next && (
          <button onClick={() => load(next)} className="w-full py-2 text-xs font-semibold text-violet-300 hover:text-violet-200">
            Load more
          </button>
        )}
      </div>
    </aside>
  );
}
