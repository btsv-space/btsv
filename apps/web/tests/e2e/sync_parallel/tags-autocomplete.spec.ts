/**
 * E2E: tags autocomplete in the post editor.
 *
 * The Tags field suggests existing project tags (IDB by_tag index) in a
 * combobox listbox: typing ≥1 character shows substring matches (no
 * match-all on focus), Enter accepts with a trailing separator,
 * already-added tags are excluded, and unknown text offers a "Create"
 * row.
 *
 * The fixture repo already contains tagged posts, so the seeded tags use
 * an "e2e" prefix no fixture tag contains — assertions stay exact.
 */

import { test, expect } from "@playwright/test";
import { register, createProject, newPost, back } from "../helpers";

test.describe("tags autocomplete", () => {
  test("TA-1: suggest → filter → accept → exclude → create", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);

    // Post 1: seed two tags into the project (debounced saver → IDB).
    await newPost(page);
    const tagsInput = page.getByLabel("Tags (comma-separated)");
    await tagsInput.fill("e2ealpha, e2ebeta");
    await page.waitForTimeout(300);
    await back(page);

    // Post 2: the autocomplete surface under test.
    await newPost(page);
    const input = page.getByLabel("Tags (comma-separated)");
    await input.click();

    // No match-all: an empty segment shows no popup.
    const listbox = page.getByRole("listbox");
    const options = listbox.getByRole("option");
    await expect(input).toBeFocused();
    await expect(listbox).toBeHidden();

    // Substring match lists both seeded tags, plus the create row.
    await input.pressSequentially("e2e");
    await expect(options).toHaveText(["e2ealpha", "e2ebeta", 'Create "e2e"']);

    // Refining to "e2ea" leaves only "e2ealpha".
    await input.pressSequentially("a");
    await expect(options).toHaveText(["e2ealpha", 'Create "e2ea"']);

    // Enter accepts the active option: segment replaced, trailing ", ",
    // popup closes (empty segment again).
    await input.press("Enter");
    await expect(input).toHaveValue("e2ealpha, ");
    await expect(listbox).toBeHidden();

    // The accepted tag is excluded from further suggestions — typing
    // "e2ea" again (which would match "e2ealpha") leaves the create row.
    await input.pressSequentially("e2ea");
    await expect(options).toHaveText(['Create "e2ea"']);

    // Unknown text → create row commits it. Via click this time: the
    // input must keep focus (mousedown preventDefault, not pointerdown —
    // iOS Safari breaks both focus and list scroll otherwise).
    for (let i = 0; i < 4; i++) await input.press("Backspace");
    await input.pressSequentially("zq");
    await expect(options).toHaveText(['Create "zq"']);
    await listbox.getByRole("option", { name: 'Create "zq"' }).click();
    await expect(input).toHaveValue("e2ealpha, zq, ");
    await expect(input).toBeFocused();

    // Escape closes the popup.
    await input.pressSequentially("x");
    await input.press("Escape");
    await expect(listbox).toBeHidden();
  });
});
