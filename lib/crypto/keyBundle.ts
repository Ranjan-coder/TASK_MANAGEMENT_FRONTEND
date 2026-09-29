/**
 * lib/crypto/keyBundle.ts
 *
 * The user's chat private keys (every version) live on the server as ONE
 * encrypted blob — the key bundle — sealed with the password-derived wrapKey
 * (passwordKeys.ts). Logging in on any device downloads and opens it, so chat
 * history is available everywhere while the server still can't read anything.
 *
 * Recovery key: optionally, the same keys are also sealed with a random
 * 256-bit recovery key the user writes down. A password reset can't open the
 * main bundle any more (new password), but the recovery key can. The recovery
 * key itself is stored inside the main bundle so any signed-in device can keep
 * the recovery copy up to date when keys are added.
 */

import {
  generateKeyPair,
  exportPrivateKeyPkcs8,
  importPrivateKeyPkcs8,
  exportPublicKeyFromPrivateKey,
  bufToB64,
  b64ToBuf
} from "./e2e";
import {
  type LocalKey,
  type SealedBundle,
  saveKeyring,
  saveWrapKey,
  loadWrapKey,
  loadLegacyPrivateKey,
  deleteLegacyKeys,
  saveBundleCache,
  loadBundleCache,
  saveKeyMeta,
  clearSessionKeyCache
} from "./keyStore";
import { deriveKeysFromPassword, type KdfParams } from "./passwordKeys";
import { fetchKeyBundle, putKeyBundle, publishPublicKey, fetchRecoveryBundle } from "@/lib/api/chat.api";
import apiClient from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";

interface BundleKey {
  version: number;
  privateKey: string; // PKCS#8 base64
  publicKey: string; // SPKI base64
  createdAt: string;
}

interface BundlePlain {
  format: 1;
  keys: BundleKey[];
  recoveryKey?: string; // base64 raw recovery key (main bundle only)
}

const toBuffer = (u8: Uint8Array): ArrayBuffer =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

export class WrongPasswordError extends Error {
  constructor() {
    super("That password doesn't match this account");
    this.name = "WrongPasswordError";
  }
}

export class InvalidRecoveryKeyError extends Error {
  constructor(message = "That recovery key isn't right. Check it and try again.") {
    super(message);
    this.name = "InvalidRecoveryKeyError";
  }
}

// ── Seal / open ───────────────────────────────────────────────────────────────

async function seal(plain: BundlePlain, key: CryptoKey): Promise<SealedBundle> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    key,
    new TextEncoder().encode(JSON.stringify(plain))
  );
  return { ciphertext: bufToB64(ct), iv: bufToB64(toBuffer(iv)) };
}

async function open(bundle: SealedBundle, key: CryptoKey, onFail: () => Error = () => new WrongPasswordError()): Promise<BundlePlain> {
  let buf: ArrayBuffer;
  try {
    buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBuffer(b64ToBuf(bundle.iv)) },
      key,
      toBuffer(b64ToBuf(bundle.ciphertext))
    );
  } catch {
    // AES-GCM authentication failed: wrong key (or a tampered bundle)
    throw onFail();
  }
  const plain = JSON.parse(new TextDecoder().decode(buf)) as BundlePlain;
  if (plain.format !== 1 || !Array.isArray(plain.keys)) throw new Error("Unsupported key bundle format");
  return plain;
}

async function toLocalKeys(keys: BundleKey[]): Promise<LocalKey[]> {
  return Promise.all(
    keys.map(async (k) => ({
      version: k.version,
      privateKey: await importPrivateKeyPkcs8(k.privateKey, false),
      publicKeyB64: k.publicKey
    }))
  );
}

/** Adds keys from `extra` that `keys` doesn't have (matched by public key). */
function mergeKeys(keys: BundleKey[], extra: BundleKey[]): boolean {
  let changed = false;
  for (const k of extra) {
    if (keys.some((x) => x.publicKey === k.publicKey)) continue;
    // Keep its number unless another key already uses it
    const version = keys.some((x) => x.version === k.version)
      ? Math.min(-1, ...keys.map((x) => x.version)) - 1
      : k.version;
    keys.push({ ...k, version });
    changed = true;
  }
  return changed;
}

// ── Recovery key encoding (Crockford base32, grouped, with checksum) ─────────

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  const clean = text
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new InvalidRecoveryKeyError();
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function checksum(raw: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", toBuffer(raw))).slice(0, 2);
}

async function formatRecoveryKey(raw: Uint8Array): Promise<string> {
  const withSum = new Uint8Array(34);
  withSum.set(raw, 0);
  withSum.set(await checksum(raw), 32);
  return base32Encode(withSum).match(/.{1,5}/g)!.join("-");
}

async function parseRecoveryKey(text: string): Promise<Uint8Array> {
  const bytes = base32Decode(text);
  if (bytes.length < 34) throw new InvalidRecoveryKeyError();
  const raw = bytes.slice(0, 32);
  const sum = await checksum(raw);
  if (sum[0] !== bytes[32] || sum[1] !== bytes[33]) throw new InvalidRecoveryKeyError();
  return raw;
}

