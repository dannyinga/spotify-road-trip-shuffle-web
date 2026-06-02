import { test, expect } from "@playwright/test";

test("home page renders with the app title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Road Trip Shuffle/);
});
