# Deployment record

## Public reconstruction

The release workflow's production job remains disabled unless the repository variable `PRODUCTION_DEPLOY_ENABLED` is explicitly set to `true`, and it additionally requires the protected `production` environment. The initial cutover was performed locally with the same exact-tag deployment script because the repository environment did not contain a Cloudflare API token.

The tags v0.1.0 through v0.8.0 identify coherent historical product phases reconstructed from the source commits in `history/CHANGE-MAP.csv`. They do not assert that those public Git objects were the artifacts originally deployed. v1.0.0 identifies the completed self-contained repository release; v1.0.1 is the first public production release.

## Initial public-repository cutover

| Field | Result |
| --- | --- |
| Time | 2026-08-29 01:37 UTC |
| Release | v1.0.1 at ST-032 |
| Operator | Repository owner using Cloudflare OAuth |
| Target | Existing `wizardgangprod` Worker at `https://sharktank.wizardgang.ai` |
| Configuration | Existing Durable Object classes, migration tag, R2 bucket, custom domain, cron, generation identifiers, spend limit, and operator secrets preserved |
| Build and upload | Vite production build passed; Worker and four changed assets uploaded; custom domain and daily trigger confirmed |
| Runtime identity | `/version.json` returned `SharkTank`, `v1.0.1`, `production` |
| Evidence | 46 distinct routes across 489 references passed; 142 met rows and zero met rows without a route |
| Runtime parity | Game and trust pages 200; health, tank, and leaderboard APIs 200 JSON; admin 401; non-upgraded room route 426; real WebSocket session received `welcome` |
| Portfolio boundary | WizardGang case study returned 200 and linked to both the game and trust origins; the legacy human route redirected |
| Rollback | The immediately previous Cloudflare deployment remains in provider history; stateful resources were not renamed or migrated |

No DNS change was required because the canonical custom domain was already attached to the preserved production Worker. The deployment did not retire or delete state. This record closes the production-parity gate for archiving `WizardGangLocal` as immutable provenance.
