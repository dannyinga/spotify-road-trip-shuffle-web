import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/types/database";

/**
 * Supabase client for use in Client Components (browser).
 * Reads only the public, browser-safe env vars.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fallback to placeholder credentials during server-side static build prerendering
  if (!url || !anonKey) {
    if (typeof window === "undefined") {
      return createBrowserClient<Database>(
        "https://placeholder.supabase.co",
        "placeholder"
      );
    }
  }

  return createBrowserClient<Database>(url!, anonKey!);
}
