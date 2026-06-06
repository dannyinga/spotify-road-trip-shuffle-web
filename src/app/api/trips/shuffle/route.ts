import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSpotifyAccessToken,
  getSpotifyUserProfile,
  getPlaylistTracks,
  createPlaylist,
  addTracksToPlaylist,
} from "@/lib/spotify";
import { roadTripShuffle } from "@/lib/shuffle/road-trip-shuffle";
import { poolTracksByWeight } from "@/lib/shuffle/pool-tracks";

const MAX_TOTAL_TRACKS = 500;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tripId, seed, outputName } = body;

    if (!tripId || typeof seed !== "number" || !outputName) {
      return NextResponse.json(
        { error: "Missing required fields: tripId, seed, outputName" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify user is host of the trip
    const { data: trip, error: tripError } = await supabase
      .from("road_trips")
      .select("*")
      .eq("id", tripId)
      .eq("host_id", user.id)
      .maybeSingle();

    if (tripError) {
      return NextResponse.json({ error: tripError.message }, { status: 500 });
    }

    if (!trip) {
      return NextResponse.json(
        { error: "Access Denied: Only the trip host can execute a group shuffle." },
        { status: 403 }
      );
    }

    // 3. Fetch all trip members with contributed playlists
    const { data: members, error: membersError } = await supabase
      .from("road_trip_members")
      .select("user_id, spotify_playlist_id, spotify_playlist_name, weight")
      .eq("trip_id", tripId)
      .not("spotify_playlist_id", "is", null);

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    const activeMembers = members || [];
    if (activeMembers.length === 0) {
      return NextResponse.json(
        { error: "No trip members have connected a Spotify playlist yet." },
        { status: 400 }
      );
    }

    // 4. Fetch tracks for all members (using Admin Client to bypass RLS for other members' tokens)
    const memberGroups = [];

    for (const member of activeMembers) {
      try {
        // Fetch and refresh member's Spotify access token using service role bypass
        const token = await getSpotifyAccessToken(member.user_id, adminClient);
        const tracks = await getPlaylistTracks(token, member.spotify_playlist_id!);

        if (tracks.length > 0) {
          memberGroups.push({ weight: member.weight, tracks });
        }
      } catch (err) {
        console.error("Failed to load tracks for member:", member.user_id, err);
        // Continue loading other members' tracks rather than crashing entirely
      }
    }

    if (memberGroups.length === 0) {
      return NextResponse.json(
        { error: "No valid tracks could be retrieved from any member's playlist." },
        { status: 400 }
      );
    }

    // 5. Pool tracks proportionally by weight when over the cap; otherwise
    // include every track. (Pure logic lives in poolTracksByWeight.)
    const pooledTracks = poolTracksByWeight(memberGroups, MAX_TOTAL_TRACKS);

    // Deduplicate the pooled tracks globally to prevent duplicate songs in generated playlist
    const seenUris = new Set<string>();
    const uniquePooledTracks = pooledTracks.filter((track) => {
      if (!track.uri || seenUris.has(track.uri)) {
        return false;
      }
      seenUris.add(track.uri);
      return true;
    });

    if (uniquePooledTracks.length === 0) {
      return NextResponse.json(
        { error: "Failed to assemble pooled track list (no unique tracks found)." },
        { status: 400 }
      );
    }

    // 6. Run shuffle algorithm
    const shuffleResult = roadTripShuffle(uniquePooledTracks, { seed });

    // 7. Create output playlist on host's Spotify account
    const hostToken = await getSpotifyAccessToken(user.id, adminClient);
    const hostProfile = await getSpotifyUserProfile(hostToken);
    const newPlaylist = await createPlaylist(hostToken, hostProfile.id, outputName);

    // 8. Write tracks back in chunks of 100
    const trackUris = shuffleResult.tracks.map((t) => t.uri);
    await addTracksToPlaylist(hostToken, newPlaylist.id, trackUris);

    // 9. Save group recipe to database (linked to trip_id)
    const { error: dbError } = await supabase
      .from("shuffle_recipes")
      .insert({
        user_id: user.id,
        name: outputName,
        source_playlist_id: "GROUP_SHUFFLE",
        output_playlist_id: newPlaylist.id,
        seed: seed,
        trip_id: tripId,
      });

    if (dbError) {
      console.error("Failed to save group shuffle recipe to database:", dbError);
    }

    return NextResponse.json({
      success: true,
      playlistId: newPlaylist.id,
      playlistUrl: newPlaylist.external_urls.spotify,
      tracksCount: trackUris.length,
    });
  } catch (error) {
    console.error("Error in POST /api/trips/shuffle:", error);
    const errorMessage = error instanceof Error ? error.message : "Group shuffle failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
