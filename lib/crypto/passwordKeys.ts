/**
 * lib/crypto/passwordKeys.ts
 *
 * Turns the user's password into two independent keys, entirely in the browser
 * (same algorithm as backend/src/utils/kdf.js):
 *
 *   master  = PBKDF2-SHA256(password, salt, iterations)
 *   authKey = HKDF(master, "bonito-auth-v1")  → sent to the server to log in
 *   wrapKey = HKDF(master, "bonito-wrap-v1")  → never leaves the browser; encrypts the chat key bundle
 *
 * The server stores only bcrypt(authKey), so it never learns the password and
 * cannot compute wrapKey.
 */

export interface KdfParams {
  algorithm: string;
  iterations: number;
  salt: string; // base64, 16 bytes
}

export const KDF_ALGORITHM = "PBKDF2-SHA256";
// Refuse weaker parameters even if a server asks for them (downgrade protection)
export const MIN_KDF_ITERATIONS = 600000;

const enc = new TextEncoder();

export const bytesToB64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
};

export const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const newKdfSalt = (): string => bytesToB64(crypto.getRandomValues(new Uint8Array(16)));

export const newKdfParams = (): KdfParams => ({
  algorithm: KDF_ALGORITHM,
  iterations: MIN_KDF_ITERATIONS,
  salt: newKdfSalt()
});

export interface DerivedKeys {
  authKey: string;
  wrapKey: CryptoKey; // AES-GCM, non-extractable
}

export async function deriveKeysFromPassword(password: string, kdf: KdfParams): Promise<DerivedKeys> {
  if (kdf.algorithm !== KDF_ALGORITHM || !Number.isInteger(kdf.iterations) || kdf.iterations < MIN_KDF_ITERATIONS) {
    throw new Error("Unsupported key derivation settings");
  }
  const salt = b64ToBytes(kdf.salt);
  if (salt.length !== 16) throw new Error("Invalid key derivation salt");

  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations: kdf.iterations },
    base,
    256
  );
  const hkdf = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits", "deriveKey"]);

  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("bonito-auth-v1") },
    hkdf,
    256
  );
  const wrapKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("bonito-wrap-v1") },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return { authKey: bytesToB64(authBits), wrapKey };
}

/** Same rule as the server-side policy: 8+ chars, an uppercase letter and a number. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}
