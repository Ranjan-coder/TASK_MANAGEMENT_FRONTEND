/**
 * lib/crypto/keyStore.ts
 *
 * Persists the user's ECDH private key in IndexedDB.
 * The private key NEVER leaves the browser — it is NOT sent to the server.
 *
 * Also maintains an in-memory session key cache so we don't re-run ECDH
 * on every message (expensive). Cache key: `dm:<otherUserId>` or `group:<convId>`.
 */

const DB_NAME = "chat_keys";
const DB_VERSION = 1;
const STORE_NAME = "private_keys";

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

const idbPut = async (key: string, value: any): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const idbGet = async <T = any>(key: string): Promise<T | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
};

const idbDelete = async (key: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ── Private & Public key storage ──────────────────────────────────────────────

/**
 * Save the user's ECDH private key to IndexedDB.
 * Call this once after key generation or rotation.
 */
export const savePrivateKey = async (userId: string, privateKey: CryptoKey): Promise<void> => {
  await idbPut(`privkey:${userId}`, privateKey);
};

/**
 * Load the user's ECDH private key from IndexedDB.
 * Returns null if the key doesn't exist (user needs to generate keys).
 */
export const loadPrivateKey = async (userId: string): Promise<CryptoKey | null> => {
  return idbGet<CryptoKey>(`privkey:${userId}`);
};

/**
 * Save the user's base64 SPKI public key to IndexedDB for offline fast lookup.
 */
export const savePublicKey = async (userId: string, publicKeyB64: string): Promise<void> => {
  await idbPut(`pubkey:${userId}`, publicKeyB64);
};

/**
 * Load the user's base64 SPKI public key from IndexedDB.
 */
export const loadPublicKey = async (userId: string): Promise<string | null> => {
  return idbGet<string>(`pubkey:${userId}`);
};

/**
 * Delete the user's keys (called on key rotation or logout).
 */
export const deletePrivateKey = async (userId: string): Promise<void> => {
  await idbDelete(`privkey:${userId}`);
  await idbDelete(`pubkey:${userId}`);
  sessionKeyCache.clear();
};

/**
 * Ensure the user has valid E2E keys in IndexedDB AND that their public key
 * is published to the backend database.
 *
 * If private key is present but public key is not published to MongoDB,
 * this will automatically export the public key from the private key and publish it.
 * If no keys exist, it generates a fresh pair, stores it locally, and publishes it.
 */
export const ensureUserKeys = async (
  userId: string
): Promise<{ privateKey: CryptoKey; publicKeyB64: string }> => {
  // Dynamically import to avoid circular references at module evaluation time
  const { generateKeyPair, exportPublicKeyFromPrivateKey } = await import("./e2e");
  const { publishPublicKey, fetchPublicKey } = await import("@/lib/api/chat.api");
  const { useAuthStore } = await import("@/store/authStore");

  let privKey = await loadPrivateKey(userId);
  let pubKeyB64 = await loadPublicKey(userId);

  if (!privKey) {
    // No local key material at all — the only case where generating a fresh
    // keypair is safe (there is no existing identity to lose).
    const pair = await generateKeyPair();
    privKey = pair.privateKey;
    pubKeyB64 = pair.publicKeyB64;
    await savePrivateKey(userId, privKey);
    await savePublicKey(userId, pubKeyB64);
  } else if (!pubKeyB64) {
    // A private key exists but its cached public key is missing — recover it
    // by re-deriving from the private key. IMPORTANT: if this derivation
    // fails, it must propagate (not be swallowed into generating a new
    // keypair) — silently replacing a perfectly good private key here would
    // permanently break decryption of every existing DM session for this
    // user, including their own previously sent messages.
    pubKeyB64 = await exportPublicKeyFromPrivateKey(privKey);
    await savePublicKey(userId, pubKeyB64);
  }

  // 3. Ensure public key is published to backend
  try {
    const serverKey = await fetchPublicKey(userId);
    if (!serverKey?.publicKey || serverKey.publicKey !== pubKeyB64) {
      await publishPublicKey(pubKeyB64);
    }
  } catch {
    // 404 means not yet published to backend — publish now
    try {
      await publishPublicKey(pubKeyB64);
    } catch (pubErr) {
      console.error("Failed to publish public key to server:", pubErr);
    }
  }

  // 4. Update authStore user object if loaded
  const authState = useAuthStore.getState();
  if (authState.user && authState.user._id === userId && authState.user.publicKey !== pubKeyB64) {
    authState.setUser({ ...authState.user, publicKey: pubKeyB64 });
  }

  return { privateKey: privKey, publicKeyB64: pubKeyB64 };
};

// ── Session key cache (in-memory) ─────────────────────────────────────────────

/**
 * In-memory cache of derived ECDH session keys.
 * Avoids running the expensive ECDH + HKDF derivation on every message.
 *
 * Cache key format:
 *   - DMs:    `dm:<otherUserId>`
 *   - Groups: `group:<conversationId>`
 */
const sessionKeyCache = new Map<string, CryptoKey>();

export const getCachedSessionKey = (cacheKey: string): CryptoKey | undefined =>
  sessionKeyCache.get(cacheKey);

export const setCachedSessionKey = (cacheKey: string, key: CryptoKey): void => {
  sessionKeyCache.set(cacheKey, key);
};

export const clearSessionKeyCache = (): void => {
  sessionKeyCache.clear();
};

/**
 * Build the cache key for a DM session (between current user and another user).
 *
 * Includes the peer's keyVersion so that once fresher conversation data is
 * fetched (e.g. on reload or reopening the conversation) after the peer
 * rotates their encryption keys, the old session key — derived from their
 * previous public key — is never reused. Instead the version bump produces a
 * new cache key, misses, and forces a correct re-derivation.
 */
export const dmCacheKey = (otherUserId: string, keyVersion?: number) =>
  `dm:${otherUserId}:v${keyVersion ?? 0}`;

/**
 * Build the cache key for a group session.
 */
export const groupCacheKey = (conversationId: string) => `group:${conversationId}`;
