import { expect, type Page } from "@playwright/test";

export const TEST_REPO_URL = process.env.TEST_REPO_URL!;
export const TEST_GIT_TOKEN = process.env.TEST_GIT_TOKEN!;

export async function register(page: Page) {
  await page.goto("http://localhost:5173/login");
  await page.getByRole("button", { name: "Register" }).click();
  const u = `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel("Username").fill(u);
  await page.getByLabel("Password").fill("testpassword123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/projects", { timeout: 10_000 });
}

export async function createProject(page: Page): Promise<string> {
  await page.goto("http://localhost:5173/projects?new=true");
  await page.getByLabel("Repo URL").fill(TEST_REPO_URL);
  await page.locator("input[type='password']").first().fill(TEST_GIT_TOKEN);
  await page.getByRole("button", { name: "Create & Clone" }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.split("/").filter(Boolean).length === 1 &&
      url.pathname !== "/projects",
    { timeout: 120_000 },
  );
  const projectId = new URL(page.url()).pathname.split("/").filter(Boolean)[0];
  await expect(page.locator("text=Cloning repository")).toBeHidden({
    timeout: 60_000,
  });
  await expect(
    page.locator(".card, [role='button'], [role='link']").first(),
  ).toBeVisible({ timeout: 30_000 });
  return projectId;
}

export async function newPost(page: Page): Promise<string> {
  const dashed = page.locator(".card.border-dashed").first();
  if (await dashed.isVisible().catch(() => false)) {
    await dashed.click();
  } else {
    await page.locator("button:has-text('New Post')").last().click({
      force: true,
    });
  }
  await page.waitForURL(
    (url) => url.pathname.split("/").filter(Boolean).length === 2,
    { timeout: 15_000 },
  );
  await expect(page.getByRole("textbox", { name: "Content" })).toBeVisible({
    timeout: 15_000,
  });
  return page.url();
}

export async function openExistingPost(page: Page, index = 0): Promise<string> {
  const cards = page.locator(
    ".card.cursor-pointer, [role='button'], [role='link']",
  );
  const card = cards.nth(index);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
  await page.waitForURL(
    (url) => url.pathname.split("/").filter(Boolean).length === 2,
    { timeout: 15_000 },
  );
  await expect(page.getByRole("textbox", { name: "Content" })).toBeVisible({
    timeout: 15_000,
  });
  return page.url();
}

export async function back(page: Page) {
  await page.getByRole("button", { name: "Back to posts" }).click();
  await page.waitForURL(
    (url) => url.pathname.split("/").filter(Boolean).length === 1,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(2000);
}

export async function save(page: Page) {
  await page.locator("header button.btn-primary").click();
  await page.waitForTimeout(3000);
}

export async function getBody(page: Page): Promise<string> {
  return page.getByRole("textbox", { name: "Content" }).inputValue();
}

export function urlParts(url: string): { projectId: string; postId: string } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return { projectId: parts[0], postId: parts[1] };
}

export function setupGithubControl(page: Page) {
  let mode:
    | { type: "normal" }
    | { type: "blocked" }
    | { type: "slow"; ms: number } = { type: "normal" };
  page.route("https://api.github.com/**", async (route) => {
    if (mode.type === "blocked") {
      await route.abort("failed");
      return;
    }
    if (mode.type === "slow") {
      await new Promise((r) => setTimeout(r, mode.ms));
    }
    await route.continue();
  });
  return {
    block: () => {
      mode = { type: "blocked" };
    },
    slow: (ms: number) => {
      mode = { type: "slow", ms };
    },
    normal: () => {
      mode = { type: "normal" };
    },
  };
}
