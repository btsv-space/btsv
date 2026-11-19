import { dbGetGitToken, dbSaveGitToken } from "$lib/db";
import { deviceLock } from "$lib/stores/device.svelte";
import {
  base64ToBytes,
  bytesToBase64,
  decryptToken,
  encryptToken,
} from "$lib/crypto";
import type { ISecretRecord } from "$lib/shared/types";

export async function ensureGitToken(
  projectId: string,
): Promise<string | null> {
  if (deviceLock.state !== "unlocked") return null;

  const secretRecord = await dbGetGitToken(projectId);
  if (!secretRecord) return null;

  try {
    return await decryptToken(
      base64ToBytes(secretRecord.ciphertext),
      base64ToBytes(secretRecord.iv),
      deviceLock.getDek(),
    );
  } catch (err) {
    console.warn(`[secrets] failed to decrypt token for ${projectId}:`, err);
    return null;
  }
}

export async function saveGitToken(
  projectId: string,
  token: string,
): Promise<void> {
  const { ciphertext, iv } = await encryptToken(token, deviceLock.getDek());
  const secretRecord: ISecretRecord = {
    projectId,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: Date.now(),
  };
  await dbSaveGitToken(secretRecord);
}
