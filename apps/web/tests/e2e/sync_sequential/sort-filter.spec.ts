import { expect, test, type Page } from "@playwright/test";
import { register, createProject } from "../helpers";

/**
 * Sort & filter UI for the posts list, tested against the designed baseline
 * fixture (TEST_BASELINE_SHA). The fixture is exactly 5 posts with distinct
 * dates across all three date fields and deliberate draft/page shapes:
 *
 * | title   | created    | updated    | published  | draft | page |
 * |---------|------------|------------|------------|-------|------|
 * | Alpha   | 2025-01-10 | 2025-03-01 | 2025-01-12 | no    | no   |
 * | Beta    | 2025-02-05 | 2025-02-20 | —          | yes   | no   |  (never published)
 * | Gamma   | 2025-03-15 | 2025-04-10 | 2025-03-16 | no    | yes  |
 * | Epsilon | 2025-05-20 | 2025-06-15 | 2025-05-22 | no    | no   |
 * | Zeta    | 2025-06-10 | 2025-07-01 | 2025-06-12 | yes   | no   |  (once-published draft)
 *
 * All five fit on one page (POSTS_PAGE_SIZE=15), so absolute order
 * assertions are stable. There is deliberately NO draft page, so
 * drafts+pages is the guaranteed-empty filter combo.
 *
 * This spec lives in sync_sequential (workers=1) because its assertions are
 * absolute: parallel specs create and push their own posts to the shared
 * repo, which would interleave into the list. These tests never create
 * posts, so the fixture is the entire list while they run.
 *
 * The options popover is the only sort/filter UI on all viewports; tests
 * open it via the "View options" trigger before touching the controls, and
 * Escape-close it before clicking anything in the page body (the popover's
 * transparent backdrop intercepts body clicks).
 */

const CARD_TITLES = ".card.cursor-pointer h3";

const CREATED_DESC = ["Zeta", "Epsilon", "Gamma", "Beta", "Alpha"];

async function cardTitles(page: Page): Promise<string[]> {
  return page.locator(CARD_TITLES).allTextContents();
}

/** Polls until the card list equals exactly `expected` (order-sensitive). */
async function expectCardOrder(page: Page, expected: string[]): Promise<void> {
  await expect
    .poll(async () => await cardTitles(page), { timeout: 15_000 })
    .toEqual(expected);
}

async function openOptions(page: Page): Promise<void> {
  await page.getByRole("button", { name: "View options" }).click();
}

/** The direction toggle's accessible name reflects current state. */
function sortDirection(page: Page) {
  return page.getByRole("button", { name: /Sort direction/ });
}

test.describe("posts list sort & filter", () => {
  test("SF-1: sort field + direction", async ({ page }) => {
    await register(page);
    await createProject(page);
    await openOptions(page);

    // default: created desc
    await expectCardOrder(page, CREATED_DESC);

    // direction toggle → created asc
    await sortDirection(page).click();
    await expectCardOrder(page, ["Alpha", "Beta", "Gamma", "Epsilon", "Zeta"]);

    // field → updated; direction persists (asc)
    await page.getByLabel("Sort posts").selectOption("dateUpdated");
    await expectCardOrder(page, ["Beta", "Alpha", "Gamma", "Epsilon", "Zeta"]);

    // toggle → updated desc
    await sortDirection(page).click();
    await expectCardOrder(page, ["Zeta", "Epsilon", "Gamma", "Alpha", "Beta"]);
  });

  test("SF-2: filters, empty state, and clear filters", async ({ page }) => {
    await register(page);
    await createProject(page);
    await openOptions(page);

    await page.getByLabel("Filter by status").selectOption("drafts");
    await expectCardOrder(page, ["Zeta", "Beta"]);

    await page.getByLabel("Filter by status").selectOption("published");
    await expectCardOrder(page, ["Epsilon", "Gamma", "Alpha"]);

    await page.getByLabel("Filter by type").selectOption("pages");
    await expectCardOrder(page, ["Gamma"]);

    // drafts + pages: guaranteed empty (fixture has no draft page)
    await page.getByLabel("Filter by status").selectOption("drafts");
    await expect(
      page.getByText("No posts match the current filters."),
    ).toBeVisible({ timeout: 10_000 });

    // clear filters → full fixture list again (Escape first: the popover
    // backdrop intercepts body clicks)
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expectCardOrder(page, CREATED_DESC);
  });

  test("SF-3: list prefs persist across reload", async ({ page }) => {
    await register(page);
    await createProject(page);
    await openOptions(page);

    await page.getByLabel("Filter by status").selectOption("drafts");
    await expectCardOrder(page, ["Zeta", "Beta"]);

    await page.reload();
    // reload re-validates the project (unknown → cloning → ready, involving
    // a real pull); the toolbar only renders in the ready branch
    const trigger = page.getByRole("button", { name: "View options" });
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    await trigger.click();

    // the select itself restores the stored value
    await expect(page.getByLabel("Filter by status")).toHaveValue("drafts");

    // filter still applied after reload
    await expectCardOrder(page, ["Zeta", "Beta"]);
  });

  test("SF-4: published-sort semantics for drafts", async ({ page }) => {
    await register(page);
    await createProject(page);
    await openOptions(page);

    // published desc: Beta (never published) is absent; Zeta (once-published
    // draft) is present via its retained datePublished
    await page.getByLabel("Sort posts").selectOption("datePublished");
    await expectCardOrder(page, ["Zeta", "Epsilon", "Gamma", "Alpha"]);

    await sortDirection(page).click();
    await expectCardOrder(page, ["Alpha", "Gamma", "Epsilon", "Zeta"]);

    // published sort + drafts filter: only once-published drafts remain
    await page.getByLabel("Filter by status").selectOption("drafts");
    await expectCardOrder(page, ["Zeta"]);
  });

  test("SF-5: Use default resets non-default prefs", async ({ page }) => {
    await register(page);
    await createProject(page);
    await openOptions(page);

    // no button while prefs are default
    const useDefault = page.getByRole("button", { name: "Use default" });
    await expect(useDefault).not.toBeVisible();

    await page.getByLabel("Sort posts").selectOption("dateUpdated");
    await page.getByLabel("Filter by status").selectOption("drafts");
    await expectCardOrder(page, ["Zeta", "Beta"]);
    await expect(useDefault).toBeVisible();

    await useDefault.click();
    await expectCardOrder(page, CREATED_DESC);
    await expect(useDefault).not.toBeVisible();
    await expect(page.getByLabel("Sort posts")).toHaveValue("dateCreated");
    await expect(page.getByLabel("Filter by status")).toHaveValue("all");
  });
});
