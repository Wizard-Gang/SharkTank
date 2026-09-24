# Active implementation plan

**Portfolio plan maintenance notice.** The owner may direct an additive update to this active queue while another task or pull request is in progress. Keep every existing open task and its order; a plan amendment neither implements nor retires it. After the shared policy setup, a routine amendment changes only this plan file. Before merging, re-fetch authoritative `main` and open pull requests, compare the current plan and exact head with the recorded base, and rebase/reconcile if either moved. Require current exact-head checks and mergeability so concurrent work is not overwritten. Any earlier “final task” or “no queue remains” wording applies to its original wave; it keeps this plan while appended tasks remain, and only the actual last task deletes it.

This is SharkTank's next current/future delivery-process convergence wave under WG-ARCH-001 §27. It was created from fresh repository and provider evidence after the prior queue was retired. Work only the first task. Each delivering change removes its own task; the final task deletes this file. Git, pull requests, Actions, annotated tags, GitHub Releases and provider evidence retain completed history.

The current repository is already squash-only with completed-branch cleanup, protected `main`, strict required `verify`, immutable `v*` tags, the normalized GitHub settings test/verify/apply CLI, credential-free canonical `npm run check`, separate live dependency advisories, exact annotated release identity, GitHub Release publication before production deployment, and a reusable workflow-call-only production stage. Do not rebuild those controls merely for cosmetic sameness.

Fresh evidence identified three remaining process gaps that this wave owns:

- `npm run deploy:wizardgangprod` can still perform a real production mutation from a local tagged checkout when local Cloudflare access exists, so the protected release workflow is not the only repository-owned production path;
- release tagging is still a manual semantic-tag push rather than a consequence of an accepted controlled version change on `main`;
- `gh release create` is not retry-safe after publication, so a workflow rerun can stop before an otherwise valid production retry.

The latest published release remains `v1.3.7`, which predates the current reusable release/deploy shape. This wave therefore ends by exercising the governed process once from a controlled version change instead of treating structural tests alone as production proof.

## Open tasks

### ST-084 — [OPS] Make real production deployment workflow-only

- Dependency: ST-083 merged.
- Why: `scripts/deploy-prod.mjs` loads local ignored environment state and can execute a real Wrangler production deploy from a tagged checkout outside the protected GitHub release path.
- Scope: Keep local dry-run capability, but make the mutating production command fail closed unless it is executing in the expected GitHub Actions semantic-tag release context with the exact release identity. Do not load local `.env` authority into the real production path. Keep Cloudflare credentials supplied by the protected `production` environment and retain provider-side Version ID/100%-traffic proof.
- Non-goals: No secret rotation, WAF change, alternate deployment provider or manual production escape hatch.
- Acceptance: A workstation checkout, arbitrary branch, untagged commit, mismatched tag or spoofed ordinary npm invocation cannot reach the repository-owned real Wrangler deploy path; the governed release workflow still can.
- Validation: deploy-command failure/success fixtures; dry run; release/deploy workflow contract cases; `npm run check`; `git diff --check`.
- Authorities: `scripts/deploy-prod.mjs`, package deploy commands, `.github/workflows/deploy.yml`, protected production environment.

### ST-085 — [BUILD] Create annotated release tags from merged version changes

- Dependency: ST-084 merged.
- Why: A release still depends on a separate manual tag push after the controlled version change, leaving tagging outside the normal reviewed merge path.
- Scope: Add a post-merge release-tagging path on `main` that detects an accepted root package-version change, proves the new semantic version is intentional and unreleased, and creates exactly one annotated `vX.Y.Z` tag on that exact merged commit. Ordinary main pushes without a version change create no tag. Existing matching state is idempotent; an existing conflicting tag is a hard failure and is never moved or recreated.
- Non-goals: No GitHub Release publication or production deployment logic moves into the tagging step.
- Acceptance: A controlled version-bump merge can create the immutable annotated tag without a workstation tagging step; non-version changes and conflicting existing tags cannot create or rewrite release identity.
- Validation: disposable Git/tag fixtures; workflow contract tests; `npm run check`; exact-head CI; `git diff --check`.
- Authorities: package version authority, release identity CLI, immutable `v*` ruleset, GitHub Actions.

### ST-086 — [BUILD] Make GitHub Release publication retry-safe

