# Active implementation plan

This is SharkTank's current/future process-parity wave under WG-ARCH-001 §27. The former empty placeholder is replaced by real open work. On `do needful`, re-fetch `main`, open PRs, exact-head CI and live settings; finish a current green authoritative PR first, then take only the first open task. A blocked first task is reported, not skipped. The delivering squash removes its own task and updates later scope. Delete this plan in its final delivery; Git/GitHub keep history. No task here authorizes a release or production deploy.

Keep SharkTank's existing PHP parity, local HTTP acceptance, provenance, dependency audit, provider settings, protected production environment, immutable release tags and Cloudflare deployed-version confirmation. `npm run local` now fails closed around process ownership, clears only validated disposable checkout state by default, and preserves PHP developer data unless the exact destructive opt-in is supplied. It is ready for the next task to make it the standard `dev` entry point. Tasks are intentionally one reviewable outcome each.

## Open tasks

### ST-071 — [BUILD] Make `dev` the safe whole-stack entry point

- Dependency: ST-070 merged.
- Why: `dev` currently omits the PHP backend and managed lifecycle available through `local`, so the same command means less than the product's actual development session.
- Scope: Route `dev` through the now-safe local lifecycle, update the baseline validator's `dev` assertion, and retain a narrow TS-only command if needed. Preserve current browser/start behavior for the next task.
- Non-goals: No protocol behavior change or production deploy.
- Acceptance: One `dev` command starts the complete local stack and stops only owned children; the TS-only path remains explicitly named if needed.
- Validation: Focused lifecycle tests; `npm run check`; manual local smoke; `git diff --check`.
- Authorities: `package.json`, `scripts/local.mjs`, `README.md`.

### ST-072 — [FIX] Replace fixed-delay browser opening with readiness

- Dependency: ST-071 merged.
- Why: `scripts/local.mjs` opens a browser after a fixed delay and cannot be suppressed in a headless cloud session.
- Scope: Probe local readiness before reporting/opening the URL; add a no-open mode and bounded timeout with owned-process cleanup.
- Non-goals: No protocol change, production action or port reclamation.
- Acceptance: Browser opening follows readiness only, headless mode does not open it, and timeout exits cleanly.
- Validation: Focused readiness tests; `npm run check`; manual headless smoke; `git diff --check`.
- Authorities: `scripts/local.mjs`, `README.md`.

### ST-073 — [OPS] Publish the GitHub Release before production deployment

- Dependency: ST-072 merged.
- Why: Release `publish-release` and `deploy-production` both depend only on `verify`, so deployment can begin before publication succeeds.
- Scope: Make production deployment depend on successful exact-tag reproduction and GitHub Release publication; preserve the existing opt-in variable, protected environment and provider-version proof.
- Non-goals: Do not deploy, publish a release or change Cloudflare credentials in this task.
- Acceptance: Failed publication prevents a production deploy job; a successful tag still follows the current protected path.
- Validation: Focused workflow dependency test; `npm run check`; `git diff --check`.
- Authorities: `.github/workflows/release.yml`, `docs/RELEASE-MANAGEMENT.md`.

### ST-074 — [BUILD] Prove annotated tag and package identity before publication

- Dependency: ST-073 merged.
- Why: The release workflow runs `check` and `gh release --verify-tag`, but does not itself prove annotation, exact checkout and `package.json` version agreement before publication.
- Scope: Add a reusable exact-tag identity validation step for the tag event; keep `vMAJOR.MINOR.PATCH` and the existing deploy script's independent guard.
- Non-goals: No tag creation, version bump, release publication or provider mutation.
- Acceptance: Lightweight, mismatched and wrong-version tags fail before GitHub Release creation.
- Validation: Focused identity tests; `npm run check`; `git diff --check`.
- Authorities: `.github/workflows/release.yml`, `scripts/deploy-prod.mjs`.

### ST-075 — [TEST] Guard release and one-task process boundaries

- Dependency: ST-074 merged.
- Why: The release ordering/tag rules and plan lifecycle should fail visibly if a later edit regresses them.
- Scope: Add narrow, behavior-oriented tests for release job ordering and current/future plan semantics; keep the existing change-contract/history validators authoritative.
- Non-goals: No prose snapshot, runtime change or provider mutation. Delete this plan in the delivering PR unless fresh work is explicitly planned.
- Acceptance: A lost publication prerequisite or retained completed task produces a focused failure without freezing harmless wording.
- Validation: Focused process/release tests; `npm run check`; `git diff --check`.
- Authorities: `.github/workflows/release.yml`, `AGENTS.md`, plan validation scripts.

## Recheck after this wave

Audit current source/provider state again before planning further changes. In particular, reassess whether advisory-network failures should be distinguished in `check`, and whether the provider-settings comparison covers every material live ruleset field. Do not infer a deployment from a green CI or release job.
