import { describe, it, expect, beforeAll } from "vitest";
import {
  PAIRING_CODE_LENGTH,
  createPairing,
  formatPairingCode,
  isPairingBlob,
  normalizePairingCode,
  openPairing,
  pairingUrl,
  readPairingBlobFromUrl,
  type IPairingInvite,
  type IPairingPayload,
} from "$lib/pairing";

const payload: IPairingPayload = {
  v: 1,
  name: "My Blog",
  repoUrl: "https://github.com/me/blog",
  pat: "github_pat_test",
};

let invite: IPairingInvite;

beforeAll(async () => {
  invite = await createPairing(payload);
});

describe("pairing", () => {
  it("produces a 6-character code from an unambiguous alphabet", () => {
    expect(invite.code).toHaveLength(PAIRING_CODE_LENGTH);
    expect(invite.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(isPairingBlob(invite.blob)).toBe(true);
  });

  it("round-trips with the right code", async () => {
    expect(await openPairing(invite.code, invite.blob)).toEqual(payload);
  });

  it("accepts lowercase and spaced input", async () => {
    const typed = invite.code.toLowerCase().split("").join(" ");
    expect(await openPairing(typed, invite.blob)).toEqual(payload);
  });

  it("rejects a wrong code", async () => {
    const wrong = invite.code === "AAAAAA" ? "BBBBBB" : "AAAAAA";
    expect(await openPairing(wrong, invite.blob)).toBeNull();
  });

  it("rejects a malformed blob", async () => {
    expect(isPairingBlob("not-a-blob")).toBe(false);
    expect(await openPairing(invite.code, "not-a-blob")).toBeNull();
  });

  it("rejects a payload with a non-https repo or an empty token", async () => {
    const badRepo = await createPairing({ ...payload, repoUrl: "http://x/y" });
    expect(await openPairing(badRepo.code, badRepo.blob)).toBeNull();

    const noToken = await createPairing({ ...payload, pat: "   " });
    expect(await openPairing(noToken.code, noToken.blob)).toBeNull();
  });

  it("builds and reads the deep link", () => {
    const url = pairingUrl("BLOB", "https://app.example");
    expect(url).toBe("https://app.example/pair#pair=BLOB");
    expect(readPairingBlobFromUrl(url)).toBe("BLOB");
    expect(readPairingBlobFromUrl("https://app.example/projects")).toBeNull();
  });

  it("formats and normalizes the code", () => {
    expect(formatPairingCode("K7QD3M")).toBe("K7Q D3M");
    expect(normalizePairingCode(" k7qd-3m ")).toBe("K7QD3M");
  });
});
