# Contributing to SharkTank

Thank you for helping improve SharkTank. This repository contains the complete Worker host, deterministic TypeScript game runtime, browser client, and PHP parity proof.

## Local setup

Use the shared WG-ARCH-001 toolchain authority: Node.js 26.7.0 from `.node-version`, npm 11.19.0 from `packageManager`, and PHP 8.2 or newer. The Node/npm engine policy remains 26.x/11.x, while repository acceptance requires the exact pinned pair:

```sh
npm ci
```

For normal development, run:

```sh
npm run dev
```

That is the standard whole-stack lifecycle. It uses `scripts/local.mjs`, stops only processes positively identified as belonging to this checkout's managed Wrangler or Workerman lifecycle, fails closed when ports 8787/8080/8081 are occupied by anything else, clears only validated disposable `dist/` and `.wrangler/` state by default, preserves `packages/php-runtime/data/`, builds, starts the PHP backend when available, starts Wrangler, waits for bounded HTTP readiness on port 8787, and only then reports/opens the application URL. For headless/cloud development, use exactly `npm run dev -- --no-open`; readiness and every other lifecycle control still run, and only browser launch is suppressed.

`npm run local` remains a compatibility/explicit whole-stack alias to the same implementation; its exact headless form is `npm run local -- --no-open`. To deliberately clear PHP application state, use exactly `npm run local -- --reset-php-data`; the option authorizes only this checkout's canonical PHP data directory, and containment/symlink validation happens before any reset mutation.

For a deliberately narrow TypeScript/Cloudflare Worker-only session, use `npm run dev:worker`. It starts raw Wrangler on `http://127.0.0.1:8787` without the PHP lifecycle or whole-stack reset. `npm start` preserves its prior Worker-only behavior by delegating to `dev:worker`. Local admin credentials, when needed, belong in ignored `.dev.vars`, not in tracked files.

## Validation and operations commands

- `npm test` runs Vitest only.
- `npm run test:php` runs the PHP parity self-test and requires PHP.
- `npm run build` creates the Vite production build locally; it does not deploy.
- `npm run check` is the complete credential-free repository gate. It includes the tests above, the production build, repository/change/history/provenance/settings checks, local HTTP acceptance, pure dependency-advisory policy cases, and patch whitespace. The local HTTP gate starts and stops its own Worker on port 8792.
- `npm run audit:dependencies` performs the separate live network advisory check at the moderate severity threshold; CI and release verification require it.
- Local HTTP acceptance launches Wrangler with a temporary test-owned environment file and does not require reading, moving, deleting, or rewriting a developer's ignored `.dev.vars`.
- `npm run verify:github-settings` is read-only live provider verification and requires an admin-capable `GH_ADMIN_TOKEN` or `GH_TOKEN` with Repository Administration read access.
- `npm run apply:github-settings` is the explicit provider mutation path, requires Repository Administration write access, and re-verifies after applying the committed settings.
- `npm run deploy:wizardgangprod:dry-run` exercises the production deployment configuration without deploying. It still requires a semantic `SHARKTANK_RELEASE` tag at `HEAD` and `CLOUDFLARE_ACCOUNT_ID`; the deployment script may load the ignored `.env`.
- Pushing a semantic `vX.Y.Z` tag starts the Release workflow. After `npm run check`, GitHub Release publication and optional production deployment currently run as separate jobs. Production deploy is additionally gated by `PRODUCTION_DEPLOY_ENABLED=true`, the protected `production` environment, Cloudflare credentials, and the exact release tag at `HEAD`. A green CI or release verification run does not itself mean a release was published or production changed.

Do not invoke production deployment paths merely to validate a pull request.

## Planning queue

`implementation_plan.md` exists only while SharkTank has queued current/future work. Work the first task only; if its dependency is unsatisfied, report it as blocked rather than skipping to a later task. The pull request that delivers a task removes that task from the plan, and if it was the final task, deletes the exhausted plan instead of retaining a placeholder.

When no implementation plan exists, a `do needful` turn is planning-only: re-audit current repository and provider state, publish a new dependency-ordered wave of small tasks, and stop before implementing the first new task. A single turn therefore completes either one controlled delivery or one fresh planning wave.

## Pull requests

Keep a pull request focused on one auditable outcome. Explain risk, controls, evidence, rollback needs, and the commands actually run. New behavior needs tests. Changes to public assurance claims must update their evidence and must not turn a limitation into an unsupported assertion.

Use the structured commit format in `AGENTS.md`. Pull requests carry one contributor-authored controlled commit and land as one commit on `main`; squash merge is the accepted merge method when needed to preserve that shape. The landed commit must retain the complete structured record. Dependency updates are reviewed and submitted under the contributor's ST identity rather than by a version-update bot.

## Security reports

Do not open a public issue for a vulnerability. Follow `SECURITY.md` instead.
