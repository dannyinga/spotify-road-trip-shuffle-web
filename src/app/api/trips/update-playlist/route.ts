import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tripId, playlistId, playlistName, trackCount, weight } = body;

    if (!tripId) {
      return NextResponse.json({ error: "tripId is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Update membership columns
    const updateData: {
      spotify_playlist_id: string | null;
      spotify_playlist_name: string | null;
      spotify_playlist_track_count?: number | null;
      weight?: number;
    } = {
      spotify_playlist_id: playlistId || null,
      spotify_playlist_name: playlistName || null,
    };

    if (typeof trackCount === "number") {
      updateData.spotify_playlist_track_count = trackCount;
    } else if (!playlistId) {
      updateData.spotify_playlist_track_count = null;
    }

    if (typeof weight === "number") {
      if (weight < 1 || weight > 10) {
        return NextResponse.json({ error: "Weight must be between 1 and 10" }, { status: 400 });
      }
      updateData.weight = weight;
    }

    const { error: updateError } = await supabase
      .from("road_trip_members")
      .update(updateData)
      .eq("trip_id", tripId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/trips/update-playlist:", error);
    return NextResponse.json({ error: "Failed to update playlist contribution" }, { status: 500 });
  }
}
