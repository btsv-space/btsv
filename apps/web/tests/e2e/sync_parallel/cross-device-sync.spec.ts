/**
 * E2E regression: push must not advance storedRemoteSha (the compare
 * base for pulls). Device B pushes while behind a commit from device A;
 * B's next pull must still fetch A's change. The old code jumped the
 * base to the pushed sha — whose history includes A's unpulled commit —
 * skipping it until a full re-pull (stale dates/content on the pusher).
 *
 * B is kept "offline" (GitHub requests blocked) while drafting so its
 * push happens strictly after A's, without an intervening pull (opening
 * the editor force-pulls, which would otherwise heal B prematurely).
 */

import { test, expect } from "@playwright/test";
import {
  register,
  login,
  createProject,
  newPost,
  back,
  urlParts,
  waitForRemoteContent,
  waitForFileExists,
  setupGithubControl,
} from "../helpers";

test.describe("cross-device sync", () => {
  test("CD-1: pushing while behind does not skip the other device's commit", async ({
    browser,
    request,
  }) => {
    const suffix = Date.now().toString(36);
    const titleA = `CD-A-${suffix}`;
    const titleAEdited = `CD-A-edited-${suffix}`;
    const titleB = `CD-B-${suffix}`;

    // Device A: register, clone, create a post, push it.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const username = await register(pageA);
    const projectId = await createProject(pageA);
    await newPost(pageA);
    await pageA.getByLabel("Title").fill(titleA);
    await pageA.waitForTimeout(300);
    const postAId = urlParts(pageA.url()).postId;
    await back(pageA);
    await waitForRemoteContent(request, postAId, titleA);

    // Device B: same account in a fresh context → full clone; sees A's post.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const controlB = setupGithubControl(pageB);
    await login(pageB, username);
    await pageB.goto(`http://localhost:5173/${projectId}`);
    await expect(pageB.getByText(titleA)).toBeVisible({ timeout: 60_000 });

    // B goes "offline" and drafts its own post (dirty in IDB, unpushed).
    controlB.block();
    await newPost(pageB);
    await pageB.getByLabel("Title").fill(titleB);
    await pageB.waitForTimeout(300);
    const postBId = urlParts(pageB.url()).postId;

    // Meanwhile A edits its post's title and pushes.
    await pageA.locator(".card").filter({ hasText: titleA }).first().click();
    await expect(pageA.getByRole("textbox", { name: "Content" })).toBeVisible({
      timeout: 15_000,
    });
    await pageA.getByLabel("Title").fill(titleAEdited);
    await pageA.waitForTimeout(300);
    await back(pageA);
    await waitForRemoteContent(request, postAId, titleAEdited);

    // B comes back online and pushes (online event = push-only trigger).
    controlB.normal();
    await pageB.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitForFileExists(request, postBId);

    // B returns to the list → mount pull compares from the pre-push base
    // and must fetch A's edit (old code: base jumped past it → stale).
    await back(pageB);
    await expect(pageB.getByText(titleAEdited)).toBeVisible({
      timeout: 30_000,
    });

    await ctxA.close();
    await ctxB.close();
  });
});
