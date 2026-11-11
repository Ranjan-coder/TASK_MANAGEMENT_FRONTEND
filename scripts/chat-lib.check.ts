/**
 * Checks for the chat data structures (chat-features-plan.md P0), each against
 * a brute-force reference on random input. No test runner needed:
 *
 *   node --experimental-transform-types --import ./scripts/ts-resolve.mjs scripts/chat-lib.check.ts
 */
import assert from "node:assert/strict";
import { Fenwick } from "../lib/chat/fenwick.ts";
import {
  LruKeys,
  compareMessages,
  confirmLocal,
  findIndexById,
  insertMessage,
  localIdFor,
  mergeMessages,
  replaceWithPage,
  updateById
} from "../lib/chat/messageStore.ts";
import { Outbox, type OutboxEntry } from "../lib/chat/outbox.ts";
import type { Message } from "../types/chat.ts";
import { MentionIndex, activeMentionQuery, encodeMentions, fold, mentionedIn, mentionsToPlain, parseMentions } from "../lib/chat/mentions.ts";
import { applyReceipt, receiptStateFrom, ticksForPage, whoSaw, type ReceiptState } from "../lib/chat/receipts.ts";
import { ChatSearch } from "../lib/chat/chatSearch.ts";
import { MENU_WIDTH, PICKER_HEIGHT, PICKER_WIDTH, menuHeight, placeMenu } from "../lib/chat/messageMenu.ts";
import { hasFormatting, parseFormatting, parseInline } from "../lib/chat/format.ts";
import { formatDuration, formatSize, kindOf, safeDownloadName } from "../lib/chat/files.ts";

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const randInt = (n: number) => Math.floor(rand() * n);
let passed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

// ── Fenwick ─────────────────────────────────────────────────────────────────
await check("Fenwick: prefix, set and indexAt match a plain array (2,000 random operations)", () => {
  const n = 300;
  const plain = Array.from({ length: n }, () => 20 + randInt(200));
  const fw = new Fenwick(plain);
  const prefix = (i: number) => plain.slice(0, i).reduce((a, b) => a + b, 0);
  const indexAt = (y: number) => {
    if (y < 0) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) if ((s += plain[i]) > y) return i;
    return n - 1;
  };
  for (let op = 0; op < 2000; op++) {
    const i = randInt(n);
    if (rand() < 0.4) {
      plain[i] = 10 + randInt(400);
      fw.set(i, plain[i]);
    }
    assert.equal(fw.prefix(i), prefix(i));
    const y = randInt(prefix(n) + 500) - 100;
    assert.equal(fw.indexAt(y), indexAt(y), `indexAt(${y})`);
  }
  assert.equal(fw.total(), prefix(n));
});

await check("Fenwick: edges (empty, one row, exact boundaries)", () => {
  assert.equal(new Fenwick([]).indexAt(10), 0);
  assert.equal(new Fenwick([]).total(), 0);
  const one = new Fenwick([50]);
  assert.equal(one.indexAt(0), 0);
  assert.equal(one.indexAt(49.9), 0);
  assert.equal(one.indexAt(1e9), 0);
  const three = new Fenwick([10, 10, 10]);
  assert.equal(three.indexAt(10), 1); // a boundary belongs to the next row
  assert.equal(three.indexAt(9.99), 0);
  assert.equal(three.prefix(3), 30);
});

await check("Fenwick: 10,000 rows build in O(n), 100,000 lookups stay fast", () => {
  const heights = Array.from({ length: 10_000 }, () => 40 + randInt(300));
  const t0 = performance.now();
  const fw = new Fenwick(heights);
  const built = performance.now() - t0;
  const t1 = performance.now();
  let sink = 0;
  for (let k = 0; k < 100_000; k++) sink += fw.indexAt(randInt(fw.total()));
  const looked = performance.now() - t1;
  console.log(`      build ${built.toFixed(2)} ms, 100k lookups ${looked.toFixed(1)} ms (${sink > 0 ? "ok" : ""})`);
  assert.ok(built < 50 && looked < 500);
});

