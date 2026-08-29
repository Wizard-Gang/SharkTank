# Release management

A release is an annotated semantic tag `vX.Y.Z` on a verified structured commit. Historical reconstruction tags mark coherent product phases; only the latest supported release receives fixes.

The release workflow installs the lockfile, runs `npm run verify`, validates structured history, and publishes an immutable GitHub release. Production deployment is an additional job with three gates: repository variable `PRODUCTION_DEPLOY_ENABLED=true`, the protected `production` environment, and required Cloudflare secrets. The deployment script independently refuses unless `SHARKTANK_RELEASE` is a semantic tag pointing at `HEAD`.

After deployment, the workflow walks all public evidence routes and requires `/version.json` to match the tag. A release can therefore exist without being deployed, and production deployment remains disabled during repository reconstruction and migration review.

Never move or recreate a published release tag. Correct defects forward with a new patch release. Record deployment outcome separately from the release itself.
