# Active implementation plan

This is SharkTank's current/future process-convergence queue under WG-ARCH-001 §27. On `do needful`, re-fetch authoritative `main`, open PRs, exact-head CI, repository settings, rulesets, tags, releases and deployment state before changing anything. Finish a current authoritative PR for the first open task instead of duplicating it. Deliver exactly one queued task per controlled change, remove that task in the same delivery, and delete this file when the final task is complete.

Keep SharkTank's existing PHP parity, local HTTP acceptance, provenance controls, protected production environment, squash-only merge policy, immutable release tags, GitHub Release authority and Cloudflare deployed-version confirmation. `npm run dev` remains the safe whole-stack lifecycle shared with `npm run local`; `dev:worker` remains the narrow raw Worker path. Process ownership, reset/data preservation, bounded readiness, release-before-deploy ordering and exact release identity are authoritative constraints.

## Open tasks

### ST-077 — [BUILD] Standardize the GitHub settings CLI contract

- Dependency: ST-076 merged.
- Why: SharkTank already has pure settings tests plus read-only and apply commands, but its read-only command is named `check:github-settings` while the shared normalized command surface is test / verify / apply.
- Scope: Expose `test:github-settings`, `verify:github-settings` and `apply:github-settings` as the canonical command contract; preserve compatibility only where useful and update current documentation/validators to use the normalized names.
- Non-goals: Do not mutate GitHub from `npm run check`; no provider-policy change, release or deploy.
- Acceptance: Pure settings tests remain credential-free; `verify:github-settings` is read-only; `apply:github-settings` is the only explicit mutating path and independently re-verifies after apply.
- Validation: Settings CLI cases; `npm run check`; credential-free command paths; `git diff --check`.
- Authorities: `package.json`, settings scripts, committed repository-settings authority.

### ST-078 — [TEST] Complete repository-ruleset drift coverage

- Dependency: ST-077 merged.
- Why: Live provider state currently matches the high-level committed authority, but the comparison must prove every material field that protects controlled merges and immutable release tags rather than only rule names.
- Scope: Add focused pure cases for merge toggles, delete-branch behavior, required status-check identity, ruleset enforcement/target/include conditions and material rule configuration. Keep live provider verification separate from canonical acceptance.
- Non-goals: No provider mutation or new protection policy.
- Acceptance: Pure tests fail for each material drift that would weaken squash-only delivery, required exact-head verification, main protection or immutable `v*` tags while accepting harmless provider metadata differences.
- Validation: Focused settings cases; `npm run check`; `git diff --check`.
- Authorities: `config/github-repository-settings.json`, settings comparator/tests, live ruleset schema.

### ST-079 — [BUILD] Separate dependency advisories from canonical acceptance

- Dependency: ST-078 merged.
- Why: `npm run check` is documented as the complete credential-free repository gate but currently invokes live `npm audit`, mixing deterministic repository acceptance with a changing network advisory source.
- Scope: Remove live advisory lookup from canonical `check`; retain deterministic advisory-classification behavior/tests inside the repository gate; expose a named network advisory command and run it as an explicit CI/release gate using the shared severity policy.
- Non-goals: No ignored advisory, severity downgrade or dependency remediation unless current live evidence requires a separate controlled task.
- Acceptance: `npm run check` is deterministic with respect to repository inputs; network advisory status remains an explicit required provider gate and cannot silently disappear.
- Validation: Advisory classifier cases; `npm run check`; explicit network advisory command; exact-head CI; `git diff --check`.
- Authorities: `package.json`, CI/release workflows, dependency-advisory scripts/tests, organization baseline.

### ST-080 — [REFACTOR] Make production deployment a reusable release stage

- Dependency: ST-079 merged.
- Why: SharkTank already enforces publication-before-production and exact release-tag deployment, but the production job is embedded directly in `release.yml` while the normalized deployable-repository shape separates release authority from a reusable deploy workflow.
- Scope: Extract the existing production deployment behavior into a reusable `deploy.yml` called only after GitHub Release publication. Preserve `PRODUCTION_DEPLOY_ENABLED`, the protected `production` environment, Cloudflare secret boundary, exact release tag at HEAD, deployed Version ID proof, 100% traffic proof and current public-evidence limitation handling.
- Non-goals: No production deployment during the task, no secret mutation, no domain/runtime/protocol behavior change, and no weakening of release prerequisites.
- Acceptance: Release verification -> GitHub Release publication -> reusable production deploy is the only production path; deploy cannot run from arbitrary `main` or before publication.
- Validation: Release/deploy dependency tests; canonical `npm run check`; workflow review; exact-head CI; `git diff --check`.
- Authorities: `.github/workflows/release.yml`, reusable deploy workflow, deployment scripts, production environment policy.

### ST-081 — [DOCS] Complete shared process-parity acceptance

- Dependency: ST-080 merged.
- Why: The convergence wave should end with one fresh repository/provider comparison rather than relying on assumptions accumulated across individual tasks.
- Scope: Re-audit Node/npm authority, canonical acceptance, advisory-network gate, controlled history, exact-head and merged-main CI, squash-only merging, automatic branch cleanup, GitHub settings CLI, live rulesets, annotated semantic-tag identity, GitHub Release publication, reusable exact-tag production deployment and current-state documentation. Delete `implementation_plan.md` in this delivery when all applicable evidence is green.
- Non-goals: No feature work, package-version bump, tag creation, release publication or production deployment solely to satisfy the audit.
- Acceptance: Fresh repository and provider evidence show SharkTank follows the shared npm -> controlled merge -> provider CLI -> annotated tag -> GitHub Release -> exact-tag production deploy process everywhere applicable, with no active implementation queue remaining.
- Validation: `npm ci`; `npm run check`; explicit dependency-advisory gate; `npm run verify:github-settings`; live provider reads; release/tag workflow evidence; exact-head CI; merged-main CI; `git diff --check`.
- Authorities: current repository state, live GitHub/provider state and organization baseline.

## Recheck after this wave

After ST-081, enter fresh planning mode only if current repository or provider evidence shows new drift. Do not infer a release or production deployment from green CI, a release verification job, or a planning/audit task.
