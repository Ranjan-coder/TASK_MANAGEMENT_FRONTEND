/**
 * Checks for the chunked video upload (lib/upload/chunkedUpload.ts), with a
 * fake network in place of Cloudinary. No test runner needed:
 *
 *   node --experimental-transform-types --import ./scripts/ts-resolve.mjs scripts/upload-lib.check.ts
 */
import assert from "node:assert/strict";
import { UploadError, chunkRanges, makeXhrSend, uploadInChunks, type SendPiece, type VideoTicket } from "../lib/upload/chunkedUpload.ts";

let passed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const MB = 1024 * 1024;
const ticket: VideoTicket = {
  uploadUrl: "https://api.cloudinary.com/v1_1/demo/video/upload",
  fields: { public_id: "org_1/campaigns/1_a", timestamp: 1, signature: "sig", api_key: "k" },
  uploadId: "u1",
  chunkBytes: 6 * MB
};

/** Fake Cloudinary: reassembles pieces by Content-Range, can fail chosen attempts. */
const fakeCloud = (failures: Record<number, number> = {}) => {
  const calls: Array<{ range: string; id: string; size: number; fields: string[] }> = [];
  let attempt = 0;
  const send: SendPiece = async (_url, body, headers, onProgress) => {
    const n = attempt++;
    const piece = body.get("file") as Blob;
    calls.push({ range: headers["Content-Range"], id: headers["X-Unique-Upload-Id"], size: piece.size, fields: [...body.keys()] });
    if (n in failures) throw new UploadError("boom", failures[n]); // status 0 = connection dropped
    onProgress(piece.size / 2);
    onProgress(piece.size);
    const [, , end, total] = headers["Content-Range"].match(/bytes (\d+)-(\d+)\/(\d+)/)!.map(Number);
    return end + 1 === total ? { public_id: "org_1/campaigns/1_a", bytes: total } : { done: false };
  };
  return { send, calls };
};

await check("chunkRanges covers every byte once, all pieces full size but the last (vs brute force)", () => {
  for (const size of [0, 1, 5, 6, 7, 12, 13, 100]) {
    for (const chunk of [1, 3, 6]) {
      const r = chunkRanges(size, chunk);
      const seen = new Array(size).fill(0);
      r.forEach(([s, e]) => {
        for (let i = s; i <= e; i++) seen[i]++;
      });
      assert.ok(seen.every((c) => c === 1), `size ${size} chunk ${chunk}`);
      r.slice(0, -1).forEach(([s, e]) => assert.equal(e - s + 1, chunk));
      assert.equal(r.length, Math.ceil(size / chunk));
    }
  }
});

await check("a 28 MB video goes in 5 pieces with one upload id, contiguous ranges and the signed fields", async () => {
  const { send, calls } = fakeCloud();
  const pct: number[] = [];
  const out = await uploadInChunks(new Blob([new Uint8Array(28 * MB)]), ticket, { send, onProgress: (p) => pct.push(p) });
  assert.equal(out.public_id, "org_1/campaigns/1_a");
  assert.deepEqual(
    calls.map((c) => c.range),
    ["bytes 0-6291455/29360128", "bytes 6291456-12582911/29360128", "bytes 12582912-18874367/29360128", "bytes 18874368-25165823/29360128", "bytes 25165824-29360127/29360128"]
  );
  assert.ok(calls.every((c) => c.id === "u1" && ["public_id", "timestamp", "signature", "api_key", "file"].every((f) => c.fields.includes(f))));
  assert.ok(pct.every((p, i) => i === 0 || p >= pct[i - 1]), "progress never goes backwards");
  assert.equal(pct.at(-1), 100);
  assert.ok(pct.slice(0, -1).every((p) => p < 100), "100% only once Cloudinary has the last piece");
});

await check("a dropped connection or 5xx retries only that piece; a 4xx stops at once", async () => {
  const flaky = fakeCloud({ 1: 0, 2: 503 }); // 2nd piece fails twice, then works
  await uploadInChunks(new Blob([new Uint8Array(13 * MB)]), ticket, { send: flaky.send, backoffMs: 1 });
  assert.deepEqual(
    flaky.calls.map((c) => c.range.split("/")[0]),
    ["bytes 0-6291455", "bytes 6291456-12582911", "bytes 6291456-12582911", "bytes 6291456-12582911", "bytes 12582912-13631487"]
  );

  const refused = fakeCloud({ 0: 400 });
  await assert.rejects(uploadInChunks(new Blob([new Uint8Array(7 * MB)]), ticket, { send: refused.send, backoffMs: 1 }), /boom/);
  assert.equal(refused.calls.length, 1);

  const down = fakeCloud({ 0: 500, 1: 500, 2: 500, 3: 500 });
  await assert.rejects(uploadInChunks(new Blob([new Uint8Array(MB)]), ticket, { send: down.send, backoffMs: 1, retries: 3 }));
  assert.equal(down.calls.length, 4, "1 try + 3 retries");
});

