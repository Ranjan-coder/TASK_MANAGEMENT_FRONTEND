/**
 * lib/chat/receipts.ts — ✓ sent, ✓✓ delivered, blue ✓✓ seen (chat-features-plan.md CH-R).
 *
 * The server keeps two times per member (lastDelivered, lastRead), never a
 * row per message per reader. A message sent at time t has been seen by
 * count(lastRead ≥ t) people:
 *   - one message:  binary search in the sorted times, O(log m)
 *   - a whole page: messages are already in time order, so one pointer walks
 *     the sorted times alongside them: O(n + m) for n messages, m members
 *
 * Customers (decision CH-D3) get one "team" time instead of everyone's, so for
 * them a message is "seen" once anyone in the team has read it.
 */

export type Tick = "sent" | "delivered" | "read";

export interface ReceiptState {
  /** Other members' times (staff view), userId → ms */
  byUser: Record<string, { read: number; delivered: number }>;
  /** Customer view: the team's latest times (ms); present instead of byUser */
  team?: { read: number; delivered: number };
}

export interface TickInfo {
  tick: Tick;
  /** How many of the others have read / received it (staff view) */
  readBy: number;
  deliveredTo: number;
  of: number;
}

const ms = (d: string | Date | null | undefined) => (d ? new Date(d).getTime() || 0 : 0);

/** Receipt state from a conversation as the server sent it (members' times, or the team times for customers). */
export const receiptStateFrom = (
  conv: {
    members: { user: { _id: string } | null; lastRead?: string | null; lastDelivered?: string | null }[];
    teamLastRead?: string | null;
    teamLastDelivered?: string | null;
  },
  myId: string,
  asCustomer: boolean
): ReceiptState => {
  if (asCustomer) {
    const read = ms(conv.teamLastRead);
    return { byUser: {}, team: { read, delivered: Math.max(read, ms(conv.teamLastDelivered)) } };
  }
  const byUser: ReceiptState["byUser"] = {};
  for (const m of conv.members) {
    if (!m.user || m.user._id === myId) continue;
    const read = ms(m.lastRead);
    byUser[m.user._id] = { read, delivered: Math.max(read, ms(m.lastDelivered)) };
  }
  return { byUser };
};

/** Applies a live receipt; times only move forward (same rule as the server's $max). */
export const applyReceipt = (
  state: ReceiptState,
  r: { userId?: string; lastRead?: string; lastDelivered?: string; teamLastRead?: string; teamLastDelivered?: string }
): ReceiptState => {
  if (state.team) {
    if (!r.teamLastRead && !r.teamLastDelivered) return state;
    const read = Math.max(state.team.read, ms(r.teamLastRead));
    const delivered = Math.max(state.team.delivered, read, ms(r.teamLastDelivered));
    return read === state.team.read && delivered === state.team.delivered ? state : { ...state, team: { read, delivered } };
  }
  if (!r.userId || !(r.userId in state.byUser)) return state; // not someone we track (e.g. me)
  const cur = state.byUser[r.userId];
  const read = Math.max(cur.read, ms(r.lastRead));
  const delivered = Math.max(cur.delivered, read, ms(r.lastDelivered));
  if (read === cur.read && delivered === cur.delivered) return state;
  return { ...state, byUser: { ...state.byUser, [r.userId]: { read, delivered } } };
};

/** First index in an ascending array whose value is ≥ t. */
export const lowerBoundNum = (sorted: ArrayLike<number>, t: number): number => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * Ticks for messages (ascending by time) in one pass. `times[i]` is message
 * i's send time in ms; only the indexes in `mine` are computed.
 */
export const ticksForPage = (times: number[], mine: boolean[], state: ReceiptState): (TickInfo | null)[] => {
  const out: (TickInfo | null)[] = new Array(times.length).fill(null);
  if (state.team) {
    const { read, delivered } = state.team;
    for (let i = 0; i < times.length; i++) {
      if (!mine[i]) continue;
      const tick: Tick = read >= times[i] ? "read" : delivered >= times[i] ? "delivered" : "sent";
      out[i] = { tick, readBy: tick === "read" ? 1 : 0, deliveredTo: tick === "sent" ? 0 : 1, of: 1 };
    }
    return out;
  }
  const people = Object.values(state.byUser);
  const of = people.length;
  const reads = people.map((p) => p.read).sort((a, b) => a - b);
  const delivers = people.map((p) => p.delivered).sort((a, b) => a - b);
  // Pointers: first member time ≥ current message time. Message times only grow, so pointers only advance.
  let r = 0;
  let d = 0;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    while (r < of && reads[r] < t) r++;
    while (d < of && delivers[d] < t) d++;
    if (!mine[i]) continue;
    const readBy = of - r;
    const deliveredTo = of - d;
    const tick: Tick = of > 0 && readBy === of ? "read" : of > 0 && deliveredTo === of ? "delivered" : "sent";
    out[i] = { tick, readBy, deliveredTo, of };
  }
  return out;
};

/** Who has read / only received a message sent at `t` (staff view, for "Message info"). */
export const whoSaw = (state: ReceiptState, t: number): { read: string[]; delivered: string[] } => {
  const read: string[] = [];
  const delivered: string[] = [];
  for (const [id, p] of Object.entries(state.byUser)) {
    if (p.read >= t) read.push(id);
    else if (p.delivered >= t) delivered.push(id);
  }
  return { read, delivered };
};
