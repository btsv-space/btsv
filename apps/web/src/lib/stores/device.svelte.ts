import { browser } from "$app/environment";
import {
  DEVICE_LOCK_STORAGE_KEY,
  PASSCODE_MIN_LENGTH,
} from "$lib/shared/constants";
import type {
  IDeviceLockRecord,
  IPasscodeWrap,
  IPasskeyWrap,
  TBytes,
  TDeviceLockState,
} from "$lib/shared/types";
import {
  KEK_PBKDF2_ITERATIONS,
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  deriveKek,
  derivePasskeyKek,
  encryptBytes,
  randomBytes,
} from "$lib/crypto";
import { createPasskey, unlockPasskey } from "$lib/passkey";

const DEK_BYTES = 32;
const KEK_SALT_BYTES = 16;

function isPasscodeWrap(value: unknown): value is IPasscodeWrap {
  const wrap = value as Partial<IPasscodeWrap> | undefined;
  return (
    wrap?.type === "passcode" &&
    typeof wrap.kekSalt === "string" &&
    typeof wrap.iterations === "number" &&
    typeof wrap.wrapIv === "string" &&
    typeof wrap.wrappedDek === "string"
  );
}

function isPasskeyWrap(value: unknown): value is IPasskeyWrap {
  const wrap = value as Partial<IPasskeyWrap> | undefined;
  return (
    wrap?.type === "passkey" &&
    typeof wrap.credentialId === "string" &&
    typeof wrap.prfSalt === "string" &&
    typeof wrap.rpId === "string" &&
    typeof wrap.wrapIv === "string" &&
    typeof wrap.wrappedDek === "string"
  );
}

class DeviceLock {
  private record = $state<IDeviceLockRecord | null>(
    browser ? this.#load() : null,
  );
  private deviceDek = $state<TBytes | null>(null);

  get state(): TDeviceLockState {
    if (!this.record) return "unconfigured";
    return this.deviceDek ? "unlocked" : "locked";
  }

  get hasPasskey(): boolean {
    return this.record?.passkey != null;
  }

  getDek(): TBytes {
    if (!this.deviceDek) throw new Error("Device is locked");
    return this.deviceDek;
  }

  async setup(passcode: string): Promise<void> {
    this.#assertPasscode(passcode);
    const dek = randomBytes(DEK_BYTES);
    this.#writeRecord({
      v: 2,
      passcode: await this.#buildPasscodeWrap(passcode, dek),
    });
    this.deviceDek = dek;
  }

  async unlock(passcode: string): Promise<boolean> {
    const wrap = this.record?.passcode;
    if (!wrap) return false;

    try {
      const passcodeKek = await deriveKek(
        passcode,
        base64ToBytes(wrap.kekSalt),
        wrap.iterations,
      );
      this.deviceDek = await decryptBytes(
        base64ToBytes(wrap.wrappedDek),
        base64ToBytes(wrap.wrapIv),
        passcodeKek,
      );
      return true;
    } catch {
      return false;
    }
  }

  async unlockWithPasskey(): Promise<boolean> {
    const wrap = this.record?.passkey;
    if (!wrap) return false;

    try {
      const prfOutput = await unlockPasskey(
        wrap.credentialId,
        wrap.prfSalt,
        wrap.rpId,
      );
      const kek = await derivePasskeyKek(prfOutput);
      this.deviceDek = await decryptBytes(
        base64ToBytes(wrap.wrappedDek),
        base64ToBytes(wrap.wrapIv),
        kek,
      );
      return true;
    } catch {
      return false;
    }
  }

  lock(): void {
    this.deviceDek = null;
  }

  async addPasskey(): Promise<void> {
    const deviceDek = this.deviceDek;
    const record = this.record;
    if (!deviceDek) throw new Error("Device is locked");
    if (!record?.passcode) throw new Error("No device lock configured");

    const credential = await createPasskey();
    const kek = await derivePasskeyKek(credential.prfOutput);
    const { ciphertext, iv } = await encryptBytes(deviceDek, kek);

    this.#writeRecord({
      ...record,
      passkey: {
        type: "passkey",
        credentialId: credential.credentialId,
        prfSalt: credential.prfSalt,
        rpId: credential.rpId,
        wrapIv: bytesToBase64(iv),
        wrappedDek: bytesToBase64(ciphertext),
      },
    });
  }

  removePasskey(): void {
    const record = this.record;
    if (!record?.passkey) return;

    if (record.passcode) {
      this.#writeRecord({ v: 2, passcode: record.passcode });
    } else {
      this.reset();
    }
  }

  async changePasscode(
    verifyPasscode: string,
    newPasscode: string,
  ): Promise<void> {
    this.#assertPasscode(newPasscode);
    const deviceDek = this.deviceDek;
    if (!deviceDek) throw new Error("Device is locked");
    const wrap = this.record?.passcode;
    if (!wrap) throw new Error("No device lock configured");

    const verifyKek = await deriveKek(
      verifyPasscode,
      base64ToBytes(wrap.kekSalt),
      wrap.iterations,
    );

    try {
      // Verifies the current passcode: only the right KEK decrypts the wrap.
      await decryptBytes(
        base64ToBytes(wrap.wrappedDek),
        base64ToBytes(wrap.wrapIv),
        verifyKek,
      );
    } catch {
      throw new Error("Current passcode is incorrect");
    }

    this.#writeRecord({
      ...this.record!,
      passcode: await this.#buildPasscodeWrap(newPasscode, deviceDek),
    });
  }

  reset(): void {
    localStorage.removeItem(DEVICE_LOCK_STORAGE_KEY);
    this.record = null;
    this.deviceDek = null;
  }

  #load(): IDeviceLockRecord | null {
    const raw = localStorage.getItem(DEVICE_LOCK_STORAGE_KEY);
    if (!raw) return null;

    const record = this.#parseRecord(raw);
    if (!record) localStorage.removeItem(DEVICE_LOCK_STORAGE_KEY);
    return record;
  }

  #parseRecord(raw: string): IDeviceLockRecord | null {
    try {
      const parsed = JSON.parse(raw) as Partial<IDeviceLockRecord> | null;
      if (parsed?.v !== 2) return null;

      const passcode = isPasscodeWrap(parsed.passcode)
        ? parsed.passcode
        : undefined;
      const passkey = isPasskeyWrap(parsed.passkey)
        ? parsed.passkey
        : undefined;
      if (!passcode && !passkey) return null;

      return { v: 2, passcode, passkey };
    } catch {
      return null;
    }
  }

  #writeRecord(record: IDeviceLockRecord): void {
    this.record = record;
    localStorage.setItem(DEVICE_LOCK_STORAGE_KEY, JSON.stringify(record));
  }

  #assertPasscode(passcode: string): void {
    if (passcode.length < PASSCODE_MIN_LENGTH) {
      throw new Error(
        `Passcode must be at least ${PASSCODE_MIN_LENGTH} characters`,
      );
    }
  }

  async #buildPasscodeWrap(
    passcode: string,
    dek: TBytes,
  ): Promise<IPasscodeWrap> {
    const kekSalt = randomBytes(KEK_SALT_BYTES);
    const passcodeKek = await deriveKek(passcode, kekSalt);
    const { ciphertext, iv } = await encryptBytes(dek, passcodeKek);
    return {
      type: "passcode",
      kekSalt: bytesToBase64(kekSalt),
      iterations: KEK_PBKDF2_ITERATIONS,
      wrapIv: bytesToBase64(iv),
      wrappedDek: bytesToBase64(ciphertext),
    };
  }
}

export const deviceLock = new DeviceLock();
