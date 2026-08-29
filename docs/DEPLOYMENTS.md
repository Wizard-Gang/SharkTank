# Deployment record

## Public reconstruction

No commit in this reconstructed public repository has been deployed by this migration. The release workflow's production job is disabled unless the repository variable `PRODUCTION_DEPLOY_ENABLED` is explicitly set to `true`, and it additionally requires the protected `production` environment.

The tags v0.1.0 through v0.8.0 identify coherent historical product phases reconstructed from the source commits in `history/CHANGE-MAP.csv`. They do not assert that those public Git objects were the artifacts originally deployed. v1.0.0 identifies the completed self-contained repository release.

## Existing production

The existing production origin is `https://sharktank.wizardgang.ai`, backed by the historical Cloudflare environment `wizardgangprod`. Its stateful names are intentionally unchanged. Repository publication and release publication do not perform a deployment, DNS change, state migration, or legacy shutdown.

The first authorized deployment from this repository must record the release tag, workflow run, Cloudflare deployment result, `/version.json` result, evidence-walk result, operator, and rollback tag here or in a successor controlled record.
