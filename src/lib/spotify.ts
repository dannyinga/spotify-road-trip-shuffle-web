import { createClient } from "@/lib/supabase/server";

export interface SpotifyTokenData {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string;
  email?: string;
  images?: { url: string; height?: number; width?: number }[];
}

/**
 * Gets a valid Spotify access token for the logged-in user.
 * If the current token is expired or expires in less than 5 minutes,
 * it refreshes the token against the Spotify API, updates the database,
 * and returns the new token.
 */
export async function getSpotifyAccessToken(userId: string): Promise<string> {
  const supabase = await createClient();

  // Retrieve tokens from the database. RLS guarantees we only see the current user's tokens if using the user's client,
  // but filtering by user_id ensures we fetch the correct record.
  const { data: tokenData, error } = await supabase
    .from("spotify_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !tokenData) {
    throw new Error("No Spotify credentials found. Please log in again with Spotify.");
  }

  const { access_token, refresh_token, expires_at } = tokenData;

  // Check if token expires within the next 5 minutes
  const bufferTime = 5 * 60 * 1000;
  const isExpired = new Date(expires_at).getTime() - bufferTime < Date.now();

  if (!isExpired) {
    return access_token;
  }

  console.log(`Spotify token for user ${userId} has expired or is expiring soon. Refreshing...`);

  // Refresh token flow
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify client credentials are not configured in environment variables.");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh_token,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Failed to refresh Spotify token: Status", response.status, errorBody);
    throw new Error(`Failed to refresh Spotify token: ${response.statusText}`);
  }

  const data = await response.json();
  
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token || refresh_token; // Keep old refresh token if new one is not returned
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Save the new tokens back to the database
  const { error: updateError } = await supabase
    .from("spotify_tokens")
    .update({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    console.error("Failed to update refreshed Spotify token in database:", updateError);
  }

  return newAccessToken;
}

/**
 * Fetches the user profile from Spotify.
 */
export async function getSpotifyUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Failed to fetch Spotify user profile: Status", response.status, errorBody);
    throw new Error(`Failed to fetch Spotify user profile: ${response.statusText}`);
  }

  return response.json();
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  images?: { url: string }[];
  tracks: { total: number };
}

export interface SpotifyShuffleTrack {
  id: string;
  uri: string;
  albumId: string;
  discNumber: number;
  trackNumber: number;
}

/**
 * Fetches user's Spotify playlists.
 */
export async function getUserPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const response = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Failed to fetch playlists: Status", response.status, errorBody);
    throw new Error(`Failed to fetch playlists: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items;
}

/**
 * Fetches all tracks of a playlist, resolving pagination.
 */
export async function getPlaylistTracks(
  accessToken: string,
  playlistId: string
): Promise<SpotifyShuffleTrack[]> {
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  const tracks: SpotifyShuffleTrack[] = [];

  while (url) {
    const currentUrl: string = url;
    const response = await fetch(currentUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Failed to fetch playlist tracks: Status", response.status, errorBody);
      throw new Error(`Failed to fetch playlist tracks: ${response.statusText}`);
    }

    const data = await response.json();
    for (const item of data.items) {
      if (!item.track || !item.track.id || !item.track.album?.id) {
        continue;
      }
      tracks.push({
        id: item.track.id,
        uri: item.track.uri,
        albumId: item.track.album.id,
        discNumber: item.track.disc_number,
        trackNumber: item.track.track_number,
      });
    }

    url = data.next;
  }

  return tracks;
}

/**
 * Creates a new private playlist on the user's Spotify account.
 */
export async function createPlaylist(
  accessToken: string,
  spotifyUserId: string,
  name: string
): Promise<{ id: string; external_urls: { spotify: string } }> {
  const response = await fetch(`https://api.spotify.com/v1/users/${spotifyUserId}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description: "Generated by Road Trip Shuffle.",
      public: false,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Failed to create playlist: Status", response.status, errorBody);
    throw new Error(`Failed to create playlist: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Adds tracks to a playlist in chunks of 100.
 */
export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[]
): Promise<void> {
  for (let i = 0; i < trackUris.length; i += 100) {
    const chunk = trackUris.slice(i, i + 100);
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: chunk,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Failed to add tracks to playlist chunk (index", i, "): Status", response.status, errorBody);
      throw new Error(`Failed to add tracks to playlist chunk: ${response.statusText}`);
    }
  }
}
