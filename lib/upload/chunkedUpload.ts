/**
 * lib/upload/chunkedUpload.ts — sends one file to Cloudinary in fixed-size
 * pieces, using a ticket signed by our server (media.service.js).
 *
 * Why pieces: a 28 MB video in one request either all arrives or all fails;
 * a dropped connection at 90% meant starting again with no explanation. Here
 * each piece is its own request, so progress is real, and a failed piece is
 * retried on its own (with backoff) instead of the whole file.
 *
 * Pieces go one after another: Cloudinary assembles them by the shared
 * X-Unique-Upload-Id and each piece's Content-Range. Memory use is one piece
 * (Blob.slice does not copy the file).
 */

export interface VideoTicket {
  uploadUrl: string;
  /** Signed form fields sent with every piece (public_id, timestamp, signature…) */
  fields: Record<string, string | number>;
  uploadId: string;
  chunkBytes: number;
}

/** Inclusive byte ranges covering [0, size): all `chunk` long except the last. O(size / chunk). */
export const chunkRanges = (size: number, chunk: number): Array<[number, number]> => {
  if (size <= 0 || chunk <= 0) return [];
  const out: Array<[number, number]> = [];
  for (let start = 0; start < size; start += chunk) out.push([start, Math.min(start + chunk, size) - 1]);
  return out;
};

/** One piece over the network: resolves with the parsed JSON body, rejects with { status, message }. */
export type SendPiece = (
  url: string,
  body: FormData,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal
) => Promise<any>;

export class UploadError extends Error {
  /** First piece not yet stored: pass it back as `fromPiece` to resume */
  resumeFrom?: number;
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

/**
 * No fixed time limit per piece: on a slow link (measured ~30 KB/s to
 * Cloudinary from some Indian ISPs) a 6 MB piece needs 3+ minutes, and a
 * fixed 2-minute limit failed every one. A piece fails only if no bytes move
 * for STALL_MS, or if the reply takes longer than REPLY_MS once it is all sent.
 */
export const STALL_MS = 60 * 1000;
export const REPLY_MS = 3 * 60 * 1000;

/** XMLHttpRequest (fetch has no upload progress). No cookies: Cloudinary is another site. */
export const makeXhrSend = ({ stallMs = STALL_MS, replyMs = REPLY_MS, tickMs = 5000 } = {}): SendPiece => (url, body, headers, onProgress, signal) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastMove = Date.now();
    let sentAt = 0; // when the whole piece had gone (0 = still sending)
    let why = "";
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (!sentAt && now - lastMove > stallMs) why = "The connection stalled";
      else if (sentAt && now - sentAt > replyMs) why = "Cloudinary didn't answer in time";
      if (why) xhr.abort();
    }, tickMs);
    const settle = (fn: () => void) => {
      clearInterval(watchdog);
      fn();
    };
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      lastMove = Date.now();
      if (e.lengthComputable && e.loaded >= e.total && !sentAt) sentAt = lastMove;
      onProgress(e.loaded);
    };
    xhr.upload.onload = () => (sentAt ||= Date.now());
    xhr.onload = () =>
      settle(() => {
        let data: any = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* not JSON */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new UploadError(data?.error?.message || `Upload failed (${xhr.status})`, xhr.status));
      });
    xhr.onerror = () => settle(() => reject(new UploadError("Connection lost while uploading")));
    signal?.addEventListener("abort", () => xhr.abort());
    // Watchdog aborts are retried (status 0); the person's Cancel is not (-1)
    xhr.onabort = () => settle(() => reject(why ? new UploadError(why) : new UploadError("Upload cancelled", -1)));
    xhr.send(body);
  });

export const xhrSend = makeXhrSend();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Network trouble and server hiccups are worth another try; a refused file (4xx) is not. */
const retryable = (e: unknown) => {
  const s = (e as UploadError)?.status ?? 0;
  return s === 0 || s === 429 || s >= 500;
};

export interface ChunkOptions {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
  send?: SendPiece;
  /** Per piece. Slow links drop now and then: 5 retries ≈ 31 s of patience per piece */
  retries?: number;
  /** Base backoff; doubled per attempt (1 s, 2 s, 4 s, 8 s, 16 s) */
  backoffMs?: number;
  /** Resume: pieces before this one are already stored on Cloudinary (same ticket) */
  fromPiece?: number;
}

/**
 * Uploads `file`; resolves with Cloudinary's answer to the last piece (which
 * has public_id). On failure the error carries `resumeFrom`.
 */
export async function uploadInChunks(file: Blob, ticket: VideoTicket, opts: ChunkOptions = {}) {
  const { onProgress, signal, send = xhrSend, retries = 5, backoffMs = 1000, fromPiece = 0 } = opts;
  const total = file.size;
  const ranges = chunkRanges(total, ticket.chunkBytes);
  let done = ranges.slice(0, fromPiece).reduce((n, [s, e]) => n + e - s + 1, 0); // bytes already stored
  let last: any = null;
  for (let i = fromPiece; i < ranges.length; i++) {
    const [start, end] = ranges[i];
    for (let attempt = 0; ; attempt++) {
      const body = new FormData();
      for (const [k, v] of Object.entries(ticket.fields)) body.append(k, String(v));
      // The real name, so Cloudinary sees the extension (a nameless piece arrives as "blob")
      body.append("file", file.slice(start, end + 1), (file as File).name || "video.mp4");
      try {
        last = await send(
          ticket.uploadUrl,
          body,
          { "X-Unique-Upload-Id": ticket.uploadId, "Content-Range": `bytes ${start}-${end}/${total}` },
          (loaded) => onProgress?.(Math.min(99, Math.floor(((done + Math.min(loaded, end - start + 1)) / total) * 100))),
          signal
        );
        break;
      } catch (e) {
        if (signal?.aborted || attempt >= retries || !retryable(e)) {
          const err = e instanceof UploadError ? e : new UploadError(String((e as Error)?.message || e));
          err.resumeFrom = i;
          throw err;
        }
        await sleep(backoffMs * 2 ** attempt);
      }
    }
    done += end - start + 1;
  }
  // (Whether every piece made it is checked by the server's finish step, which
  // compares the stored size with the file's and deletes a partial upload.)
  if (!last?.public_id) throw new UploadError("The upload didn't complete. Please upload the video again.", 409);
  onProgress?.(100);
  return last as { public_id: string };
}
