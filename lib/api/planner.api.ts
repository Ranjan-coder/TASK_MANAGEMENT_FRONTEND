import { apiClient } from "./client";
import type { ApiResponse } from "@/types";

/**
 * Planner API (backend/src/modules/planner). Content travels only as `Enc`
 * (AES-GCM ciphertext + IV) — see lib/crypto/vault.ts; the server can't read it.
 */
export interface Enc {
  ciphertext: string;
  iv: string;
}

export type NoteColor = "none" | "yellow" | "green" | "blue" | "pink" | "purple" | "grey";

export interface NoteRow {
  _id: string;
  enc: Enc;
  pinned: boolean;
  color: NoteColor;
  archived: boolean;
  version: number;
  updatedAt: string;
  createdAt: string;
}

export interface ListRow {
  _id: string;
  enc: Enc;
  rank: string;
  version: number;
  updatedAt: string;
}

export interface ItemRow {
  _id: string;
  list: string;
  enc: Enc;
  done: boolean;
  doneAt: string | null;
  dueAt: string | null;
  rank: string;
  version: number;
  updatedAt: string;
}

export type Freq = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export interface Recurrence {
  freq: Freq;
  interval?: number;
  byWeekday?: number[];
}

export interface ReminderRow {
  _id: string;
  enc: Enc;
  anchorAt: string;
  nextAt: string;
  timeZone: string;
  recurrence: Recurrence;
  status: "active" | "done";
  link: { kind: "note" | "item" | "meeting"; id: string } | null;
  lastFiredAt: string | null;
  version: number;
}

export type MeetingResponse = "pending" | "accepted" | "tentative" | "declined";

export interface WrappedFor {
  user: string;
  wrapped: string;
  recipientKeyVersion: number;
  senderKeyVersion: number;
}

export interface MeetingRow {
  _id: string;
  organiser: { _id: string; name: string };
  isOrganiser: boolean;
  startAt: string;
  endAt: string;
  timeZone: string;
  enc: Enc;
  keyEpoch: number;
  myKey: { wrapped: string; recipientKeyVersion: number; senderKeyVersion: number } | null;
  myResponse: MeetingResponse | null;
  attendees: { user: string; name: string; response: MeetingResponse }[];
  hiddenGuests?: number; // customers see other customers only as a count
  reminderMinutes: number | null;
  cancelled: boolean;
  version: number;
}

/** Someone who can be invited to a meeting (names only). */
export interface PlannerPerson {
  _id: string;
  name: string;
  role: string;
  designation: string;
  avatarUrl: string;
}

const data = <T,>(p: Promise<{ data: ApiResponse<T> }>) => p.then((r) => r.data.data);
const P = "/planner";

