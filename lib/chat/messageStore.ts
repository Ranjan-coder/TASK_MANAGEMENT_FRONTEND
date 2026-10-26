/**
 * lib/chat/messageStore.ts — the ordered message list of one conversation
 * (chat-features-plan.md CH-Q). Pure functions over immutable arrays, so the
 * zustand store stays simple and every operation is unit-testable.
 *
 * Order: server messages by (createdAt, _id); messages still being sent
 * (`local:` ids) always after them, in the order they were typed. Sorting
 * the pending ones last means a wrong clock on this device can't push them
 * into the middle of the history.
 *
 *  - insert / find:  binary search, O(log n) to locate (+ one array copy)
 *  - merge pages:    two-pointer merge with de-duplication, O(n + m)
 *  - lookup by id:   O(1) after one O(n) pass per array version (WeakMap cache)
 *  - memory:         LRU of conversation ids, so only the last N stay loaded
 */
import type { Message } from "@/types/chat";

export const LOCAL_PREFIX = "local:";
export const isLocal = (m: Pick<Message, "_id">): boolean => m._id.startsWith(LOCAL_PREFIX);
export const localIdFor = (clientMsgId: string): string => `${LOCAL_PREFIX}${clientMsgId}`;

// Parsed timestamps, cached per message object (Date.parse on every comparison adds up)
const timeCache = new WeakMap<Message, number>();
const timeOf = (m: Message): number => {
  let t = timeCache.get(m);
  if (t === undefined) {
    t = Date.parse(m.createdAt) || 0;
    timeCache.set(m, t);
  }
  return t;
};

/** Total order used everywhere: negative if a comes first. */
export const compareMessages = (a: Message, b: Message): number => {
  const la = isLocal(a);
  const lb = isLocal(b);
  if (la !== lb) return la ? 1 : -1;
  const dt = timeOf(a) - timeOf(b);
  if (dt !== 0) return dt;
  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
};