// ── Message ordering ────────────────────────────────────────────────────────
let idSeq = 0;
const msg = (t: number, extra: Partial<Message> = {}): Message =>
  ({
    _id: (++idSeq).toString(16).padStart(24, "0"),
    conversation: "c1",
    sender: { _id: "u1", name: "Anna" },
    type: "text",
    attachments: [],
    reactions: [],
    isEdited: false,
    isDeleted: false,
    createdAt: new Date(1_700_000_000_000 + t).toISOString(),
    updatedAt: new Date(1_700_000_000_000 + t).toISOString(),
    ...extra
  }) as Message;
const local = (t: number, clientMsgId: string, extra: Partial<Message> = {}) =>
  msg(t, { _id: localIdFor(clientMsgId), clientMsgId, localStatus: "sending", decryptedContent: `text ${clientMsgId}`, ...extra });
const isSorted = (list: Message[]) => list.every((m, i) => i === 0 || compareMessages(list[i - 1], m) <= 0);

await check("insertMessage keeps order and never duplicates (random arrival order, repeats)", () => {
  const all = Array.from({ length: 400 }, () => msg(randInt(5000))); // many equal timestamps
  let list: Message[] = [];
  for (let k = 0; k < 1200; k++) list = insertMessage(list, all[randInt(all.length)]);
  for (const m of all) list = insertMessage(list, m);
  assert.equal(list.length, all.length);
  assert.ok(isSorted(list));
  assert.deepEqual(list.map((m) => m._id), [...all].sort(compareMessages).map((m) => m._id));
});

await check("unsent messages always sort after the history, even with this device's clock behind", () => {
  const server = [msg(1000), msg(2000), msg(3000)];
  let list = mergeMessages([], server);
  list = insertMessage(list, local(-99_999, "a")); // clock far behind
  list = insertMessage(list, local(-99_998, "b"));
  assert.deepEqual(list.slice(3).map((m) => m.clientMsgId), ["a", "b"]);
  const live = msg(4000);
  list = insertMessage(list, live); // a live message still goes above the unsent ones
  assert.equal(list[3]._id, live._id);
  assert.ok(isSorted(list));
  assert.equal(list.findIndex((m) => m.clientMsgId === "a"), 4);
});

await check("mergeMessages: two-pointer merge equals sort + dedupe (incoming copy wins)", () => {
  for (let round = 0; round < 50; round++) {
    const pool = Array.from({ length: 60 }, () => msg(randInt(1000)));
    const a = [...pool].filter(() => rand() < 0.5).sort(compareMessages);
    const bRaw = pool.filter(() => rand() < 0.5).map((m) => ({ ...m, reactions: [{ emoji: "👍", users: ["x"] }] }));
    const merged = mergeMessages(a, bRaw);
    const ref = new Map<string, Message>();
    for (const m of a) ref.set(m._id, m);
    for (const m of bRaw) ref.set(m._id, m);
    assert.deepEqual(merged.map((m) => m._id), [...ref.values()].sort(compareMessages).map((m) => m._id));
    for (const m of merged) if (bRaw.some((b) => b._id === m._id)) assert.equal(m.reactions.length, 1);
  }
});

await check("replaceWithPage keeps unsent messages and ones that arrived during the fetch", () => {
  const [m1, m2, m3, live] = [msg(10), msg(20), msg(30), msg(40)];
  const pendingSent = local(50, "sent-meanwhile");
  const pendingWaiting = local(51, "still-waiting");
  const existing = [m1, live, pendingSent, pendingWaiting];
  // The page includes the message that was pending (now saved on the server)
  const savedCopy = msg(35, { clientMsgId: "sent-meanwhile" });
  const out = replaceWithPage(existing, [m1, m2, m3, savedCopy]);
  assert.deepEqual(
    out.map((m) => m.clientMsgId ?? m._id),
    [m1._id, m2._id, m3._id, "sent-meanwhile", live._id, "still-waiting"]
  );
  assert.ok(out.find((m) => m.clientMsgId === "sent-meanwhile" && !m.localStatus));
});

