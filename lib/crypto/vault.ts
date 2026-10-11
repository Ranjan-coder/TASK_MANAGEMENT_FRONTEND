/**
 * Planner encryption (planner-module-plan.md). Everything in the Planner is
 * encrypted here, in the browser, before it is sent; the server never sees text.
 *
 * - Vault key: one random AES-256 key per person, wrapped to their OWN chat key
 *   (ECDH with themselves). Stored on the server once per chat-key version, so any
 *   of their devices that has their chat keys can open it — including after a
 *   recovery-key restore. A new chat-key version just adds a wrap (done lazily
 *   here), so nothing ever needs re-encrypting.
 * - Meeting key: one random key per meeting, wrapped separately for each attendee
 *   (ECDH organiser ↔ attendee), the same scheme as group chat.
 */
import { requireKeyring, latestKey, type LocalKey } from "./keyStore";
import { deriveSessionKey, generateGroupKey, wrapGroupKey, unwrapGroupKey, encryptMessage, decryptMessage } from "./e2e";
import { fetchPublicKey } from "@/lib/api/chat.api";
import { plannerApi, type Enc, type WrappedFor, type MeetingRow } from "@/lib/api/planner.api";

export class VaultUnavailableError extends Error {
  constructor() {
    super("This device can't open your Planner yet. Unlock your keys first.");
    this.name = "VaultUnavailableError";
  }
}

const selfSession = (k: LocalKey) => deriveSessionKey(k.privateKey, k.publicKeyB64);

// In-memory caches for this page session (cleared on sign-out by reload)
let vault: { userId: string; key: CryptoKey } | null = null;
let vaultLoading: Promise<CryptoKey> | null = null;
const meetingKeys = new Map<string, CryptoKey>(); // `${meetingId}:${keyEpoch}`
const publicKeys = new Map<string, Promise<string>>(); // `${userId}:${version}`

const loadVault = async (userId: string, retry = true): Promise<CryptoKey> => {
  const keys = await requireKeyring(userId); // throws ChatKeysLockedError if locked on this device
  const newest = latestKey(keys);
  const byVersion = new Map(keys.map((k) => [k.version, k]));
  const { wraps } = await plannerApi.vault();

  let key: CryptoKey | null = null;
  for (const w of wraps || []) {
    const local = byVersion.get(w.keyVersion);
    if (local) {
      key = await unwrapGroupKey(w.wrapped, await selfSession(local));
      break;
    }
  }

  if (!key) {
    if (wraps?.length) throw new VaultUnavailableError();
    // First use: make the key and store it wrapped for the newest chat key
    key = await generateGroupKey();
    try {
      await plannerApi.addVaultWrap(newest.version, await wrapGroupKey(key, await selfSession(newest)));
    } catch (err) {
      // Another tab/device created it at the same moment: use theirs
      if (retry && (err as { response?: { status?: number } })?.response?.status === 409) return loadVault(userId, false);
      throw err;
    }
  } else if (!(wraps || []).some((w) => w.keyVersion === newest.version)) {
    // Chat keys were rotated since: add a wrap for the new version (best effort)
    plannerApi.addVaultWrap(newest.version, await wrapGroupKey(key, await selfSession(newest))).catch(() => {});
  }
  return key;
};

/** The person's planner key (made on first use). Throws ChatKeysLockedError when locked. */
export async function getVaultKey(userId: string): Promise<CryptoKey> {
  if (vault?.userId === userId) return vault.key;
  if (!vaultLoading) {
    vaultLoading = loadVault(userId)
      .then((key) => {
        vault = { userId, key };
        return key;
      })
      .finally(() => {
        vaultLoading = null;
      });
  }
  return vaultLoading;
}

export function forgetVault() {
  vault = null;
  meetingKeys.clear();
}

/** Encrypts any JSON-able value. */
export const seal = async (key: CryptoKey, value: unknown): Promise<Enc> => encryptMessage(JSON.stringify(value), key);

/** Decrypts what seal() produced. */
export const open = async <T,>(key: CryptoKey, enc: Enc): Promise<T> => JSON.parse(await decryptMessage(enc.ciphertext, enc.iv, key)) as T;

// ── Meeting keys ──────────────────────────────────────────────────────────────

const publicKeyOf = (userId: string, version?: number) => {
  const cacheKey = `${userId}:${version ?? "latest"}`;
  if (!publicKeys.has(cacheKey)) {
    publicKeys.set(
      cacheKey,
      fetchPublicKey(userId, version).then((p) => {
        if (!p.publicKey) throw new Error("That person hasn't set up encryption yet");
        // Remember the exact version for the latest lookup too
        if (version === undefined) publicKeys.set(`${userId}:${p.keyVersion}`, Promise.resolve(p.publicKey));
        return p.publicKey;
      })
    );
  }
  return publicKeys.get(cacheKey)!;
};

/**
 * A new meeting key, wrapped for every attendee (the organiser included).
 * Returns the key (to encrypt the details) and the per-person wraps (to send).
 */
export async function wrapMeetingKeyFor(organiserId: string, attendeeIds: string[], existingKey?: CryptoKey) {
  const keys = await requireKeyring(organiserId);
  const mine = latestKey(keys);
  const key = existingKey || (await generateGroupKey());
  const people = [organiserId, ...attendeeIds.filter((u) => u !== organiserId)];
  const wraps: WrappedFor[] = await Promise.all(
    people.map(async (user) => {
      if (user === organiserId) {
        return { user, wrapped: await wrapGroupKey(key, await selfSession(mine)), recipientKeyVersion: mine.version, senderKeyVersion: mine.version };
      }
      const info = await fetchPublicKey(user);
      if (!info.publicKey) throw new Error(`${info.name || "Someone"} hasn't set up encryption yet, so they can't be invited.`);
      publicKeys.set(`${user}:${info.keyVersion}`, Promise.resolve(info.publicKey));
      const session = await deriveSessionKey(mine.privateKey, info.publicKey);
      return { user, wrapped: await wrapGroupKey(key, session), recipientKeyVersion: info.keyVersion, senderKeyVersion: mine.version };
    })
  );
  return { key, wraps };
}

/** Opens a meeting's key with this person's own wrap. */
export async function meetingKeyOf(userId: string, m: MeetingRow): Promise<CryptoKey> {
  const cacheKey = `${m._id}:${m.keyEpoch}`;
  const hit = meetingKeys.get(cacheKey);
  if (hit) return hit;
  if (!m.myKey) throw new VaultUnavailableError();
  const keys = await requireKeyring(userId);
  const local = keys.find((k) => k.version === m.myKey!.recipientKeyVersion);
  if (!local) throw new VaultUnavailableError();
  // The organiser wrapped it with ECDH(organiser key vN, my key vM)
  const theirPublic = m.isOrganiser ? local.publicKeyB64 : await publicKeyOf(m.organiser._id, m.myKey.senderKeyVersion);
  const key = await unwrapGroupKey(m.myKey.wrapped, await deriveSessionKey(local.privateKey, theirPublic));
  meetingKeys.set(cacheKey, key);
  return key;
}
