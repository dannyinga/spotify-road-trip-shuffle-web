# Branch & PR naming

Mirrors Vine Health conventions.

## Branches

| Kind | Pattern | Example |
| ---- | ------- | ------- |
| Feature work | `work/<slug>` | `work/spotify-login` |
| Bug fix | `fix/<slug>` | `fix/album-sort-order` |
| Hotfix (off `prd`) | `hotfix/<slug>` | `hotfix/token-refresh` |
| Release train | `release/<vX.Y.Z>` | `release/v0.1.0` |
| Post-release back-merge | `sync/prd-to-dev-<vX.Y.Z>` | `sync/prd-to-dev-v0.1.0` |

Long-lived branches — `dev`, `stg`, `prd` — are never committed to directly;
everything lands via PR. `prd` is the default/production branch.

## PR titles

Start with the bracketed category, then a concise summary:

- `[work] Add Spotify OAuth login`
- `[fix] Sort album tracks by disc before track number`
- `[release/v0.1.0] Cut v0.1.0 to stg`
- `[sync] Back-merge prd → dev after v0.1.0`

## Release flow

1. Branch `work/*` off `dev`, open a PR into `dev` (Gate 1).
2. When dev is ready to ship, branch `release/vX.Y.Z` off `dev`, PR into
   `stg` (Gate 2).
3. PR the same `release/vX.Y.Z` into `prd` (Gate 3, manual approval).
4. After the prod deploy, open `sync/prd-to-dev-vX.Y.Z` back into `dev`.
