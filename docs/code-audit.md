# Code audit — 2026-06-03

Audit of the full codebase (source, migrations, CI, config). Overall the project
is in good shape: the core algorithm is pure and well-tested, RLS is enabled on
every table, the Spotify secret never reaches the browser, and the CI/CD gates
are thorough. Findings below are ordered by severity. Items marked ✅ Fixed were
addressed in the same change that produced this report.

## High

Nothing in this tier. No unauthenticated data exposure, no RLS gaps, no secrets
committed to git history (`.env*` and `important-info.txt` are gitignored).

## Medium

### M1. Live secrets sitting in a plaintext working-tree file
[important-info.txt](../important-info.txt) contains real credentials: dev/prd
database passwords, a **prod Doppler service token** (`dp.st.prd.…`), and
Supabase keys. It is gitignored and untracked, so it is *not* in the repo — but
it is plaintext on disk and was readable during this audit.
- **Risk:** anything with filesystem access (a stray backup, a synced folder, a
  shared screen) leaks production credentials.
- **Recommendation:** treat these as exposed and **rotate** the Doppler prod
  token and both DB passwords. Keep operational notes in a password manager, not
  a repo file. If you must keep the file, confirm it can never be force-added.

### M2. Debug instrumentation on the trip-creation hot path  ✅ Fixed
[api/trips/route.ts](../src/app/api/trips/route.ts) `POST` called a
`get_my_uid` RPC and `console.log`'d the auth context and the full insert
payload on **every** trip creation — an extra DB round-trip plus log noise that
echoes user ids. The dedicated debug migration
(`20260603140000_add_debug_function.sql`) exists only to support this.
- **Fix applied:** removed the `get_my_uid` call and the two debug `console.log`
  statements. The `get_my_uid` function is left in the database (dropping it
  needs a new migration); it is harmless (`SECURITY INVOKER`, returns only the
  caller's own uid/role) but should be dropped in a follow-up migration.

## Low

### L1. Verbose server logging of operational detail
`lib/spotify.ts` and several routes `console.error`/`console.log` status codes,
user ids, and token-refresh notices. None log token *values*, so this is not a
secret leak, but it is noisy and surfaces user ids in logs. Consider a leveled
logger and dropping the info-level lines (e.g. the token-refresh `console.log`).

### L2. `getPlaylistTracks` trusts Spotify's track shape
[lib/spotify.ts](../src/lib/spotify.ts) maps `disc_number` / `track_number`
directly. Tracks missing an `album.id` are already skipped, but a track missing
`disc_number`/`track_number` would carry `undefined` into the sort comparator
(treated as `NaN`). In practice Spotify always returns these for catalogue
tracks; local/podcast items are the edge. Low impact — the album-block guarantee
still holds; only intra-album order could wobble. Defaulting both to `1` would
remove the edge entirely.

### L3. Invite-code generation gives up after 5 collisions
[api/trips/route.ts](../src/app/api/trips/route.ts) tries 5 random 6-char codes
then returns 500. With a 36⁶ keyspace this is astronomically unlikely, and the
`UNIQUE` constraint on `invite_code` makes a genuine race safe (the insert would
fail rather than duplicate). No action needed at current scale; noted for
awareness.

### L4. README "What's built" omits the group-trip feature
The collaborative road-trip ("cabin") feature — a substantial slice of the app
(four routes, two tables) — isn't listed in the README checklist or documented
anywhere until now. Addressed by [architecture.md](architecture.md); consider
adding a checklist line to the README.

## Testing gaps (addressed in this change)

Before this audit, only `roadTripShuffle` and `/api/health` had tests.

- ✅ **`lib/spotify.ts`** now has unit tests covering token refresh (fresh vs.
  expired vs. refresh-rotation), playlist pagination, the >100-track add
  chunking, the invalid-track filter, and HTTP error propagation —
  [lib/spotify.test.ts](../src/lib/spotify.test.ts).
- ✅ **Group-shuffle weight pooling** was extracted from the route into the pure
  [`poolTracksByWeight`](../src/lib/shuffle/pool-tracks.ts) and unit-tested
  (under-cap passthrough, weighted shares, per-member cap, zero-weight safety) —
  [lib/shuffle/pool-tracks.test.ts](../src/lib/shuffle/pool-tracks.test.ts).
- **Still uncovered (by design):** the Route Handlers' orchestration and the
  Supabase RLS policies. These are best exercised by integration/e2e tests
  against a real (test) Supabase project rather than unit mocks. The Playwright
  smoke suite covers the deployed surface today; an authenticated e2e flow is the
  natural next step.

## What's solid

- `roadTripShuffle` is pure, deterministic, and thoroughly tested.
- RLS is enabled on all four tables with per-command policies; the service-role
  client is used in exactly one place and only after host authorization.
- The Spotify client secret is confined to server-side Route Handlers.
- TypeScript is strict and the build, typecheck, and lint are all clean.
- CI/CD has three escalating QA gates plus post-deploy validation.
