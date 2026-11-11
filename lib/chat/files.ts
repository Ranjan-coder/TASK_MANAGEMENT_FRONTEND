/**
 * lib/chat/files.ts — encrypted chat files (attachments, voice notes, forwarding).
 *
 * The bytes are encrypted here with the chat's key (AES-GCM) before upload;
 * the server stores ciphertext only and checks the declared type against its
 * allow-list (chat.upload.controller.js).
 */
import apiClient from "@/lib/api/client";
import { encryptFile, decryptFile } from "@/lib/crypto/e2e";
import type { SendKey } from "@/lib/crypto/conversationKeys";
import type { ChatAttachment, Message } from "@/types/chat";

export type FileKind = ChatAttachment["fileType"];

/** What the app shows a file as, from its type and name. */
export const kindOf = (mimeType: string, name: string): FileKind => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx"].includes(ext)) return "xls";
  return "other";
};

export interface SendFileInput {
  conversationId: string;
  sendKey: SendKey;
  data: Blob | ArrayBuffer;
  name: string;
  mimeType: string;
  fileType?: FileKind;
  /** Voice notes */
  durationSec?: number;
  /** Inside a thread */
  threadRoot?: string;
  alsoInChat?: boolean;
  onProgress?: (percent: number) => void;
}

/** Encrypts and uploads one file as a chat message; resolves to the saved message. */
export async function sendEncryptedFile(input: SendFileInput): Promise<Message> {
  const { conversationId, sendKey, data, name, mimeType, onProgress } = input;
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  onProgress?.(20);
  const { encryptedBuffer, iv: fileIv } = await encryptFile(buffer, sendKey.key);
  onProgress?.(50);

  const form = new FormData();
  form.append("file", new Blob([encryptedBuffer], { type: "application/octet-stream" }), `${name}.enc`);
  form.append("originalName", name);
  form.append("mimeType", mimeType);
  form.append("fileSize", String(buffer.byteLength));
  form.append("fileType", input.fileType ?? kindOf(mimeType, name));
  // The chat key encrypts the file; the IV is what's unique per file
  form.append("encryptedFileKey", fileIv);
  form.append("fileIv", fileIv);
  form.append("keyRef", JSON.stringify(sendKey.keyRef));
  if (input.durationSec) form.append("durationSec", String(Math.max(1, Math.round(input.durationSec))));
  if (input.threadRoot) {
    form.append("threadRoot", input.threadRoot);
    if (input.alsoInChat) form.append("alsoInChat", "true");
  }
  onProgress?.(70);

  const res = await apiClient.post(`/chat/conversations/${conversationId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  onProgress?.(100);
  return res.data.data as Message;
}

/** Downloads and decrypts an attachment with the key that encrypted it. */
export async function fetchDecrypted(attachment: ChatAttachment, key: CryptoKey): Promise<Blob> {
  if (!attachment.fileIv) throw new Error("Missing file IV");
  const resp = await fetch(attachment.url);
  if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
  const plain = await decryptFile(await resp.arrayBuffer(), attachment.fileIv, key);
  return new Blob([plain], { type: attachment.mimeType });
}

const EXT_FOR: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/aac": "aac"
};

/**
 * The name a decrypted file is saved under: no control or right-to-left
 * characters, and always the extension of its declared type, so a file
 * sent as a PDF can't land on disk as "something.exe" (older messages too).
 */
export const safeDownloadName = (attachment: Pick<ChatAttachment, "originalName" | "mimeType">): string => {
  const clean =
    attachment.originalName
      .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩\\/:*?"<>|]/g, "")
      .replace(/^[.\s]+/, "") // no hidden files, nothing left of "../"
      .trim() || "file";
  const ext = EXT_FOR[attachment.mimeType] || "bin";
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  return dot > 0 && clean.slice(dot + 1).toLowerCase() === ext ? clean : `${base}.${ext}`;
};

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
