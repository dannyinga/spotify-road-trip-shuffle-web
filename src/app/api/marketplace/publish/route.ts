import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSpotifyAccessToken } from "@/lib/spotify";
import { Json } from "@/types/database";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { playlistId, name, description, tags } = body;

    if (!playlistId || !name) {
      return NextResponse.json(
        { error: "Missing required fields: playlistId, name" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Refresh Spotify token and fetch tracks from Spotify
    const accessToken = await getSpotifyAccessToken(user.id, supabase);
    
    let fetchUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(uri,name,duration_ms,album(name),artists(name)))`;
    const tracks: Array<{
      uri: string;
      title: string;
      artist: string;
      album: string;
      duration_ms: number;
    }> = [];

    while (fetchUrl) {
      const spotifyResponse: Response = await fetch(fetchUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!spotifyResponse.ok) {
        const errorBody = await spotifyResponse.text();
        console.error("Failed to fetch playlist tracks from Spotify:", spotifyResponse.status, errorBody);
        return NextResponse.json(
          { error: `Failed to fetch tracks from Spotify: ${spotifyResponse.statusText}` },
          { status: spotifyResponse.status }
        );
      }

      const spotifyData = (await spotifyResponse.json()) as {
        items: Array<{
          track?: {
            uri?: string;
            name?: string;
            duration_ms?: number;
            album?: { name?: string };
            artists?: Array<{ name: string }>;
          };
        }>;
        next: string | null;
      };
      for (const item of spotifyData.items) {
        if (!item.track || !item.track.uri) {
          continue;
        }
        tracks.push({
          uri: item.track.uri,
          title: item.track.name || "Unknown Track",
          artist: item.track.artists?.map((a: { name: string }) => a.name).join(", ") || "Unknown Artist",
          album: item.track.album?.name || "Unknown Album",
          duration_ms: item.track.duration_ms || 0,
        });
      }

      fetchUrl = spotifyData.next;
    }

    if (tracks.length === 0) {
      return NextResponse.json(
        { error: "This playlist contains no valid tracks." },
        { status: 400 }
      );
    }

    const spotifyPlaylistUrl = `https://open.spotify.com/playlist/${playlistId}`;
    const creatorName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Anonymous";
    const creatorAvatarUrl = user.user_metadata?.avatar_url || null;

    // 3. Insert into marketplace_playlists
    const { data, error } = await supabase
      .from("marketplace_playlists")
      .insert({
        user_id: user.id,
        name,
        description: description || null,
        tags: tags || [],
        tracks: tracks as Json,
        spotify_playlist_url: spotifyPlaylistUrl,
        creator_name: creatorName,
        creator_avatar_url: creatorAvatarUrl,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to publish playlist to marketplace:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, playlist: data });
  } catch (error) {
    console.error("Error in POST /api/marketplace/publish:", error);
    const errorMessage = error instanceof Error ? error.message : "Publish failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
