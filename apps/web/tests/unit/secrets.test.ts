import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ISecretRecord } from "$lib/shared/types";

const { mockGetGitToken, mockSaveGitToken, mockGetDek, mockDeviceLock } =
  vi.hoisted(() => {
    const mockGetDek = vi.fn();
    return {
      mockGetGitToken: vi.fn(),
      mockSaveGitToken: vi.fn(),
      mockGetDek,
      mockDeviceLock: { state: "unlocked", getDek: mockGetDek },
    };
  });

vi.mock("$lib/db", () => ({
  dbGetGitToken: mockGetGitToken,
  dbSaveGitToken: mockSaveGitToken,
}));

vi.mock("$lib/stores/device.svelte", () => ({ deviceLock: mockDeviceLock }));

const DEK = new Uint8Array(32).fill(7);
const TOKEN = "github_pat_test_value";
const PROJECT = "proj-1";

async function importSecrets() {
  return import("$lib/secrets");
}

describe("secrets", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetGitToken.mockReset();
    mockSaveGitToken.mockReset();
    mockGetDek.mockReset();
    mockGetDek.mockReturnValue(DEK);
    mockDeviceLock.state = "unlocked";
    mockSaveGitToken.mockResolvedValue(undefined);
  });

  it("encrypts a token at rest", async () => {
    const { saveGitToken } = await importSecrets();
    await saveGitToken(PROJECT, TOKEN);

    const record = mockSaveGitToken.mock.calls[0][0] as ISecretRecord;
    expect(record.projectId).toBe(PROJECT);
    expect(record.ciphertext).not.toContain(TOKEN);
    expect(record.iv).toBeTruthy();
    expect(record.updatedAt).toBeGreaterThan(0);
  });

  it("decrypts a stored token", async () => {
    const first = await importSecrets();
    await first.saveGitToken(PROJECT, TOKEN);
    const record = mockSaveGitToken.mock.calls[0][0] as ISecretRecord;

    mockGetGitToken.mockResolvedValue(record);
    const fresh = await importSecrets();
    expect(await fresh.ensureGitToken(PROJECT)).toBe(TOKEN);
  });

  it("returns null when no secret is stored", async () => {
    mockGetGitToken.mockResolvedValue(undefined);
    const { ensureGitToken } = await importSecrets();
    expect(await ensureGitToken(PROJECT)).toBeNull();
  });

  it("returns null without touching IDB while locked", async () => {
    mockDeviceLock.state = "locked";
    const { ensureGitToken } = await importSecrets();

    expect(await ensureGitToken(PROJECT)).toBeNull();
    expect(mockGetGitToken).not.toHaveBeenCalled();
    expect(mockGetDek).not.toHaveBeenCalled();
  });

  it("returns null when the stored ciphertext cannot be decrypted", async () => {
    mockGetGitToken.mockResolvedValue({
      projectId: PROJECT,
      iv: "AAAAAAAAAAAAAAAA",
      ciphertext:
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      updatedAt: 1,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ensureGitToken } = await importSecrets();

    expect(await ensureGitToken(PROJECT)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
