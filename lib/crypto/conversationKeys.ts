/**
 * lib/crypto/conversationKeys.ts
 *
 * Resolves the right key for every message in a conversation.
 *
 *  DMs:    key = ECDH(my private key vN, their public key vM). New messages
 *          carry keyRef { s, r } (sender/recipient key versions), so they stay
 *          readable after either person changes keys.
 *  Groups: key = group AES key version g, unwrapped from the versioned keyring.
 *          New messages carry keyRef { g }. The legacy `groupKeys` map is v0.
 *
 * Messages without keyRef (sent before versioning) are tried against every
 * key this user has, so existing history keeps working.
 */

import type { Conversation, KeyRef, Message, WrappedKeyInput } from "@/types/chat";
import { deriveSessionKey, unwrapGroupKey, wrapGroupKey, generateGroupKey, decryptMessage, encryptMessage } from "./e2e";
import { sealText, openText } from "./franking";
import {
  requireKeyring,
  latestKey,
  getCachedSessionKey,
  setCachedSessionKey,
  type LocalKey
} from "./keyStore";
import { fetchPublicKey, shareGroupKeys, rotateGroupKey, type GroupKeyShareEntry } from "@/lib/api/chat.api";

// ── Public key lookup (per user + version) ────────────────────────────────────

const publicKeyCache = new Map<string, Promise<string | null>>();

function publicKeyAt(userId: string, version: number, hint?: { publicKey?: string; keyVersion?: number }) {
  if (hint?.publicKey && hint.keyVersion === version) return Promise.resolve(hint.publicKey);
  const cacheKey = `${userId}:${version}`;
  let pending = publicKeyCache.get(cacheKey);
  if (!pending) {
    pending = fetchPublicKey(userId, version)
      .then((r) => r?.publicKey ?? null)
      .catch(() => {
        publicKeyCache.delete(cacheKey); // allow a retry later
        return null;
      });
    publicKeyCache.set(cacheKey, pending);
  }
  return pending;
}

// Derivations in progress, by cache key. Opening a chat decrypts ~30 messages at once;
// without this each one missed the cache and ran its own identical ECDH/unwrap.
const inflightKeys = new Map<string, Promise<CryptoKey | null>>();
function deriveOnce(cacheKey: string, derive: () => Promise<CryptoKey | null>): Promise<CryptoKey | null> {
  const cached = getCachedSessionKey(cacheKey);
  if (cached) return Promise.resolve(cached);
  let pending = inflightKeys.get(cacheKey);
  if (!pending) {
    pending = derive()
      .then((key) => {
        if (key) setCachedSessionKey(cacheKey, key);
        return key;
      })
      .finally(() => inflightKeys.delete(cacheKey));
    inflightKeys.set(cacheKey, pending);
  }
  return pending;
}

async function sharedKey(cacheKey: string, myKey: LocalKey, theirPublicKey: string): Promise<CryptoKey> {
  const key = await deriveOnce(cacheKey, () => deriveSessionKey(myKey.privateKey, theirPublicKey));
  return key as CryptoKey;
}

const canDecrypt = async (msg: Pick<Message, "ciphertext" | "iv">, key: CryptoKey) => {
  if (!msg.ciphertext || !msg.iv) return true; // nothing to test against
  try {
    await decryptMessage(msg.ciphertext, msg.iv, key);
    return true;
  } catch {
    return false;
  }
};

// ── Conversation crypto ───────────────────────────────────────────────────────

export interface SendKey {
  key: CryptoKey;
  keyRef: KeyRef;
}

/** Abuse-check result sent in the clear with a "Send anyway" message (counts only). */
export interface ModerationFlag {
  flagged: true;
  severity: "mild" | "abusive" | "threat";
  hitCount: number;
}

export interface EncryptedText {
  ciphertext: string;
  iv: string;
  keyRef: KeyRef;
  franking: { commitment: string };
  frankingKey: string;
  moderation?: ModerationFlag;
}

/** Thrown when the sender cancels an edit at the "Send anyway?" prompt. */
export class EditCancelledError extends Error {
  constructor() {
    super("Edit cancelled");
    this.name = "EditCancelledError";
  }
}

