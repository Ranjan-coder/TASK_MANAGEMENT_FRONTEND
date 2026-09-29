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

// ── Encryption keys ───────────────────────────────────────────────────────────

/** Which key encrypted a message: g = group key version; s/r = sender/recipient key versions (DMs). */
export interface KeyRef {
  g?: number;
  s?: number;
  r?: number;
}

export interface WrappedGroupKey {
  wrapped: string;
  wrappedBy: string;
  wrapperKeyVersion: number;
  recipientKeyVersion: number;
}

export interface GroupKeyVersion {
  version: number;
  createdBy?: string;
  createdAt?: string;
  keys: Record<string, WrappedGroupKey>;
}

/** Entry sent when creating/rotating/sharing group keys. */
export interface WrappedKeyInput {
  wrapped: string;
  wrapperKeyVersion: number;
  recipientKeyVersion: number;
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
  keyRef?: KeyRef;
  // Key that decrypted this message (client-only; used for its attachments)
  cryptoKey?: CryptoKey;
  // Decrypted plaintext — computed client-side, never stored on server
  decryptedContent?: string;
  decryptionFailed?: boolean;
  // Message franking: commitment from the server; key + check result client-side only
  franking?: { commitment: string; serverTs?: string };
  frankingKey?: string;
  frankVerified?: boolean;
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

type UserRef = string | { _id: string; name?: string; avatarUrl?: string; email?: string; phone?: string };

export interface ProjectInfo {
  status: "active" | "on_hold" | "completed";
  customers: UserRef[];
  leadDesigner: UserRef;
  backupDesigner?: UserRef | null;
  manager?: UserRef | null;
  createdBy: string;
  createdAt: string;
  stage?: "consultation" | "site_measurement" | "design" | "quotation" | "production" | "installation" | "handover";
  stageHistory?: { stage: string; at: string; note?: string }[];
  expectedHandover?: string | null;
}

export interface Conversation {
  _id: string;
  type: ConversationType;
  name?: string;
  avatarUrl?: string;
  members: ConversationMember[];
  groupKeys?: Record<string, string>; // legacy (version 0): userId → wrapped key
  groupKeyring?: GroupKeyVersion[];
  /** Set for Bonito project chats (managed from Admin → Projects) */
  project?: ProjectInfo;
  /** Project chats: set while an abuse alert is open (drives the warning popup) */
  moderation?: { openIncident?: string | null; warningAt?: string | null };
  /** The current key must be replaced by a staff member of the group */
  rekeyRequested?: boolean;
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
  groupKeyring?: GroupKeyVersion[];
}

export interface MemberRemovedPayload {
  conversationId: string;
  userId: string;
}

export interface RekeyPayload {
  conversationId: string;
  groupKeyring: GroupKeyVersion[];
  groupKeys?: Record<string, string>;
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
  encryptedGroupKeys: Record<string, WrappedKeyInput>;
}

export interface SendMessageBody {
  ciphertext: string;
  iv: string;
  type?: "text" | "image" | "file";
  attachments?: ChatAttachment[];
  replyTo?: string;
  keyRef?: KeyRef;
  franking?: { commitment: string };
  moderation?: { flagged: true; severity: "mild" | "abusive" | "threat"; hitCount: number };
}

export interface PublicKeyInfo {
  userId: string;
  name: string;
  publicKey: string;
  keyVersion: number;
  currentKeyVersion?: number;
  keyUpdatedAt: string;
}
