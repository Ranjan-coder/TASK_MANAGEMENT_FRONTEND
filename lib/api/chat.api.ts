import apiClient from "./client";
import {
  Conversation,
  Message,
  PublicKeyInfo,
  CreateDMBody,
  CreateGroupBody,
  SendMessageBody,
  KeyRef,
  WrappedKeyInput
} from "@/types/chat";
import { ApiResponse } from "@/types";

// Uses the shared client so expired access tokens are refreshed automatically
const chatAxios = {
  get: <T>(url: string, config?: object) => apiClient.get<T>(`/chat${url}`, config),
  post: <T>(url: string, data?: unknown, config?: object) => apiClient.post<T>(`/chat${url}`, data, config),
  put: <T>(url: string, data?: unknown, config?: object) => apiClient.put<T>(`/chat${url}`, data, config),
  patch: <T>(url: string, data?: unknown, config?: object) => apiClient.patch<T>(`/chat${url}`, data, config),
  delete: <T>(url: string, config?: object) => apiClient.delete<T>(`/chat${url}`, config)
};

// ── Public Keys ───────────────────────────────────────────────────────────────

export const publishPublicKey = (publicKey: string) =>
  chatAxios.post<ApiResponse<{ keyVersion: number }>>("/keys/publish", { publicKey }).then((r) => r.data.data);

/** Current public key, or a specific older version. */
export const fetchPublicKey = (userId: string, version?: number) =>
  chatAxios
    .get<ApiResponse<PublicKeyInfo>>(`/keys/${userId}`, version !== undefined ? { params: { version } } : undefined)
    .then((r) => r.data.data);

export interface KeyBundleResponse {
  bundle: { ciphertext: string; iv: string; version: number } | null;
  publicKey: string | null;
  keyVersion: number;
  recoveryAvailable: boolean;
  recoveryUpdatedAt: string | null;
}

export const fetchKeyBundle = () =>
  chatAxios.get<ApiResponse<KeyBundleResponse>>("/keys/bundle").then((r) => r.data.data);

export const putKeyBundle = (body: {
  ciphertext: string;
  iv: string;
  expectedVersion: number;
  recovery?: { ciphertext: string; iv: string };
}) => chatAxios.put<ApiResponse<{ version: number }>>("/keys/bundle", body).then((r) => r.data.data);

export const fetchRecoveryBundle = () =>
  chatAxios.get<ApiResponse<{ ciphertext: string; iv: string }>>("/keys/recovery").then((r) => r.data.data);

// ── Conversations ─────────────────────────────────────────────────────────────

export const fetchConversations = () =>
  chatAxios.get<ApiResponse<Conversation[]>>("/conversations").then((r) => r.data.data);

export const createDM = (body: CreateDMBody) =>
  chatAxios.post<ApiResponse<Conversation>>("/conversations", body).then((r) => r.data.data);

export const createGroup = (body: CreateGroupBody) =>
  chatAxios.post<ApiResponse<Conversation>>("/conversations", body).then((r) => r.data.data);

export const fetchConversation = (id: string) =>
  chatAxios.get<ApiResponse<Conversation>>(`/conversations/${id}`).then((r) => r.data.data);

export const updateConversation = (id: string, data: { name?: string; avatarUrl?: string }) =>
  chatAxios.patch<ApiResponse<Conversation>>(`/conversations/${id}`, data).then((r) => r.data.data);

// ── Group Member Management ───────────────────────────────────────────────────

export const addMember = (convId: string, userId: string) =>
  chatAxios.post<ApiResponse<Conversation>>(`/conversations/${convId}/members`, { userId }).then((r) => r.data.data);

export const removeMember = (convId: string, userId: string) =>
  chatAxios.delete(`/conversations/${convId}/members/${userId}`).then((r) => r.data);

/** Adds the next group key version (after removing a member). */
export const rotateGroupKey = (convId: string, version: number, keys: Record<string, WrappedKeyInput>) =>
  chatAxios.put(`/conversations/${convId}/group-keys`, { version, keys }).then((r) => r.data);

export interface GroupKeyShareEntry extends WrappedKeyInput {
  version: number;
  userId: string;
}

/** Gives existing key versions to members who lack them. */
export const shareGroupKeys = (convId: string, entries: GroupKeyShareEntry[]) =>
  chatAxios
    .post<ApiResponse<{ changed: number }>>(`/conversations/${convId}/group-keys/share`, { entries })
    .then((r) => r.data.data);

// ── Messages ──────────────────────────────────────────────────────────────────

export const fetchMessages = (convId: string, cursor?: string, limit = 30) =>
  chatAxios
    .get<
      ApiResponse<{
        messages: Message[];
        hasMore: boolean;
        nextCursor: string | null;
        /** First unread message in this batch (initial load only) — null if nothing was unread or this is a "load more" page. */
        unreadMarkerId: string | null;
      }>
    >(`/conversations/${convId}/messages`, { params: { cursor, limit } })
    .then((r) => r.data.data);

export const sendMessage = (convId: string, body: SendMessageBody) =>
  chatAxios
    .post<ApiResponse<Message>>(`/conversations/${convId}/messages`, body)
    .then((r) => r.data.data);

export const markRead = (messageId: string) =>
  chatAxios.patch(`/messages/${messageId}/read`).then((r) => r.data);

export const reactToMessage = (messageId: string, emoji: string) =>
  chatAxios.patch(`/messages/${messageId}/react`, { emoji }).then((r) => r.data);

export const editMessage = (
  messageId: string,
  ciphertext: string,
  iv: string,
  keyRef?: KeyRef,
  franking?: { commitment: string },
  moderation?: { flagged: true; severity: string; hitCount: number }
) => chatAxios.patch(`/messages/${messageId}/edit`, { ciphertext, iv, keyRef, franking, moderation }).then((r) => r.data);

export const deleteMessage = (messageId: string, scope: "me" | "everyone" = "everyone") =>
  chatAxios.delete(`/messages/${messageId}`, { data: { scope } }).then((r) => r.data);
