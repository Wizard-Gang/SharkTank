# Active implementation plan

**Portfolio plan maintenance notice.** The owner may direct an additive update to this active queue while another task or pull request is in progress. Keep every existing open task and its order; a plan amendment neither implements nor retires it. After the shared policy setup, a routine amendment changes only this plan file. Before merging, re-fetch authoritative `main` and open pull requests, compare the current plan and exact head with the recorded base, and rebase/reconcile if either moved. Require current exact-head checks and mergeability so concurrent work is not overwritten. Any earlier “final task” or “no queue remains” wording applies to its original wave; it keeps this plan while appended tasks remain, and only the actual last task deletes it.

This is SharkTank's next current/future delivery-process convergence wave under WG-ARCH-001 §27. It was created from fresh repository and provider evidence after the prior queue was retired. Work only the first task. Each delivering change removes its own task; the final task deletes this file. Git, pull requests, Actions, annotated tags, GitHub Releases and provider evidence retain completed history.

The current repository is already squash-only with completed-branch cleanup, protected `main`, strict required `verify`, immutable `v*` tags, the normalized GitHub settings test/verify/apply CLI, credential-free canonical `npm run check`, separate live dependency advisories, exact annotated release identity, and a reusable workflow-call-only production stage. Do not rebuild those controls merely for cosmetic sameness.

Fresh provider evidence from 2026-09-24 identifies one release handoff gap:

- accepted `main` at `999e2b988667cdb02dc5812ca2952d3051b68b5a` passed CI and the Release Tag workflow created immutable annotated `v1.3.8` at that exact commit;
- the tag push used the workflow's default `GITHUB_TOKEN`, so GitHub did not start the separate tag-push Release workflow; no published GitHub Release `v1.3.8` or governed production deploy exists, and public `/version.json` still reports `v1.3.7`;
- the release/deploy workflow must be repaired to hand off an exact immutable tag without depending on a `GITHUB_TOKEN`-generated push event. Preserve the existing protected production environment, published-Release prerequisite, and fail-closed deployment boundary.

The owner has prioritized this recovery before the final parity audit. The existing `v1.3.8` tag must not be moved, deleted, or replaced.

## Open tasks


### ST-089 — [BUILD] Repair release handoff and recover v1.3.8

- Dependency: ST-088 merged; annotated `v1.3.8` remains at exact commit `999e2b988667cdb02dc5812ca2952d3051b68b5a`.
- Why: A tag pushed with GitHub Actions `GITHUB_TOKEN` does not trigger the separate tag-push Release workflow, leaving the new immutable tag unpublished and production on `v1.3.7`.
- Scope: Give the Release workflow a supported explicit handoff from the successful exact-main Release Tag workflow and a deliberate recovery path for an already-created immutable tag. Verify the requested tag is semantic and annotated, matches the package version and exact accepted commit, and has passed canonical tagged-state and live advisory gates before creating or verifying its GitHub Release. Keep publication retry-safe. Only after publication may the protected `production` environment deploy that same tag when `PRODUCTION_DEPLOY_ENABLED=true`; require Cloudflare provider version/100%-traffic evidence and public release identity where the edge permits it. Update focused workflow, release-identity, and deployment-boundary tests and current-state release docs. Do not rely on a new credential solely to cause a second workflow run.
- Non-goals: No new version bump, tag movement, arbitrary-checkout deployment, ruleset weakening, or alternate hosting platform.
- Acceptance: GitHub records a published non-draft `v1.3.8` Release at the existing annotated tag, the governed release/deploy run proves the same exact commit and release, Cloudflare serves the resulting Worker Version ID at 100%, and public `/version.json` reports `v1.3.8` when reachable. The next version change follows the repaired path without a manual tag-push workaround.
- Validation: `npm ci`; focused release/tag/deploy cases; `npm run check`; `npm run audit:dependencies`; `npm run verify:github-settings`; `git diff --check`; exact-head and merged-main CI; authenticated GitHub Release, protected-environment, Cloudflare deployment, and public-origin evidence.
- Authorities: GitHub Actions `GITHUB_TOKEN` trigger semantics, immutable tag and GitHub Release state, repository release/deploy workflows and guards, Cloudflare production evidence.

### ST-091 — [DOCS] Complete fresh process-parity acceptance

- Dependency: ST-089 recovered the `v1.3.8` release and production deployment.
- Why: The wave should end from fresh evidence, not from assumptions made while planning.
- Scope: Re-audit SharkTank against the current WG-ARCH-001 §27 authority and active reference repositories across Node/npm, canonical commands, controlled history, squash-only merge policy, provider CLI/token contract, automated immutable tagging, retry-safe GitHub Release publication, guarded production deployment and post-deploy identity. Reconcile only current-state docs where drift remains, remove this task from `implementation_plan.md`, and retain the shared normalization task.
- Non-goals: No product feature or unrelated refactor.
- Acceptance: Fresh repository/provider evidence shows no hidden alternative controlled merge, tag, release or production path; documentation describes current behavior; only future shared normalization remains in the active queue.
- Validation: `npm ci`; `npm run check`; `npm run audit:dependencies`; `npm run verify:github-settings`; exact-head and merged-main CI; release/tag evidence; `git diff --check`.
- Authorities: current repository state, live provider state, current WG-ARCH-001 §27 and current reference repositories.

### ST-092 — [OPS] Normalize shared package, workflow, and npm command contracts

- Dependency: ST-091 delivered; portfolio planning policy ST-090 merged. Coordinate with the same normalization task in every public sibling repository.
- Why: Shared versioned tooling, workflow behavior, and npm command meanings have drifted across the public repositories.
- Scope: Inventory every public repository's direct and transitive shared npm packages, package manager, Node pin, lockfile, versioned vendor code, GitHub Action pins, workflow triggers/permissions/toolchain/install/check/advisory/identity/release/deploy steps, and npm scripts. Select one supported version for each shared vendor dependency or document a concrete compatibility exception. Align common scripts and YAML workflows to the same behavior for equivalent capabilities. Keep product-specific commands and explicit local-only/library/no-deploy boundaries. Reconcile AGENTS.md and the byte-identical CONTRIBUTING.md contract across the public set. Delete this active plan in the final delivery.
- Non-goals: Do not add unused packages, a hosted runtime to a local-only product, or production deployment merely for parity. Do not rewrite published history or unrelated product behavior.
- Acceptance: A fresh cross-repository matrix shows the same version for every shared versioned package/vendor tool where compatible, identical CONTRIBUTING.md bytes, equivalent workflow and npm-script semantics for applicable capabilities, and recorded exceptions with technical reasons. No workflow invokes a missing script; every package lock matches its manifest.
- Validation: Install each public repository with its pinned toolchain and `npm ci`; run `npm run check`, focused workflow/script contract tests, `git diff --check`, exact-head CI, and the separate network/provider gates where applicable. Re-fetch every target's base and this documentation commit before merging to preserve concurrent work.

## Invariants for this wave

- One task per controlled delivery; no later task begins in the same turn.
- Human-controlled ST work lands as one squash commit on `main`.
- `npm run check` remains the one canonical credential-free acceptance gate.
- `npm run audit:dependencies` remains the separate network advisory gate.
- `npm run verify:github-settings` remains read-only; `npm run apply:github-settings` remains the explicit bounded mutation path using only `GH_ADMIN_TOKEN` or `GH_TOKEN` from process environment.
- Published commits, tags and GitHub Releases are never rewritten.
- Production remains Cloudflare-only and must not become reachable from an arbitrary checkout.
- The final delivery deletes this plan instead of retaining completed history.
