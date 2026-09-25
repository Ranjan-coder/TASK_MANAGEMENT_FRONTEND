import { User } from "@/types";

// ── Conversation ──────────────────────────────────────────────────────────────

export type ConversationType = "dm" | "group";

export interface ConversationMember {
  user: User;
  role: "admin" | "member";
  joinedAt: string;
  lastRead: string | null;
  isOnline?: boolean;
}

export interface ChatAttachment {
  fileName: string;
  originalName: string;
  fileType: "pdf" | "doc" | "docx" | "xls" | "xlsx" | "image" | "other";
  mimeType: string;
  fileSize: number;
  url: string;
  publicId: string;
  thumbnailUrl?: string;
  encryptedFileKey?: string;
  fileIv?: string;
}

export interface Reaction {
  emoji: string;
  users: string[]; // userIds
}

// ── Message ───────────────────────────────────────────────────────────────────

export interface Message {
  _id: string;
  conversation: string;
  sender: User;
  type: "text" | "image" | "file" | "system";
  // E2E fields — client decrypts these; never displayed raw
  ciphertext?: string;
  iv?: string;
  // Decrypted plaintext — computed client-side, never stored on server
  decryptedContent?: string;
  decryptionFailed?: boolean;
  // System messages only
  content?: string;
  attachments: ChatAttachment[];
  replyTo?: Message | null;
  reactions: Reaction[];
  isEdited: boolean;
  isDeleted: boolean;
  editedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Conversation ──────────────────────────────────────────────────────────────

export interface Conversation {
  _id: string;
  type: ConversationType;
  name?: string;
  avatarUrl?: string;
  members: ConversationMember[];
  groupKeys?: Record<string, string>; // userId → base64(encryptedGroupKey)
  createdBy: string;
  lastMessage?: Message;
  lastActivityAt: string;
  isArchived: boolean;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Socket payloads ───────────────────────────────────────────────────────────

export interface TypingPayload {
  conversationId: string;
  userId: string;
  name: string;
  isTyping: boolean;
}

export interface ReadReceiptPayload {
  conversationId: string;
  userId: string;
  lastRead: string;
}

export interface ReactionPayload {
  messageId: string;
  conversationId: string;
  reactions: Reaction[];
}

export interface PresencePayload {
  userId: string;
  isOnline: boolean;
}

export interface MemberAddedPayload {
  conversationId: string;
  user: User;
  encryptedGroupKey: string | null;
}

export interface MemberRemovedPayload {
  conversationId: string;
  userId: string;
}

export interface RekeyPayload {
  conversationId: string;
  groupKeys: Record<string, string>;
}

// ── API request bodies ────────────────────────────────────────────────────────

export interface CreateDMBody {
  type: "dm";
  memberIds: [string];
}

export interface CreateGroupBody {
  type: "group";
  name: string;
  memberIds: string[];
  encryptedGroupKeys: Record<string, string>;
}

export interface SendMessageBody {
  ciphertext: string;
  iv: string;
  type?: "text" | "image" | "file";
  attachments?: ChatAttachment[];
  replyTo?: string;
}

export interface PublicKeyInfo {
  userId: string;
  name: string;
  publicKey: string;
  keyVersion: number;
  keyUpdatedAt: string;
}
