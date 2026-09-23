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
- Human-controlled ST work lands as one non-merge controlled commit on `main`. Keep the feature branch to one controlled commit; squash at merge when necessary. Do not use merge commits or rebase merges for controlled ST changes.
- Use the next free sequential `ST` identifier. Branches use `st-NNN-imperative-summary`.
- Commit and pull-request titles use `[ST-NNN] [TYPE] Imperative summary` with exactly one type from: `INIT`, `FEAT`, `FIX`, `SEC`, `API`, `A11Y`, `I18N`, `AI`, `DB`, `OPS`, `TEST`, `DOCS`, `REFACTOR`, `PERF`, `BUILD`, `REVERT`, `CHORE`.
- Dependabot's GitHub-verified dependency-bump commits are the only automated title/body exception currently accepted by repository validation.
- Include commit-body headings: `Change`, `Reason`, `Impact`, `Risk`, `Controls`, `Validation`, and `Evidence`, followed by either `Notes` or explicit `Source` and `Release` fields. Add `Rollback` for medium/high-risk operational changes.
- Never rewrite published commits or tags.
- Never commit credentials, `.env` files, private Cloudflare identifiers, production exports, or operator receipts containing private values.

Git history is authoritative for forward ST sequencing. Provenance ledgers are limited to imported source lineage from the reconstruction and must not receive forward change-history rows merely to duplicate Git.

## Normalization rules

- When `implementation_plan.md` exists, its first task heading is authoritative. Do not skip a blocked first task to take a later task; report the unmet dependency and stop controlled implementation for that turn.
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

Provider-authenticated checks remain explicit and separate. GitHub repository settings are governed by `config/github-repository-settings.json`; their pure comparison tests run inside `npm run check`, while live provider verification runs with `npm run verify:github-settings` using an admin-capable token. `npm run apply:github-settings` is the explicit mutating path and must be followed by a fresh live verification. Do not invoke production deploy paths merely to validate a pull request.


## Implementation-plan maintenance and session handoff

- Standing shorthand: when the user says `do needful`, re-fetch authoritative `main`, open pull requests, exact-head CI, and live repository settings, then read `AGENTS.md` and the active implementation plan if one exists.
- If `implementation_plan.md` exists, select only its first task. If that task has an unsatisfied dependency, report it as blocked and do not skip ahead. If it is ready, execute exactly that one controlled delivery.
- The delivering change must remove its own task from `implementation_plan.md`. If no task headings remain after that removal, delete `implementation_plan.md` in the same controlled change instead of leaving an empty or exhausted placeholder.
- If `implementation_plan.md` is absent at the start of a `do needful` turn, enter fresh planning mode: audit current repository and provider state against the applicable authorities, publish a new dependency-ordered current/future task wave, and stop before implementing the first newly planned task. One turn ends after either one controlled delivery or one fresh planning wave.
- Do not keep completed task summaries in the plan for historical purposes; Git, pull requests, CI, tags, releases, and provider evidence are the history.
- After a successful controlled delivery, end the session with a complete ready-to-run prompt for the next remaining task. That prompt must include the repository, authoritative `main` SHA, satisfied dependency, required branch and commit/PR title, task scope and acceptance criteria, validation, and the same merge/purge completion rule.
- If the delivered task exhausted and deleted the plan, hand off fresh planning mode instead of inventing another implementation task.
- Do not begin the subsequent task or a newly planned task in the same session unless the user explicitly asks to continue.

## Completion workflow

The normal controlled-delivery path is:

```text
branch -> implement + purge delivered task (or delete exhausted plan) -> validate -> one controlled commit -> pull request -> exact-head CI -> squash merge -> verify main
```

If the current PR is the authoritative/up-to-date change, its exact head is green, live repository settings match the committed authority, and GitHub reports it mergeable, squash it so the accepted ST change lands as one controlled commit on `main`. Do not stop at “ready to merge” unless the user explicitly says not to merge. Re-fetch the PR head, CI state, and provider settings before merging so stale evidence is never used.

Do not begin the next ST task until the current task's dependency state on `main` is authoritative.
