/**
 * E2E sync tests: network resilience.
 *
 * Verifies that content is never lost when the GitHub API is slow,
 * unavailable, or intermittent.
 */

import { test, expect } from "@playwright/test";
import {
  register,
  createProject,
  newPost,
  back,
  save,
  getBody,
  setupGithubControl,
} from "../helpers";

test.describe("network resilience", () => {
  test("NR-1: no connectivity during push — content stays in IDB, pushes on reconnect", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Text saved while offline — should persist in IDB.";
    await textarea.fill(text);
    await page.waitForTimeout(300);

    github.block();
    await page.locator("header button.btn-primary").click();
    await page.waitForTimeout(3000);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);

    github.normal();
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("NR-2: no connectivity during pull — editor loads from IDB cache", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Content saved while online.";
    await textarea.fill(text);
    await page.waitForTimeout(300);
    await save(page);
    const postUrl = page.url();
    await back(page);

    github.block();
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);

    const text2 = " More content added while offline.";
    await textarea.fill(text + text2);
    await page.waitForTimeout(300);

    github.normal();
  });

  test("NR-3: slow push (5s) — back during push, content preserved", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Content with a slow push — back before push completes.";
    await textarea.fill(text);
    await page.waitForTimeout(300);

    github.slow(5000);
    await page.locator("header button.btn-primary").click();
    await page.waitForTimeout(500);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);

    github.normal();
    await page.waitForTimeout(6000);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("NR-4: slow pull (5s) — type during pull, mount race fix prevents clobber", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text1 = "Initial content saved while fast.";
    await textarea.fill(text1);
    await page.waitForTimeout(300);
    await save(page);
    const postUrl = page.url();
    await back(page);

    github.slow(5000);
    await page.goto(postUrl);
    const text2 = " Typed during slow pull — should not be clobbered.";
    await textarea.fill(text1 + text2);
    await page.waitForTimeout(8000);
    expect(await getBody(page)).toBe(text1 + text2);

    github.normal();
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1 + text2);
  });

  test("NR-5: intermittent connectivity — multiple rounds with failures", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const postUrl = page.url();

    const text1 = "Round 1: online save.";
    await textarea.fill(text1);
    await page.waitForTimeout(300);
    await save(page);
    expect(await getBody(page)).toBe(text1);

    github.block();
    const text2 = " Round 2: offline edit.";
    await textarea.fill(text1 + text2);
    await page.waitForTimeout(300);
    await page.locator("header button.btn-primary").click();
    await page.waitForTimeout(3000);

    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1 + text2);

    github.normal();
    const text3 = " Round 3: back online.";
    await textarea.fill(text1 + text2 + text3);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1 + text2 + text3);
  });

  test("NR-6: offline session: type → back → re-enter → type more → online → save", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text1 = "Online content.";
    await textarea.fill(text1);
    await page.waitForTimeout(300);
    await save(page);
    const postUrl = page.url();
    await back(page);

    github.block();
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1);

    const text2 = " Offline content added.";
    await textarea.fill(text1 + text2);
    await page.waitForTimeout(300);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1 + text2);

    github.normal();
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1 + text2);
  });

  test("NR-7: slow push (10s) → type more during push → back → re-enter", async ({
    page,
  }) => {
    const github = setupGithubControl(page);
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text1 = "First text that will be slowly pushed.";
    await textarea.fill(text1);
    await page.waitForTimeout(300);

    github.slow(10000);
    await page.locator("header button.btn-primary").click();
    await page.waitForTimeout(500);

    const text2 = " Second text typed while push is in flight.";
    await textarea.click();
    await page.keyboard.type(text2);
    await page.waitForTimeout(1000);

    const postUrl = page.url();
    await back(page);
    github.normal();
    await page.waitForTimeout(12000);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1 + text2);
  });
});