await check("confirmLocal: the saved copy replaces the pending one and keeps its text, whichever arrives first", () => {
  const base = mergeMessages([], [msg(1), msg(2)]);
  const pending = local(3, "cm1", { replyTo: msg(0) });
  const saved = msg(5, { clientMsgId: "cm1", franking: { commitment: "c" } });
  // HTTP response first
  let list = insertMessage(base, pending);
  list = confirmLocal(list, saved);
  assert.equal(list.length, 3);
  assert.equal(list[2]._id, saved._id);
  assert.equal(list[2].decryptedContent, "text cm1");
  assert.equal(list[2].localStatus, undefined);
  assert.ok(typeof list[2].replyTo === "object");
  // ...then the live echo (already decrypted elsewhere): nothing doubles
  list = confirmLocal(list, { ...saved, decryptedContent: "text cm1" });
  assert.equal(list.length, 3);
  // Echo first, response second (response has no text): the decrypted copy stays
  let other = insertMessage(base, pending);
  other = confirmLocal(other, { ...saved, decryptedContent: "text cm1" });
  other = confirmLocal(other, saved);
  assert.equal(other.length, 3);
  assert.equal(other[2].decryptedContent, "text cm1");
});

await check("findIndexById / updateById use one cached index per list version", () => {
  const list = mergeMessages([], Array.from({ length: 1000 }, (_, i) => msg(i)));
  const target = list[777];
  assert.equal(findIndexById(list, target._id), 777);
  const removed = updateById(list, target._id, () => null);
  assert.equal(removed.length, 999);
  assert.equal(findIndexById(removed, target._id), -1);
  assert.equal(updateById(list, "nope", () => null), list); // unchanged → same array
  const edited = updateById(list, target._id, (m) => ({ ...m, isEdited: true }));
  assert.equal(edited[777].isEdited, true);
  assert.equal(list[777].isEdited, false); // never mutates
});

// ── LRU ─────────────────────────────────────────────────────────────────────
await check("LruKeys evicts the least recently used, never protected keys", () => {
  const lru = new LruKeys(3);
  assert.deepEqual(lru.touch("a"), []);
  lru.touch("b");
  lru.touch("c");
  lru.touch("a"); // a is fresh again
  assert.deepEqual(lru.touch("d"), ["b"]);
  assert.deepEqual(lru.touch("e", (k) => k === "c"), ["a"]); // c protected (open chat / unsent messages)
  assert.equal(lru.size, 3);
});

