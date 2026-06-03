import { test, expect } from "@playwright/test";

/**
 * Smoke spec — customer-critical journeys that must hold against a real
 * deployed environment (no localhost-only fixtures, no DB setup, no auth).
 *
 *   @smoke — run by QA Gate 3 (release/* → prd) and by the deploy-* post-deploy
 *            validation jobs against the deployed URL. Failure is a release
 *            blocker. The full (untagged) sweep also runs post-deploy.
 */

test(
  "home page renders with the app title",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Road Trip Shuffle/);
  },
);

test(
  "/api/health returns status=ok with deploy metadata",
  { tag: "@smoke" },
  async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Body shape is asserted in full by src/app/api/health/route.test.ts; this
    // duplicates only status as an end-to-end sanity check on the deployed
    // artifact.
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("env");
  },
);
