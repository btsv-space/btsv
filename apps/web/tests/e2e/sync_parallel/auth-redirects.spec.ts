import { test, expect } from "@playwright/test";
import { register } from "../helpers";

// Blink-freedom is structural (load-guard redirects + synchronous
// module-scope auth init), so these assert redirect behavior, not frames.
test.describe("auth redirects", () => {
  test("logged-out visit to / redirects to /login and shows the form", async ({
    page,
  }) => {
    await page.goto("http://localhost:5173/");
    await page.waitForURL("**/login", { timeout: 10_000 });
    await expect(page.getByLabel("Username")).toBeVisible();
  });

  test("authed visit to /login redirects away without rendering the form", async ({
    page,
  }) => {
    await register(page);
    await page.goto("http://localhost:5173/login");
    await page.waitForURL((url) => url.pathname !== "/login", {
      timeout: 10_000,
    });
    await expect(page.getByLabel("Username")).toHaveCount(0);
  });
});
