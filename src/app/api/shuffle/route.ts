import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSpotifyAccessToken,
  getSpotifyUserProfile,
  getPlaylistTracks,
  createPlaylist,
  addTracksToPlaylist,
} from "@/lib/spotify";
import { roadTripShuffle } from "@/lib/shuffle/road-trip-shuffle";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourcePlaylistId, seed, outputName } = body;

    if (!sourcePlaylistId || typeof seed !== "number" || !outputName) {
      return NextResponse.json(
        { error: "Missing required fields: sourcePlaylistId, seed, outputName" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get Spotify tokens and user info
    const accessToken = await getSpotifyAccessToken(user.id);
    const spotifyProfile = await getSpotifyUserProfile(accessToken);

    // 3. Fetch playlist tracks
    const playlistTracks = await getPlaylistTracks(accessToken, sourcePlaylistId);

    if (playlistTracks.length === 0) {
      return NextResponse.json(
        { error: "The source playlist contains no valid tracks." },
        { status: 400 }
      );
    }

    // Deduplicate tracks by URI to ensure no duplicates in generated playlist
    const seenUris = new Set<string>();
    const uniqueTracks = playlistTracks.filter((track) => {
      if (!track.uri || seenUris.has(track.uri)) {
        return false;
      }
      seenUris.add(track.uri);
      return true;
    });

    if (uniqueTracks.length === 0) {
      return NextResponse.json(
        { error: "The source playlist contains no valid unique tracks." },
        { status: 400 }
      );
    }

    // Limit to at most 500 tracks to avoid timeouts in developer mode
    const cappedTracks = uniqueTracks.slice(0, 500);

    // 4. Run shuffle algorithm
    const shuffleResult = roadTripShuffle(cappedTracks, { seed });

    // 5. Create new playlist on Spotify
    const newPlaylist = await createPlaylist(
      accessToken,
      spotifyProfile.id,
      outputName
    );

    // 6. Write back track URIs (handled in chunks of 100)
    const trackUris = shuffleResult.tracks.map((t) => t.uri);
    await addTracksToPlaylist(accessToken, newPlaylist.id, trackUris);

    // 7. Save recipe to database
    const { error: dbError } = await supabase
      .from("shuffle_recipes")
      .insert({
        user_id: user.id,
        name: outputName,
        source_playlist_id: sourcePlaylistId,
        output_playlist_id: newPlaylist.id,
        seed: seed,
      });

    if (dbError) {
      console.error("Failed to save shuffle recipe to database:", dbError);
      // We don't crash here since the Spotify action succeeded, but we log the error.
    }

    return NextResponse.json({
      success: true,
      playlistId: newPlaylist.id,
      playlistUrl: newPlaylist.external_urls.spotify,
      tracksCount: trackUris.length,
    });
  } catch (error) {
    console.error("Error in /api/shuffle:", error);
    const errorMessage = error instanceof Error ? error.message : "Shuffle failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
