import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSpotifyAccessToken,
  getSpotifyUserProfile,
  getUserPlaylists,
  getPlaylistTracks,
  createPlaylist,
  addTracksToPlaylist,
} from "@/lib/spotify";

/**
 * Unit tests for the Spotify Web API helpers. `fetch` is stubbed globally and
 * `getSpotifyAccessToken` is given a hand-rolled fake Supabase client, so these
 * exercise the real token-refresh / pagination / chunking logic without any
 * network or database. Imported via the `@/` alias (registered in
 * vitest.config.ts) so the import path matches the app's.
 */

/** Minimal Response-like object for the bits the helpers actually read. */
function res(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Queue responses; each fetch call shifts the next one off the queue. */
function queueFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Fake Supabase client supporting the select/update chains spotify.ts uses. */
function fakeSupabase(opts: {
  token?: { access_token: string; refresh_token: string; expires_at: string } | null;
  onUpdate?: (vals: Record<string, unknown>) => void;
}) {
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({
                  data: opts.token ?? null,
                  error: opts.token ? null : { message: "no rows" },
                }),
              };
            },
          };
        },
        update(vals: Record<string, unknown>) {
          opts.onUpdate?.(vals);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  // The function only needs structural compatibility for the test.
  return client as unknown as Parameters<typeof getSpotifyAccessToken>[1];
}

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getSpotifyAccessToken", () => {
  it("returns the stored token without refreshing when it is still valid", async () => {
    const fetchFn = queueFetch();
    const supabase = fakeSupabase({
      token: { access_token: "valid-token", refresh_token: "r", expires_at: future() },
    });

    const token = await getSpotifyAccessToken("user-1", supabase);

    expect(token).toBe("valid-token");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws a clear error when the user has no stored credentials", async () => {
    const supabase = fakeSupabase({ token: null });
    await expect(getSpotifyAccessToken("user-1", supabase)).rejects.toThrow(
      /No Spotify credentials/,
    );
  });

  describe("when the token is expired", () => {
    beforeEach(() => {
      process.env.SPOTIFY_CLIENT_ID = "client-id";
      process.env.SPOTIFY_CLIENT_SECRET = "client-secret";
    });
    afterEach(() => {
      delete process.env.SPOTIFY_CLIENT_ID;
      delete process.env.SPOTIFY_CLIENT_SECRET;
    });

    it("refreshes against Spotify and persists the new token", async () => {
      queueFetch(
        res({ access_token: "new-token", refresh_token: "new-refresh", expires_in: 3600 }),
      );
      const updates: Record<string, unknown>[] = [];
      const supabase = fakeSupabase({
        token: { access_token: "old", refresh_token: "old-refresh", expires_at: past() },
        onUpdate: (v) => updates.push(v),
      });

      const token = await getSpotifyAccessToken("user-1", supabase);

      expect(token).toBe("new-token");
      expect(updates).toHaveLength(1);
      expect(updates[0].access_token).toBe("new-token");
      expect(updates[0].refresh_token).toBe("new-refresh");
    });

    it("keeps the existing refresh token when Spotify omits a new one", async () => {
      queueFetch(res({ access_token: "new-token", expires_in: 3600 }));
      const updates: Record<string, unknown>[] = [];
      const supabase = fakeSupabase({
        token: { access_token: "old", refresh_token: "keep-me", expires_at: past() },
        onUpdate: (v) => updates.push(v),
      });

      await getSpotifyAccessToken("user-1", supabase);

      expect(updates[0].refresh_token).toBe("keep-me");
    });

    it("throws when the refresh request fails", async () => {
      queueFetch(res({ error: "invalid_grant" }, { ok: false, status: 400 }));
      const supabase = fakeSupabase({
        token: { access_token: "old", refresh_token: "r", expires_at: past() },
      });

      await expect(getSpotifyAccessToken("user-1", supabase)).rejects.toThrow(
        /Failed to refresh Spotify token/,
      );
    });

    it("throws when client credentials are not configured", async () => {
      delete process.env.SPOTIFY_CLIENT_ID;
      const supabase = fakeSupabase({
        token: { access_token: "old", refresh_token: "r", expires_at: past() },
      });

      await expect(getSpotifyAccessToken("user-1", supabase)).rejects.toThrow(
        /client credentials are not configured/,
      );
    });
  });
});

