import { NextResponse } from "next/server";

/**
 * Liveness / deploy-metadata endpoint.
 *
 * Curled by post-deploy-health.yml after every push to `prd` (alongside the
 * home page) for a sub-5-minute fail signal, and hit by the @smoke e2e suite.
 * The body shape is asserted by route.test.ts so external uptime monitoring
 * keyed on it can't silently break behind a still-200 response.
 *
 * `force-dynamic` keeps `timestamp` honest — without it Next would statically
 * render this at build time and serve a frozen timestamp.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
