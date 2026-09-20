# SharkTank repository normalization plan

**Authority:** WG-ARCH-001 §27 (WizardGang repository baseline)
**Purpose:** finish the remaining repository-baseline acceptance work without changing product behavior merely for architectural conformity.

## Current constraints

- Preserve `Room` and `Lobby` Durable Object class identities and migration tag `v1`.
- Preserve the stable `global` Lobby identity, room-ID semantics, R2 production/development separation, WebSocket protocol, deterministic game/replay behavior, PHP parity contract, authentication, backup/restore behavior, CSP, and fail-closed release/deploy behavior unless the open task explicitly authorizes a change.
- `/play/` is the one explicit interactive client application boundary. Ordinary human pages remain complete without JavaScript and are not hydrated.
- `npm run check` is the complete credential-free repository acceptance gate.
- Git/GitHub are authoritative for implementation and release history. Current-state documentation must not become a parallel historical ledger.
- No production deployment is implied by repository normalization work.

## Task lifecycle

Work one controlled ST change at a time from fresh `main`. The pull request that completes a task removes that task from this file, so `implementation_plan.md` remains current/future-state only. After merge, verify the resulting `main` state before starting another task.

## Remaining controlled change

### ST-064 — TEST — Prove WG-ARCH-001 repository-baseline acceptance

**Depends on:** ST-053 through ST-063.

Final acceptance change; do not use it to introduce architecture.

Required outcome:

- full clean-clone `npm ci && npm run check` acceptance on Node 26/npm 11;
- verify TypeScript 7, Vite 8, Vitest 5, React 19, Wrangler 4, strict mode, and the explicit game-client boundary;
- generated-output scan proves no `unsafe-inline`, inline handlers, or unauthorized inline style/script surfaces;
- repository scan proves no `CHANGELOG.md` or per-version Markdown release archive;
- documentation scan proves current-state authority with only intentional provenance exception data remaining;
- GitHub settings verification proves merge/ruleset/tag-policy alignment;
- verify canonical public routes, APIs, WebSockets, Durable Object behavior, PHP parity, evidence routes, build artifacts, and ordinary unknown-path behavior;
- record remaining justified project-specific departures, if any, in `docs/ARCHITECTURE.md` rather than silently diverging.

## Completion definition

Normalization is complete when ST-064 is merged and green. A release or production deployment after that acceptance is a separate controlled change and is not implied by this plan.
