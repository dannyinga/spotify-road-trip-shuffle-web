# Road Trip Shuffle

Build custom shuffled Spotify playlists that play like a stack of CDs in a car
changer: each **album plays in its real running order**, but the **albums are
shuffled**. Put on a whole record, then jump to a different one — no songs from
the same album scattered across the playlist.

This is an onboarding project that mirrors the Vine Health stack so the tooling
becomes muscle memory.

## Stack

| Layer        | Tech                                                      |
| ------------ | -------------------------------------------------------- |
| Frontend     | Next.js (App Router, TypeScript) + Tailwind              |
| Server/API   | Next.js Route Handlers (hold the Spotify secret here)    |
| Auth + DB    | Supabase (Spotify OAuth provider, Postgres, RLS)         |
| Client state | TanStack React Query                                      |
| Secrets      | Doppler (`dev` / `stg` / `prd`)                          |
| Hosting      | Vercel (frontend) + Supabase (backend)                   |
| Tests        | Vitest (unit) + Playwright (e2e)                          |

## Architecture in one paragraph

The browser never sees the Spotify client secret. "Log in with Spotify" goes
through Supabase Auth, which stores and refreshes the user's Spotify tokens. A
server-side Route Handler reads the user's playlist from Spotify, runs the pure
[`roadTripShuffle`](src/lib/shuffle/road-trip-shuffle.ts) function, and writes
the reordered playlist back. Postgres stores **recipes** — the source playlist
plus the seed that reproduces an exact ordering — each row scoped to its owner
by Row-Level Security.

## First-time setup

These steps need your own accounts, so they're yours to run:

1. **Doppler** — create a `spotify-road-trip-shuffle` project with `dev` / `stg`
   / `prd` configs, then `doppler setup` in this folder to select `dev`.
2. **Supabase** — create a project, then link it:
   ```bash
   doppler run -- npx supabase link
   ```
   Push the first migration:
   ```bash
   npm run db:push
   ```
3. **Spotify** — register an app at
   https://developer.spotify.com/dashboard, add the redirect URI
   `http://127.0.0.1:3000/auth/callback`, and in the Supabase dashboard enable
   the **Spotify** auth provider with that client id/secret.
4. Put all values in Doppler (see [.env.local.example](.env.local.example) for
   the variable names). Never paste real values into files or commits.

## Develop

```bash
doppler run -- npm run dev        # http://127.0.0.1:3000
npm run test:unit                 # vitest (the shuffle algorithm)
npm run typecheck                 # tsc --noEmit
npm run db:migrate:check          # supabase db lint
```

## What's built so far

- [x] Next.js + Tailwind + TypeScript scaffold
- [x] Supabase SSR client/server/middleware helpers
- [x] React Query provider wired into the root layout
- [x] `roadTripShuffle` pure algorithm + Vitest suite
- [x] First migration: `shuffle_recipes` table with owner-only RLS
- [x] CI/CD pipeline: dev/stg/prd gates + backend deploys, verified end-to-end
- [ ] Spotify OAuth login flow
- [ ] Read playlist → shuffle → write-back Route Handler
- [ ] Recipe save/list UI
