/**
 * E2E sync tests: sync interactions.
 *
 * Verifies content preservation across specific sync scenarios:
 * existing posts, title/slug editing, publish toggle, metadata-only
 * edits, long-running sequences, and multi-post isolation.
 */

import { test, expect } from "@playwright/test";
import {
  register,
  createProject,
  newPost,
  openExistingPost,
  back,
  save,
  getBody,
  setupGithubControl,
} from "../helpers";

test.describe("sync interactions", () => {
  test("SI-1: existing post: edit → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);

    const postUrl = await openExistingPost(page, 0);
    const originalBody = await getBody(page);

    const appended = " [EDITED VIA E2E]";
    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill(originalBody + appended);
    await page.waitForTimeout(300);
    await save(page);

    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(originalBody + appended);
  });

  test("SI-2: title editing: change title → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const body = "Body text that should survive title changes.";
    await textarea.fill(body);
    await page.waitForTimeout(300);

    const titleInput = page.locator("input[placeholder='Title']").first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill("Test Title for Slug Check");
    } else {
      await page.getByLabel("Title").first().fill("Test Title for Slug Check");
    }
    await page.waitForTimeout(500);
    await save(page);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(body);
  });

  test("SI-3: back during pull: onDestroy push vs in-flight pull", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Content typed before hitting back during a slow pull.";
    await textarea.fill(text);
    await page.waitForTimeout(300);

    github.slow(5000);
    const postUrl = page.url();
    await back(page);

    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill(text + " More text.");
    await page.waitForTimeout(200);
    await back(page);

    github.normal();
    await page.waitForTimeout(6000);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text + " More text.");
  });

  test("SI-4: metadata-only edit: change tags without body → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const body = "Body that should NOT change when only tags are edited.";
    await textarea.fill(body);
    await page.waitForTimeout(300);
    await save(page);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    const tagsInput = page.getByLabel("Tags (comma-separated)");
    if (await tagsInput.isVisible().catch(() => false)) {
      await tagsInput.fill("tag1, tag2, tag3");
    }
    await page.waitForTimeout(300);
    await save(page);

    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(body);
  });

  test("SI-5: publish toggle: draft → published → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const body = "Content that should survive publishing.";
    await textarea.fill(body);
    await page.waitForTimeout(300);

    await page.getByLabel("Title").first().fill("Post to Publish");
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const labels = document.querySelectorAll("label");
      for (const label of labels) {
        if (label.textContent?.includes("Published")) {
          const btn = label.querySelector('button[role="switch"]');
          if (btn) (btn as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(500);

    await page.locator("header button.btn-primary").click({ force: true });
    await page.waitForTimeout(3000);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(body);
  });

  test("SI-6: 10 rapid back-and-forth cycles with no typing — no corruption", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Base content for rapid cycling.";
    await textarea.fill(text);
    await page.waitForTimeout(300);
    await save(page);
    const postUrl = page.url();

    for (let i = 0; i < 10; i++) {
      await back(page);
      await page.goto(postUrl);
      await expect(textarea).toBeVisible({ timeout: 15_000 });
    }
    expect(await getBody(page)).toBe(text);
  });

  test("SI-7: long-running sequence: 5 rounds of edit → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const postUrl = page.url();
    let accumulated = "";

    for (let i = 1; i <= 5; i++) {
      accumulated += `Round ${i}: edit number ${i}. `;
      await textarea.fill(accumulated);
      await page.waitForTimeout(300);
      await save(page);
      await back(page);
      await page.goto(postUrl);
      await expect(textarea).toBeVisible({ timeout: 15_000 });
      expect(await getBody(page)).toBe(accumulated);
    }
  });

  test("SI-8: multi-post isolation: editing post A doesn't affect post B", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);

    const textarea = page.getByRole("textbox", { name: "Content" });

    await newPost(page);
    const postUrlA = page.url();
    const textA = "Content of post A.";
    await textarea.fill(textA);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);

    await newPost(page);
    const postUrlB = page.url();
    const textB = "Content of post B — completely different.";
    await textarea.fill(textB);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);

    await page.goto(postUrlA);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textA);

    await page.goto(postUrlB);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textB);

    await page.goto(postUrlA);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill(textA + " Appended to A.");
    await page.waitForTimeout(300);
    await save(page);
    await back(page);

    await page.goto(postUrlB);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textB);

    await page.goto(postUrlA);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textA + " Appended to A.");
  });

  test("SI-9: 3-post isolation: edit each independently, verify isolation", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);

    const urls: string[] = [];
    const texts: string[] = [];
    for (let i = 0; i < 3; i++) {
      await newPost(page);
      const url = page.url();
      const text = `Content of post ${i}: unique text ${i}.`;
      await page.getByRole("textbox", { name: "Content" }).fill(text);
      await page.waitForTimeout(300);
      await save(page);
      await back(page);
      urls.push(url);
      texts.push(text);
    }

    for (let i = 0; i < 3; i++) {
      await page.goto(urls[i]);
      await expect(page.getByRole("textbox", { name: "Content" })).toBeVisible({
        timeout: 15_000,
      });
      expect(await getBody(page)).toBe(texts[i]);
    }

    await page.goto(urls[1]);
    await expect(page.getByRole("textbox", { name: "Content" })).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole("textbox", { name: "Content" })
      .fill(texts[1] + " [EDITED]");
    await page.waitForTimeout(300);
    await save(page);
    await back(page);

    await page.goto(urls[0]);
    expect(await getBody(page)).toBe(texts[0]);

    await page.goto(urls[1]);
    expect(await getBody(page)).toBe(texts[1] + " [EDITED]");

    await page.goto(urls[2]);
    expect(await getBody(page)).toBe(texts[2]);
  });
});