/** Franked encryption of a text message with a given send key. */
export async function encryptTextWith(send: SendKey, text: string): Promise<EncryptedText> {
  const sealed = await sealText(text);
  const { ciphertext, iv } = await encryptMessage(sealed.plaintext, send.key);
  return { ciphertext, iv, keyRef: send.keyRef, franking: { commitment: sealed.commitment }, frankingKey: sealed.frankingKey };
}

/** Decrypts text content with a known key (e.g. an edit event) and checks its franking. */
export async function decryptTextWith(key: CryptoKey, ciphertext: string, iv: string, commitment?: string | null) {
  return openText(await decryptMessage(ciphertext, iv, key), commitment);
}

export class ConversationCrypto {
  private constructor(
    readonly conversation: Conversation,
    private readonly me: string,
    private readonly keys: LocalKey[]
  ) {}

  static async create(conversation: Conversation, myUserId: string): Promise<ConversationCrypto> {
    const keys = await requireKeyring(myUserId); // throws ChatKeysLockedError if locked
    return new ConversationCrypto(conversation, myUserId, keys);
  }

  private get isGroup() {
    return this.conversation.type === "group";
  }

  private member(userId: string) {
    return this.conversation.members.find((m) => m.user._id === userId);
  }

  private myKey(version: number) {
    return this.keys.find((k) => k.version === version);
  }

  private otherMember() {
    return this.conversation.members.find((m) => m.user._id !== this.me);
  }

  // ── DM ──
  private currentPeer: Promise<{ publicKey: string; keyVersion: number } | null> | null = null;

  private peerCurrentKey() {
    if (!this.currentPeer) {
      const other = this.otherMember();
      this.currentPeer = other
        ? fetchPublicKey(other.user._id)
            .then((r) => ({ publicKey: r.publicKey, keyVersion: r.keyVersion }))
            .catch(() =>
              other.user.publicKey
                ? { publicKey: other.user.publicKey, keyVersion: other.user.keyVersion ?? 0 }
                : null
            )
        : Promise.resolve(null);
    }
    return this.currentPeer;
  }

  private async dmKey(myVersion: number, theirVersion: number): Promise<CryptoKey | null> {
    const other = this.otherMember();
    const mine = this.myKey(myVersion);
    if (!other || !mine) return null;
    const theirPub = await publicKeyAt(other.user._id, theirVersion, other.user);
    if (!theirPub) return null;
    return sharedKey(`dm:${other.user._id}:${myVersion}:${theirVersion}`, mine, theirPub);
  }

  // ── Group ──
  private groupKey(version: number): Promise<CryptoKey | null> {
    return deriveOnce(`group:${this.conversation._id}:${version}`, () => this.unwrapGroupKeyVersion(version));
  }

  private async unwrapGroupKeyVersion(version: number): Promise<CryptoKey | null> {
    let key: CryptoKey | null = null;
    if (version === 0) {
      key = await this.legacyGroupKey();
    } else {
      const ring = this.conversation.groupKeyring?.find((r) => r.version === version);
      const entry = ring?.keys?.[this.me];
      // Only accept a key wrapped by whoever created that key version or a group admin:
      // an ordinary member can't slip us a key of their own choosing
      const wrapperTrusted =
        entry && (entry.wrappedBy === (ring as { createdBy?: string } | undefined)?.createdBy || this.member(entry.wrappedBy)?.role === "admin");
      if (entry && wrapperTrusted) {
        const wrapperPub = await publicKeyAt(entry.wrappedBy, entry.wrapperKeyVersion, this.member(entry.wrappedBy)?.user);
        const candidates = [this.myKey(entry.recipientKeyVersion), ...this.keys].filter(Boolean) as LocalKey[];
        if (wrapperPub) {
          for (const mine of candidates) {
            try {
              const session = await deriveSessionKey(mine.privateKey, wrapperPub);
              key = await unwrapGroupKey(entry.wrapped, session);
              break;
            } catch {
              /* try the next key */
            }
          }
        }
      }
    }

    return key;
  }

