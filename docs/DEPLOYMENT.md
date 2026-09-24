# Deployment

Production is the existing Cloudflare environment `wizardgangprod`, routed to `sharktank.wizardgang.ai`. Its name remains stable because it identifies deployed state. Local development uses `sharktank-local`.

## Preconditions

- The exact commit has passed CI and has an annotated `vX.Y.Z` tag.
- The GitHub `production` environment is protected and contains `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Cloudflare already contains `OPS_USERNAME` and `OPS_TOKEN` for the production environment.
- `PRODUCTION_DEPLOY_ENABLED` is explicitly set to `true` only for an authorized production deployment.

The release workflow supplies the tag, expected accepted `main` SHA, and GitHub workflow identity to the reusable production job. A real deploy is workflow-only: the deployment script requires GitHub Actions, the exact SharkTank `workflow_dispatch` on `main`, the exact Release workflow ref, the annotated tag/package/commit identity in the released checkout, and Cloudflare credentials from the protected `production` environment before it invokes Wrangler. The guard code comes from the dispatching workflow commit; the application build comes from the immutable tag. It does not load ignored local `.env` values in real mode. The explicit dry-run remains available from a workstation, may load `.env`, and still requires a semantic release tag at `HEAD` plus the account identifier.

## Verification and rollback

GitHub Actions records the release/deployment workflow execution. The production job confirms the uploaded version in authenticated Cloudflare deployment state and requires it to serve 100% of traffic. When the public origin is reachable, compare `/version.json` with the intended tag and run the public evidence checks; a Cloudflare managed challenge does not replace the provider-side deployment proof.

Validate the game shell, a non-upgraded room route returning 426, public assurance pages, and an unauthenticated admin route returning 401. Roll back by deploying a previously verified tag through the same controlled workflow; do not rename stateful resources.

Cloudflare/provider evidence is the authority for deployment/runtime provider history. Repository publication, release publication, production deployment, DNS changes, and legacy-repository retirement are separate controlled decisions; repository Markdown does not mirror deployment receipts.
