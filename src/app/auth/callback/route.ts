import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Redirect location after successful login, defaulting to home page
  const next = searchParams.get("next") ?? "/";

  // Create the redirect response object first so we can attach cookies directly to it
  const response = NextResponse.redirect(`${origin}${next}`);

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
                response.cookies.set(name, value, options);
              });
            } catch (err) {
              console.error("Error setting cookies during exchange:", err);
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.session) {
      const { provider_token, provider_refresh_token, user } = data.session;
      
      if (provider_token && provider_refresh_token) {
        // Spotify tokens usually expire in 3600 seconds (1 hour)
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
        
        const { error: dbError } = await supabase
          .from("spotify_tokens")
          .upsert(
            {
              user_id: user.id,
              access_token: provider_token,
              refresh_token: provider_refresh_token,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id",
            }
          );
          
        if (dbError) {
          console.error("Error saving Spotify tokens to database:", dbError);
        }
      } else {
        console.warn("Spotify OAuth session did not include provider_token or provider_refresh_token.");
      }
      
      return response;
    } else if (error) {
      console.error("Error exchanging code for session:", error);
    }
  }

  // Redirect to home page with error parameter if authentication fails
  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
