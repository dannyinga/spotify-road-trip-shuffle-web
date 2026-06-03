import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config.
 *
 * Local / pre-merge gates (qa-staging, qa-production): PLAYWRIGHT_BASE_URL is
 * unset, so `webServer` boots `npm run dev` and tests hit it. Run under Doppler
 * so the spawned dev server inherits Supabase env vars:
 *   doppler run -- npm run test:e2e
 *
 * Post-deploy validation (deploy-staging / deploy-production): PLAYWRIGHT_BASE_URL
 * points at the deployed Vercel URL, so `webServer` is skipped and tests run
 * against the real deployed artifact.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

// When running against a protected Vercel preview (e.g. the stg deployment),
// send the automation bypass header so navigations get past Deployment
// Protection. Unset for local runs — undefined leaves headers untouched.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    extraHTTPHeaders: bypass
      ? {
          "x-vercel-protection-bypass": bypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
