import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";

/**
 * Supabase client for use in Client Components (browser).
 * Reads only the public, browser-safe env vars.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
