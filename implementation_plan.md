# Active implementation plan

**Portfolio plan maintenance notice.** The owner may direct an additive update to this active queue while another task or pull request is in progress. Keep every existing open task and its order; a plan amendment neither implements nor retires it. After the shared policy setup, a routine amendment changes only this plan file. Before merging, re-fetch authoritative `main` and open pull requests, compare the current plan and exact head with the recorded base, and rebase/reconcile if either moved. Require current exact-head checks and mergeability so concurrent work is not overwritten. Any earlier “final task” or “no queue remains” wording applies to its original wave; it keeps this plan while appended tasks remain, and only the actual last task deletes it.

This is SharkTank's next current/future delivery-process convergence wave under WG-ARCH-001 §27. It was created from fresh repository and provider evidence after the prior queue was retired. Work only the first task. Each delivering change removes its own task; the final task deletes this file. Git, pull requests, Actions, annotated tags, GitHub Releases and provider evidence retain completed history.

The current repository is already squash-only with completed-branch cleanup, protected `main`, strict required `verify`, immutable `v*` tags, the normalized GitHub settings test/verify/apply CLI, credential-free canonical `npm run check`, separate live dependency advisories, exact annotated release identity, and a reusable workflow-call-only production stage. Do not rebuild those controls merely for cosmetic sameness.

## Open tasks

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
