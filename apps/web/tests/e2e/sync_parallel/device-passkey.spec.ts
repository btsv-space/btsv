/**
 * Device passkey (WebAuthn PRF): register from settings, unlock with one tap,
 * and fall back to the passcode when the credential is gone. Uses Chrome's
 * virtual authenticator via CDP, so it needs no real biometric hardware.
 */

import { test, expect, type Page } from "@playwright/test";
import { setupDevice, TEST_PASSCODE } from "../helpers";

async function addVirtualPasskey(page: Page): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        hasPrf: true,
      },
    },
  );
  return authenticatorId;
}

test.describe("device passkey", () => {
  test("register, unlock with it, remove it, fall back to passcode", async ({
    page,
  }) => {
    const authenticatorId = await addVirtualPasskey(page);
    await setupDevice(page);

    // settings → add
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.waitForURL("**/settings");
    await page.getByRole("button", { name: "Add passkey" }).click();
    await expect(
      page.getByRole("button", { name: "Remove passkey" }),
    ).toBeVisible({ timeout: 20_000 });

    // the record now carries both wraps
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("btsv:deviceLock") ?? "{}"),
    );
    expect(record.v).toBe(2);
    expect(record.passcode?.type).toBe("passcode");
    expect(record.passkey?.rpId).toBe("localhost");

    // lock → wake with the passkey
    await page.getByRole("button", { name: "Lock now" }).click();
    await page.getByRole("button", { name: "Unlock with passkey" }).click();
    await expect(
      page.getByRole("button", { name: "Open settings" }),
    ).toBeVisible({ timeout: 20_000 });

    // cold start → same
    await page.reload();
    await page.getByRole("button", { name: "Unlock with passkey" }).click();
    await expect(
      page.getByRole("button", { name: "Open settings" }),
    ).toBeVisible({ timeout: 20_000 });

    // delete the credential behind the app's back → passcode fallback
    const cdp = await page.context().newCDPSession(page);
    const { credentials } = await cdp.send("WebAuthn.getCredentials", {
      authenticatorId,
    });
    await cdp.send("WebAuthn.removeCredential", {
      authenticatorId,
      credentialId: credentials[0].credentialId,
    });

    await page.getByRole("button", { name: "Open settings" }).click();
    await page.waitForURL("**/settings");
    await page.getByRole("button", { name: "Remove passkey" }).click();
    await expect(
      page.getByRole("button", { name: "Add passkey" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Lock now" }).click();
    await expect(
      page.getByRole("button", { name: "Unlock with passkey" }),
    ).toHaveCount(0);
    await page.getByLabel("Passcode", { exact: true }).fill(TEST_PASSCODE);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Open settings" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
