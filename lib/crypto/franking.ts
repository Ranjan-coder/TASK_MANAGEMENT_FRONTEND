/**
 * Message franking (plan §4.2). Each text message carries a random 32-byte
 * franking key *inside* its encrypted content, and the server stores
 * commitment = HMAC-SHA256(frankingKey, text). If someone reports a message,
 * their app reveals the text + key for just that message and the server can
 * prove it's genuine and unedited. Nothing else in the chat is revealed.
 *
 * Encrypted content format: MARK + base64(frankingKey) + ":" + text.
 * Messages without MARK are older, unfranked messages.
 */
import { bufToB64, b64ToBuf } from "./e2e";

const MARK = "\u0000bf1:";
const KEY_B64_LEN = 44;

const hmac = async (keyBytes: Uint8Array, text: string): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bufToB64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
};

/** Wraps text for encryption and returns the commitment to send alongside. */
export async function sealText(text: string): Promise<{ plaintext: string; commitment: string; frankingKey: string }> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const frankingKey = bufToB64(keyBytes.buffer as ArrayBuffer);
  return { plaintext: `${MARK}${frankingKey}:${text}`, commitment: await hmac(keyBytes, text), frankingKey };
}

export interface OpenedText {
  text: string;
  frankingKey?: string;
  /** The text matches the commitment the server stored (so it can be reported with proof). */
  verified: boolean;
}

/** Unwraps decrypted content and checks it against the stored commitment. */
export async function openText(plaintext: string, commitment?: string | null): Promise<OpenedText> {
  if (!plaintext.startsWith(MARK)) return { text: plaintext, verified: false };
  const rest = plaintext.slice(MARK.length);
  const frankingKey = rest.slice(0, KEY_B64_LEN);
  if (rest[KEY_B64_LEN] !== ":") return { text: plaintext, verified: false };
  const text = rest.slice(KEY_B64_LEN + 1);
  if (!commitment) return { text, frankingKey, verified: false };
  try {
    const expected = await hmac(b64ToBuf(frankingKey), text);
    return { text, frankingKey, verified: expected === commitment };
  } catch {
    return { text, verified: false };
  }
}