async function recoveryWrapKey(raw: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", toBuffer(raw), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("bonito-recovery-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── Save (main bundle + recovery copy kept in step) ───────────────────────────

async function saveBundle(userId: string, plain: BundlePlain, wrapKey: CryptoKey, expectedVersion: number) {
  const main = await seal(plain, wrapKey);
  const recovery = plain.recoveryKey
    ? await seal({ format: 1, keys: plain.keys }, await recoveryWrapKey(b64ToBuf(plain.recoveryKey)))
    : undefined;
  await putKeyBundle({ ...main, expectedVersion, ...(recovery ? { recovery } : {}) });
  await saveBundleCache(userId, main);
  return main;
}

async function cacheLocally(userId: string, plain: BundlePlain, wrapKey: CryptoKey, sealed?: SealedBundle) {
  await saveKeyring(userId, await toLocalKeys(plain.keys));
  await saveWrapKey(userId, wrapKey);
  if (sealed) await saveBundleCache(userId, sealed);
  await saveKeyMeta(userId, { hasRecoveryKey: Boolean(plain.recoveryKey) });
  clearSessionKeyCache();
}

const newest = (keys: BundleKey[]) => keys.reduce((a, b) => (b.version > a.version ? b : a));

function updateAuthStoreKey(userId: string, key: BundleKey) {
  const state = useAuthStore.getState();
  if (state.user && state.user._id === userId) {
    state.setUser({ ...state.user, publicKey: key.publicKey, keyVersion: key.version });
  }
}

// ── Establish keys after sign-in ──────────────────────────────────────────────

/**
 * Called right after sign-in / sign-up, while the wrapKey (derived from the
 * password just typed) is in memory. Opens the bundle; merges keys this device
 * still has from before a password reset or from pre-bundle storage; creates
 * the first key if there are none — then caches everything locally.
 */
export async function establishChatKeys(userId: string, wrapKey: CryptoKey): Promise<void> {
  const user = useAuthStore.getState().user;
  // An admin set this password; keys are created after the user picks their own
  if (user?._id === userId && user.mustChangePassword) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    const server = await fetchKeyBundle();
    const plain: BundlePlain = server.bundle ? await open(server.bundle, wrapKey) : { format: 1, keys: [] };
    let changed = false;

    // 1. Keys this device cached before (e.g. the password was reset elsewhere):
    //    the old bundle copy opens with the old wrapKey still stored here.
    const cachedBundle = await loadBundleCache(userId);
    const cachedWrapKey = await loadWrapKey(userId);
    if (cachedBundle && cachedWrapKey && cachedBundle.ciphertext !== server.bundle?.ciphertext) {
      try {
        const old = await open(cachedBundle, cachedWrapKey);
        if (mergeKeys(plain.keys, old.keys)) changed = true;
        if (!plain.recoveryKey && old.recoveryKey) {
          plain.recoveryKey = old.recoveryKey;
          changed = true;
        }
      } catch {
        /* stale cache from another account/password — ignore */
      }
    }

    // 2. The single key kept in this browser before bundles existed
    const legacy = await loadLegacyPrivateKey(userId);
    if (legacy) {
      try {
        const publicKey = await exportPublicKeyFromPrivateKey(legacy);
        if (!plain.keys.some((k) => k.publicKey === publicKey)) {
          let version: number;
          if (server.publicKey === publicKey) version = server.keyVersion;
          else if (!server.publicKey) version = (await publishPublicKey(publicKey)).keyVersion;
          else version = Math.min(0, ...plain.keys.map((k) => k.version)) - 1; // old key: read-only
          plain.keys.push({ version, privateKey: await exportPrivateKeyPkcs8(legacy), publicKey, createdAt: new Date().toISOString() });
          changed = true;
        }
      } catch (err) {
        console.warn("Could not migrate this browser's previous chat key:", err);
      }
    }

    // 3. First key for this account
    if (plain.keys.length === 0) {
      const pair = await generateKeyPair();
      const { keyVersion } = await publishPublicKey(pair.publicKeyB64);
      plain.keys.push({
        version: keyVersion,
        privateKey: await exportPrivateKeyPkcs8(pair.privateKey),
        publicKey: pair.publicKeyB64,
        createdAt: new Date().toISOString()
      });
      changed = true;
    }

    // 4. The newest key must be the one others encrypt to
    let current = newest(plain.keys);
    if (server.publicKey !== current.publicKey) {
      const { keyVersion } = await publishPublicKey(current.publicKey);
      if (keyVersion !== current.version) {
        // Same key under its new published number; the old number stays too
        current = { ...current, version: keyVersion };
        plain.keys.push(current);
        changed = true;
      }
    }

    let sealed: SealedBundle | undefined = server.bundle ?? undefined;
    if (changed) {
      try {
        sealed = await saveBundle(userId, plain, wrapKey, server.bundle?.version ?? 0);
      } catch (err: any) {
        if (err?.response?.status === 409 && attempt === 0) continue; // another device updated it — merge again
        throw err;
      }
    }

    await cacheLocally(userId, plain, wrapKey, sealed);
    if (legacy) await deleteLegacyKeys(userId);
    updateAuthStoreKey(userId, current);
    return;
  }
}

