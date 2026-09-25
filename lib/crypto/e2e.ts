/**
 * lib/crypto/e2e.ts
 *
 * End-to-End Encryption using the Web Crypto API (zero npm dependencies).
 *
 * Algorithm choices:
 *  - Key exchange:  ECDH P-256 (native Web Crypto, widely supported)
 *  - Encryption:    AES-256-GCM (authenticated — prevents both eavesdropping AND tampering)
 *  - Key derivation: HKDF-SHA256 (stretches ECDH shared secret into a proper AES key)
 *
 * The server NEVER sees plaintext. It stores only ciphertext + iv + public keys.
 */

const ECDH_PARAMS: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };
const AES_PARAMS: AesKeyGenParams = { name: "AES-GCM", length: 256 };
const HKDF_HASH = "SHA-256";

/** Encode a string to Uint8Array */
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Decode ArrayBuffer to string */
const dec = (b: ArrayBuffer): string => new TextDecoder().decode(b);

/** Convert ArrayBuffer → base64 string */
export const bufToB64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...Array.from(new Uint8Array(buf))));

/** Convert base64 string → Uint8Array */
export const b64ToBuf = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Uint8Array → ArrayBuffer (strict type for SubtleCrypto) */
const toBuffer = (u8: Uint8Array): ArrayBuffer =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

// ── Key Generation ────────────────────────────────────────────────────────────

export const generateKeyPair = async (): Promise<{
  publicKeyB64: string;
  privateKey: CryptoKey;
}> => {
  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey", "deriveBits"]);
  const publicKeySpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyB64 = bufToB64(publicKeySpki);
  return { publicKeyB64, privateKey: keyPair.privateKey };
};

export const importPublicKey = async (publicKeyB64: string): Promise<CryptoKey> => {
  const keyData = b64ToBuf(publicKeyB64);
  return crypto.subtle.importKey("spki", toBuffer(keyData), ECDH_PARAMS, true, []);
};

/**
 * Extract the SPKI base64 public key directly from an extractable ECDH private key.
 * Uses Web Crypto JWK export/import to extract the affine curve coordinates (x, y)
 * and exports the matching SPKI public key without needing network requests.
 */
export const exportPublicKeyFromPrivateKey = async (privateKey: CryptoKey): Promise<string> => {
  const privJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const pubJwk = {
    kty: privJwk.kty,
    crv: privJwk.crv,
    x: privJwk.x,
    y: privJwk.y
  };
  const pubKey = await crypto.subtle.importKey("jwk", pubJwk, ECDH_PARAMS, true, []);
  const spki = await crypto.subtle.exportKey("spki", pubKey);
  return bufToB64(spki);
};

// ── Session Key Derivation ────────────────────────────────────────────────────

export const deriveSessionKey = async (
  myPrivateKey: CryptoKey,
  theirPublicKeyB64: string
): Promise<CryptoKey> => {
  const theirPublicKey = await importPublicKey(theirPublicKeyB64);

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    256
  );

  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);

  const infoBytes = enc("chat-dm-v1");
  const sessionKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HKDF_HASH,
      salt: new Uint8Array(32).buffer as ArrayBuffer,
      info: toBuffer(infoBytes)
    },
    hkdfKey,
    AES_PARAMS,
    false,
    ["encrypt", "decrypt"]
  );

  return sessionKey;
};

// ── Message Encryption / Decryption ──────────────────────────────────────────

export const encryptMessage = async (
  plaintext: string,
  sessionKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> => {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = enc(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(ivBytes) },
    sessionKey,
    toBuffer(encodedPlaintext)
  );

  return {
    ciphertext: bufToB64(ciphertextBuffer),
    iv: bufToB64(toBuffer(ivBytes))
  };
};

export const decryptMessage = async (
  ciphertextB64: string,
  ivB64: string,
  sessionKey: CryptoKey
): Promise<string> => {
  const ciphertext = b64ToBuf(ciphertextB64);
  const iv = b64ToBuf(ivB64);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    sessionKey,
    toBuffer(ciphertext)
  );

  return dec(plaintextBuffer);
};

// ── Group Key Management ──────────────────────────────────────────────────────

export const generateGroupKey = async (): Promise<CryptoKey> => {
  return crypto.subtle.generateKey(AES_PARAMS, true, ["encrypt", "decrypt"]);
};

export const wrapGroupKey = async (
  groupKey: CryptoKey,
  memberSessionKey: CryptoKey
): Promise<string> => {
  const rawGroupKey = await crypto.subtle.exportKey("raw", groupKey);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));

  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(ivBytes) },
    memberSessionKey,
    rawGroupKey
  );

  return `${bufToB64(toBuffer(ivBytes))}:${bufToB64(wrapped)}`;
};

export const unwrapGroupKey = async (
  wrappedKey: string,
  sessionKey: CryptoKey
): Promise<CryptoKey> => {
  const [ivB64, ciphertextB64] = wrappedKey.split(":");
  const iv = b64ToBuf(ivB64);
  const ciphertext = b64ToBuf(ciphertextB64);

  const rawGroupKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    sessionKey,
    toBuffer(ciphertext)
  );

  return crypto.subtle.importKey("raw", rawGroupKey, AES_PARAMS, true, ["encrypt", "decrypt"]);
};

// ── File Encryption ───────────────────────────────────────────────────────────

export const encryptFile = async (
  fileBuffer: ArrayBuffer,
  sessionKey: CryptoKey
): Promise<{ encryptedBuffer: ArrayBuffer; iv: string }> => {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(ivBytes) },
    sessionKey,
    fileBuffer
  );
  return { encryptedBuffer, iv: bufToB64(toBuffer(ivBytes)) };
};

export const decryptFile = async (
  encryptedBuffer: ArrayBuffer,
  ivB64: string,
  sessionKey: CryptoKey
): Promise<ArrayBuffer> => {
  const iv = b64ToBuf(ivB64);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: toBuffer(iv) }, sessionKey, encryptedBuffer);
};

// ── Key Fingerprint ───────────────────────────────────────────────────────────

export const computeFingerprint = async (
  myPublicKeyB64: string,
  theirPublicKeyB64: string
): Promise<string> => {
  const sorted = [myPublicKeyB64, theirPublicKeyB64].sort();
  const combined = enc(sorted.join("|"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", toBuffer(combined));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexString = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hexString
    .toUpperCase()
    .match(/.{1,4}/g)!
    .join(" ");
};
