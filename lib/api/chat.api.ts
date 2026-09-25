import axios from "axios";
import {
  Conversation,
  Message,
  PublicKeyInfo,
  CreateDMBody,
  CreateGroupBody,
  SendMessageBody
} from "@/types/chat";
import { ApiResponse } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

const chatAxios = axios.create({
  baseURL: `${API}/chat`,
  withCredentials: true
});

// ── Public Keys ───────────────────────────────────────────────────────────────

export const publishPublicKey = (publicKey: string) =>
  chatAxios.post<ApiResponse<null>>("/keys/publish", { publicKey }).then((r) => r.data);

export const fetchPublicKey = (userId: string) =>
  chatAxios.get<ApiResponse<PublicKeyInfo>>(`/keys/${userId}`).then((r) => r.data.data);

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

export const addMember = (convId: string, userId: string, encryptedGroupKey?: string) =>
  chatAxios
    .post<ApiResponse<Conversation>>(`/conversations/${convId}/members`, { userId, encryptedGroupKey })
    .then((r) => r.data.data);

export const removeMember = (convId: string, userId: string) =>
  chatAxios.delete(`/conversations/${convId}/members/${userId}`).then((r) => r.data);

export const updateGroupKeys = (convId: string, newGroupKeys: Record<string, string>) =>
  chatAxios.put(`/conversations/${convId}/group-keys`, { newGroupKeys }).then((r) => r.data);

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

export const editMessage = (messageId: string, ciphertext: string, iv: string) =>
  chatAxios.patch(`/messages/${messageId}/edit`, { ciphertext, iv }).then((r) => r.data);

export const deleteMessage = (messageId: string, scope: "me" | "everyone" = "everyone") =>
  chatAxios.delete(`/messages/${messageId}`, { data: { scope } }).then((r) => r.data);