describe("getSpotifyUserProfile", () => {
  it("returns the profile JSON on success", async () => {
    queueFetch(res({ id: "spotify-id", display_name: "Danny" }));
    const profile = await getSpotifyUserProfile("token");
    expect(profile.id).toBe("spotify-id");
    expect(profile.display_name).toBe("Danny");
  });

  it("throws on a non-OK response", async () => {
    queueFetch(res({}, { ok: false, status: 401 }));
    await expect(getSpotifyUserProfile("token")).rejects.toThrow(
      /Failed to fetch Spotify user profile/,
    );
  });
});

describe("getUserPlaylists", () => {
  it("returns the items array", async () => {
    queueFetch(res({ items: [{ id: "p1" }, { id: "p2" }] }));
    const playlists = await getUserPlaylists("token");
    expect(playlists.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("getPlaylistTracks", () => {
  it("follows pagination via `next` until exhausted", async () => {
    queueFetch(
      res({
        items: [trackItem("t1", "alb1", 1, 1)],
        next: "https://api.spotify.com/v1/playlists/x/tracks?offset=100",
      }),
      res({ items: [trackItem("t2", "alb1", 1, 2)], next: null }),
    );

    const tracks = await getPlaylistTracks("token", "playlist-1");

    expect(tracks.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("skips items missing a track, track id, or album id", async () => {
    queueFetch(
      res({
        items: [
          trackItem("good", "alb1", 1, 1),
          { track: null },
          { track: { id: "no-album", uri: "spotify:track:no-album" } },
          { track: { uri: "x", album: { id: "alb2" } } }, // missing track id
        ],
        next: null,
      }),
    );

    const tracks = await getPlaylistTracks("token", "playlist-1");

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe("good");
  });

  it("maps Spotify fields onto the shuffle track shape", async () => {
    queueFetch(res({ items: [trackItem("t1", "alb1", 2, 5)], next: null }));
    const [track] = await getPlaylistTracks("token", "playlist-1");
    expect(track).toEqual({
      id: "t1",
      uri: "spotify:track:t1",
      albumId: "alb1",
      discNumber: 2,
      trackNumber: 5,
    });
  });
});

describe("createPlaylist", () => {
  it("returns the new playlist id and url", async () => {
    queueFetch(res({ id: "new-pl", external_urls: { spotify: "https://open.spotify.com/x" } }));
    const pl = await createPlaylist("token", "spotify-user", "My Mix");
    expect(pl.id).toBe("new-pl");
    expect(pl.external_urls.spotify).toContain("open.spotify.com");
  });
});

describe("addTracksToPlaylist", () => {
  it("adds tracks in chunks of 100", async () => {
    const fetchFn = queueFetch(res({}), res({}), res({}));
    const uris = Array.from({ length: 250 }, (_, i) => `spotify:track:${i}`);

    await addTracksToPlaylist("token", "playlist-1", uris);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    const chunkSizes = fetchFn.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).uris.length,
    );
    expect(chunkSizes).toEqual([100, 100, 50]);
  });

  it("makes no request for an empty track list", async () => {
    const fetchFn = queueFetch();
    await addTracksToPlaylist("token", "playlist-1", []);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws if a chunk fails to add", async () => {
    queueFetch(res({}, { ok: false, status: 500 }));
    await expect(
      addTracksToPlaylist("token", "playlist-1", ["spotify:track:1"]),
    ).rejects.toThrow(/Failed to add tracks/);
  });
});

/** Build a Spotify playlist-tracks API item. */
function trackItem(id: string, albumId: string, disc: number, trackNo: number) {
  return {
    track: {
      id,
      uri: `spotify:track:${id}`,
      album: { id: albumId },
      disc_number: disc,
      track_number: trackNo,
    },
  };
}
