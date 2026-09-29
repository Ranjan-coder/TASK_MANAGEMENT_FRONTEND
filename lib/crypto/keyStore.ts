/**
 * lib/crypto/keyStore.ts
 *
 * Local (this browser) copy of the user's chat keys, in IndexedDB:
 *   keyring:<userId>  → every private key version (non-extractable CryptoKeys)
 *   wrapkey:<userId>  → the password-derived wrapKey (non-extractable), used to
 *                       update the encrypted key bundle when a key is added
 *
 *   bundlecache:<userId> → last encrypted bundle seen here (lets this device
 *                       restore older keys after a password reset elsewhere)
 *   meta:<userId>     → small flags (e.g. whether a recovery key is set up)
 *
 * The authoritative copy is the encrypted bundle on the server (keyBundle.ts);
 * this is a cache so chats open without re-entering the password. It is wiped
 * on logout.
 *
 * On devices the user doesn't trust (shared/office computers) nothing is
 * written to IndexedDB: keys live in memory for the open tab only.
 *
 * Also keeps an in-memory cache of derived session/group keys.
 */

const DB_NAME = "chat_keys";
const DB_VERSION = 1;
const STORE_NAME = "private_keys";

export interface LocalKey {
  version: number;
  privateKey: CryptoKey;
  publicKeyB64: string;
}

// ── Trusted vs memory-only storage ────────────────────────────────────────────

// Session cookie (no expiry): shared across tabs, gone when the browser closes
const MEMORY_ONLY_COOKIE = "bonito_keys_memory_only";
const memoryStore = new Map<string, unknown>();

const isMemoryOnly = (): boolean => {
  try {
    return document.cookie.split("; ").some((c) => c === `${MEMORY_ONLY_COOKIE}=1`);
  } catch {
    return false;
  }
};

/** Called at sign-in with the user's "trust this device" choice. */
export const setKeyStorageTrusted = (trusted: boolean): void => {
  try {
    document.cookie = trusted
      ? `${MEMORY_ONLY_COOKIE}=; path=/; max-age=0; samesite=strict`
      : `${MEMORY_ONLY_COOKIE}=1; path=/; samesite=strict`;
  } catch {
    /* no document (SSR) */
  }
  if (!trusted) memoryStore.clear();
};

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idbPut = async (key: string, value: unknown): Promise<void> => {
  if (isMemoryOnly()) {
    memoryStore.set(key, value);
    return;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const idbGet = async <T = unknown>(key: string): Promise<T | null> => {
  if (isMemoryOnly()) return (memoryStore.get(key) as T) ?? null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
};

const idbDelete = async (key: string): Promise<void> => {
  if (isMemoryOnly()) {
    memoryStore.delete(key);
    return;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Deletes every entry except pre-bundle keys ("privkey:"/"pubkey:") that have
 * not been migrated yet — they exist nowhere else, and establishChatKeys()
 * moves them into the encrypted bundle (then deletes them) at the next sign-in.
 */
const idbClearExceptUnmigrated = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = String(cursor.key);
      if (!key.startsWith("privkey:") && !key.startsWith("pubkey:")) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ── Keyring ───────────────────────────────────────────────────────────────────

export const saveKeyring = async (userId: string, keys: LocalKey[]): Promise<void> => {
  await idbPut(`keyring:${userId}`, keys);
};

export const loadKeyring = async (userId: string): Promise<LocalKey[] | null> => {
  const keys = await idbGet<LocalKey[]>(`keyring:${userId}`);
  return keys && keys.length > 0 ? keys : null;
};

export const saveWrapKey = async (userId: string, wrapKey: CryptoKey): Promise<void> => {
  await idbPut(`wrapkey:${userId}`, wrapKey);
};

export const loadWrapKey = async (userId: string): Promise<CryptoKey | null> =>
  idbGet<CryptoKey>(`wrapkey:${userId}`);

export interface SealedBundle {
  ciphertext: string;
  iv: string;
}

export const saveBundleCache = async (userId: string, bundle: SealedBundle): Promise<void> => {
  await idbPut(`bundlecache:${userId}`, bundle);
};

export const loadBundleCache = async (userId: string): Promise<SealedBundle | null> =>
  idbGet<SealedBundle>(`bundlecache:${userId}`);

export interface KeyMeta {
  hasRecoveryKey: boolean;
}

export const saveKeyMeta = async (userId: string, meta: KeyMeta): Promise<void> => {
  await idbPut(`meta:${userId}`, meta);
};

export const loadKeyMeta = async (userId: string): Promise<KeyMeta | null> => idbGet<KeyMeta>(`meta:${userId}`);

/** Newest key version, used for everything new (sending, wrapping). */
export const latestKey = (keys: LocalKey[]): LocalKey =>
  keys.reduce((a, b) => (b.version > a.version ? b : a));

// ── Pre-bundle (legacy) single key, read once to migrate into the bundle ─────

export const loadLegacyPrivateKey = async (userId: string): Promise<CryptoKey | null> =>
  idbGet<CryptoKey>(`privkey:${userId}`);

export const deleteLegacyKeys = async (userId: string): Promise<void> => {
  await idbDelete(`privkey:${userId}`);
  await idbDelete(`pubkey:${userId}`);
};

/** Removes the chat keys from this browser (logout, "sign out this device"). */
export const wipeLocalKeys = async (): Promise<void> => {
  sessionKeyCache.clear();
  memoryStore.clear();
  try {
    await idbClearExceptUnmigrated();
  } catch {
    // IndexedDB unavailable (private mode) — nothing persisted anyway
  }
};

/** Thrown when chat keys are not available on this device yet. */
export class ChatKeysLockedError extends Error {
  constructor() {
    super("Chat keys are locked on this device");
    this.name = "ChatKeysLockedError";
  }
}

export const requireKeyring = async (userId: string): Promise<LocalKey[]> => {
  const keys = await loadKeyring(userId);
  if (!keys) throw new ChatKeysLockedError();
  return keys;
};

// ── Session key cache (in-memory) ─────────────────────────────────────────────

/**
 * Derived keys cached for this page session, so ECDH/unwrap runs once per key:
 *   dm:<otherUserId>:<myVersion>:<theirVersion>
 *   group:<conversationId>:<keyVersion>
 */
const sessionKeyCache = new Map<string, CryptoKey>();

export const getCachedSessionKey = (cacheKey: string): CryptoKey | undefined => sessionKeyCache.get(cacheKey);

export const setCachedSessionKey = (cacheKey: string, key: CryptoKey): void => {
  sessionKeyCache.set(cacheKey, key);
};

export const clearSessionKeyCache = (): void => {
  sessionKeyCache.clear();
};
