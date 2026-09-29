/**
 * "Download my data" (DPDP Act): the server's copy of your personal data plus
 * your chat history, which only this device can decrypt (end-to-end
 * encryption). Nothing decrypted is sent anywhere; it's saved as a file.
 */
import { apiClient } from "@/lib/api/client";
import { fetchConversations, fetchMessages } from "@/lib/api/chat.api";
import { ConversationCrypto } from "@/lib/crypto/conversationKeys";
import type { Message } from "@/types/chat";

const MAX_MESSAGES_PER_CHAT = 20_000;

export interface ExportProgress {
  step: string;
  done: number;
  total: number;
}

async function exportChats(myUserId: string, onProgress: (p: ExportProgress) => void) {
  const conversations = await fetchConversations();
  const chats = [];
  let i = 0;
  for (const conv of conversations) {
    i += 1;
    onProgress({ step: `Decrypting chat ${i} of ${conversations.length}`, done: i - 1, total: conversations.length });
    let crypto: ConversationCrypto | null = null;
    try {
      crypto = await ConversationCrypto.create(conv, myUserId);
    } catch {
      crypto = null; // keys locked on this device
    }
    const seen = new Map<string, Message>();
    let cursor: string | undefined;
    let first = true;
    while (first || cursor) {
      const page = await fetchMessages(conv._id, cursor, 50);
      for (const m of page.messages) seen.set(m._id, m);
      cursor = page.nextCursor ?? undefined;
      first = false;
      if (seen.size >= MAX_MESSAGES_PER_CHAT) break;
    }
    const messages = [...seen.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const out = [];
    for (const m of messages) {
      let text: string | null = m.type === "system" ? m.content ?? null : null;
      if (m.type !== "system" && !m.isDeleted && crypto && m.ciphertext) {
        const d = await crypto.decrypt(m);
        text = d.decryptionFailed ? "[could not decrypt on this device]" : d.decryptedContent ?? null;
      }
      out.push({
        at: m.createdAt,
        from: m.sender?.name ?? "",
        mine: m.sender?._id === myUserId,
        type: m.type,
        text: m.isDeleted ? "[deleted]" : text,
        files: (m.attachments || []).map((a) => a.originalName),
        edited: m.isEdited || undefined
      });
    }
    chats.push({ name: conv.name || conv.members.map((mm) => mm.user.name).join(", "), type: conv.project ? "project" : conv.type, messages: out });
  }
  onProgress({ step: "Finishing", done: conversations.length, total: conversations.length });
  return chats;
}

/** Builds the export and saves it as a JSON file. */
export async function downloadMyData(myUserId: string, onProgress: (p: ExportProgress) => void) {
  onProgress({ step: "Collecting your account data", done: 0, total: 1 });
  const server = (await apiClient.get("/privacy/export")).data.data;
  let chats: unknown[] = [];
  let chatNote = "";
  try {
    chats = await exportChats(myUserId, onProgress);
  } catch {
    chatNote = "Chat history couldn't be added (unlock Chat on this device and try again).";
  }
  const file = { ...server, chats, ...(chatNote && { chatNote }) };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bonito-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
