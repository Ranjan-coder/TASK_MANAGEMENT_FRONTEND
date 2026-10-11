"use client";

/**
 * Planner data hooks (planner-module-plan.md). Every row arrives encrypted; these
 * hooks decrypt it with the person's vault key (or a meeting's key) and hand the
 * screens plain objects. Writes encrypt first, update the cache optimistically
 * (instant UI) and roll back on error. A "planner:changed" socket event from the
 * person's other devices refreshes just the affected data.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { getSocket } from "@/lib/socket";
import { ChatKeysLockedError } from "@/lib/crypto/keyStore";
import { getVaultKey, seal, open, meetingKeyOf, VaultUnavailableError } from "@/lib/crypto/vault";
import { SearchIndex } from "@/lib/planner/searchIndex";
import {
  plannerApi,
  type NoteRow,
  type NoteColor,
  type ListRow,
  type ItemRow,
  type ReminderRow,
  type Recurrence,
  type MeetingRow
} from "@/lib/api/planner.api";

// ── Decrypted shapes ──────────────────────────────────────────────────────────
export interface NoteContent {
  title: string;
  body: string;
  tags: string[];
}
export type Note = Omit<NoteRow, "enc"> & NoteContent & { broken?: boolean };
export type TodoList = Omit<ListRow, "enc"> & { title: string; broken?: boolean };
export type TodoItem = Omit<ItemRow, "enc"> & { text: string; broken?: boolean };
export type Reminder = Omit<ReminderRow, "enc"> & { text: string; broken?: boolean };
export interface MeetingDetails {
  title: string;
  agenda: string;
  link: string;
  location: string;
}
export type Meeting = Omit<MeetingRow, "enc"> & MeetingDetails & { broken?: boolean };

const errMsg = (err: unknown, fallback: string) => (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** Decrypts a row; a row that can't be opened is shown as such instead of crashing the list. */
async function decryptRow<T, C>(key: CryptoKey, row: T & { enc: { ciphertext: string; iv: string } }, empty: C): Promise<Omit<T, "enc"> & C & { broken?: boolean }> {
  const { enc, ...rest } = row;
  try {
    return { ...(rest as Omit<T, "enc">), ...(await open<C>(key, enc)) };
  } catch {
    return { ...(rest as Omit<T, "enc">), ...empty, broken: true };
  }
}

// ── Key ───────────────────────────────────────────────────────────────────────

export type KeyState =
  | { status: "loading" }
  | { status: "locked" } // keys exist but are locked on this device: enter the password
  | { status: "unrecoverable" } // the Planner key was made with keys that are gone (e.g. after a password reset)
  | { status: "ready"; key: CryptoKey }
  | { status: "error"; message: string };

/** The person's planner key; "locked" until their chat keys are unlocked on this device. */
export function usePlannerKey() {
  const userId = useAuthStore((s) => s.user?._id);
  const [state, setState] = useState<KeyState>({ status: "loading" });
  const load = useCallback(() => {
    if (!userId) return;
    setState({ status: "loading" });
    getVaultKey(userId)
      .then((key) => setState({ status: "ready", key }))
      .catch((err) => {
        if (err instanceof ChatKeysLockedError) setState({ status: "locked" });
        else if (err instanceof VaultUnavailableError) setState({ status: "unrecoverable" });
        else setState({ status: "error", message: errMsg(err, "Couldn't open your Planner") });
      });
  }, [userId]);
  useEffect(load, [load]);
  return { state, retry: load };
}

/** Other devices' changes refresh the matching data (O(1) per event). */
export function usePlannerSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const onChanged = (p: { kind: string; list?: string }) => {
      const keys: Record<string, QueryKey[]> = {
        note: [["planner", "notes"]],
        list: [["planner", "lists"]],
        item: [["planner", "items", p.list], ["planner", "due"]],
        reminder: [["planner", "reminders"]],
        meeting: [["planner", "meetings"]]
      };
      for (const queryKey of keys[p.kind] || []) qc.invalidateQueries({ queryKey });
    };
    socket.on("planner:changed", onChanged);
    return () => {
      socket.off("planner:changed", onChanged);
    };
  }, [qc]);
}

/** Optimistic mutation helper: apply locally, send, roll back if it fails. */
function useOptimistic<V>(queryKey: QueryKey, run: (v: V) => Promise<unknown>, apply: (old: unknown, v: V) => unknown, failMsg: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData(queryKey);
      qc.setQueryData(queryKey, (old: unknown) => apply(old, v));
      return { previous };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(queryKey, ctx?.previous);
      toast.error(errMsg(err, failMsg));
    },
    onSettled: () => qc.invalidateQueries({ queryKey })
  });
}

// ── Notes ─────────────────────────────────────────────────────────────────────

const EMPTY_NOTE: NoteContent = { title: "", body: "", tags: [] };

