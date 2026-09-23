# Release management

A release is an annotated semantic tag `vX.Y.Z` on a verified structured commit. The release change sets `package.json` to the tagged version before the tag is created. Only the latest supported release receives fixes.

Release history is authoritative in annotated `v*` tags and GitHub Releases. Repository Markdown does not mirror per-version release history. GitHub Actions is the authority for CI and release-workflow run history.

The release workflow installs the lockfile, runs `npm run check` and the separate live `npm run audit:dependencies` gate, then verifies that the event identity is an annotated semantic tag resolving to the checked-out `HEAD` and matching the root `package.json` version before it publishes an immutable GitHub Release. Only after that publication succeeds can production deployment become eligible. Production deployment remains optional and has three gates: repository variable `PRODUCTION_DEPLOY_ENABLED=true`, the protected `production` environment, and required Cloudflare secrets. The deployment script independently refuses unless `SHARKTANK_RELEASE` is a semantic tag pointing at `HEAD`.

After deployment, the production job confirms the uploaded version through authenticated Cloudflare deployment evidence and requires it to serve 100% of traffic. Public `/version.json` and evidence checks run when the edge permits them; a Cloudflare managed challenge is reported only after provider-side deployment proof succeeds.

Published `v*` release tags are protected by the repository's active tag ruleset against update and deletion. Never move or recreate a published release tag. Correct defects forward with a new patch release. Cloudflare/provider evidence is authoritative for deployment/runtime provider state; do not maintain a checked-in deployment ledger.
