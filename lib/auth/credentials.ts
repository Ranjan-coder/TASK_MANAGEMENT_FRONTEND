/**
 * lib/auth/credentials.ts
 *
 * Every place a password is typed goes through here. The password itself never
 * leaves the browser: it's turned into an authKey (sent to the server) and a
 * wrapKey (kept here to open the encrypted chat key bundle).
 */

import apiClient from "@/lib/api/client";
import { deriveKeysFromPassword, newKdfParams, type KdfParams } from "@/lib/crypto/passwordKeys";
import { establishChatKeys } from "@/lib/crypto/keyBundle";
import { wipeLocalKeys, setKeyStorageTrusted } from "@/lib/crypto/keyStore";
import { clearConversationCrypto } from "@/lib/crypto/conversationKeys";

export interface LoginBody {
  identifier: string;
  authKey: string;
  password?: string; // sent once, only for accounts created before this scheme
  trustDevice?: boolean;
}

/** Fetches the account's KDF settings and derives the login keys. */
export async function prepareLogin(
  identifier: string,
  password: string,
  trustDevice = true
): Promise<{ body: LoginBody; wrapKey: CryptoKey }> {
  const res = await apiClient.post<{ data: { kdf: KdfParams; legacy: boolean } }>("/auth/prelogin", { identifier });
  const { kdf, legacy } = res.data.data;
  const { authKey, wrapKey } = await deriveKeysFromPassword(password, kdf);
  // Decide where chat keys may be stored before anything is unlocked
  setKeyStorageTrusted(trustDevice);
  return { body: { identifier, authKey, trustDevice, ...(legacy ? { password } : {}) }, wrapKey };
}

/** Keys for a brand-new password (sign-up, reset, change, admin-created account). */
export async function prepareNewPassword(password: string): Promise<{ authKey: string; kdfSalt: string; wrapKey: CryptoKey }> {
  const kdf = newKdfParams();
  const { authKey, wrapKey } = await deriveKeysFromPassword(password, kdf);
  return { authKey, kdfSalt: kdf.salt, wrapKey };
}

/** Derives keys for the signed-in user's current password (change password, 2FA). */
export async function prepareCurrentPassword(password: string) {
  const res = await apiClient.get<{ data: { kdf: KdfParams | null; legacy: boolean } }>("/auth/kdf");
  const { kdf, legacy } = res.data.data;
  if (legacy || !kdf) return { legacy: true as const, password };
  const { authKey, wrapKey } = await deriveKeysFromPassword(password, kdf);
  return { legacy: false as const, authKey, wrapKey };
}

/**
 * Opens (or creates) the chat keys after sign-in. Never blocks the sign-in
 * itself: if it fails, Chat shows an unlock prompt instead.
 */
export async function finishSignIn(userId: string, wrapKey: CryptoKey): Promise<void> {
  try {
    await establishChatKeys(userId, wrapKey);
  } catch (err) {
    console.warn("Chat keys will be unlocked later:", err);
  }
}

/** Removes chat keys and caches from this browser (sign-out). */
export async function forgetDeviceKeys(): Promise<void> {
  clearConversationCrypto();
  await wipeLocalKeys();
}