await check("cancelling stops without retrying", async () => {
  const ctrl = new AbortController();
  let calls = 0;
  const send: SendPiece = async () => {
    calls++;
    ctrl.abort();
    throw new UploadError("Upload cancelled", -1);
  };
  await assert.rejects(uploadInChunks(new Blob([new Uint8Array(13 * MB)]), ticket, { send, signal: ctrl.signal, backoffMs: 1 }), /cancelled/);
  assert.equal(calls, 1);
});

await check("a failure says where to resume; resuming sends only the missing pieces, progress starting where it stopped", async () => {
  const file = new Blob([new Uint8Array(20 * MB)]); // 4 pieces
  const broken = fakeCloud({ 2: 400 }); // 3rd piece refused
  const err = await uploadInChunks(file, ticket, { send: broken.send, backoffMs: 1 }).catch((e) => e);
  assert.ok(err instanceof UploadError);
  assert.equal(err.resumeFrom, 2);

  const rest = fakeCloud();
  const pct: number[] = [];
  const out = await uploadInChunks(file, ticket, { send: rest.send, fromPiece: 2, onProgress: (p) => pct.push(p) });
  assert.equal(out.public_id, "org_1/campaigns/1_a");
  assert.deepEqual(rest.calls.map((c) => c.range.split("/")[0]), ["bytes 12582912-18874367", "bytes 18874368-20971519"]);
  assert.ok(pct[0] >= 60, `progress resumes near 60%, got ${pct[0]}`);
});

// ── The XHR watchdog, with a fake XMLHttpRequest and short timings ──────────
class FakeXhr {
  static script: (x: FakeXhr) => void = () => {};
  upload: any = {};
  status = 0;
  responseText = "";
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  aborted = false;
  open() {}
  setRequestHeader() {}
  send() {
    FakeXhr.script(this);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true });
  }
  reply(json: object) {
    this.status = 200;
    this.responseText = JSON.stringify(json);
    this.onload?.();
  }
}
(globalThis as any).XMLHttpRequest = FakeXhr;
const send = makeXhrSend({ stallMs: 120, replyMs: 300, tickMs: 20 });
const one = () => send("u", new FormData(), {}, () => {});

await check("watchdog: a slow piece that keeps moving is never cut off (the old fixed timeout was)", async () => {
  FakeXhr.script = (x) => {
    let n = 0;
    const t = setInterval(() => {
      x.progress(++n, 10); // a byte every 80 ms: slower than the stall limit overall, but always moving
      if (n === 10) {
        clearInterval(t);
        setTimeout(() => x.reply({ done: false }), 50);
      }
    }, 80);
  };
  assert.deepEqual(await one(), { done: false }); // ~850 ms in total, far above stallMs
});

await check("watchdog: no bytes moving → 'stalled' (retryable, status 0)", async () => {
  FakeXhr.script = (x) => x.progress(1, 10);
  const err = await one().catch((e) => e);
  assert.match(err.message, /stalled/);
  assert.equal(err.status, 0);
});

await check("watchdog: waiting for Cloudinary after the last byte is not a stall, but has its own limit", async () => {
  FakeXhr.script = (x) => {
    x.progress(10, 10);
    setTimeout(() => x.reply({ public_id: "p" }), 200); // longer than stallMs, shorter than replyMs
  };
  assert.deepEqual(await one(), { public_id: "p" });
  FakeXhr.script = (x) => x.progress(10, 10); // never answers
  assert.match((await one().catch((e) => e)).message, /didn't answer/);
});

await check("watchdog: the person's Cancel is not retried (status -1)", async () => {
  const ctrl = new AbortController();
  FakeXhr.script = () => setTimeout(() => ctrl.abort(), 10);
  const err = await send("u", new FormData(), {}, () => {}, ctrl.signal).catch((e) => e);
  assert.equal(err.status, -1);
});

console.log(`\n${passed} checks passed`);
