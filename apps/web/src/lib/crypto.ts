import { IV_LENGTH } from "$lib/shared/constants";
import type { TBytes } from "$lib/shared/types";

export const KEK_PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = "SHA-256";
const KEY_LENGTH_BITS = 256;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(s: string): TBytes {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): TBytes {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
}

const PASSKEY_HKDF_INFO = "btsv-device-key-v1";

export async function derivePasskeyKek(prfOutput: TBytes): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(PASSKEY_HKDF_INFO),
    },
    base,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export function randomBytes(length: number): TBytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function importAesKey(raw: TBytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveWrapKey(
  passphrase: string,
  salt: TBytes,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(
  bytes: TBytes,
  key: CryptoKey,
): Promise<{ ciphertext: TBytes; iv: TBytes }> {
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    bytes,
  );
  return { ciphertext: new Uint8Array(ciphertext), iv };
}

export async function decryptBytes(
  ciphertext: TBytes,
  iv: TBytes,
  key: CryptoKey,
): Promise<TBytes> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new Uint8Array(plaintext);
}

export async function encryptToken(
  token: string,
  key: TBytes,
): Promise<{ ciphertext: TBytes; iv: TBytes }> {
  return encryptBytes(new TextEncoder().encode(token), await importAesKey(key));
}

export async function decryptToken(
  ciphertext: TBytes,
  iv: TBytes,
  key: TBytes,
): Promise<string> {
  return new TextDecoder().decode(
    await decryptBytes(ciphertext, iv, await importAesKey(key)),
  );
}

export function deriveKek(
  passcode: string,
  salt: TBytes,
  iterations: number = KEK_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  return deriveWrapKey(passcode, salt, iterations);
}
