# Deployment

Production is the existing Cloudflare environment `wizardgangprod`, routed to `sharktank.wizardgang.ai`. Its name is historical and remains stable because it identifies deployed state. Local development uses `sharktank-local`.

## Preconditions

- The exact commit has passed CI and has an annotated `vX.Y.Z` tag.
- The GitHub `production` environment is protected and contains `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Cloudflare already contains `OPS_USERNAME` and `OPS_TOKEN` for the production environment.
- `PRODUCTION_DEPLOY_ENABLED` is explicitly set to `true` only after migration approval.

The release workflow supplies the tag as `SHARKTANK_RELEASE`. The local deployment script refuses an untagged commit, an invalid tag, a missing account identifier, or missing operator secrets. Its dry-run has the same tag and identity preconditions.

## Verification and rollback

After deployment, run the public evidence walk and compare `/version.json` with the intended tag. Validate the game shell, a non-upgraded room route returning 426, public assurance pages, and an unauthenticated admin route returning 401. Roll back by deploying a previously verified tag through the same controlled workflow; do not rename stateful resources.

Repository publication, release publication, production deployment, DNS cutover, and retirement of legacy repositories are separate decisions. This reconstruction does not authorize the last three.
