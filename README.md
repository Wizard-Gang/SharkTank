# SharkTank

SharkTank is a realtime multiplayer game backed by authoritative Cloudflare Durable Objects. The same deployment publishes operational status, controls, incidents, logs, continuity evidence, and spend limits.

**[Overview](https://sharktank.wizardgang.ai)** · **[Play](https://sharktank.wizardgang.ai/play/)** · **[Evidence](https://sharktank.wizardgang.ai/evidence/)**

## Command map

Use the exact Node.js release pinned in `.node-version`, npm 11, and run `npm ci` before repository validation. PHP 8.2 or newer is required for the PHP parity test and therefore for the complete `check` gate.

| Command | Purpose and current side effects |
| --- | --- |
| `npm run dev` | Standard whole-stack development lifecycle. It uses the same `scripts/local.mjs` implementation as `npm run local`: may install missing Node dependencies, stops only checkout-owned Wrangler/Workerman processes, fails closed on foreign ports 8787/8080/8081, clears only validated disposable `dist/` and `.wrangler/` state by default, preserves PHP `packages/php-runtime/data/`, builds, starts PHP when available, opens a browser after the current fixed delay, and runs Wrangler in the foreground. |
| `npm run local` | Compatibility/explicit whole-stack alias for the same safe lifecycle used by `npm run dev`. The deliberate destructive data reset remains `npm run local -- --reset-php-data`; it can remove only this checkout's canonical PHP data directory after containment and symlink validation. |
| `npm run dev:worker` | Narrow TypeScript/Cloudflare Worker-only development path: raw Wrangler on port 8787 with no PHP lifecycle management or whole-stack reset. `npm start` preserves its prior Worker-only behavior by delegating to this explicit command. Wrangler may load ignored `.dev.vars` for local values. |
| `npm test` | Runs the Vitest suite. It does not build, start the local stack, or mutate provider state. |
| `npm run test:php` | Runs the PHP protocol-parity self-test and requires a working PHP runtime. |
| `npm run build` | Runs the Vite production build into local generated output. It does not publish a release or deploy production. |
| `npm run check` | Complete credential-free repository acceptance: type checks, TypeScript tests, PHP parity, build, repository/change/history/provenance/settings tests, local HTTP acceptance, dependency audit, and patch whitespace. Its local HTTP gate owns a temporary Worker on port 8792. The gate launches Wrangler with a temporary test-owned environment file, so ignored developer `.dev.vars` values are not part of repository acceptance. |
| `npm run check:github-settings` | Read-only live GitHub settings verification against `config/github-repository-settings.json`. Requires an admin-capable `GH_ADMIN_TOKEN` or `GH_TOKEN` with Repository Administration read access. |
| `npm run apply:github-settings` | Explicitly mutates repository merge settings and rulesets to the committed authority, then re-reads them. Requires Repository Administration write access. This is not part of ordinary repository acceptance. |
| `npm run deploy:wizardgangprod:dry-run` | Runs the production deployment script with Wrangler `--dry-run`. It still requires `SHARKTANK_RELEASE` to be a semantic `vX.Y.Z` tag at `HEAD` and `CLOUDFLARE_ACCOUNT_ID` (the script can load the ignored `.env`), and it performs a build, but it does not deploy production. |

## Release and production boundary

Pushing a semantic `vX.Y.Z` tag triggers the Release workflow. The workflow installs locked dependencies and runs `npm run check`; after that verification, GitHub Release publication and the optional production deployment are currently separate jobs that both depend on `verify`. Production deployment runs only when `PRODUCTION_DEPLOY_ENABLED=true`, through the protected `production` environment with Cloudflare credentials, and the deploy script independently requires the release tag at `HEAD`.

Because those two post-verification jobs are currently independent, production deployment does not wait for GitHub Release publication to complete. A green CI or release verification job therefore proves repository acceptance only; it does not by itself prove that a GitHub Release was published or that production changed. Do not run production deployment paths merely to validate a pull request.

## Repository map

- `src/worker/` — Worker routing, Durable Objects, controls, operations, and public evidence.
- `src/client/` — browser application entry and progressive enhancement.
- `vendor/ModuleReact3Fiber/` — first-party deterministic game engine and client source.
- `packages/php-runtime/` — optional cross-language protocol-parity runtime.
- `scripts/` — local development, verification, release, and deployment tooling.

## Current-state documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY-MODEL.md)
- [Operations](docs/OPERATIONS.md)
- [Continuity and recovery](docs/CONTINUITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Release management](docs/RELEASE-MANAGEMENT.md)
- [Change management](docs/CHANGE-MANAGEMENT.md)
- [AI applicability](docs/AI-APPLICABILITY.md)
- [Runtime parity](docs/PARITY.md)
- [Security reporting](SECURITY.md)

These documents describe the current system and operating policy. Git/GitHub are authoritative for implementation and release history; provider evidence is authoritative for deployment/runtime provider state.
