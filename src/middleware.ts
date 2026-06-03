import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
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
