# Architecture

How Road Trip Shuffle fits together: the request flow, the HTTP surface, the
database schema, and the security model. For the deploy/branching machinery see
[pipeline.md](pipeline.md).

## The core idea

`roadTripShuffle` ([src/lib/shuffle/road-trip-shuffle.ts](../src/lib/shuffle/road-trip-shuffle.ts))
is a pure function: group tracks by album, sort each album into CD running order
(disc, then track), shuffle the **album groups** with a seedable PRNG
(mulberry32), then flatten. Same `(input order, seed)` always yields the same
ordering, so a saved recipe can reproduce a mix exactly. Everything else in the
app exists to feed tracks into this function and write the result back to
Spotify.

## Request flow

```
Browser (app/page.tsx, client component)
  │  fetch() to same-origin Route Handlers
  ▼
Route Handlers (app/api/**)         ← hold the Spotify secret; never the browser
  │  Supabase server client (RLS as the user)  +  Spotify Web API
  ▼
Supabase Postgres  ───────────────  Spotify Web API
```

The browser authenticates to Supabase and reads its own rows directly via the
browser client (recipes list, weight updates). Anything that touches the Spotify
secret or another user's tokens goes through a Route Handler.

## Authentication

1. `page.tsx` calls `supabase.auth.signInWithOAuth({ provider: "spotify", ... })`
   with the playlist + profile scopes.
2. Spotify redirects back with a PKCE `code`. [middleware.ts](../src/middleware.ts)
   catches any request carrying a `code` that isn't already on the callback path
   and forwards it to `/auth/callback`.
3. [auth/callback/route.ts](../src/app/auth/callback/route.ts) exchanges the code
   for a session and **upserts the Spotify `provider_token` / `provider_refresh_token`**
   into `spotify_tokens`, keyed by user id.
4. On every subsequent request, [lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts)
   calls `getUser()` to refresh the Supabase session cookie.

Spotify access tokens expire hourly. `getSpotifyAccessToken`
([lib/spotify.ts](../src/lib/spotify.ts)) reads the stored token and, if it is
within 5 minutes of expiry, refreshes it against `accounts.spotify.com`, writes
the new token back, and returns it. It accepts an optional Supabase client so a
group shuffle can use the **admin (service-role)** client to refresh *other*
members' tokens.

## HTTP surface (Route Handlers)

All routes require an authenticated Supabase user unless noted. They return
`{ error }` with a 4xx/5xx status on failure.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness + deploy metadata (`status`, `timestamp`, `env`, `commit`). Used by post-deploy health checks and the @smoke suite. No auth. |
| `GET /api/spotify/me` | The caller's Spotify profile (refreshes token if needed). |
| `GET /api/spotify/playlists` | The caller's Spotify playlists (first 50). |
| `POST /api/shuffle` | **Personal shuffle.** Body: `{ sourcePlaylistId, seed, outputName }`. Reads the source playlist, runs `roadTripShuffle`, creates a new private Spotify playlist, writes the tracks, and saves a recipe row. |
| `GET /api/trips` | The caller's active trip (or `{ trip: null }`), with members joined from `get_road_trip_members`. |
| `POST /api/trips` | Create a trip. Body: `{ name }`. Generates a unique 6-char invite code; a DB trigger adds the creator as `admin`. Rejected if already in a trip. |
| `DELETE /api/trips` | Leave the trip (passenger) or delete it entirely (host/`admin`). |
| `POST /api/trips/join` | Join by code. Body: `{ inviteCode }`. Delegates to the `join_road_trip` RPC. Rejected if already in a trip. |
| `POST /api/trips/update-playlist` | Set the caller's contributed playlist + `weight` (1–10) for a trip. Body: `{ tripId, playlistId, playlistName, trackCount, weight }`. |
| `POST /api/trips/shuffle` | **Group shuffle (host only).** Body: `{ tripId, seed, outputName }`. Pools every member's contributed playlist (weighted, capped at 1000 tracks), runs `roadTripShuffle`, and writes the result to the host's Spotify account. |

### Group-shuffle track pooling

When the combined track count across all contributing members is within the
1000-track cap, every track is included. Above the cap, each member receives a
share proportional to their `weight`:
`floor(1000 × weight / totalWeight)`, never more than the tracks they actually
contributed. This math lives in the pure, unit-tested
[`poolTracksByWeight`](../src/lib/shuffle/pool-tracks.ts) so it can be reasoned
about independently of Spotify and the database. The same formula is mirrored in
`page.tsx` to preview each member's share in the UI.

## Data model

Four tables in `public`, all with Row-Level Security enabled. Types are
generated into [src/types/database.ts](../src/types/database.ts) via
`npm run db:types`.

| Table | Key columns | RLS summary |
| --- | --- | --- |
| `spotify_tokens` | `user_id` (PK), `access_token`, `refresh_token`, `expires_at` | Owner-only (`user_id = auth.uid()`). |
| `shuffle_recipes` | `id`, `user_id`, `name`, `source_playlist_id`, `output_playlist_id`, `seed`, `trip_id?` | Owner can do everything; trip members can additionally **read** recipes linked to their trip. |
| `road_trips` | `id`, `name`, `host_id`, `invite_code` (unique) | Read by host or any member; insert/update/delete by host only. |
| `road_trip_members` | `(trip_id, user_id)` (PK), `role`, `spotify_playlist_id/name/track_count`, `weight` | Read/write by the member themselves or the trip host. |

### Database functions (`SECURITY DEFINER` unless noted)

- `handle_new_road_trip()` — trigger that inserts the host as an `admin` member
  when a trip is created.
- `join_road_trip(invite_code)` — looks up the trip by code and inserts the
  caller as a `passenger` (idempotent via `ON CONFLICT DO NOTHING`).
- `get_road_trip_members(p_trip_id)` — returns members joined with their
  `display_name` / `avatar_url` from the protected `auth.users` table; raises if
  the caller isn't a member.
- `is_road_trip_member(p_trip_id, p_user_id)` — membership check used inside RLS
  policies (kept `SECURITY DEFINER` to avoid recursive policy evaluation).

> **Service-role usage.** Group shuffle is the one place the server uses the
> service-role key ([lib/supabase/admin.ts](../src/lib/supabase/admin.ts)) to
> bypass RLS — specifically to read and refresh *other* members' Spotify tokens.
> The host is authorized first (`road_trips.host_id = auth.uid()`) before the
> admin client is used.

## Client state

[providers.tsx](../src/app/providers.tsx) wires a single TanStack Query client.
`page.tsx` polls `GET /api/trips` every 5 seconds so passengers and the host see
live membership / contribution updates. Recipe reads and weight writes go
straight to Supabase from the browser (covered by RLS); everything Spotify-facing
goes through the Route Handlers above.
