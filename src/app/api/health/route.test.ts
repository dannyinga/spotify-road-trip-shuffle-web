import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/**
 * Unit test for the /api/health route handler.
 *
 * post-deploy-health.yml curls this endpoint after a push to `prd`. If the
 * response shape ever drifts (someone drops `status: ok` or reshapes the
 * JSON), the curl gate would still see 200 and stay green — but anything
 * keyed on the body breaks silently. These tests assert on body shape, not
 * just the status code.
 *
 * Imported via the relative `./route` path on purpose: vitest.config.ts does
 * not register the `@/` alias, so `@/app/api/health/route` would not resolve.
 */
describe("/api/health route handler", () => {
  let originalVercelEnv: string | undefined;
  let originalVercelSha: string | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T10:00:00.000Z"));
    originalVercelEnv = process.env.VERCEL_ENV;
    originalVercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    if (originalVercelSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = originalVercelSha;
  });

  it("returns 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns JSON content type", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("body.status is 'ok'", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("body.timestamp is an ISO-8601 UTC string", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.timestamp).toBe("2026-06-03T10:00:00.000Z");
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });

  it("body.env reflects VERCEL_ENV when set", async () => {
    process.env.VERCEL_ENV = "production";
    const res = await GET();
    const body = await res.json();
    expect(body.env).toBe("production");
  });

  it("body.env falls back to 'local' when VERCEL_ENV is unset", async () => {
    delete process.env.VERCEL_ENV;
    const res = await GET();
    const body = await res.json();
    expect(body.env).toBe("local");
  });

  it("body.commit reflects VERCEL_GIT_COMMIT_SHA when set", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123def456";
    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBe("abc123def456");
  });

  it("body.commit is null when VERCEL_GIT_COMMIT_SHA is unset", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBeNull();
  });
});
