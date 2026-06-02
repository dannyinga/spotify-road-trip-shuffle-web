# Deployment pipeline

Mirrors the Vine Health flow, scaled to a solo project.

```
work/* | fix/* | product/*
   │
   ▼
  dev          ← deploy-dev.yml (Supabase migrations + edge fns). QA Gate 1 on PRs into dev.
   │
   ▼
release/<vX.Y.Z>
   │
   ▼
  stg          ← deploy-staging.yml (backend + post-deploy smoke). QA Gate 2 on release/* → stg.
   │
   ▼
release/<vX.Y.Z>
   │
   ▼
  prd          ← deploy-production.yml (backend + health). QA Gate 3 on release/* → prd.
   │
   ▼
sync/prd-to-dev-<vX.Y.Z>    ← MANDATORY back-merge after every prod release.
```

Long-lived branches are named to match the environments and Doppler configs:
`dev` / `stg` / `prd`. `prd` is the repo's default/production branch.

## The QA gates are branch protection, not scripts

| Gate | Where | Enforced by | Runs |
| ---- | ----- | ----------- | ---- |
| **Gate 1** | PR → `dev` | Required check `ci / quality` | lint, typecheck, unit tests |
| **Gate 2** | PR `release/*` → `stg` | Required checks `ci / quality` + `e2e / playwright` | + Playwright e2e |
| **Gate 3** | PR `release/*` → `prd` | Gate 2 checks **+** `production` Environment reviewer | + manual approval before prod migration |

The deploy workflows run on `push` (i.e. *after* a PR merges into a long-lived
branch). The gates run on `pull_request`, so nothing reaches a protected branch
until the checks are green.

## Hard rules (inherited from Vine)

- Never commit directly to `dev`, `stg`, `prd` — always via PR.
- Never force-push to `prd` or `stg`.
- The `sync/prd-to-dev-*` back-merge after a prod release is mandatory, or
  `dev` silently drifts behind.
- Frontend deploys ride Vercel's Git integration; backend deploys ride these
  GitHub Actions. The two are independent.

## Environment isolation (free-tier compromise)

Two Supabase projects: **dev** and **prd**. The `stg` Doppler config points
`NEXT_SUPABASE_PROJECT_REF` at the **dev** project, so the `stg` branch shares
dev's database for now. To give staging its own database later, create a third
Supabase project and change that one Doppler var — no workflow edits needed.

## Required Doppler vars per config (dev / stg / prd)

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server |
| `NEXT_SUPABASE_SERVICE_ROLE_KEY` | server-only |
| `NEXT_SUPABASE_PAT` | Supabase personal access token (CLI auth in CI) |
| `NEXT_SUPABASE_PROJECT_REF` | which project this env deploys to |
| `NEXT_SUPABASE_DB_PASSWORD` | DB password for `supabase link`/`db push` |
| `NEXT_PUBLIC_SITE_URL` | (optional) deployed URL for post-deploy smoke |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | added when we build auth |

> Doppler reserves the bare `SUPABASE_*` prefix for its own integration, so our
> server-only vars use the `NEXT_SUPABASE_*` prefix and are aliased to the
> CLI's expected names (`SUPABASE_ACCESS_TOKEN`) inside each workflow step.

## GitHub Actions secrets

One Doppler **service token** per config, stored as a repo secret:
`DOPPLER_TOKEN_DEV`, `DOPPLER_TOKEN_STG`, `DOPPLER_TOKEN_PRD`.

## TODO

- Lighthouse CI on the staging gate (Vine runs it post-deploy; not wired here yet).
- Post-deploy Playwright against the live staging URL once the Vercel domain is set.
- Pin `supabase/setup-cli` to a fixed version.
