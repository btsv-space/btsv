import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEVICE_LOCK_STORAGE_KEY } from "$lib/shared/constants";
import { KEK_PBKDF2_ITERATIONS } from "$lib/crypto";
import type { IDeviceLockRecord } from "$lib/shared/types";

vi.mock("$app/environment", () => ({ browser: true }));

function mockLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
  });
}

const PASSCODE = "correct horse battery";

async function importDevice() {
  return import("$lib/stores/device.svelte");
}

describe("device key", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLocalStorage();
  });

  it("starts unconfigured when no record exists", async () => {
    const { deviceLock } = await importDevice();
    expect(deviceLock.state).toBe("unconfigured");
  });

  it("setup stores only a wrapped record and unlocks the device", async () => {
    const { deviceLock } = await importDevice();
    await deviceLock.setup(PASSCODE);

    expect(deviceLock.state).toBe("unlocked");

    const raw = localStorage.getItem(DEVICE_LOCK_STORAGE_KEY)!;
    expect(raw).not.toContain(PASSCODE);
    const record = JSON.parse(raw) as IDeviceLockRecord;
    expect(record.type).toBe("passcode");
    expect(record.v).toBe(1);
    expect(record.iterations).toBe(KEK_PBKDF2_ITERATIONS);
    expect(record.kekSalt).toBeTruthy();
    expect(record.wrapIv).toBeTruthy();
    expect(record.wrappedDek).toBeTruthy();
  });

  it("rejects passcodes shorter than the minimum", async () => {
    const { deviceLock } = await importDevice();
    await expect(deviceLock.setup("short")).rejects.toThrow();
  });

  it("starts locked when a record exists (cold start)", async () => {
    const first = await importDevice();
    await first.deviceLock.setup(PASSCODE);

    vi.resetModules();
    const second = await importDevice();
    expect(second.deviceLock.state).toBe("locked");
  });

  it("cold start: wrong passcode stays locked, correct passcode unlocks", async () => {
    const first = await importDevice();
    await first.deviceLock.setup(PASSCODE);

    vi.resetModules();
    const second = await importDevice();
    expect(second.deviceLock.state).toBe("locked");

    expect(await second.deviceLock.unlock("wrong passcode")).toBe(false);
    expect(second.deviceLock.state).toBe("locked");

    expect(await second.deviceLock.unlock(PASSCODE)).toBe(true);
    expect(second.deviceLock.state).toBe("unlocked");
  });

  it("clears a corrupt record instead of bricking the app", async () => {
    localStorage.setItem(DEVICE_LOCK_STORAGE_KEY, "{not json");
    const { deviceLock } = await importDevice();
    expect(deviceLock.state).toBe("unconfigured");
    expect(localStorage.getItem(DEVICE_LOCK_STORAGE_KEY)).toBeNull();
  });
});