export function useNotes(key: CryptoKey | null, archived = false) {
  const qc = useQueryClient();
  const queryKey: QueryKey = ["planner", "notes", archived];
  const query = useQuery({
    queryKey,
    enabled: Boolean(key),
    // Every page is loaded (≤ 5,000 notes): search needs them all, and it's encrypted anyway
    queryFn: async () => {
      const rows: NoteRow[] = [];
      let cursor: string | undefined;
      do {
        const page = await plannerApi.notes({ archived, cursor, limit: 200 });
        rows.push(...page.items);
        cursor = page.nextCursor || undefined;
      } while (cursor && rows.length < 5000);
      return Promise.all(rows.map((r) => decryptRow<NoteRow, NoteContent>(key!, r, EMPTY_NOTE)));
    }
  });

  // Inverted index over the decrypted notes, rebuilt only when the notes change
  const index = useMemo(() => {
    const idx = new SearchIndex();
    for (const n of query.data || []) idx.set(n._id, `${n.title} ${n.body} ${n.tags.join(" ")}`);
    return idx;
  }, [query.data]);

  const create = useMutation({
    mutationFn: async (input: { content: NoteContent; color?: NoteColor; pinned?: boolean }) =>
      decryptRow<NoteRow, NoteContent>(key!, await plannerApi.createNote({ enc: await seal(key!, input.content), color: input.color, pinned: input.pinned }), EMPTY_NOTE),
    onSuccess: (note) => qc.setQueryData(queryKey, (old: Note[] | undefined) => [note, ...(old || [])]),
    onError: (err) => toast.error(errMsg(err, "Couldn't save the note"))
  });

  /** Saves a change; a 409 means another device changed it first: theirs is kept and shown. */
  const update = useMutation({
    // One save at a time (typing + pin in quick succession), each using the newest version
    scope: { id: "planner-note-save" },
    mutationFn: async ({ note: given, patch }: { note: Note; patch: Partial<NoteContent> & { pinned?: boolean; color?: NoteColor; archived?: boolean } }) => {
      const note = (qc.getQueryData(queryKey) as Note[] | undefined)?.find((n) => n._id === given._id) || given;
      const { title, body, tags, ...flags } = patch;
      const contentChanged = title !== undefined || body !== undefined || tags !== undefined;
      const content = { title: title ?? note.title, body: body ?? note.body, tags: tags ?? note.tags };
      const row = await plannerApi.updateNote(note._id, { version: note.version, ...flags, ...(contentChanged ? { enc: await seal(key!, content) } : {}) });
      return decryptRow<NoteRow, NoteContent>(key!, row, EMPTY_NOTE);
    },
    onSuccess: (note) =>
      qc.setQueryData(queryKey, (old: Note[] | undefined) =>
        (old || []).map((n) => (n._id === note._id ? note : n)).filter((n) => n.archived === archived)
      ),
    onError: (err) => {
      const code = (err as { response?: { data?: { errors?: { code?: string }[] } } })?.response?.data?.errors?.[0]?.code;
      if (code === "STALE_VERSION") toast.info("This note was changed on another device. Showing the latest version.");
      else toast.error(errMsg(err, "Couldn't save the note"));
      qc.invalidateQueries({ queryKey });
    }
  });

  const remove = useOptimistic<string>(
    queryKey,
    (id) => plannerApi.deleteNote(id),
    (old, id) => ((old as Note[] | undefined) || []).filter((n) => n._id !== id),
    "Couldn't delete the note"
  );

  return { ...query, notes: query.data || [], index, create, update, remove };
}

// ── Todos ─────────────────────────────────────────────────────────────────────

