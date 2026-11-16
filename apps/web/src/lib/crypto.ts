import { IV_LENGTH } from "$lib/shared/constants";
import type { TBytes } from "$lib/shared/types";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = "SHA-256";
const KEY_LENGTH_BITS = 256;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(s: string): TBytes {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importDEK(dek: TBytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", dek, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function generateUserKeys(): { dek: TBytes; kekSalt: TBytes } {
  return {
    dek: crypto.getRandomValues(new Uint8Array(32)),
    kekSalt: crypto.getRandomValues(new Uint8Array(16)),
  };
}

export async function deriveKEK(
  password: string,
  salt: TBytes,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapDEK(
  dek: TBytes,
  kek: CryptoKey,
): Promise<{ encrypted: TBytes; iv: TBytes }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    kek,
    dek,
  );
  return { encrypted: new Uint8Array(ciphertext), iv };
}

export async function unwrapDEK(
  encrypted: TBytes,
  iv: TBytes,
  kek: CryptoKey,
): Promise<TBytes> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    kek,
    encrypted,
  );
  return new Uint8Array(plaintext);
}

export async function encryptToken(
  token: string,
  dek: TBytes,
): Promise<{ ciphertext: TBytes; iv: TBytes }> {
  const key = await importDEK(dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(token),
  );
  return { ciphertext: new Uint8Array(ciphertext), iv };
}

export async function decryptToken(
  ciphertext: TBytes,
  iv: TBytes,
  dek: TBytes,
): Promise<string> {
  const key = await importDEK(dek);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  const dec = new TextDecoder();
  return dec.decode(plaintext);
}

export function dekToBase64(dek: Uint8Array): string {
  return bytesToBase64(dek);
}

export function dekFromBase64(s: string): TBytes {
  return base64ToBytes(s);
}

export function bytesToApi(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

export function bytesFromApi(s: string): TBytes {
  return base64ToBytes(s);
}