export const plannerApi = {
  // Vault: the person's planner key, wrapped per chat-key version
  vault: () => data<{ wraps: { keyVersion: number; wrapped: string }[] | null }>(apiClient.get(`${P}/vault`)),
  // Start over when the key can't be recovered: deletes the person's unreadable items
  resetVault: (proof: { authKey?: string; password?: string }) =>
    data<{ notes: number; lists: number; items: number; reminders: number }>(apiClient.delete(`${P}/vault`, { data: { confirm: "DELETE", ...proof } })),
  addVaultWrap: (keyVersion: number, wrapped: string) => data<{ wraps: { keyVersion: number; wrapped: string }[] }>(apiClient.put(`${P}/vault`, { keyVersion, wrapped })),

  // Notes
  notes: (params: { archived?: boolean; cursor?: string; limit?: number } = {}) =>
    data<{ items: NoteRow[]; nextCursor: string | null }>(apiClient.get(`${P}/notes`, { params })),
  createNote: (body: { enc: Enc; pinned?: boolean; color?: NoteColor }) => data<NoteRow>(apiClient.post(`${P}/notes`, body)),
  updateNote: (id: string, body: { version: number; enc?: Enc; pinned?: boolean; color?: NoteColor; archived?: boolean }) =>
    data<NoteRow>(apiClient.patch(`${P}/notes/${id}`, body)),
  deleteNote: (id: string) => apiClient.delete(`${P}/notes/${id}`),

  // Todos
  lists: () => data<ListRow[]>(apiClient.get(`${P}/lists`)),
  createList: (enc: Enc) => data<ListRow>(apiClient.post(`${P}/lists`, { enc })),
  updateList: (id: string, body: { version: number; enc: Enc }) => data<ListRow>(apiClient.patch(`${P}/lists/${id}`, body)),
  moveList: (id: string, body: { before?: string; after?: string }) => data<ListRow>(apiClient.post(`${P}/lists/${id}/move`, body)),
  deleteList: (id: string) => apiClient.delete(`${P}/lists/${id}`),
  items: (listId: string) => data<ItemRow[]>(apiClient.get(`${P}/lists/${listId}/items`)),
  createItem: (listId: string, body: { enc: Enc; dueAt?: string | null }) => data<ItemRow>(apiClient.post(`${P}/lists/${listId}/items`, body)),
  updateItem: (id: string, body: { version: number; enc?: Enc; done?: boolean; dueAt?: string | null }) => data<ItemRow>(apiClient.patch(`${P}/items/${id}`, body)),
  moveItem: (id: string, body: { before?: string; after?: string; list?: string }) => data<ItemRow>(apiClient.post(`${P}/items/${id}/move`, body)),
  deleteItem: (id: string) => apiClient.delete(`${P}/items/${id}`),
  dueItems: (from: string, to: string) => data<ItemRow[]>(apiClient.get(`${P}/todos/due`, { params: { from, to } })),

  // Reminders
  reminders: (status: "active" | "done" = "active") => data<ReminderRow[]>(apiClient.get(`${P}/reminders`, { params: { status } })),
  createReminder: (body: { enc: Enc; at: string; timeZone?: string; recurrence?: Recurrence; link?: { kind: "note" | "item" | "meeting"; id: string } }) =>
    data<ReminderRow>(apiClient.post(`${P}/reminders`, body)),
  updateReminder: (id: string, body: { version: number; enc?: Enc; at?: string; timeZone?: string; recurrence?: Recurrence }) =>
    data<ReminderRow>(apiClient.patch(`${P}/reminders/${id}`, body)),
  snooze: (id: string, minutes: number) => data<ReminderRow>(apiClient.post(`${P}/reminders/${id}/snooze`, { minutes })),
  doneReminder: (id: string) => data<ReminderRow>(apiClient.post(`${P}/reminders/${id}/done`)),
  deleteReminder: (id: string) => apiClient.delete(`${P}/reminders/${id}`),

  // Meetings
  meetings: (from: string, to: string) => data<MeetingRow[]>(apiClient.get(`${P}/meetings`, { params: { from, to } })),
  createMeeting: (body: { startAt: string; endAt: string; timeZone: string; enc: Enc; attendees: WrappedFor[]; reminderMinutes: number | null }) =>
    data<MeetingRow>(apiClient.post(`${P}/meetings`, body)),
  updateMeeting: (
    id: string,
    body: { version: number; startAt?: string; endAt?: string; timeZone?: string; enc?: Enc; attendees?: WrappedFor[]; reminderMinutes?: number | null; rekey?: boolean }
  ) => data<MeetingRow>(apiClient.patch(`${P}/meetings/${id}`, body)),
  respond: (id: string, response: Exclude<MeetingResponse, "pending">) => data<MeetingRow>(apiClient.post(`${P}/meetings/${id}/respond`, { response })),
  cancelMeeting: (id: string) => apiClient.delete(`${P}/meetings/${id}`),
  people: (q: string) => data<PlannerPerson[]>(apiClient.get(`${P}/people`, { params: q ? { q } : {} })),
  availability: (users: string[], from: string, to: string) =>
    data<{ user: string; busy: { start: string; end: string }[] }[]>(apiClient.get(`${P}/availability`, { params: { users: users.join(","), from, to } }))
};
