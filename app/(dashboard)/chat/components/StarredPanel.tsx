"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetchStarred, unstarMessage } from "@/lib/api/chat.api";
import { ConversationCrypto, getConversationCrypto, registerConversationCrypto } from "@/lib/crypto/conversationKeys";
import { mentionsToPlain } from "@/lib/chat/mentions";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import type { Message } from "@/types/chat";

interface Item {
  starredAt: string;
  message: Message;
}

/**
 * My starred messages across chats (chat-features-plan.md CH-P). The server
 * returns them encrypted; each is opened here with its chat's keys.
 */
export function StarredPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const decrypt = useCallback(
    async (msg: Message): Promise<Message> => {
      const conv = useChatStore.getState().conversations.find((c) => c._id === msg.conversation);
      if (!conv || !user || msg.isDeleted || !msg.ciphertext) return msg;
      try {
        let c = getConversationCrypto(conv._id);
        if (!c) {
          c = await ConversationCrypto.create(conv, user._id);
          registerConversationCrypto(c);
        }
        return await c.decrypt(msg);
      } catch {
        return msg; // keys locked here: shown as encrypted
      }
    },
    [user]
  );

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const page = await fetchStarred(cursor);
        const opened = await Promise.all(page.items.map(async (i) => ({ ...i, message: await decrypt(i.message) })));
        setItems((prev) => (cursor ? [...prev, ...opened] : opened));
        setNext(page.next);
      } catch {
        toast.error("Couldn't load starred messages");
      } finally {
        setLoading(false);
      }
    },
    [decrypt]
  );

  useEffect(() => {
    load();
  }, [load]);

  const chatName = (convId: string) => {
    const c = useChatStore.getState().conversations.find((x) => x._id === convId);
    if (!c) return "Chat";
    return c.type === "group" ? c.name || "Group" : c.members.find((m) => m.user._id !== user?._id)?.user.name || "Direct message";
  };
  const nameOf = (convId: string) => {
    const c = useChatStore.getState().conversations.find((x) => x._id === convId);
    return (id: string) => c?.members.find((m) => m.user._id === id)?.user.name;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Starred messages"
        className="h-full w-full sm:w-96 bg-slate-950 border-l border-slate-800 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400 fill-amber-400" aria-hidden /> Starred messages
          </p>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!loading && items.length === 0 && (
            <p className="px-6 py-10 text-sm text-slate-500 text-center">Star messages to find them here later. Only you can see your stars.</p>
          )}
          <ul>
            {items.map(({ message: m }) => (
              <li key={m._id} className="flex items-start gap-2 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-900">
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => {
                    onClose();
                    router.push(`/chat/${m.conversation}?m=${m._id}`);
                  }}
                >
                  <p className="text-[11px] text-slate-500 truncate">
                    <span className="font-semibold text-slate-300">{m.sender?.name}</span> · {chatName(m.conversation)} · {format(new Date(m.createdAt), "d MMM")}
                  </p>
                  <p className="text-sm text-slate-200 line-clamp-3 break-words">
                    {m.isDeleted
                      ? "Message deleted"
                      : m.decryptedContent
                      ? mentionsToPlain(m.decryptedContent, nameOf(m.conversation))
                      : m.attachments?.[0]
                      ? `📎 ${m.attachments[0].originalName}`
                      : "🔒 Encrypted message"}
                  </p>
                </button>
                <button
                  aria-label="Unstar"
                  title="Unstar"
                  onClick={async () => {
                    await unstarMessage(m._id).catch(() => toast.error("Couldn't unstar"));
                    setItems((prev) => prev.filter((i) => i.message._id !== m._id));
                  }}
                  className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-amber-400 hover:bg-slate-800"
                >
                  <Star className="h-3.5 w-3.5 fill-amber-400" />
                </button>
              </li>
            ))}
          </ul>
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" aria-label="Loading" />
            </div>
          )}
          {!loading && next && (
            <button onClick={() => load(next)} className="w-full py-3 text-xs font-semibold text-violet-300 hover:text-violet-200">
              Load more
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