/** First index whose message is not before `msg` (lower bound). */
export const lowerBound = (list: readonly Message[], msg: Message): number => {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareMessages(list[mid], msg) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// id → index for one array version. Arrays are never mutated, so the cache can't go stale.
const indexCache = new WeakMap<readonly Message[], Map<string, number>>();
const indexOf = (list: readonly Message[]): Map<string, number> => {
  let idx = indexCache.get(list);
  if (!idx) {
    idx = new Map();
    for (let i = 0; i < list.length; i++) idx.set(list[i]._id, i);
    indexCache.set(list, idx);
  }
  return idx;
};

/** Position of a message by id, or -1. */
export const findIndexById = (list: readonly Message[], id: string): number => indexOf(list).get(id) ?? -1;

/** Position of a message, using its sort key first (O(log n)) and the id index as a fallback. */
const locate = (list: readonly Message[], msg: Message): number => {
  const i = lowerBound(list, msg);
  if (i < list.length && list[i]._id === msg._id) return i;
  return findIndexById(list, msg._id);
};

/**
 * Inserts a message in order. An existing copy (same id) is replaced, so a
 * socket echo of a message we already show is harmless. Returns the same
 * array when nothing changed.
 */
export const insertMessage = (list: readonly Message[], msg: Message): Message[] => {
  const at = locate(list, msg);
  if (at >= 0) {
    if (list[at] === msg) return list as Message[];
    const without = [...list.slice(0, at), ...list.slice(at + 1)];
    return insertMessage(without, msg);
  }
  const pos = lowerBound(list, msg);
  return [...list.slice(0, pos), msg, ...list.slice(pos)];
};

/** Replaces a message in place (same id); unchanged array if it isn't there. */
export const replaceMessage = (list: readonly Message[], msg: Message): Message[] => {
  const at = locate(list, msg);
  if (at < 0) return list as Message[];
  const next = list.slice();
  next[at] = msg;
  return next;
};

/** Applies `fn` to the message with this id; unchanged array if it isn't there. */
export const updateById = (list: readonly Message[], id: string, fn: (m: Message) => Message | null): Message[] => {
  const at = findIndexById(list, id);
  if (at < 0) return list as Message[];
  const out = fn(list[at]);
  if (out === list[at]) return list as Message[];
  return out === null ? [...list.slice(0, at), ...list.slice(at + 1)] : Object.assign(list.slice(), { [at]: out });
};

/**
 * Merges two sorted lists into one, dropping duplicates (the copy from
 * `incoming` wins). O(n + m). `incoming` may arrive unsorted; it is sorted first.
 */
export const mergeMessages = (existing: readonly Message[], incoming: readonly Message[]): Message[] => {
  const b = [...incoming].sort(compareMessages);
  const fresh = new Set(b.map((m) => m._id));
  const a = existing.filter((m) => !fresh.has(m._id));
  const out: Message[] = new Array(a.length + b.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < a.length && j < b.length) out[k++] = compareMessages(a[i], b[j]) <= 0 ? a[i++] : b[j++];
  while (i < a.length) out[k++] = a[i++];
  while (j < b.length) out[k++] = b[j++];
  return out;
};

/**
 * A freshly fetched page replaces what we had, but keeps what the fetch can't
 * know about: messages still being sent here, and messages that arrived live
 * (newer than the page's newest) while the request was in flight.
 */
export const replaceWithPage = (existing: readonly Message[], page: readonly Message[]): Message[] => {
  const sorted = [...page].sort(compareMessages);
  const newest = sorted[sorted.length - 1];
  const confirmed = new Set(sorted.map((m) => m.clientMsgId).filter(Boolean));
  const keep = existing.filter((m) =>
    isLocal(m)
      ? !confirmed.has(m.clientMsgId)
      : newest !== undefined && compareMessages(m, newest) > 0
  );
  return keep.length ? mergeMessages(sorted, keep) : sorted;
};

/**
 * The server's copy of a message we sent from here: takes the place of the
 * pending one, keeping the text we already have (no need to decrypt our own).
 */
export const confirmLocal = (list: readonly Message[], saved: Message, plain?: Partial<Message>): Message[] => {
  const localAt = saved.clientMsgId ? findIndexById(list, localIdFor(saved.clientMsgId)) : -1;
  const local = localAt >= 0 ? list[localAt] : undefined;
  const base = localAt >= 0 ? [...list.slice(0, localAt), ...list.slice(localAt + 1)] : list;
  const existing = findIndexById(base, saved._id);
  const merged: Message = {
    ...saved,
    ...(saved.decryptedContent === undefined && local?.decryptedContent !== undefined
      ? {
          decryptedContent: local.decryptedContent,
          cryptoKey: local.cryptoKey,
          frankingKey: local.frankingKey,
          // We wrote this text ourselves; it matches the commitment the server stamped
          frankVerified: saved.franking?.commitment ? local.frankVerified : undefined
        }
      : {}),
    ...(plain || {}),
    ...(local?.replyTo && typeof saved.replyTo !== "object" ? { replyTo: local.replyTo } : {})
  };
  // Already shown (the live echo won the race): keep whichever copy has the text
  if (existing >= 0 && base[existing].decryptedContent !== undefined && merged.decryptedContent === undefined) {
    return base as Message[];
  }
  return insertMessage(base, merged);
};

/**
 * Least-recently-used set of keys. A Map keeps insertion order, so "touch"
 * (delete + set) moves a key to the newest end in O(1), and the oldest key is
 * always the first one.
 */
export class LruKeys {
  private order = new Map<string, true>();
  constructor(private readonly capacity: number) {}

  /** Marks `key` as just used; returns the keys pushed out (never ones in `keep`). */
  touch(key: string, keep: (key: string) => boolean = () => false): string[] {
    this.order.delete(key);
    this.order.set(key, true);
    const evicted: string[] = [];
    if (this.order.size <= this.capacity) return evicted;
    for (const k of this.order.keys()) {
      if (this.order.size - evicted.length <= this.capacity) break;
      if (k === key || keep(k)) continue;
      evicted.push(k);
    }
    for (const k of evicted) this.order.delete(k);
    return evicted;
  }

  delete(key: string): void {
    this.order.delete(key);
  }

  clear(): void {
    this.order.clear();
  }

  get size(): number {
    return this.order.size;
  }
}
