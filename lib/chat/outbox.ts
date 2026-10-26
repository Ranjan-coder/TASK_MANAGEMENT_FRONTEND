/**
 * lib/chat/outbox.ts — messages waiting to reach the server (chat-features-plan.md CH-Q).
 *
 * One FIFO queue per conversation, one request in flight per conversation, so
 * messages arrive in the order they were typed. A failed send is retried with
 * exponential backoff and jitter; every retry reuses the same clientMsgId, and
 * the server returns the already-saved copy, so nothing is sent twice.
 *
 *  - transient failure (offline, 5xx, 429, timeout): the queue waits and retries
 *  - refused (other 4xx) or out of attempts: the message is marked failed, the
 *    rest of the queue carries on, and the person can retry or discard it
 *
 * Framework-free: the network call, storage and timers are passed in (tested
 * with fakes in scripts/chat-lib.check.ts).
 */

export type OutboxStatus = "queued" | "sending" | "failed";

export interface OutboxEntry<B = unknown> {
  clientMsgId: string;
  conversationId: string;
  /** Encrypted request body: retries send exactly the same bytes */
  body: B;
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
  error?: string;
}

export interface OutboxStorage<B> {
  put(entry: OutboxEntry<B>): void;
  remove(clientMsgId: string): void;
}

export interface OutboxDeps<B, R> {
  send: (entry: OutboxEntry<B>) => Promise<R>;
  /** "retry" for transient problems, "fail" when the server refused the message */
  classify: (err: unknown) => "retry" | "fail";
  /** Text shown on a failed message */
  describe?: (err: unknown) => string;
  onSent: (entry: OutboxEntry<B>, result: R) => void;
  onChange?: (entry: OutboxEntry<B>) => void;
  storage?: OutboxStorage<B>;
  isOnline?: () => boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class Outbox<B = unknown, R = unknown> {
  private readonly queues = new Map<string, OutboxEntry<B>[]>();
  private readonly inFlight = new Set<string>();
  private readonly timers = new Map<string, unknown>();
  /** Bumped by clear(): answers to requests sent before a sign-out are ignored */
  private generation = 0;
  private readonly d: Required<Omit<OutboxDeps<B, R>, "storage" | "onChange" | "describe">> &
    Pick<OutboxDeps<B, R>, "storage" | "onChange" | "describe">;

  constructor(deps: OutboxDeps<B, R>) {
    this.d = {
      isOnline: () => true,
      maxAttempts: 8,
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      random: Math.random,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      ...deps
    };
  }

  /** Adds a message to its conversation's queue and starts sending. */
  enqueue(entry: Omit<OutboxEntry<B>, "attempts" | "status" | "createdAt"> & { createdAt?: number }): OutboxEntry<B> {
    const full: OutboxEntry<B> = { createdAt: Date.now(), ...entry, attempts: 0, status: "queued" };
    this.queueOf(full.conversationId).push(full);
    this.d.storage?.put(full);
    this.d.onChange?.(full);
    this.pump(full.conversationId);
    return full;
  }

  /** Puts back messages saved by an earlier visit (not yet confirmed by the server). */
  restore(entries: OutboxEntry<B>[]): void {
    const known = new Set(this.all().map((e) => e.clientMsgId));
    const fresh = entries.filter((e) => !known.has(e.clientMsgId)).sort((a, b) => a.createdAt - b.createdAt);
    for (const e of fresh) this.queueOf(e.conversationId).push({ ...e, attempts: 0, status: "queued", error: undefined });
    for (const conv of new Set(fresh.map((e) => e.conversationId))) this.pump(conv);
  }

  /** Tries a failed message again. */
  retry(clientMsgId: string): void {
    const e = this.find(clientMsgId);
    if (!e || e.status !== "failed") return;
    e.status = "queued";
    e.attempts = 0;
    e.error = undefined;
    this.d.storage?.put(e);
    this.d.onChange?.(e);
    this.pump(e.conversationId);
  }

  /** Drops a failed message (one being sent can't be called back). */
  discard(clientMsgId: string): boolean {
    const e = this.find(clientMsgId);
    if (!e || e.status !== "failed") return false;
    this.drop(e);
    return true;
  }

  /** Back online / reconnected: retry now instead of waiting out the backoff. */
  resume(): void {
    for (const [conv, h] of this.timers) {
      this.d.clearTimer(h);
      this.timers.delete(conv);
    }
    for (const conv of this.queues.keys()) this.pump(conv);
  }

  pending(conversationId?: string): OutboxEntry<B>[] {
    return conversationId ? [...(this.queues.get(conversationId) || [])] : this.all();
  }

  /** Forgets everything (sign-out). */
  clear(): void {
    for (const h of this.timers.values()) this.d.clearTimer(h);
    this.timers.clear();
    this.queues.clear();
    this.inFlight.clear();
    this.generation += 1;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private all(): OutboxEntry<B>[] {
    return [...this.queues.values()].flat();
  }

  private find(clientMsgId: string): OutboxEntry<B> | undefined {
    for (const q of this.queues.values()) {
      const e = q.find((x) => x.clientMsgId === clientMsgId);
      if (e) return e;
    }
    return undefined;
  }

  private queueOf(conv: string): OutboxEntry<B>[] {
    let q = this.queues.get(conv);
    if (!q) {
      q = [];
      this.queues.set(conv, q);
    }
    return q;
  }

  private drop(e: OutboxEntry<B>): void {
    const q = this.queues.get(e.conversationId);
    if (q) {
      const i = q.indexOf(e);
      if (i >= 0) q.splice(i, 1);
      if (q.length === 0) this.queues.delete(e.conversationId);
    }
    this.d.storage?.remove(e.clientMsgId);
  }

  private delayFor(attempts: number): number {
    const exp = Math.min(this.d.maxDelayMs, this.d.baseDelayMs * 2 ** (attempts - 1));
    return Math.round(exp * (0.5 + this.d.random() * 0.5)); // jitter: many clients don't retry in lockstep
  }

  private pump(conv: string): void {
    if (this.inFlight.has(conv) || this.timers.has(conv)) return;
    if (!this.d.isOnline()) return; // resume() runs when the connection comes back
    const head = this.queues.get(conv)?.find((e) => e.status !== "failed");
    if (!head) return;

    head.status = "sending";
    this.inFlight.add(conv);
    this.d.onChange?.(head);
    const generation = this.generation;

    this.d.send(head).then(
      (result) => {
        if (generation !== this.generation) return;
        this.inFlight.delete(conv);
        this.drop(head);
        this.d.onSent(head, result);
        this.pump(conv);
      },
      (err) => {
        if (generation !== this.generation) return;
        this.inFlight.delete(conv);
        if (!this.queues.get(conv)?.includes(head)) return this.pump(conv); // cleared meanwhile
        head.attempts += 1;
        if (this.d.classify(err) === "fail" || head.attempts >= this.d.maxAttempts) {
          head.status = "failed";
          head.error = this.d.describe?.(err) || "Not sent";
          this.d.storage?.put(head);
          this.d.onChange?.(head);
          this.pump(conv); // the rest of the queue carries on
          return;
        }
        head.status = "queued";
        this.d.onChange?.(head);
        const timer = this.d.setTimer(() => {
          this.timers.delete(conv);
          this.pump(conv);
        }, this.delayFor(head.attempts));
        this.timers.set(conv, timer);
      }
    );
  }
}