export function useLists(key: CryptoKey | null) {
  const qc = useQueryClient();
  const queryKey: QueryKey = ["planner", "lists"];
  const query = useQuery({
    queryKey,
    enabled: Boolean(key),
    queryFn: async () => Promise.all((await plannerApi.lists()).map((r) => decryptRow<ListRow, { title: string }>(key!, r, { title: "" })))
  });
  const create = useMutation({
    mutationFn: async (title: string) => decryptRow<ListRow, { title: string }>(key!, await plannerApi.createList(await seal(key!, { title })), { title: "" }),
    onSuccess: (list) => qc.setQueryData(queryKey, (old: TodoList[] | undefined) => [...(old || []), list]),
    onError: (err) => toast.error(errMsg(err, "Couldn't create the list"))
  });
  const rename = useMutation({
    mutationFn: async ({ list, title }: { list: TodoList; title: string }) =>
      decryptRow<ListRow, { title: string }>(key!, await plannerApi.updateList(list._id, { version: list.version, enc: await seal(key!, { title }) }), { title: "" }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (err) => toast.error(errMsg(err, "Couldn't rename the list"))
  });
  const remove = useOptimistic<string>(queryKey, (id) => plannerApi.deleteList(id), (old, id) => ((old as TodoList[]) || []).filter((l) => l._id !== id), "Couldn't delete the list");
  return { ...query, lists: query.data || [], create, rename, remove };
}

export function useItems(key: CryptoKey | null, listId: string | null) {
  const qc = useQueryClient();
  const queryKey: QueryKey = ["planner", "items", listId];
  const query = useQuery({
    queryKey,
    enabled: Boolean(key && listId),
    queryFn: async () => Promise.all((await plannerApi.items(listId!)).map((r) => decryptRow<ItemRow, { text: string }>(key!, r, { text: "" })))
  });
  // The server returns items in rank order; local moves keep the array order until it answers
  const items = query.data || [];

  const add = useMutation({
    mutationFn: async ({ text, dueAt }: { text: string; dueAt?: string | null }) =>
      decryptRow<ItemRow, { text: string }>(key!, await plannerApi.createItem(listId!, { enc: await seal(key!, { text }), dueAt }), { text: "" }),
    onSuccess: (item) => qc.setQueryData(queryKey, (old: TodoItem[] | undefined) => [...(old || []), item]),
    onError: (err) => toast.error(errMsg(err, "Couldn't add it"))
  });

  const update = useOptimistic<{ item: TodoItem; done?: boolean; text?: string; dueAt?: string | null }>(
    queryKey,
    async ({ item, done, text, dueAt }) =>
      plannerApi.updateItem(item._id, { version: item.version, done, dueAt, ...(text !== undefined ? { enc: await seal(key!, { text }) } : {}) }),
    (old, { item, done, text, dueAt }) =>
      ((old as TodoItem[]) || []).map((i) =>
        i._id === item._id ? { ...i, ...(done !== undefined && { done }), ...(text !== undefined && { text }), ...(dueAt !== undefined && { dueAt }) } : i
      ),
    "Couldn't save it"
  );

  /** Drag-and-drop: the server writes one new rank between the neighbours. */
  const move = useOptimistic<{ id: string; before?: string; after?: string }>(
    queryKey,
    (v) => plannerApi.moveItem(v.id, { before: v.before, after: v.after }),
    (old, { id, before, after }) => {
      // Show the new position at once: take the item out and put it between its neighbours
      const list = ((old as TodoItem[]) || []).filter((i) => i._id !== id);
      const moving = ((old as TodoItem[]) || []).find((i) => i._id === id);
      if (!moving) return old;
      const at = after ? list.findIndex((i) => i._id === after) : before ? list.findIndex((i) => i._id === before) + 1 : list.length;
      list.splice(at < 0 ? list.length : at, 0, moving);
      return list;
    },
    "Couldn't move it"
  );

  const remove = useOptimistic<string>(queryKey, (id) => plannerApi.deleteItem(id), (old, id) => ((old as TodoItem[]) || []).filter((i) => i._id !== id), "Couldn't delete it");
  return { ...query, items, add, update, move, remove };
}

// ── Reminders ─────────────────────────────────────────────────────────────────

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

export function useReminders(key: CryptoKey | null, status: "active" | "done" = "active") {
  const qc = useQueryClient();
  const queryKey: QueryKey = ["planner", "reminders", status];
  const query = useQuery({
    queryKey,
    enabled: Boolean(key),
    queryFn: async () => Promise.all((await plannerApi.reminders(status)).map((r) => decryptRow<ReminderRow, { text: string }>(key!, r, { text: "" })))
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["planner", "reminders"] });
  const fail = (msg: string) => (err: unknown) => toast.error(errMsg(err, msg));

  const create = useMutation({
    mutationFn: async (v: { text: string; at: string; recurrence?: Recurrence; link?: { kind: "note" | "item" | "meeting"; id: string } }) =>
      plannerApi.createReminder({ enc: await seal(key!, { text: v.text }), at: v.at, timeZone: localTimeZone(), recurrence: v.recurrence, link: v.link }),
    onSuccess: () => {
      refresh();
      toast.success("Reminder set");
    },
    onError: fail("Couldn't set the reminder")
  });
  const snooze = useMutation({ mutationFn: (v: { id: string; minutes: number }) => plannerApi.snooze(v.id, v.minutes), onSuccess: refresh, onError: fail("Couldn't snooze") });
  const done = useMutation({ mutationFn: (id: string) => plannerApi.doneReminder(id), onSuccess: refresh, onError: fail("Couldn't update") });
  const remove = useMutation({ mutationFn: (id: string) => plannerApi.deleteReminder(id), onSuccess: refresh, onError: fail("Couldn't delete") });
  return { ...query, reminders: query.data || [], create, snooze, done, remove };
}

// ── Meetings ──────────────────────────────────────────────────────────────────

const EMPTY_MEETING: MeetingDetails = { title: "", agenda: "", link: "", location: "" };

export function useMeetings(enabled: boolean, from: Date, to: Date) {
  const userId = useAuthStore((s) => s.user?._id);
  const query = useQuery({
    queryKey: ["planner", "meetings", from.toISOString(), to.toISOString()],
    enabled: enabled && Boolean(userId),
    queryFn: async () =>
      Promise.all(
        (await plannerApi.meetings(from.toISOString(), to.toISOString())).map(async (m) => {
          try {
            return await decryptRow<MeetingRow, MeetingDetails>(await meetingKeyOf(userId!, m), m, EMPTY_MEETING);
          } catch {
            const { enc: _enc, ...rest } = m;
            return { ...rest, ...EMPTY_MEETING, broken: true } as Meeting;
          }
        })
      )
  });
  return { ...query, meetings: query.data || [] };
}
