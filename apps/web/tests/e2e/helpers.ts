import { expect, type Page, type APIRequestContext } from "@playwright/test";

export const TEST_REPO_URL = process.env.TEST_REPO_URL!;
export const TEST_GIT_TOKEN = process.env.TEST_GIT_TOKEN!;
export const TEST_BASELINE_SHA = process.env.TEST_BASELINE_SHA!;

export const TEST_PASSCODE = "testpasscode123";

/** First run on a fresh context: set the device passcode. */
export async function setupDevice(page: Page) {
  await page.goto("http://localhost:5173/projects");

  const setPasscode = page.getByRole("button", { name: "Set passcode" });
  await setPasscode.waitFor({ state: "visible", timeout: 20_000 });
  await page.getByLabel("Passcode", { exact: true }).fill(TEST_PASSCODE);
  await page.getByLabel("Confirm passcode").fill(TEST_PASSCODE);
  await setPasscode.click();

  // the header only renders once the device is unlocked — a positive signal,
  // unlike waiting for the gate to disappear (which can pass before the app
  // has even mounted)
  await page
    .getByRole("button", { name: "Open settings" })
    .waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * The device DEK only lives in memory, so any full page load lands on the
 * unlock gate. Every navigation/reload below has to go through this.
 */
export async function unlock(page: Page) {
  const button = page.getByRole("button", { name: "Unlock" });
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await page.getByLabel("Passcode", { exact: true }).fill(TEST_PASSCODE);
  await button.click();
  await page
    .getByRole("button", { name: "Open settings" })
    .waitFor({ state: "visible", timeout: 20_000 });
}

export async function open(page: Page, url: string) {
  await page.goto(url);
  await unlock(page);
}

export async function reload(page: Page) {
  await page.reload();
  await unlock(page);
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

// REVISIT IF: flakes persist → add retries in playwright.config.ts;
// if SyncIndicator's labels change, update the regex below.
async function waitForSyncSettled(page: Page, timeout = 8_000) {
  await expect(page.getByRole("status").first())
    .toHaveAttribute("aria-label", /^(Synced|Sync failed|Offline)$/, {
      timeout,
    })
    .catch(() => {});
}

export async function back(page: Page) {
  await page.getByRole("button", { name: "Back to posts" }).click();
  await page.waitForURL(
    (url) => url.pathname.split("/").filter(Boolean).length === 1,
    { timeout: 15_000 },
  );
  await waitForSyncSettled(page);
}

export async function save(page: Page) {
  await page.locator("header button.btn-primary").click();
  await waitForSyncSettled(page);
}

export async function getBody(page: Page): Promise<string> {
  return page.getByRole("textbox", { name: "Content" }).inputValue();
}

export function urlParts(url: string): { projectId: string; postId: string } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return { projectId: parts[0], postId: parts[1] };
}

export async function deletePost(page: Page) {
  await page.locator("button.btn-destructive").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(
    (url) => url.pathname.split("/").filter(Boolean).length === 1,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(2000);
}

export async function fileExistsOnRemote(
  request: APIRequestContext,
  postId: string,
  branch = "staging",
): Promise<boolean> {
  const repoPath = TEST_REPO_URL.replace("https://github.com/", "");
  const url = `https://api.github.com/repos/${repoPath}/contents/src/content/posts/${postId}.mdx?ref=${branch}`;
  const res = await request.get(url, {
    headers: { Authorization: `Bearer ${TEST_GIT_TOKEN}` },
  });
  return res.ok();
}

async function waitForFileState(
  request: APIRequestContext,
  postId: string,
  shouldExist: boolean,
  branch: string,
  timeoutMs: number,
  page?: Page,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const exists = await fileExistsOnRemote(request, postId, branch);
      if (exists === shouldExist) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    // First timeout: fire the sync retry trigger and try once more.
    if (attempt === 0 && page) {
      console.log(
        `[retry] waitForFileState: first attempt timed out after ${timeoutMs}ms for post ${postId} (${shouldExist ? "expect exists" : "expect deleted"} on ${branch}), dispatching online event for retry`,
      );
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      continue;
    }
  }
  throw new Error(
    `file ${shouldExist ? "does not exist" : "still exists"} on remote (${branch}) after ${timeoutMs * 2}ms for post ${postId}`,
  );
}

export async function waitForRemoteContent(
  request: APIRequestContext,
  postId: string,
  needle: string,
  branch = "staging",
  timeoutMs = 30000,
): Promise<void> {
  const repoPath = TEST_REPO_URL.replace("https://github.com/", "");
  const url = `https://api.github.com/repos/${repoPath}/contents/src/content/posts/${postId}.mdx?ref=${branch}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(url, {
      headers: { Authorization: `Bearer ${TEST_GIT_TOKEN}` },
    });
    if (res.ok()) {
      const { content } = await res.json();
      const text = Buffer.from(content ?? "", "base64").toString("utf8");
      if (text.includes(needle)) return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `remote file ${postId} never contained "${needle}" after ${timeoutMs}ms`,
  );
}

export function waitForFileDeleted(
  request: APIRequestContext,
  postId: string,
  branch = "staging",
  timeoutMs = 25000,
  page?: Page,
): Promise<void> {
  return waitForFileState(request, postId, false, branch, timeoutMs, page);
}

export function waitForFileExists(
  request: APIRequestContext,
  postId: string,
  branch = "staging",
  timeoutMs = 25000,
  page?: Page,
): Promise<void> {
  return waitForFileState(request, postId, true, branch, timeoutMs, page);
}

export function logGithubActivity(page: Page) {
  page.on("response", async (res) => {
    if (res.url().includes("api.github.com")) {
      const path = res.url().split("api.github.com")[1]?.split("?")[0];
      console.log(`[github] ${res.status()} ${res.request().method()} ${path}`);
    }
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("api.github.com")) {
      const path = req.url().split("api.github.com")[1]?.split("?")[0];
      console.log(
        `[github-failed] ${req.method()} ${path} — ${req.failure()?.errorText}`,
      );
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[browser-error] ${msg.text()}`);
    }
  });
}

export function setupGithubControl(page: Page) {
  let mode:
    | { type: "normal" }
    | { type: "blocked" }
    | { type: "slow"; ms: number } = { type: "normal" };
  page.route("https://api.github.com/**", async (route) => {
    const m = mode;
    if (m.type === "blocked") {
      await route.abort("failed");
      return;
    }
    if (m.type === "slow") {
      await new Promise((r) => setTimeout(r, m.ms));
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
