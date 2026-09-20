# SharkTank contributor instructions

SharkTank is a WizardGang production product repository. WG-ARCH-001 §27 is the organization repository baseline, and `implementation_plan.md` is the authoritative sequence for the current normalization work.

Historical reconstruction evidence is preserved only where it is still required to prove provenance. Do not expand historical Markdown or provenance ledgers into a parallel forward changelog.

## Read first

Before a controlled change, read:

1. `implementation_plan.md` for the current task, dependencies, invariants, and acceptance criteria;
2. `docs/ARCHITECTURE.md`;
3. `docs/CHANGE-MANAGEMENT.md`;
4. `docs/RELEASE-MANAGEMENT.md` when release/deploy behavior is in scope.

For organization-baseline questions, read WG-ARCH-001 §27 in `SouthernGentlemen/wizardgang-architecture-demo/docs/ARCHITECTURE-STANDARD.md` and treat it as the higher-level baseline. Project-specific behavior may extend it only when SharkTank has a real requirement.

## Controlled-change discipline

- Work from an up-to-date `main` on one focused branch.
- Use the next free sequential `ST` identifier. Branches use `st-NNN-imperative-summary`.
- Commit and pull-request titles use `[ST-NNN] [TYPE] Imperative summary` with exactly one type from: `INIT`, `FEAT`, `FIX`, `SEC`, `API`, `A11Y`, `I18N`, `AI`, `DB`, `OPS`, `TEST`, `DOCS`, `REFACTOR`, `PERF`, `BUILD`, `REVERT`, `CHORE`.
- Dependabot's GitHub-verified dependency-bump commits are the only automated title/body exception currently accepted by repository validation.
- Include commit-body headings: `Change`, `Reason`, `Impact`, `Risk`, `Controls`, `Validation`, and `Evidence`, followed by either `Notes` or explicit `Source` and `Release` fields. Add `Rollback` for medium/high-risk operational changes.
- Never rewrite published commits or tags.
- Never commit credentials, `.env` files, private Cloudflare identifiers, production exports, or operator receipts containing private values.

Git history is authoritative for forward ST sequencing. Provenance ledgers are limited to imported source lineage from the reconstruction and must not receive forward change-history rows merely to duplicate Git.

## Normalization rules

- Follow the ST task order in `implementation_plan.md`; do not jump ahead across declared dependencies.
- Keep structural migrations behavior-preserving unless the task explicitly changes behavior.
- Do not grow `src/worker/index.ts` to implement presentation work. Extract focused modules instead.
- The realtime game is the explicit client-application boundary. Ordinary human documentation/operations pages must remain complete without JavaScript and must not become a hydrated SPA.
- Do not introduce D1, GraphQL, MCP, SAML, Tailwind, or another supported platform feature solely for conformity. Add only what the product needs.
- Preserve Durable Object identities/migrations, R2 production state boundaries, protocol semantics, PHP parity, and fail-closed release/deploy behavior unless the task explicitly authorizes a change.
- No production deployment is implied by a normalization task.

## Required validation

The complete credential-free repository gate is:

```sh
npm ci
npm run check
```

`npm run check` owns type checking, tests, PHP parity, production build validation, controlled-change policy/context validation when applicable, structured history, reconstruction provenance, local public-IA/evidence HTTP acceptance, dependency audit, and patch whitespace. The local HTTP gate starts and stops its own local-only Wrangler process; do not run a second Worker manually for repository acceptance.

Provider-authenticated checks remain explicit and separate. GitHub repository settings are governed by `config/github-repository-settings.json`; their pure comparison tests run inside `npm run check`, while live provider verification runs with `npm run check:github-settings` using an admin-capable token. `npm run apply:github-settings` is the explicit mutating path and must be followed by a fresh live verification. Do not invoke production deploy paths merely to validate a pull request.


## Implementation-plan maintenance and session handoff

- Standing shorthand: when the user says `do needful`, treat that as authorization to read current `main`, `AGENTS.md`, and `implementation_plan.md`; select the first remaining task whose dependencies are satisfied; and execute its complete workflow without requiring the user to restate the task.
- For `do needful`, perform branch -> implement -> validate -> commit -> pull request -> exact-head CI -> merge -> verify `main` -> purge the completed plan item. Do not stop at planning or "ready to merge" when the current change is green, current, and mergeable.
- After that merge/purge, end the session with the ready-to-run prompt for the next remaining task. Do not automatically start that subsequent task in the same session unless the user explicitly says to continue or says `do needful` again.
- If no task is open or the first open task has an unsatisfied dependency, report that state rather than inventing work.

- `implementation_plan.md` is current/future-state only. The PR that completes a planned task removes that task's section, so a successful merge purges completed work from `main`.
- Do not keep completed task summaries in the plan for historical purposes; Git, PRs, CI, tags, and releases are the history.
- After a successful merge and plan purge, end the session with a complete ready-to-run prompt for the next remaining task.
- That prompt must include the repository, authoritative `main` SHA, satisfied dependency, required branch and commit/PR title, task scope/acceptance criteria, validation, and the same merge/purge completion rule.
- Do not begin the subsequent task in the same session unless the user explicitly asks to continue.

## Completion workflow

The normal completion path is:

```text
branch -> implement -> validate -> commit -> pull request -> exact-head CI -> merge
```

If the current PR is the authoritative/up-to-date change, its exact head is green, and GitHub reports it mergeable, merge it. Do not stop at “ready to merge” unless the user explicitly says not to merge. Re-fetch the PR head and CI state before merging so a stale green run is never used as evidence.

Do not begin the next ST task until the current task's dependency state on `main` is authoritative.
