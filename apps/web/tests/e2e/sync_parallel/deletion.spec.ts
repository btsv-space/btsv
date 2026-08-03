/**
 * E2E sync tests: deletion flow.
 *
 * Verifies that post deletion works correctly across various
 * scenarios — basic deletion, offline deletion, slow push,
 * isolation, and published post deletion.
 */

import { test, expect } from "@playwright/test";
import {
  register,
  createProject,
  newPost,
  back,
  save,
  deletePost,
  waitForFileDeleted,
  waitForFileExists,
  fileExistsOnRemote,
  setupGithubControl,
  logGithubActivity,
  urlParts,
} from "../helpers";

test.beforeEach(async ({ page }) => {
  logGithubActivity(page);
});

test.describe("deletion flow", () => {
  test("DL-1: basic deletion: create → save → delete → verify gone from remote", async ({
    page,
    request,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill("Post to be deleted.");
    await page.waitForTimeout(300);
    await save(page);

    const postUrl = page.url();
    const { postId } = urlParts(postUrl);

    // Precondition: the save actually landed on the remote before deleting.
    await waitForFileExists(request, postId, "staging", 25000, page);

    await deletePost(page);
    await waitForFileDeleted(request, postId, "staging", 25000, page);
  });

  test("DL-2: deletion without save: create → type → delete (no save)", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill("Unsaved post to delete.");
    await page.waitForTimeout(300);

    await deletePost(page);
  });

  test("DL-3: deletion with no connectivity: create → save → block → delete → unblock → wait", async ({
    page,
    request,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill("Post for offline deletion test.");
    await page.waitForTimeout(300);
    await save(page);

    const postUrl = page.url();
    const { postId } = urlParts(postUrl);

    // Precondition: the save landed before going offline.
    await waitForFileExists(request, postId, "staging", 25000, page);

    const gh = setupGithubControl(page);
    gh.block();

    await deletePost(page);

    // While blocked, the deletion must NOT have leaked to the remote.
    expect(await fileExistsOnRemote(request, postId, "staging")).toBe(true);

    gh.normal();
    await page.waitForTimeout(1000);

    // The retry trigger (not the fire-and-forget push) is what's under test here.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await waitForFileDeleted(request, postId, "staging", 25000, page);
  });

  test("DL-4: deletion with slow push: create → save → slow → delete → wait", async ({
    page,
    request,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill("Post for slow push deletion.");
    await page.waitForTimeout(300);
    await save(page);

    const postUrl = page.url();
    const { postId } = urlParts(postUrl);

    // Precondition: the save landed before the slow window.
    await waitForFileExists(request, postId, "staging", 25000, page);

    const gh = setupGithubControl(page);
    gh.slow(5000);

    await deletePost(page);

    // The 5s-per-request delay means the deletion has not landed yet.
    expect(await fileExistsOnRemote(request, postId, "staging")).toBe(true);

    gh.normal();
    await page.waitForTimeout(1000);

    // The retry trigger (not the fire-and-forget push) is what's under test here.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await waitForFileDeleted(request, postId, "staging", 25000, page);
  });

  test("DL-5: re-enter deleted post while deletion push is still pending → redirect, not resurrection", async ({
    page,
    request,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill("Post for immediate re-enter test.");
    await page.waitForTimeout(300);
    await save(page);

    const postUrl = page.url();
    const { postId } = urlParts(postUrl);

    // Precondition: the save landed before going offline.
    await waitForFileExists(request, postId, "staging", 25000, page);

    // Block GitHub so the fire-and-forget deletion push stays pending, keeping
    // the post marked `deleted: true` in IDB while we re-enter the editor.
    const gh = setupGithubControl(page);
    gh.block();

    await deletePost(page);

    // Re-enter while the deletion is pending. The editor must NOT open the
    // pending-deletion post; it must redirect back to the project root.
    await page.goto(postUrl);
    await page.waitForURL(
      (url) => url.pathname.split("/").filter(Boolean).length === 1,
      { timeout: 15_000 },
    );

    // Unblock and flush so the pending deletion finally lands on the remote.
    gh.normal();
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await waitForFileDeleted(request, postId, "staging", 25000, page);
  });

  test("DL-6: delete one of two posts: isolation", async ({
    page,
    request,
  }) => {
    await register(page);
    await createProject(page);

    await newPost(page);
    const textarea1 = page.getByRole("textbox", { name: "Content" });
    await textarea1.fill("First post — should survive.");
    await page.waitForTimeout(300);
    await save(page);
    const post1Url = page.url();
    const { postId: post1Id } = urlParts(post1Url);
    await waitForFileExists(request, post1Id, "staging", 25000, page);
    await back(page);

    await newPost(page);
    const textarea2 = page.getByRole("textbox", { name: "Content" });
    await textarea2.fill("Second post — to be deleted.");
    await page.waitForTimeout(300);
    await save(page);
    const post2Url = page.url();
    const { postId: post2Id } = urlParts(post2Url);
    await waitForFileExists(request, post2Id, "staging", 25000, page);

    await deletePost(page);
    await waitForFileDeleted(request, post2Id, "staging", 25000, page);

    // Sibling post must still be present remotely (isolation).
    expect(await fileExistsOnRemote(request, post1Id, "staging")).toBe(true);

    await page.goto(post1Url);
    await expect(page.getByRole("textbox", { name: "Content" })).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await page.getByRole("textbox", { name: "Content" }).inputValue(),
    ).toContain("First post — should survive.");
  });

  test("DL-7: delete a post then create a new one — the deletion and new-post pushes don't interfere", async ({
    page,
    request,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill("Post to delete before creating another.");
    await page.getByLabel("Title").first().fill("Post One");
    await page.waitForTimeout(300);
    await save(page);

    const post1Url = page.url();
    const { postId: post1Id } = urlParts(post1Url);
    await waitForFileExists(request, post1Id, "staging", 25000, page);

    await deletePost(page);
    await waitForFileDeleted(request, post1Id, "staging", 25000, page);

    await newPost(page);
    const newTextarea = page.getByRole("textbox", { name: "Content" });
    await newTextarea.fill("New post after deletion.");
    await page.getByLabel("Title").first().fill("Post Two");
    await page.waitForTimeout(300);
    await save(page);

    const post2Url = page.url();
    const { postId: post2Id } = urlParts(post2Url);
    await waitForFileExists(request, post2Id, "staging", 25000, page);

    await back(page);

    // UI: the new post is present in the list; the deleted one is gone.
    await expect(page.getByText("Post Two")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Post One")).toHaveCount(0);

    // Remote: both pushes completed without interfering.
    expect(await fileExistsOnRemote(request, post1Id, "staging")).toBe(false);
    expect(await fileExistsOnRemote(request, post2Id, "staging")).toBe(true);
  });
});