// ── Outbox ──────────────────────────────────────────────────────────────────
type Body = { text: string };
const fakeTimers = () => {
  const queue: { fn: () => void; ms: number }[] = [];
  return {
    setTimer: (fn: () => void, ms: number) => {
      const t = { fn, ms };
      queue.push(t);
      return t;
    },
    clearTimer: (t: unknown) => {
      const i = queue.indexOf(t as never);
      if (i >= 0) queue.splice(i, 1);
    },
    runAll: () => {
      const due = queue.splice(0);
      for (const t of due) t.fn();
      return due.map((t) => t.ms);
    }
  };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const httpError = (status?: number) => Object.assign(new Error("x"), status ? { response: { status } } : {});

await check("Outbox: one request at a time per chat, in typing order; chats don't block each other", async () => {
  const sent: string[] = [];
  const gates: (() => void)[] = [];
  const box = new Outbox<Body, string>({
    send: (e) => new Promise((res) => gates.push(() => (sent.push(`${e.conversationId}:${e.body.text}`), res("ok")))),
    classify: () => "retry",
    onSent: () => {}
  });
  for (const t of ["1", "2", "3"]) box.enqueue({ clientMsgId: `a${t}`, conversationId: "A", body: { text: t } });
  box.enqueue({ clientMsgId: "b1", conversationId: "B", body: { text: "1" } });
  assert.equal(gates.length, 2); // A's first and B's first in flight; A2, A3 wait
  gates[1]();
  await tick();
  gates[0]();
  await tick();
  gates[2]();
  await tick();
  gates[3]();
  await tick();
  assert.deepEqual(sent, ["B:1", "A:1", "A:2", "A:3"]);
  assert.equal(box.pending().length, 0);
});

await check("Outbox: transient errors retry with growing, jittered delays and the same entry (same clientMsgId)", async () => {
  const timers = fakeTimers();
  const ids: string[] = [];
  let fails = 3;
  let done: string | null = null;
  const box = new Outbox<Body, string>({
    send: async (e) => {
      ids.push(e.clientMsgId);
      if (fails-- > 0) throw httpError(503);
      return "saved";
    },
    classify: (err) => ((err as { response?: { status: number } }).response?.status ?? 0) >= 500 ? "retry" : "fail",
    onSent: (_e, r) => (done = r),
    random: () => 1,
    ...timers
  });
  box.enqueue({ clientMsgId: "same-id", conversationId: "A", body: { text: "hi" } });
  const delays: number[] = [];
  for (let k = 0; k < 4; k++) {
    await tick();
    delays.push(...timers.runAll());
  }
  assert.equal(done, "saved");
  assert.deepEqual(ids, ["same-id", "same-id", "same-id", "same-id"]);
  assert.deepEqual(delays, [1000, 2000, 4000]);
});

await check("Outbox: a refused message is marked failed and the rest of the queue carries on; retry and discard work", async () => {
  const states: string[] = [];
  const sent: string[] = [];
  let refuse = true;
  const box = new Outbox<Body, string>({
    send: async (e) => {
      if (e.body.text === "bad" && refuse) throw httpError(400);
      sent.push(e.body.text);
      return "ok";
    },
    classify: () => "fail",
    describe: () => "Refused",
    onSent: () => {},
    onChange: (e) => states.push(`${e.body.text}:${e.status}`)
  });
  box.enqueue({ clientMsgId: "x1", conversationId: "A", body: { text: "bad" } });
  box.enqueue({ clientMsgId: "x2", conversationId: "A", body: { text: "good" } });
  await tick();
  await tick();
  assert.deepEqual(sent, ["good"]);
  assert.equal(box.pending("A")[0].status, "failed");
  assert.equal(box.pending("A")[0].error, "Refused");
  refuse = false;
  box.retry("x1");
  await tick();
  assert.deepEqual(sent, ["good", "bad"]);
  refuse = true;
  box.enqueue({ clientMsgId: "x3", conversationId: "A", body: { text: "bad" } });
  await tick();
  assert.equal(box.discard("x3"), true);
  assert.equal(box.pending().length, 0);
});

await check("Outbox: offline waits without spending attempts; resume() sends at once", async () => {
  let online = false;
  const sent: string[] = [];
  const box = new Outbox<Body, string>({
    send: async (e) => (sent.push(e.body.text), "ok"),
    classify: () => "retry",
    onSent: () => {},
    isOnline: () => online
  });
  box.enqueue({ clientMsgId: "o1", conversationId: "A", body: { text: "1" } });
  box.enqueue({ clientMsgId: "o2", conversationId: "A", body: { text: "2" } });
  await tick();
  assert.deepEqual(sent, []);
  assert.equal(box.pending("A")[0].attempts, 0);
  online = true;
  box.resume();
  await tick();
  await tick();
  assert.deepEqual(sent, ["1", "2"]);
});

await check("Outbox: answers that arrive after clear() (sign-out) are ignored", async () => {
  let release!: () => void;
  const sentTo: string[] = [];
  const box = new Outbox<Body, string>({
    send: () => new Promise((res) => (release = () => res("late"))),
    classify: () => "retry",
    onSent: (e) => sentTo.push(e.clientMsgId)
  });
  box.enqueue({ clientMsgId: "s1", conversationId: "A", body: { text: "1" } });
  box.clear();
  release();
  await tick();
  assert.deepEqual(sentTo, []);
});

await check("Outbox: restore() resumes saved entries in their original order and skips duplicates", async () => {
  const sent: string[] = [];
  const saved: OutboxEntry<Body>[] = [
    { clientMsgId: "r2", conversationId: "A", body: { text: "2" }, createdAt: 2, attempts: 5, status: "failed", error: "x" },
    { clientMsgId: "r1", conversationId: "A", body: { text: "1" }, createdAt: 1, attempts: 0, status: "queued" }
  ];
  const box = new Outbox<Body, string>({ send: async (e) => (sent.push(e.body.text), "ok"), classify: () => "retry", onSent: () => {} });
  box.restore(saved);
  box.restore(saved);
  for (let k = 0; k < 4; k++) await tick();
  assert.deepEqual(sent, ["1", "2"]);
});

// ── Mentions (P1) ───────────────────────────────────────────────────────────
const oid = (n: number) => n.toString(16).padStart(24, "a");
const team = [
  { id: oid(1), name: "Asha Rao" },
  { id: oid(2), name: "Asha Menon" },
  { id: oid(3), name: "Rao Mehta" },
  { id: oid(4), name: "Zoë Fernandes" },
  { id: oid(5), name: "Ben" }
];

await check("MentionIndex: any name word matches by prefix, accents and case folded", () => {
  const idx = new MentionIndex(team);
  const names = (q: string) => idx.search(q).map((p) => p.name).sort();
  assert.deepEqual(names("asha"), ["Asha Menon", "Asha Rao"]);
  assert.deepEqual(names("rao"), ["Asha Rao", "Rao Mehta"]);
  assert.deepEqual(names("ZOE"), ["Zoë Fernandes"]);
  assert.deepEqual(names("asha r"), ["Asha Rao"]); // full-name prefix
  assert.deepEqual(names("x"), []);
  assert.equal(idx.search("").length, 5); // bare "@" lists everyone (up to the limit)
});

await check("MentionIndex: results match a brute-force filter, ranked by recency then name (500 random people)", () => {
  const syll = ["an", "ra", "ma", "li", "ko", "su", "ve", "di"];
  const word = () => Array.from({ length: 2 + randInt(2) }, () => syll[randInt(syll.length)]).join("");
  const people = Array.from({ length: 500 }, (_, i) => ({ id: oid(100 + i), name: `${word()} ${word()}` }));
  const recency = new Map(people.map((p) => [p.id, randInt(50)]));
  const idx = new MentionIndex(people);
  for (const q of ["a", "ra", "kos", "ma l", "su", "veve"]) {
    const ref = people
      .filter((p) => {
        const full = fold(p.name);
        return full.startsWith(q) || full.split(" ").some((w) => w.startsWith(q));
      })
      .sort((a, b) => recency.get(b.id)! - recency.get(a.id)! || a.name.localeCompare(b.name))
      .slice(0, 8);
    const got = idx.search(q, 8, (id) => recency.get(id)!);
    assert.deepEqual(got.map((p) => p.id), ref.map((p) => p.id), `query "${q}"`);
  }
});

await check("activeMentionQuery finds the @word before the caret, not e-mail addresses", () => {
  assert.deepEqual(activeMentionQuery("hi @as", 6), { start: 3, query: "as" });
  assert.deepEqual(activeMentionQuery("@", 1), { start: 0, query: "" });
  assert.equal(activeMentionQuery("mail me@acme", 12), null);
  assert.equal(activeMentionQuery("hi @asha rao", 12), null); // a space ends the query
  assert.deepEqual(activeMentionQuery("(@zo", 4), { start: 1, query: "zo" });
});

await check("encodeMentions: picked names become tokens (longest first); stray @ stays text; @everyone only when allowed", () => {
  const picked = [team[0], team[1]];
  const r = encodeMentions("hey @Asha Rao and @Asha Menon, ping @Ben and @everyone. me@x.com", picked, false);
  assert.equal(r.text, `hey <@${oid(1)}> and <@${oid(2)}>, ping @Ben and @everyone. me@x.com`);
  assert.deepEqual(r.mentions.sort(), [oid(1), oid(2)]);
  assert.equal(r.mentionsAll, null);
  const all = encodeMentions("@here then @everyone", [], true);
  assert.equal(all.text, "<@here> then <@everyone>");
  assert.equal(all.mentionsAll, "everyone");
  assert.equal(encodeMentions("@everyoneelse", [], true).mentionsAll, null); // whole word only
  // A shorter picked name that is a prefix of a longer one doesn't steal it
  const short = { id: oid(9), name: "Asha" };
  assert.equal(encodeMentions("@Asha Rao @Asha", [short, team[0]], false).text, `<@${oid(1)}> <@${oid(9)}>`);
});

await check("parseMentions / mentionsToPlain round-trip; malformed tokens stay text; never HTML", () => {
  const text = `hi <@${oid(1)}>, <@everyone> <b>x</b> <@nope> <@${oid(1)}`;
  const segs = parseMentions(text);
  assert.deepEqual(
    segs.map((s) => s.kind),
    ["text", "mention", "text", "all", "text"]
  );
  assert.ok(segs.some((s) => s.kind === "text" && s.text.includes("<b>x</b> <@nope>")));
  const names = new Map(team.map((p) => [p.id, p.name]));
  assert.equal(mentionsToPlain(text, (id) => names.get(id)), `hi @Asha Rao, @everyone <b>x</b> <@nope> <@${oid(1)}`);
  assert.deepEqual(mentionedIn(`<@${oid(3)}> and <@${oid(4)}>`), [oid(3), oid(4)]);
  // Editing: plain → tokens again with the same people
  const plain = mentionsToPlain(`ok <@${oid(3)}>`, (id) => names.get(id));
  assert.equal(encodeMentions(plain, [team[2]], false).text, `ok <@${oid(3)}>`);
});

// ── Receipts (P2) ───────────────────────────────────────────────────────────
await check("ticksForPage: one-pass counts equal a brute-force count (random members and messages)", () => {
  for (let round = 0; round < 40; round++) {
    const m = 1 + randInt(30);
    const byUser: ReceiptState["byUser"] = {};
    for (let k = 0; k < m; k++) {
      const read = randInt(1000);
      byUser[`u${k}`] = { read, delivered: read + randInt(300) };
    }
    const times = Array.from({ length: 200 }, () => randInt(1400)).sort((a, b) => a - b);
    const mine = times.map(() => rand() < 0.5);
    const got = ticksForPage(times, mine, { byUser });
    times.forEach((t, i) => {
      if (!mine[i]) return assert.equal(got[i], null);
      const people = Object.values(byUser);
      const readBy = people.filter((p) => p.read >= t).length;
      const deliveredTo = people.filter((p) => p.delivered >= t).length;
      assert.equal(got[i]!.readBy, readBy);
      assert.equal(got[i]!.deliveredTo, deliveredTo);
      assert.equal(got[i]!.tick, readBy === m ? "read" : deliveredTo === m ? "delivered" : "sent");
    });
  }
});

await check("receipts: times only move forward; customers get the team view without names", () => {
  const conv = {
    members: [
      { user: { _id: "me" }, lastRead: "2026-01-01T00:00:05Z" },
      { user: { _id: "a" }, lastRead: "2026-01-01T00:00:10Z", lastDelivered: "2026-01-01T00:00:20Z" },
      { user: { _id: "b" }, lastRead: null }
    ]
  };
  let st = receiptStateFrom(conv, "me", false);
  assert.deepEqual(Object.keys(st.byUser).sort(), ["a", "b"]); // never me
  const before = st;
  st = applyReceipt(st, { userId: "a", lastRead: "2026-01-01T00:00:01Z" }); // older: ignored
  assert.equal(st, before);
  st = applyReceipt(st, { userId: "b", lastRead: "2026-01-01T00:00:30Z" });
  assert.equal(st.byUser.b.delivered, st.byUser.b.read); // read implies delivered
  assert.equal(applyReceipt(st, { userId: "stranger", lastRead: "2026-01-01T01:00:00Z" }), st);
  const t = Date.parse("2026-01-01T00:00:15Z");
  assert.deepEqual(whoSaw(st, t), { read: ["b"], delivered: ["a"] });

  const cust = receiptStateFrom({ members: [], teamLastRead: "2026-01-01T00:00:10Z" }, "me", true);
  assert.ok(cust.team && Object.keys(cust.byUser).length === 0);
  const [early, late] = ticksForPage([Date.parse("2026-01-01T00:00:09Z"), t], [true, true], cust);
  assert.equal(early!.tick, "read");
  assert.equal(late!.tick, "sent");
  assert.equal(applyReceipt(cust, { userId: "a", lastRead: "2026-01-01T02:00:00Z" }), cust); // per-person events don't apply
  assert.equal(applyReceipt(cust, { teamLastRead: "2026-01-01T02:00:00Z" }).team!.read, Date.parse("2026-01-01T02:00:00Z"));
});

// ── Search (P3) ─────────────────────────────────────────────────────────────
await check("ChatSearch: incremental sync gives the same results as a fresh index after random edits", () => {
  const words = ["kitchen", "quote", "tiles", "marble", "design", "approved", "site", "visit", "budget", "wardrobe"];
  const sentence = () => Array.from({ length: 3 + randInt(5) }, () => words[randInt(words.length)]).join(" ");
  let list = mergeMessages([], Array.from({ length: 400 }, (_, i) => msg(i * 10, { decryptedContent: sentence() })));
  const live = new ChatSearch();
  const textOf = (m: Message) => m.decryptedContent || "";
  live.sync(list, textOf);
  for (let round = 0; round < 30; round++) {
    // edit, delete, remove and add some messages
    for (let k = 0; k < 10; k++) {
      const i = randInt(list.length);
      const op = randInt(4);
      if (op === 0) list = updateById(list, list[i]._id, (m) => ({ ...m, decryptedContent: sentence() }));
      else if (op === 1) list = updateById(list, list[i]._id, (m) => ({ ...m, isDeleted: true }));
      else if (op === 2) list = updateById(list, list[i]._id, () => null);
      else list = insertMessage(list, msg(5000 + round * 100 + k, { decryptedContent: sentence() }));
    }
    live.sync(list, textOf);
    const fresh = new ChatSearch();
    fresh.sync(list, textOf);
    for (const q of ["kit", "quote tiles", "mar", "approved site", "zzz"]) {
      assert.deepEqual(live.search(q, {}, list, "u1").map((m) => m._id), fresh.search(q, {}, list, "u1").map((m) => m._id), q);
    }
  }
});

await check("ChatSearch: newest first; filters for sender, files and mentions of me; empty query finds nothing", () => {
  const me = "me000000000000000000000a";
  const list = mergeMessages([], [
    msg(1, { decryptedContent: "marble quote", sender: { _id: "u1", name: "A" } as Message["sender"] }),
    msg(2, { decryptedContent: "marble sample", sender: { _id: "u2", name: "B" } as Message["sender"], attachments: [{ originalName: "sample.pdf" } as Message["attachments"][number]] }),
    msg(3, { decryptedContent: "marble for you", sender: { _id: "u1", name: "A" } as Message["sender"], mentions: [me] }),
    msg(4, { decryptedContent: "marble", sender: { _id: "u1", name: "A" } as Message["sender"], localStatus: "sending" })
  ]);
  const s = new ChatSearch();
  s.sync(list, (m) => m.decryptedContent || "");
  assert.deepEqual(s.search("marble", {}, list, me).map((m) => m.decryptedContent), ["marble for you", "marble sample", "marble quote"]);
  assert.equal(s.search("marble", { from: "u2" }, list, me).length, 1);
  assert.equal(s.search("", { hasFile: true }, list, me)[0].decryptedContent, "marble sample");
  assert.equal(s.search("", { mentionsMe: true }, list, me)[0].decryptedContent, "marble for you");
  assert.deepEqual(s.search("", {}, list, me), []);
  assert.equal(s.size, 3); // unsent messages aren't indexed
});

// ── Formatting and files (P4) ───────────────────────────────────────────────
await check("format: inline spans; snake_case, file~1 and lone markers stay as typed; never HTML", () => {
  const kinds = (s: string) => parseInline(s).map((x) => `${x.kind}:${x.text}`);
  assert.deepEqual(kinds("**Final** quote is _ready_, ~old~ `v2`"), ["bold:Final", "text: quote is ", "italic:ready", "text:, ", "strike:old", "text: ", "code:v2"]);
  assert.deepEqual(kinds("my_file_name and file~1~2 cost 2*3*4"), ["text:my_file_name and file~1~2 cost 2*3*4"]);
  assert.deepEqual(kinds("**unclosed and _half"), ["text:**unclosed and _half"]);
  assert.deepEqual(kinds("`<script>alert(1)</script>`"), ["code:<script>alert(1)</script>"]);
  assert.deepEqual(kinds(`**hi <@${oid(1)}>**`), [`bold:hi <@${oid(1)}>`]); // mentions survive inside bold
});

await check("format: blocks for code fences, quotes and lists; unclosed fence runs to the end", () => {
  const blocks = parseFormatting("Here:\n```\nconst a = 1;\n**not bold**\n```\n> quoted line\n> second\n- one\n* two\nafter");
  assert.deepEqual(blocks.map((b) => b.kind), ["para", "code", "quote", "list", "para"]);
  assert.equal((blocks[1] as { text: string }).text, "const a = 1;\n**not bold**");
  assert.equal((blocks[2] as { lines: unknown[] }).lines.length, 2);
  assert.equal((blocks[3] as { items: unknown[] }).items.length, 2);
  assert.deepEqual(parseFormatting("```\nopen").map((b) => b.kind), ["code"]);
  assert.equal(hasFormatting("plain text, nothing special"), false);
  assert.equal(hasFormatting("- a list"), true);
});

await check("files: kinds from type and name; sizes and durations read well", () => {
  assert.equal(kindOf("image/png", "a.png"), "image");
  assert.equal(kindOf("audio/webm", "Voice note.webm"), "audio");
  assert.equal(kindOf("application/pdf", "Quote.PDF"), "pdf");
  assert.equal(kindOf("", "sheet.xlsx"), "xls");
  assert.equal(kindOf("application/zip", "x.zip"), "other");
  assert.equal(formatSize(1536), "1.5 KB");
  assert.equal(formatDuration(75), "1:15");
});

await check("files: downloads are saved with their declared type's extension, never a disguised one", () => {
  assert.equal(safeDownloadName({ originalName: "Quote.pdf", mimeType: "application/pdf" }), "Quote.pdf");
  assert.equal(safeDownloadName({ originalName: "Quote.pdf.exe", mimeType: "application/pdf" }), "Quote.pdf.pdf");
  assert.equal(safeDownloadName({ originalName: "Quote‮fdp.exe", mimeType: "application/pdf" }), "Quotefdp.pdf");
  assert.equal(safeDownloadName({ originalName: "../../etc/passwd", mimeType: "image/png" }), "etcpasswd.png");
  assert.equal(safeDownloadName({ originalName: "x", mimeType: "application/x-unknown" }), "x.bin");
});

// ── Message menu placement ──────────────────────────────────────────────────
await check("menu: below the bubble by default, above near the bottom, aligned to the bubble's edge, always on screen", () => {
  const vp = { width: 1200, height: 800 };
  const h = menuHeight(8, true);
  assert.equal(h, 48 + 8 * 36 + 16);
  // Middle of the screen, someone else's message: below, left edges aligned
  const mid = placeMenu({ top: 300, bottom: 360, left: 400, right: 640 }, false, h, vp);
  assert.deepEqual(mid, { top: 366, left: 400, above: false });
  // My message near the bottom: above, right edges aligned
  const low = placeMenu({ top: 650, bottom: 700, left: 800, right: 1100 }, true, h, vp);
  assert.equal(low.above, true);
  assert.equal(low.left, 1100 - MENU_WIDTH);
  assert.ok(low.top + h <= 650);
  // Bubble at the far right edge: kept inside the window
  const edge = placeMenu({ top: 100, bottom: 140, left: 1150, right: 1195 }, false, h, vp);
  assert.ok(edge.left + MENU_WIDTH <= vp.width - 8);
  // Tiny window: never off the top
  const tiny = placeMenu({ top: 50, bottom: 90, left: 10, right: 100 }, false, h, { width: 400, height: 300 });
  assert.ok(tiny.top >= 8);
});

await check("menu: the emoji picker (inside the menu) stays fully on screen, even for a message at the very top", () => {
  const vp = { width: 1200, height: 800 };
  for (const anchor of [
    { top: 70, bottom: 110, left: 1000, right: 1190 }, // under the top bar, right edge (the reported case)
    { top: 740, bottom: 790, left: 20, right: 200 }, // bottom left
    { top: 380, bottom: 420, left: 600, right: 700 } // middle
  ]) {
    const p = placeMenu(anchor, true, PICKER_HEIGHT, vp, PICKER_WIDTH);
    assert.ok(p.top >= 8 && p.top + PICKER_HEIGHT <= vp.height - 8, `vertical ${JSON.stringify(anchor)}`);
    assert.ok(p.left >= 8 && p.left + PICKER_WIDTH <= vp.width - 8, `horizontal ${JSON.stringify(anchor)}`);
  }
});

console.log(`\n${passed} checks passed`);
