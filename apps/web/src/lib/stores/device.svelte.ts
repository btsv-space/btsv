import { browser } from "$app/environment";
import {
  DEVICE_LOCK_STORAGE_KEY,
  PASSCODE_MIN_LENGTH,
} from "$lib/shared/constants";
import type {
  IDeviceLockRecord,
  TBytes,
  TDeviceLockState,
} from "$lib/shared/types";
import {
  KEK_PBKDF2_ITERATIONS,
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  deriveKek,
  encryptBytes,
  randomBytes,
} from "$lib/crypto";

const DEK_BYTES = 32;
const KEK_SALT_BYTES = 16;

class DeviceLock {
  private deviceDek = $state<TBytes | null>(null);
  private isLockSetup = $state(browser ? this.#load() : false);

  get state(): TDeviceLockState {
    if (!this.isLockSetup) return "unconfigured";
    return this.deviceDek ? "unlocked" : "locked";
  }

  async setup(passcode: string): Promise<void> {
    this.#assertPasscode(passcode);
    const dek = randomBytes(DEK_BYTES);
    this.#writeRecord(await this.#buildRecord(passcode, dek));
    this.deviceDek = dek;
    this.isLockSetup = true;
  }

  async unlock(passcode: string): Promise<boolean> {
    const record = this.#readRecord();
    if (!record) return false;

    try {
      const passcodeKek = await deriveKek(
        passcode,
        base64ToBytes(record.kekSalt),
        record.iterations,
      );
      this.deviceDek = await decryptBytes(
        base64ToBytes(record.wrappedDek),
        base64ToBytes(record.wrapIv),
        passcodeKek,
      );
      this.isLockSetup = true;
      return true;
    } catch {
      return false;
    }
  }

  #load(): boolean {
    if (!localStorage.getItem(DEVICE_LOCK_STORAGE_KEY)) return false;
    if (!this.#readRecord()) {
      localStorage.removeItem(DEVICE_LOCK_STORAGE_KEY);
      return false;
    }
    return true;
  }

  #readRecord(): IDeviceLockRecord | null {
    const raw = localStorage.getItem(DEVICE_LOCK_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as IDeviceLockRecord;
      if (
        parsed?.v !== 1 ||
        parsed.type !== "passcode" ||
        !parsed.kekSalt ||
        !parsed.wrapIv ||
        !parsed.wrappedDek
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  #writeRecord(record: IDeviceLockRecord): void {
    localStorage.setItem(DEVICE_LOCK_STORAGE_KEY, JSON.stringify(record));
  }

  #assertPasscode(passcode: string): void {
    if (passcode.length < PASSCODE_MIN_LENGTH) {
      throw new Error(
        `Passcode must be at least ${PASSCODE_MIN_LENGTH} characters`,
      );
    }
  }

  async #buildRecord(
    passcode: string,
    dek: TBytes,
  ): Promise<IDeviceLockRecord> {
    const kekSalt = randomBytes(KEK_SALT_BYTES);
    const passcodeKek = await deriveKek(passcode, kekSalt);
    const { ciphertext, iv } = await encryptBytes(dek, passcodeKek);
    return {
      v: 1 as const,
      type: "passcode" as const,
      kekSalt: bytesToBase64(kekSalt),
      iterations: KEK_PBKDF2_ITERATIONS,
      wrapIv: bytesToBase64(iv),
      wrappedDek: bytesToBase64(ciphertext),
    };
  }
}

export const deviceLock = new DeviceLock();
