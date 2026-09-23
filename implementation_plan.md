# Active implementation plan

This is SharkTank's current/future process-convergence queue under WG-ARCH-001 §27. On `do needful`, re-fetch authoritative `main`, open PRs, exact-head CI, repository settings, rulesets, tags, releases and deployment state before changing anything. Finish a current authoritative PR for the first open task instead of duplicating it. Deliver exactly one queued task per controlled change, remove that task in the same delivery, and delete this file when the final task is complete.

Keep SharkTank's existing PHP parity, local HTTP acceptance, provenance controls, protected production environment, squash-only merge policy, immutable release tags, GitHub Release authority and Cloudflare deployed-version confirmation. `npm run dev` remains the safe whole-stack lifecycle shared with `npm run local`; `dev:worker` remains the narrow raw Worker path. Process ownership, reset/data preservation, bounded readiness, release-before-deploy ordering and exact release identity are authoritative constraints.

## Open tasks


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