  /**
   * Version 0 (pre-versioning). It was usually wrapped by the creator, but a
   * member removal could have re-wrapped it by whoever removed someone — so
   * try every member's public key (AES-GCM rejects wrong ones).
   */
  private async legacyGroupKey(): Promise<CryptoKey | null> {
    const wrapped = this.conversation.groupKeys?.[this.me];
    if (!wrapped) return null;
    const wrappers = [
      this.member(this.conversation.createdBy),
      ...this.conversation.members
    ].filter((m, i, all) => m && all.findIndex((x) => x?.user._id === m.user._id) === i);

    for (const w of wrappers) {
      const pub = w?.user.publicKey;
      if (!pub) continue;
      for (const mine of this.keys) {
        try {
          return await unwrapGroupKey(wrapped, await deriveSessionKey(mine.privateKey, pub));
        } catch {
          /* next */
        }
      }
    }
    return null;
  }

  private groupVersionsDesc(): number[] {
    const versions = (this.conversation.groupKeyring ?? []).map((r) => r.version);
    if (this.conversation.groupKeys && Object.keys(this.conversation.groupKeys).length) versions.push(0);
    return versions.sort((a, b) => b - a);
  }

  // ── Public API ──

  /** Key + keyRef for new messages, or null if this user has no usable key yet. */
  async sendKey(): Promise<SendKey | null> {
    if (this.isGroup) {
      for (const v of this.groupVersionsDesc()) {
        const key = await this.groupKey(v);
        if (key) return { key, keyRef: { g: v } };
      }
      return null;
    }
    const peer = await this.peerCurrentKey();
    if (!peer) return null;
    const mine = latestKey(this.keys);
    const key = await this.dmKey(mine.version, peer.keyVersion);
    return key ? { key, keyRef: { s: mine.version, r: peer.keyVersion } } : null;
  }

  /** Encrypts a text message with franking (see franking.ts). */
  async encryptText(text: string): Promise<EncryptedText | null> {
    const send = await this.sendKey();
    if (!send) return null;
    return encryptTextWith(send, text);
  }

  /** Key that decrypts `msg` (its text and attachments), or null. */
  async keyForMessage(msg: Pick<Message, "keyRef" | "sender" | "ciphertext" | "iv">): Promise<CryptoKey | null> {
    if (this.isGroup) {
      if (msg.keyRef?.g !== undefined) return this.groupKey(msg.keyRef.g);
      return this.groupKey(0);
    }

    const other = this.otherMember();
    if (!other) return null;
    const senderId = typeof msg.sender === "string" ? msg.sender : msg.sender?._id;

    if (msg.keyRef?.s !== undefined && msg.keyRef?.r !== undefined) {
      const iSent = senderId === this.me;
      return this.dmKey(iSent ? msg.keyRef.s : msg.keyRef.r, iSent ? msg.keyRef.r : msg.keyRef.s);
    }

    // Pre-versioning DM: their current key with each of my keys, newest first
    const peer = await this.peerCurrentKey();
    if (!peer) return null;
    const mineDesc = [...this.keys].sort((a, b) => b.version - a.version);
    for (const mine of mineDesc) {
      const key = await sharedKey(`dm:${other.user._id}:${mine.version}:${peer.keyVersion}`, mine, peer.publicKey);
      if (await canDecrypt(msg, key)) return key;
    }
    return null;
  }

  /** Decrypts a message, attaching its plaintext and key (and franking details for reports). */
  async decrypt(msg: Message): Promise<Message> {
    if (msg.type === "system" || msg.isDeleted || !msg.ciphertext || !msg.iv) return msg;
    try {
      const key = await this.keyForMessage(msg);
      if (!key) return { ...msg, decryptedContent: "🔒 Waiting for the key to this message", decryptionFailed: true };
      const opened = await openText(await decryptMessage(msg.ciphertext, msg.iv, key), msg.franking?.commitment);
      return {
        ...msg,
        decryptedContent: opened.text,
        decryptionFailed: false,
        cryptoKey: key,
        frankingKey: opened.frankingKey,
        frankVerified: opened.verified
      };
    } catch {
      return { ...msg, decryptedContent: "🔒 Unable to decrypt", decryptionFailed: true };
    }
  }

