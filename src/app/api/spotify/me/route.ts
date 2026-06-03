import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSpotifyAccessToken, getSpotifyUserProfile } from "@/lib/spotify";

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Retrieve the authenticated user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get a valid access token (refreshes if expired)
    const accessToken = await getSpotifyAccessToken(user.id);

    // Fetch user profile from Spotify
    const profile = await getSpotifyUserProfile(accessToken);

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Error in /api/spotify/me:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch Spotify profile";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
