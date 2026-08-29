# SharkTank contributor instructions

SharkTank is a public, self-contained reconstruction. Preserve the buildable history, the evidence-bearing behavior, and the provenance records.

## Change discipline

- Work on a branch. Do not rewrite published commits or tags.
- Keep changes focused and use a subject shaped like `[ST-NNN] [TYPE] Imperative summary`.
- Dependabot's GitHub-verified `build(deps): Bump ...` commits are the only exception to the ST subject/body shape; CI verifies the bot author and noreply identity before accepting that exception.
- Include these commit-body headings: `Change`, `Reason`, `Impact`, `Risk`, `Controls`, `Validation`, and `Evidence`, followed by either `Notes` or explicit `Source` and `Release` fields. Add `Rollback` for medium- or high-risk operational changes.
- Update `docs/history/CHANGE-MAP.csv` when a change represents migrated history or alters an existing mapping.
- Never commit credentials, `.env` files, Cloudflare identifiers intended to remain private, production exports, or operator receipts containing private values.

## Required checks

Run `npm ci` once, then run `npm run verify`. When trust routes change, also start the local Worker and run `npm run check:evidence -- http://127.0.0.1:8787`.

Deployment is tag-driven and requires the protected GitHub production environment. Do not invoke the production deploy script merely to validate a pull request; use its dry-run mode.
