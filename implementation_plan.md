# Active implementation plan

This is SharkTank's current/future process-parity wave under WG-ARCH-001 §27. The former empty placeholder is replaced by real open work. On `do needful`, re-fetch `main`, open PRs, exact-head CI and live settings; finish a current green authoritative PR first, then take only the first open task. A blocked first task is reported, not skipped. The delivering squash removes its own task and updates later scope. Delete this plan in its final delivery; Git/GitHub keep history. No task here authorizes a release or production deploy.

Keep SharkTank's existing PHP parity, local HTTP acceptance, provenance, dependency audit, provider settings, protected production environment, immutable release tags and Cloudflare deployed-version confirmation. `npm run dev` now uses the safe whole-stack lifecycle shared with `npm run local`; the narrow raw Worker path is explicitly named `dev:worker`. Process ownership, reset/data-preservation, and bounded local readiness protections remain authoritative. Tasks are intentionally one reviewable outcome each.

## Open tasks

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
