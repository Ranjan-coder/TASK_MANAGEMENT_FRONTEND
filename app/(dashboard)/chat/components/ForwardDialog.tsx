"use client";

import { useMemo, useState } from "react";
import { Forward, X, Search, Check, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { ConversationCrypto, encryptTextWith, getConversationCrypto, registerConversationCrypto } from "@/lib/crypto/conversationKeys";
import { queueMessage } from "@/lib/chat/chatOutbox";
import { localIdFor } from "@/lib/chat/messageStore";
import { mentionsToPlain } from "@/lib/chat/mentions";
import { fetchDecrypted, sendEncryptedFile } from "@/lib/chat/files";
import { checkMessage } from "@/lib/moderation/lexicon";
import { cn } from "@/lib/utils";
import type { Conversation, Message } from "@/types/chat";
import { useMentions } from "./MentionContext";

const MAX_TARGETS = 5;

const labelOf = (c: Conversation, myId: string) =>
  c.type === "group" ? c.name || "Group" : c.members.find((m) => m.user && m.user._id !== myId)?.user.name || "Direct message";

/**
 * Forward a message to up to 5 chats (P4). The text is decrypted here and
 * encrypted again with each target chat's own key; files are re-encrypted
 * and uploaded the same way. Mentions become plain "@Name" (they belong to
 * the original chat's people).
 */
export function ForwardDialog({ message, onClose }: { message: Message; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const { nameOf } = useMentions();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    if (!user) return [];
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => !q || labelOf(c, user._id).toLowerCase().includes(q)).slice(0, 50);
  }, [conversations, query, user]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_TARGETS ? p : [...p, id]));

  const forward = async () => {
    if (!user || !picked.length) return;
    setBusy(true);
    const text = message.decryptedContent ? mentionsToPlain(message.decryptedContent, nameOf) : "";
    let done = 0;
    for (const id of picked) {
      const conv = conversations.find((c) => c._id === id);
      if (!conv) continue;
      try {
        let c = getConversationCrypto(id);
        if (!c) {
          c = await ConversationCrypto.create(conv, user._id);
          registerConversationCrypto(c);
        }
        const sendKey = await c.sendKey();
        if (!sendKey) throw new Error("No key for that chat yet");

        for (const att of message.attachments || []) {
          if (!message.cryptoKey) throw new Error("This file isn't available on this device");
          const blob = await fetchDecrypted(att, message.cryptoKey);
          await sendEncryptedFile({ conversationId: id, sendKey, data: blob, name: att.originalName, mimeType: att.mimeType, fileType: att.fileType, durationSec: att.durationSec });
        }
        if (text) {
          // Project chats keep the on-device abuse check: flagged text isn't forwarded into them
          if (conv.project && (await checkMessage(text)).hitCount > 0) throw new Error("This message can't be forwarded to a project chat");
          const { ciphertext, iv, keyRef, franking, frankingKey } = await encryptTextWith(sendKey, text);
          const clientMsgId = crypto.randomUUID();
          const now = new Date().toISOString();
          queueMessage({
            conversationId: id,
            body: { ciphertext, iv, type: "text", keyRef, franking, clientMsgId, forwarded: true },
            local: {
              _id: localIdFor(clientMsgId),
              clientMsgId,
              conversation: id,
              sender: user,
              type: "text",
              ciphertext,
              iv,
              keyRef,
              franking,
              decryptedContent: text,
              cryptoKey: sendKey.key,
              frankingKey,
              frankVerified: true,
              forwarded: true,
              attachments: [],
              reactions: [],
              isEdited: false,
              isDeleted: false,
              createdAt: now,
              updatedAt: now,
              localStatus: "sending"
            }
          });
        }
        done += 1;
      } catch (err) {
        toast.error(`${labelOf(conv, user._id)}: ${(err as Error).message || "couldn't forward"}`);
      }
    }
    setBusy(false);
    if (done) {
      toast.success(`Forwarded to ${done} chat${done === 1 ? "" : "s"}`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Forward message" className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Forward className="h-4 w-4 text-violet-400" aria-hidden /> Forward to…
          </h2>
          <button onClick={onClose} aria-label="Close" className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none" autoFocus />
        </div>
        <ul className="flex-1 overflow-y-auto py-1">
          {list.map((c) => {
            const on = picked.includes(c._id);
            return (
              <li key={c._id}>
                <button
                  onClick={() => toggle(c._id)}
                  aria-pressed={on}
                  disabled={!on && picked.length >= MAX_TARGETS}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-800/70 disabled:opacity-40 text-left"
                >
                  <span className={cn("h-5 w-5 rounded-md border flex items-center justify-center shrink-0", on ? "bg-violet-600 border-violet-500" : "border-slate-600")}>
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {c.type === "group" && <Users className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden />}
                  <span className="text-sm text-slate-200 truncate">{user ? labelOf(c, user._id) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {picked.length}/{MAX_TARGETS} selected
          </span>
          <button onClick={forward} disabled={!picked.length || busy} className="h-8 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}
