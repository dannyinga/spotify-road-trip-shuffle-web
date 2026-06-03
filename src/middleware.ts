import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // If the request lands with a PKCE code but not on the auth callback,
  // redirect it to the callback endpoint so the server exchanges the code
  // and stores Spotify tokens.
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.pathname.startsWith("/auth/callback")) {
    const callbackUrl = new URL("/auth/callback", request.url);
    callbackUrl.search = request.nextUrl.search;
    return NextResponse.redirect(callbackUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and image optimization files.
     */
    "/((?!_next/static|_next/image|favicon.ico|_next/webpack-hmr|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
