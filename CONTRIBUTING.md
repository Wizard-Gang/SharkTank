# Contributing to SharkTank

Thank you for helping improve SharkTank. This repository contains the complete Worker host, deterministic TypeScript game runtime, browser client, and PHP parity proof.

## Local setup

Use the Node.js release pinned in `.node-version`, npm 11, and PHP 8.2 or newer:

```sh
npm ci
```

For normal Worker-only development, run:

```sh
npm run dev
```

That command is raw Wrangler on `http://127.0.0.1:8787`; it does not start the PHP backend. Local admin credentials, when needed, belong in ignored `.dev.vars`, not in tracked files.

`npm run local` is a different, whole-stack convenience command. It now stops only processes positively identified as belonging to this checkout's managed Wrangler or Workerman lifecycle and fails closed when ports 8787/8080/8081 are occupied by anything else. It still deletes `dist/`, `.wrangler/`, and PHP `data/`, builds, starts the PHP backend when available, opens a browser after a fixed delay, and then runs Wrangler. Use it only when that destructive reset is intentional; the reset policy is queued for separate hardening.

## Validation and operations commands

- `npm test` runs Vitest only.
- `npm run test:php` runs the PHP parity self-test and requires PHP.
- `npm run build` creates the Vite production build locally; it does not deploy.
- `npm run check` is the complete credential-free repository gate. It includes the tests above, the production build, repository/change/history/provenance/settings checks, local HTTP acceptance, dependency audit, and patch whitespace. The local HTTP gate starts and stops its own Worker on port 8792.
- Local HTTP acceptance launches Wrangler with a temporary test-owned environment file and does not require reading, moving, deleting, or rewriting a developer's ignored `.dev.vars`.
- `npm run check:github-settings` is read-only live provider verification and requires an admin-capable `GH_ADMIN_TOKEN` or `GH_TOKEN` with Repository Administration read access.
- `npm run apply:github-settings` is the explicit provider mutation path, requires Repository Administration write access, and re-verifies after applying the committed settings.
- `npm run deploy:wizardgangprod:dry-run` exercises the production deployment configuration without deploying. It still requires a semantic `SHARKTANK_RELEASE` tag at `HEAD` and `CLOUDFLARE_ACCOUNT_ID`; the deployment script may load the ignored `.env`.
- Pushing a semantic `vX.Y.Z` tag starts the Release workflow. After `npm run check`, GitHub Release publication and optional production deployment currently run as separate jobs. Production deploy is additionally gated by `PRODUCTION_DEPLOY_ENABLED=true`, the protected `production` environment, Cloudflare credentials, and the exact release tag at `HEAD`. A green CI or release verification run does not itself mean a release was published or production changed.

Do not invoke production deployment paths merely to validate a pull request.

## Planning queue

`implementation_plan.md` exists only while SharkTank has queued current/future work. Work the first task only; if its dependency is unsatisfied, report it as blocked rather than skipping to a later task. The pull request that delivers a task removes that task from the plan, and if it was the final task, deletes the exhausted plan instead of retaining a placeholder.

When no implementation plan exists, a `do needful` turn is planning-only: re-audit current repository and provider state, publish a new dependency-ordered wave of small tasks, and stop before implementing the first new task. A single turn therefore completes either one controlled delivery or one fresh planning wave.

## Pull requests

Keep a pull request focused on one auditable outcome. Explain risk, controls, evidence, rollback needs, and the commands actually run. New behavior needs tests. Changes to public assurance claims must update their evidence and must not turn a limitation into an unsupported assertion.

Use the structured commit format in `AGENTS.md`. Human-controlled pull requests carry one controlled commit and land as one commit on `main`; squash merge is the accepted merge method when needed to preserve that shape. The landed commit must retain the complete structured record.

## Security reports

Do not open a public issue for a vulnerability. Follow `SECURITY.md` instead.
