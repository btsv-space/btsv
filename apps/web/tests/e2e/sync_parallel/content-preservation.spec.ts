/**
 * E2E sync tests: content preservation.
 *
 * Verifies that user content is never lost across editor lifecycle
 * operations — typing, saving, navigating back, re-entering, and
 * various content mutations.
 */

import { test, expect } from "@playwright/test";
import {
  register,
  createProject,
  newPost,
  back,
  save,
  getBody,
} from "../helpers";

test.describe("content preservation", () => {
  test("CP-1: basic round-trip: type → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "The quick brown fox jumps over the lazy dog.";
    await textarea.fill(text);
    await page.waitForTimeout(300);
    await save(page);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("CP-2: onDestroy flush: type → back (no save button) → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Text without explicit save — onDestroy should flush.";
    await textarea.fill(text);
    await page.waitForTimeout(300);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("CP-3: two rounds: edit → save → back → re-enter → edit → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const postUrl = page.url();

    const text1 = "Round 1: first version of the text.";
    await textarea.fill(text1);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1);

    const text2 = "Round 2: second version with more content added.";
    await textarea.fill(text2);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text2);
  });

  test("CP-4: rapid re-entry: enter → back × 3 → type → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);
    const postUrl = page.url();

    for (let i = 0; i < 2; i++) {
      await back(page);
      await page.goto(postUrl);
      await expect(page.getByRole("textbox", { name: "Content" })).toBeVisible({
        timeout: 15_000,
      });
      await page.waitForTimeout(500);
    }

    const text = "Text after rapid re-entry.";
    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill(text);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("CP-5: mount race: type immediately on mount — not clobbered by pull", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Typed during the pull — should not be clobbered.";
    await textarea.fill(text);
    await page.waitForTimeout(3000);
    expect(await getBody(page)).toBe(text);

    await save(page);
    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("CP-6: flush-then-save: type → back → re-enter → type more → save", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text1 = "First edit — no save, just back.";
    await textarea.fill(text1);
    await page.waitForTimeout(300);
    const postUrl = page.url();
    await back(page);

    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1);

    const text2 = " Second edit — with save.";
    await textarea.fill(text1 + text2);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);

    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1 + text2);
  });

  test("CP-7: immediate back before debounce: type → back instantly → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Typed and immediately backed — no debounce, no save button.";
    await textarea.fill(text);
    const postUrl = page.url();
    await back(page);

    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("CP-8: save button spam: click save 5 times rapidly", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = "Content with save button spam.";
    await textarea.fill(text);
    await page.waitForTimeout(300);

    for (let i = 0; i < 5; i++) {
      await page.locator("header button.btn-primary").click();
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(3000);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("CP-9: content replacement: select-all → delete → type new content", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const textA = "First version of content that will be completely replaced.";
    await textarea.fill(textA);
    await page.waitForTimeout(300);
    await save(page);
    const postUrl = page.url();

    const textB =
      "Completely different content that replaced the first version.";
    await textarea.fill(textB);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textB);
    expect(await getBody(page)).not.toBe(textA);
  });

  test("CP-10: special characters: markdown, code blocks, unicode, emojis", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text = [
      "# Heading",
      "",
      "Some **bold** and *italic* text.",
      "",
      "```js",
      "const x = () => console.log('hello 🌍');",
      "```",
      "",
      "Unicode: café, naïve, 日本語, emoji 🚀🎉",
      "",
      "Mixed \"quotes\" and 'apostrophes' and {brackets}.",
    ].join("\n");

    await textarea.fill(text);
    await page.waitForTimeout(300);
    await save(page);
    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text);
  });

  test("CP-11: empty body: clear all text → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    await textarea.fill("Some initial content.");
    await page.waitForTimeout(300);
    await save(page);

    await textarea.fill("");
    await page.waitForTimeout(300);
    await save(page);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe("");
  });

  test("CP-12: very long content (5KB+) → save → back → re-enter", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const paragraph =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";
    const longText = paragraph.repeat(50);
    await textarea.fill(longText);
    await page.waitForTimeout(500);
    await save(page);

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(longText);
  });

  test("CP-13: rapid type-save cycles: type → save × 5", async ({ page }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    let accumulated = "";

    for (let i = 0; i < 5; i++) {
      accumulated += `Word${i} `;
      await textarea.fill(accumulated);
      await page.waitForTimeout(100);
      await page.locator("header button.btn-primary").click();
      await page.waitForTimeout(500);
    }

    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(accumulated);
  });

  test("CP-14: full revert chain: type → push → back → re-enter → stale IDB → push stale", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });

    const textA = "Content A: the original committed text.";
    await textarea.fill(textA);
    await page.waitForTimeout(300);
    await save(page);
    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textA);

    const textB = textA + " Content B: additional text that was committed.";
    await textarea.fill(textB);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textB);

    const textC = textB + " Content C: the latest edit.";
    await textarea.fill(textC);
    await page.waitForTimeout(300);
    await save(page);
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(textC);
  });

  test("CP-15: mount race with IDB tracing — verifies IDB state at each step", async ({
    page,
  }) => {
    await register(page);
    await createProject(page);
    await newPost(page);

    const textarea = page.getByRole("textbox", { name: "Content" });
    const text1 = "Version 1: The quick brown fox jumps over the lazy dog.";
    await textarea.fill(text1);
    await page.waitForTimeout(300);

    const idbAfterDebounce = await page.evaluate(async () => {
      return new Promise<{ body: string; dirty: number } | null>((resolve) => {
        const req = indexedDB.open("btsv");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("posts", "readonly");
          const store = tx.objectStore("posts");
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const posts = allReq.result;
            const lastPost = posts[posts.length - 1];
            if (!lastPost) {
              resolve(null);
              return;
            }
            resolve({
              body: lastPost.body ?? "",
              dirty: lastPost.dirty,
            });
          };
          allReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    });
    console.log(
      `[trace] IDB after debounce: body="${idbAfterDebounce?.body?.slice(0, 50)}..." dirty=${idbAfterDebounce?.dirty}`,
    );

    await save(page);
    const postUrl = page.url();
    await back(page);
    await page.goto(postUrl);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await getBody(page)).toBe(text1);
  });
});
