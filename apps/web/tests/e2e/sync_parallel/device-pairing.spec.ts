/**
 * Pairing handshake: the QR carries an encrypted blob; the 6-character code is
 * the key. Opening the link alone must not reveal the repository or token.
 */

import { test, expect } from "@playwright/test";
import { open, setupDevice } from "../helpers";

const payload = {
  v: 1,
  name: "Linked Blog",
  repoUrl: "https://github.com/example/linked",
  pat: "github_pat_pairing_e2e",
};

const CODE = "K7QD3M";

/** Same derivation as `$lib/crypto.deriveKek`: PBKDF2-SHA256, 600k. */
async function makeBlob(): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
    await crypto.subtle.importKey("raw", enc.encode(CODE), "PBKDF2", false, [
      "deriveKey",
    ]),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(JSON.stringify(payload)),
    ),
  );

  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
  return Buffer.from(
    JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) }),
  ).toString("base64url");
}

test.describe("device pairing", () => {
  test("the link needs the code, then prefills the project form", async ({
    page,
  }) => {
    await setupDevice(page);

    const blob = await makeBlob();
    await open(page, `http://localhost:5173/pair#pair=${blob}`);

    await expect(
      page.getByRole("heading", { name: "Link this device" }),
    ).toBeVisible({ timeout: 20_000 });
    // the link alone must not leak the repository or token
    await expect(page.getByText(payload.repoUrl)).toHaveCount(0);
    await expect(page.getByText(payload.pat)).toHaveCount(0);

    await page.getByLabel("Pairing code").fill("AAAAAA");
    await page.getByRole("button", { name: "Link device" }).click();
    await expect(page.getByText("didn't match", { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel("Pairing code").fill("k7q d3m");
    await page.getByRole("button", { name: "Link device" }).click();

    // decrypted on the same page: the create form appears prefilled
    await expect(page.locator('input[type="url"]')).toHaveValue(
      payload.repoUrl,
      { timeout: 20_000 },
    );
    await expect(page.locator("#new-project-token")).toHaveValue(payload.pat);
    await expect(
      page.getByRole("button", { name: "Create & Clone" }),
    ).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");

    // cancelling leaves for the project list
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL("**/projects");
  });
});
