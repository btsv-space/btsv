/**
 * E2E sync test: publishing then deleting a post.
 *
 * Runs in its OWN Playwright project (sequentially, with `fullyParallel: false`)
 * because `ApiAdapter.mergeToMain` force-updates the shared `staging` ref after
 * merging (POST /merges + PATCH ref). If this ran concurrently with the other
 * deletion tests, the force-PATCH would rewind their just-pushed staging
 * commits and make their `waitForFileExists`/`waitForFileDeleted` assertions
 * fail — even in an otherwise-correct solo run.
 */

import { test } from "@playwright/test";
import {
  register,
  createProject,
  newPost,
  deletePost,
  waitForFileExists,
  waitForFileDeleted,
  logGithubActivity,
  urlParts,
} from "../helpers";

test.beforeEach(async ({ page }) => {
  logGithubActivity(page);
});

test.describe.configure({ mode: "serial" });

test("DP-1: delete published post: verify gone from staging and main", async ({
  page,
  request,
}) => {
  await register(page);
  await createProject(page);
  await newPost(page);

  const textarea = page.getByRole("textbox", { name: "Content" });
  await textarea.fill("Published post to delete.");
  await page.waitForTimeout(300);

  await page.getByLabel("Title").first().fill("Post to Delete");
  await page.waitForTimeout(300);

  await page
    .locator('label:has-text("Published") button[role="switch"]')
    .click();

  await page.locator("header button.btn-primary").click({ force: true });

  const postUrl = page.url();
  const { postId } = urlParts(postUrl);

  // Preconditions: the publish landed on staging AND the merge reached main.
  await waitForFileExists(request, postId, "staging", 25000, page);
  await waitForFileExists(request, postId, "main", 25000, page);

  await deletePost(page);

  await waitForFileDeleted(request, postId, "staging", 25000, page);
  await waitForFileDeleted(request, postId, "main", 25000, page);
});