- Dependency: ST-085 merged.
- Why: The current `gh release create` step is correct for first publication but fails on a rerun after the Release already exists, preventing a safe retry of later stages.
- Scope: Keep first publication immutable and exact-tag. When the matching GitHub Release already exists, verify that it is the expected non-draft/non-prerelease Release for the same immutable tag and continue without rewriting it. Any mismatch fails closed.
- Non-goals: No release editing, tag movement, changelog archive or production deployment shortcut.
- Acceptance: First run creates the Release; a valid rerun verifies existing immutable publication and can continue; mismatched existing release state cannot be overwritten or silently accepted.
- Validation: release publication fixtures/contract cases; `npm run check`; exact-head CI; `git diff --check`.
- Authorities: annotated tag identity, GitHub Release API/CLI semantics, release workflow.

### ST-087 — [TEST] Prove version-to-production identity end to end

- Dependency: ST-086 merged.
- Why: The final process should be guarded as one chain rather than as individually plausible version, tag, Release and deploy steps.
- Scope: Extend credential-free contract coverage for controlled version change -> exact annotated tag -> tagged-state reproduction -> GitHub Release create-or-verify -> same-tag reusable production workflow -> guarded production CLI -> authenticated Cloudflare Version ID and 100%-traffic proof. Preserve the existing documented public-edge challenge fallback after provider proof.
- Non-goals: No live production deployment in ordinary PR acceptance and no WAF weakening.
- Acceptance: Wrong commit/tag/package identity, unpublished release state, release/deploy ordering drift, local production invocation or mismatched deploy handoff fails canonical acceptance.
- Validation: focused release/tag/deploy cases; `npm run check`; `npm run audit:dependencies`; exact-head CI; `git diff --check`.
- Authorities: release identity, tagging workflow, Release workflow, reusable deploy workflow, production deploy script.

### ST-088 — [OPS] Publish the first fully governed post-convergence release

- Dependency: ST-087 merged and live GitHub settings match committed authority.
- Why: SharkTank's latest published release `v1.3.7` predates the current reusable release/deploy process, so the standardized chain has not yet been exercised end to end.
- Scope: Make one controlled patch-version release change. If no intervening product release changes SemVer requirements, advance `1.3.7` to `1.3.8`. Use only the governed path: version-bump PR -> exact-head CI -> squash merge -> automatic annotated tag -> exact tagged reproduction -> GitHub Release create/verify -> optional protected production deployment -> provider identity verification.
- Non-goals: No unrelated product feature or refactor in the release change.
- Acceptance: GitHub records one immutable annotated tag and matching GitHub Release for the merged version commit; if production deployment is enabled, the protected workflow proves the same release through provider deployment evidence. Failures are reported, not bypassed.
- Validation: canonical repository checks; live settings verification; exact-head and merged-main CI; tag/Release/workflow evidence; production provider evidence when deployment runs.
- Authorities: live GitHub provider state, committed settings authority, release/deploy workflows, Cloudflare deployment evidence.

### ST-089 — [DOCS] Complete fresh process-parity acceptance

- Dependency: ST-088 merged.
- Why: The wave should end from fresh evidence, not from assumptions made while planning.
- Scope: Re-audit SharkTank against the current WG-ARCH-001 §27 authority and active reference repositories across Node/npm, canonical commands, controlled history, squash-only merge policy, provider CLI/token contract, automated immutable tagging, retry-safe GitHub Release publication, guarded production deployment and post-deploy identity. Reconcile only current-state docs where drift remains, then delete `implementation_plan.md`.
- Non-goals: No product feature or unrelated refactor.
- Acceptance: Fresh repository/provider evidence shows no hidden alternative controlled merge, tag, release or production path; documentation describes current behavior; no exhausted implementation queue remains.
- Validation: `npm ci`; `npm run check`; `npm run audit:dependencies`; `npm run verify:github-settings`; exact-head and merged-main CI; release/tag evidence; `git diff --check`.
- Authorities: current repository state, live provider state, current WG-ARCH-001 §27 and current reference repositories.

### ST-091 — [OPS] Normalize shared package, workflow, and npm command contracts

- Dependency: ST-089 delivered; portfolio planning policy ST-090 merged. Coordinate with the same normalization task in every public sibling repository.
- Why: Shared versioned tooling, workflow behavior, and npm command meanings have drifted across the public repositories.
- Scope: Inventory every public repository's direct and transitive shared npm packages, package manager, Node pin, lockfile, versioned vendor code, GitHub Action pins, workflow triggers/permissions/toolchain/install/check/advisory/identity/release/deploy steps, and npm scripts. Select one supported version for each shared vendor dependency or document a concrete compatibility exception. Align common scripts and YAML workflows to the same behavior for equivalent capabilities. Keep product-specific commands and explicit local-only/library/no-deploy boundaries. Reconcile AGENTS.md and the byte-identical CONTRIBUTING.md contract across the public set.
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