// ── Unlock on a device that has a session but no local keys ──────────────────

async function fetchOwnKdf(): Promise<{ kdf: KdfParams | null; legacy: boolean }> {
  const res = await apiClient.get("/auth/kdf");
  return res.data.data;
}

/**
 * Re-opens chat keys with the password (e.g. browser storage was cleared, or
 * this is an untrusted device and the tab was reloaded).
 * Throws WrongPasswordError if the password doesn't open the bundle.
 * Returns "sign-in-again" for accounts that still need the one-time upgrade.
 */
export async function unlockChatKeys(userId: string, password: string): Promise<"ok" | "sign-in-again"> {
  const { kdf, legacy } = await fetchOwnKdf();
  if (legacy || !kdf) return "sign-in-again";
  const { wrapKey } = await deriveKeysFromPassword(password, kdf);

  // Verify the password against the bundle before touching anything
  const server = await fetchKeyBundle();
  if (server.bundle) await open(server.bundle, wrapKey);

  await establishChatKeys(userId, wrapKey);
  return "ok";
}

// ── New key version (replace a possibly exposed key) ──────────────────────────

/**
 * Creates a new key version and makes it the one others encrypt to. Older
 * versions stay in the bundle, so existing messages remain readable.
 */
export async function addNewKeyVersion(userId: string): Promise<{ version: number; publicKey: string }> {
  const wrapKey = await loadWrapKey(userId);
  if (!wrapKey) throw new Error("Unlock your chats on this device first.");

  const server = await fetchKeyBundle();
  const plain: BundlePlain = server.bundle ? await open(server.bundle, wrapKey) : { format: 1, keys: [] };
  const pair = await generateKeyPair();
  const { keyVersion } = await publishPublicKey(pair.publicKeyB64);
  const key: BundleKey = {
    version: keyVersion,
    privateKey: await exportPrivateKeyPkcs8(pair.privateKey),
    publicKey: pair.publicKeyB64,
    createdAt: new Date().toISOString()
  };
  plain.keys.push(key);

  const sealed = await saveBundle(userId, plain, wrapKey, server.bundle?.version ?? 0);
  await cacheLocally(userId, plain, wrapKey, sealed);
  updateAuthStoreKey(userId, key);
  return { version: keyVersion, publicKey: pair.publicKeyB64 };
}

// ── Recovery key ──────────────────────────────────────────────────────────────

/**
 * Creates (or replaces) the recovery key. Returns it formatted for the user to
 * save — it's shown once and can't be retrieved later.
 */
export async function createRecoveryKey(userId: string): Promise<string> {
  const wrapKey = await loadWrapKey(userId);
  if (!wrapKey) throw new Error("Unlock your chats on this device first.");
  const server = await fetchKeyBundle();
  if (!server.bundle) throw new Error("Open Chat once to set up your keys, then create a recovery key.");

  const plain = await open(server.bundle, wrapKey);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  plain.recoveryKey = bufToB64(toBuffer(raw));

  const sealed = await saveBundle(userId, plain, wrapKey, server.bundle.version);
  await cacheLocally(userId, plain, wrapKey, sealed);
  return formatRecoveryKey(raw);
}

/**
 * Restores older keys (e.g. after a password reset) from the recovery key and
 * merges them into the current bundle. Returns how many keys were restored.
 */
export async function restoreWithRecoveryKey(userId: string, code: string): Promise<number> {
  const raw = await parseRecoveryKey(code);
  const recovered = await open(await fetchRecoveryBundle(), await recoveryWrapKey(raw), () => new InvalidRecoveryKeyError());

  const wrapKey = await loadWrapKey(userId);
  if (!wrapKey) throw new Error("Unlock your chats on this device first.");
  const server = await fetchKeyBundle();
  const plain: BundlePlain = server.bundle ? await open(server.bundle, wrapKey) : { format: 1, keys: [] };

  const before = plain.keys.length;
  mergeKeys(plain.keys, recovered.keys);
  plain.recoveryKey = bufToB64(toBuffer(raw)); // the same recovery key keeps working

  const sealed = await saveBundle(userId, plain, wrapKey, server.bundle?.version ?? 0);
  await cacheLocally(userId, plain, wrapKey, sealed);
  return plain.keys.length - before;
}

// ── Password change ───────────────────────────────────────────────────────────

/**
 * Re-seals the existing bundle for a new password (the recovery key inside is
 * kept). Returns undefined when the account has no bundle yet.
 */
export async function resealBundleForNewPassword(
  oldWrapKey: CryptoKey,
  newWrapKey: CryptoKey
): Promise<SealedBundle | undefined> {
  const server = await fetchKeyBundle();
  if (!server.bundle) return undefined;
  return seal(await open(server.bundle, oldWrapKey), newWrapKey);
}

// exported for tests
export const _recoveryCodec = { formatRecoveryKey, parseRecoveryKey };
