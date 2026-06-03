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
  stg          ← deploy-staging.yml (backend + post-deploy validation). QA Gate 2 on release/* → stg.
   │
   ▼
release/<vX.Y.Z>
   │
   ▼
  prd          ← deploy-production.yml (backend + post-deploy validation),
   │             post-deploy-health.yml (fast curl smoke). QA Gate 3 on release/* → prd.
   ▼
sync/prd-to-dev-<sha>    ← MANDATORY back-merge, opened automatically by
                            sync-prd-to-dev.yml after every prod release.
```

Long-lived branches are named to match the environments and Doppler configs:
`dev` / `stg` / `prd`. `prd` is the repo's default/production branch.

## The QA gates are workflows enforced by branch protection

Each gate is its own workflow (`qa-dev.yml` / `qa-staging.yml` / `qa-production.yml`),
mirroring Vine. The job name is the required-status-check name in branch
protection.

| Gate | Where | Workflow / required check | Runs |
| ---- | ----- | ------------------------- | ---- |
| **Gate 1** | PR → `dev` | `qa-dev.yml` → **QA Gate 1** | env contract, lint, typecheck, build, unit tests, `npm audit --high`, migration lint, edge-fn check |
| **Gate 2** | PR `release/*` → `stg` | `qa-staging.yml` → **QA Gate 2** | release-branch enforcement, build, `npm audit --high`, migration lint, Playwright e2e, Semgrep SAST |
| **Gate 3** | PR `release/*` → `prd` | `qa-production.yml` → **QA Gate 3** + `production` Environment reviewer | Gate 2 checks with `npm audit --critical`, Playwright @smoke, **+ manual approval** before the prod migration (the Environment reviewer on `deploy-production.yml`) |

The deploy workflows run on `push` (i.e. *after* a PR merges into a long-lived
branch). The gates run on `pull_request`, so nothing reaches a protected branch
until the checks are green.

> **Branch-protection setup.** Each gate workflow is self-contained (it re-runs
> the foundational checks plus its own extra rigor) and only triggers on PRs
> into its own branch, so each branch requires exactly **one** check — its own
> gate: `dev` requires **QA Gate 1**; `stg` requires **QA Gate 2**; `prd`
> requires **QA Gate 3** (and keep the `production` Environment reviewer). These
> contexts replace the old `quality` / `playwright` ones from `ci.yml` /
> `e2e.yml`.

## Deployment tests (post-deploy validation)

After a merge lands on `stg`/`prd`, `deploy-*.yml` runs a `post-deploy-validation`
job against the **deployed** site: poll the URL until it serves 200, run the full
Playwright suite against it, then a Lighthouse audit (`lighthouserc.cjs`). On
`prd`, `post-deploy-health.yml` runs a faster curl smoke (`/` and `/api/health`)
in parallel for a sub-5-minute fail signal. These jobs **require**
`NEXT_PUBLIC_SITE_URL` in the relevant Doppler config and fail if it's unset
(any trailing slash is stripped so `…/` never becomes `…//`). They send the
`x-vercel-protection-bypass` header (`VERCEL_AUTOMATION_BYPASS_SECRET`) to get
past Deployment Protection on protected preview URLs like `stg`.

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
| `NEXT_PUBLIC_SITE_URL` | deployed URL — **required** by post-deploy validation + health (stg/prd) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | added when we build auth |

> Doppler reserves the bare `SUPABASE_*` prefix for its own integration, so our
> server-only vars use the `NEXT_SUPABASE_*` prefix and are aliased to the
> CLI's expected names (`SUPABASE_ACCESS_TOKEN`) inside each workflow step.

## GitHub Actions secrets

One Doppler **service token** per config, stored as a repo secret:
`DOPPLER_TOKEN_DEV`, `DOPPLER_TOKEN_STG`, `DOPPLER_TOKEN_PRD`.

Plus `VERCEL_AUTOMATION_BYPASS_SECRET` — the post-deploy jobs send it as the
`x-vercel-protection-bypass` header so they can reach Vercel preview
deployments that have Deployment Protection on (the `stg` URL returns 401
otherwise). Get the value from Vercel → Project → Settings → Deployment
Protection → **Protection Bypass for Automation**. Harmless on the unprotected
prod URL.

## TODO

- Pin `supabase/setup-cli` and `actions/upload-artifact` to fixed SHAs once the
  pipeline is stable.
- Tighten `lighthouserc.cjs` assertions from `warn` to `error` once the deployed
  site has a real baseline (Vine's deploy-*.yml uses `error` thresholds).
- Give `stg` its own Supabase project (currently shares dev's DB).

## Done (mirrored from Vine)

- Three named QA-gate workflows (`qa-dev` / `qa-staging` / `qa-production`),
  replacing `ci.yml` + `e2e.yml`.
- Post-deploy validation (Playwright + Lighthouse against the live URL) on
  `stg`/`prd`, plus a fast `post-deploy-health.yml` curl smoke on `prd`.
- Automatic `sync/prd-to-dev-<sha>` back-merge via `sync-prd-to-dev.yml`.
- `/api/health` route + unit test, hit by the health check and the @smoke suite.
