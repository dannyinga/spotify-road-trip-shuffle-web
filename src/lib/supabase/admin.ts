import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

/**
2:  * Supabase client initialized with the SERVICE_ROLE key.
3:  * This client BYPASSES Row-Level Security (RLS).
4:  * ONLY use this on the server side (API routes) when necessary to execute actions
5:  * on behalf of other users (such as fetching passengers' Spotify tokens during a group shuffle).
6:  */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
