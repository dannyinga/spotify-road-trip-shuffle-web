import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSpotifyAccessToken,
  getSpotifyUserProfile,
  createPlaylist,
  addTracksToPlaylist,
} from "@/lib/spotify";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { playlistId } = body;

    if (!playlistId) {
      return NextResponse.json({ error: "Missing required field: playlistId" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the marketplace playlist
    const { data: marketplacePlaylist, error: dbError } = await supabase
      .from("marketplace_playlists")
      .select("*")
      .eq("id", playlistId)
      .maybeSingle();

    if (dbError || !marketplacePlaylist) {
      return NextResponse.json(
        { error: dbError?.message || "Marketplace playlist not found." },
        { status: 404 }
      );
    }

    // 3. Get Spotify credentials for current user
    const accessToken = await getSpotifyAccessToken(user.id);
    const spotifyProfile = await getSpotifyUserProfile(accessToken);

    // 4. Create new private playlist on caller's Spotify account
    const outputName = `${marketplacePlaylist.name} (Cloned)`;
    const newPlaylist = await createPlaylist(
      accessToken,
      spotifyProfile.id,
      outputName
    );

    // 5. Parse track URIs and add to Spotify playlist in chunks of 100
    const tracksArray = marketplacePlaylist.tracks as Array<{ uri: string }>;
    if (!tracksArray || tracksArray.length === 0) {
      return NextResponse.json(
        { error: "The marketplace playlist contains no tracks." },
        { status: 400 }
      );
    }

    const trackUris = tracksArray.map((t) => t.uri);
    await addTracksToPlaylist(accessToken, newPlaylist.id, trackUris);

    // 6. Save recipe to database for history tracking (linking back to the source)
    const { error: recipeError } = await supabase
      .from("shuffle_recipes")
      .insert({
        user_id: user.id,
        name: outputName,
        source_playlist_id: "MARKETPLACE_CLONE",
        output_playlist_id: newPlaylist.id,
        seed: 0, // No seed needed since it is a direct clone of shuffled track list
      });

    if (recipeError) {
      console.error("Failed to save cloned shuffle recipe to database:", recipeError);
    }

    return NextResponse.json({
      success: true,
      playlistId: newPlaylist.id,
      playlistUrl: newPlaylist.external_urls.spotify,
      tracksCount: trackUris.length,
    });
  } catch (error) {
    console.error("Error in POST /api/marketplace/clone:", error);
    const errorMessage = error instanceof Error ? error.message : "Clone failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
