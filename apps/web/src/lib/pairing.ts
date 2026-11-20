import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  decryptBytes,
  deriveKek,
  encryptBytes,
  randomBytes,
} from "$lib/crypto";

export interface IPairingPayload {
  v: 1;
  name: string;
  repoUrl: string;
  pat: string;
}

export interface IPairingInvite {
  code: string;
  blob: string;
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIRING_CODE_LENGTH = 6;

const SALT_BYTES = 16;
const HASH_PREFIX = "#pair=";

interface IPairingEnvelope {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function formatPairingCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function randomCode(): string {
  return Array.from(
    randomBytes(PAIRING_CODE_LENGTH),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
}

function parseEnvelope(blob: string): IPairingEnvelope | null {
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(blob)),
    ) as Partial<IPairingEnvelope>;

    if (parsed?.v !== 1) return null;
    if (
      typeof parsed.salt !== "string" ||
      typeof parsed.iv !== "string" ||
      typeof parsed.ct !== "string"
    ) {
      return null;
    }
    return { v: 1, salt: parsed.salt, iv: parsed.iv, ct: parsed.ct };
  } catch {
    return null;
  }
}

export function isPairingBlob(blob: string): boolean {
  return parseEnvelope(blob) !== null;
}

export async function createPairing(
  payload: IPairingPayload,
): Promise<IPairingInvite> {
  const code = randomCode();
  const salt = randomBytes(SALT_BYTES);
  const { ciphertext, iv } = await encryptBytes(
    new TextEncoder().encode(JSON.stringify(payload)),
    await deriveKek(code, salt),
  );

  const envelope: IPairingEnvelope = {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ciphertext),
  };

  return {
    code,
    blob: bytesToBase64Url(new TextEncoder().encode(JSON.stringify(envelope))),
  };
}

export async function openPairing(
  code: string,
  blob: string,
): Promise<IPairingPayload | null> {
  const envelope = parseEnvelope(blob);
  if (!envelope) return null;

  try {
    const key = await deriveKek(
      normalizePairingCode(code),
      base64ToBytes(envelope.salt),
    );
    const plaintext = await decryptBytes(
      base64ToBytes(envelope.ct),
      base64ToBytes(envelope.iv),
      key,
    );
    return parsePayload(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    return null;
  }
}

function parsePayload(value: unknown): IPairingPayload | null {
  const parsed = value as Partial<IPairingPayload> | null;

  if (parsed?.v !== 1) return null;
  if (typeof parsed.name !== "string") return null;
  if (
    typeof parsed.repoUrl !== "string" ||
    !parsed.repoUrl.startsWith("https://")
  ) {
    return null;
  }
  if (typeof parsed.pat !== "string" || parsed.pat.trim() === "") return null;

  return { v: 1, name: parsed.name, repoUrl: parsed.repoUrl, pat: parsed.pat };
}

export function pairingUrl(
  blob: string,
  origin: string = location.origin,
): string {
  return `${origin}/pair${HASH_PREFIX}${blob}`;
}

export function readPairingBlobFromUrl(href: string): string | null {
  const start = href.indexOf(HASH_PREFIX);
  if (start === -1) return null;

  const blob = href.slice(start + HASH_PREFIX.length).split("&")[0];
  return blob || null;
}