  /**
   * Shares every group key version this user holds with members who lack it,
   * or whose copy was made for an older key of theirs (new device, password
   * reset). Safe to call often: it only sends what's missing.
   */
  async healGroupKeys(): Promise<number> {
    // Only group admins share keys with other members (the server enforces this too)
    if (!this.isGroup || this.member(this.me)?.role !== "admin") return 0;
    const mine = latestKey(this.keys);
    const others = this.conversation.members.filter(
      (m) => m.user._id !== this.me && m.user.publicKey && typeof m.user.keyVersion === "number"
    );
    if (others.length === 0) return 0;

    const entries: GroupKeyShareEntry[] = [];
    for (const version of this.groupVersionsDesc()) {
      const groupKey = await this.groupKey(version);
      if (!groupKey) continue;
      const ring = this.conversation.groupKeyring?.find((r) => r.version === version);

      for (const m of others) {
        const uid = m.user._id;
        const existing = ring?.keys?.[uid];
        const existingTrusted =
          existing && (existing.wrappedBy === (ring as { createdBy?: string } | undefined)?.createdBy || this.member(existing.wrappedBy)?.role === "admin");
        const needs =
          version === 0
            ? !this.conversation.groupKeys?.[uid]
            : !existing || existing.recipientKeyVersion < (m.user.keyVersion as number) || !existingTrusted;
        if (!needs) continue;

        const session = await sharedKey(`dm:${uid}:${mine.version}:${m.user.keyVersion}`, mine, m.user.publicKey as string);
        entries.push({
          version,
          userId: uid,
          wrapped: await wrapGroupKey(groupKey, session),
          wrapperKeyVersion: mine.version,
          recipientKeyVersion: m.user.keyVersion as number
        });
      }
    }

    if (entries.length === 0) return 0;
    const { changed } = await shareGroupKeys(this.conversation._id, entries.slice(0, 2000));
    return changed;
  }
}

// ── Registry (so socket handlers can decrypt for open conversations) ─────────

const registry = new Map<string, ConversationCrypto>();

export const registerConversationCrypto = (c: ConversationCrypto) => registry.set(c.conversation._id, c);
export const getConversationCrypto = (conversationId: string) => registry.get(conversationId);
export const clearConversationCrypto = () => registry.clear();

// ── Group key creation / rotation ─────────────────────────────────────────────

interface KeyHolder {
  _id: string;
  publicKey?: string;
  keyVersion?: number;
}

async function wrapForMembers(groupKey: CryptoKey, myUserId: string, members: KeyHolder[], includeSelf = true) {
  const keys = await requireKeyring(myUserId);
  const mine = latestKey(keys);
  const out: Record<string, WrappedKeyInput> = {};
  if (includeSelf) {
    out[myUserId] = {
      wrapped: await wrapGroupKey(groupKey, await deriveSessionKey(mine.privateKey, mine.publicKeyB64)),
      wrapperKeyVersion: mine.version,
      recipientKeyVersion: mine.version
    };
  }
  const missing: string[] = [];
  for (const m of members) {
    if (m._id === myUserId) continue;
    let pub = m.publicKey;
    let version = m.keyVersion;
    if (!pub || typeof version !== "number") {
      try {
        const info = await fetchPublicKey(m._id);
        pub = info.publicKey;
        version = info.keyVersion;
      } catch {
        /* no key yet */
      }
    }
    if (!pub || typeof version !== "number") {
      missing.push(m._id); // they'll get it automatically once they set up chat
      continue;
    }
    out[m._id] = {
      wrapped: await wrapGroupKey(groupKey, await deriveSessionKey(mine.privateKey, pub)),
      wrapperKeyVersion: mine.version,
      recipientKeyVersion: version
    };
  }
  return { keys: out, missing };
}

/** Wrapped copies of a brand-new group key (version 1) for group creation. */
export async function createInitialGroupKeys(myUserId: string, members: KeyHolder[]) {
  return wrapForMembers(await generateGroupKey(), myUserId, members);
}

/**
 * First key for a project chat created by an admin who is NOT a member: wrapped
 * only for the team. The team's first staff member to open it replaces it.
 */
export async function createProjectGroupKeys(adminUserId: string, members: KeyHolder[]) {
  return wrapForMembers(await generateGroupKey(), adminUserId, members, false);
}

/** Adds the next key version for the remaining members (after a removal). */
export async function rotateConversationGroupKey(conversation: Conversation, myUserId: string, remaining: KeyHolder[]) {
  const latest = Math.max(0, ...(conversation.groupKeyring ?? []).map((r) => r.version));
  const { keys } = await wrapForMembers(await generateGroupKey(), myUserId, remaining);
  await rotateGroupKey(conversation._id, latest + 1, keys);
  return latest + 1;
}
