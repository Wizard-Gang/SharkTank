# SharkTank repository normalization plan

**Authority:** WG-ARCH-001 §27 (WizardGang repository baseline)
**Starting point:** `main` after ST-048
**Purpose:** converge SharkTank on the WizardGang product-repository baseline without changing product behavior merely for architectural fashion.

## 1. Goal

SharkTank should finish as a small, current-state product repository with one clear build/check path, an explicit game-client boundary, React-rendered HTML documents, strict CSP, concise current documentation, Git/GitHub as historical authority, and repository settings that match the organization standard.

The work must preserve the realtime game, Durable Object identities and migrations, protocol behavior, production storage bindings, PHP parity proof, security boundaries, and release/deploy safety unless a task explicitly says otherwise.

## 2. Baseline already adopted

ST-048 established the repository-level shell of WG-ARCH-001:

- exact Node 26 in `.node-version` and `engines.node` `26.x`;
- exact npm 11 in `packageManager`, `engines.npm` `11.x`, and `engine-strict=true`;
- explicit `allowScripts` approvals;
- ESM and committed lockfile;
- Wrangler 4 / Workers Static Assets / Vite 8 remain the deployment and browser-build path;
- CI and release workflows read `.node-version`;
- `npm run check` is the primary validation command name.

Those choices are now constraints, not items to revisit during the normalization series.

## 3. Remaining verified gaps

### Toolchain and validation

- TypeScript is still `^5.6.0`; WG-ARCH-001 requires TypeScript 7 in strict mode.
- Vitest is still `^4.1.11`; the baseline requires Vitest 5 for TS/TSX/DOM tests.
- React / React DOM are 18.x and `@react-three/fiber` is 8.x; the baseline presentation target is React 19, and the existing Dependabot policy explicitly blocks the R3F 9 major until that migration occurs.

### Presentation and Worker structure

- `src/worker/index.ts` still combines routing, security response construction, current operational data, HTML rendering, historical delivery data, and controller behavior in one very large module.
- Human pages are emitted as raw HTML strings rather than React 19 server/build-time components.
- The game shell is a hand-authored `index.html` mounted with `createRoot`; the game is a legitimate client-application boundary, but the document shell itself is not yet generated from the organization presentation model.
- Both the static game CSP and the server-page CSP still require `style-src 'unsafe-inline'`.
- Worker-generated HTML contains many inline `style=` attributes and embedded `<style>` blocks; `index.html` also carries an inline `<style>` block.
- `wrangler.jsonc` uses Static Assets `not_found_handling: "single-page-application"` even though the baseline does not use a client-side router. SharkTank needs an explicit `/play/` client-app boundary and ordinary unknown-path behavior rather than repository-wide SPA fallback semantics.

### History and documentation authority

- `docs/RECONSTRUCTION.md` and `docs/history/LEGACY-INVENTORY.md` retain reconstruction narrative that belongs in Git/GitHub once no validator requires it.
- `docs/history/CHANGE-MAP.csv` still grows with forward changes. WG-ARCH-001 allows exact validator/provenance exception data, but not a parallel forward implementation-history ledger.
- The runtime `ROADMAP_MANIFEST` presents checked-in ST/change history as product content. Current operational evidence may remain; implementation history should come from Git/GitHub.


## 4. Normalization rules

1. One controlled ST change at a time. Start each task from fresh `main` after its dependency is merged.
2. Do not combine dependency majors, rendering migrations, CSP work, documentation retirement, and repository-settings changes into one PR.
3. Preserve behavior first; structural tasks should have explicit parity tests before they remove old code.
4. Do not expand `src/worker/index.ts` to complete this plan. New rendering/routing work moves into focused modules.
5. Do not add D1, GraphQL, MCP, SAML, Tailwind, or other supported architecture features merely because WG-ARCH-001 mentions them. Add a capability only when SharkTank needs it.
6. The realtime game remains an explicit client application. The rest of the site remains usable as complete HTML without JavaScript.
7. No production deploy is part of this normalization sequence. Release/deploy work is a separate controlled decision after acceptance.
8. Published tags and existing Git history are immutable. Corrections move forward.

## 5. Product invariants during normalization

Unless a task explicitly authorizes a change, preserve:

- `Room` and `Lobby` Durable Object class identities and migration tag `v1`;
- the stable `global` Lobby identity and room-ID semantics;
- R2 production/development prefix separation and existing production object namespace;
- WebSocket protocol and deterministic game/replay behavior;
- the optional PHP parity runtime and its protocol contract;
- canonical product destinations `/`, `/controls/`, `/evidence/`, and `/play/` until a later route-specific change says otherwise;
- fail-closed production deployment and exact-tag release identity;
- public evidence claims only when backed by executable/runtime evidence.

## 6. Task lifecycle and handoff

`implementation_plan.md` contains only current and future normalization work. The pull request that completes a task removes that task's section from this file, so the successful merge purges completed work from `main`. Git commits, pull requests, CI runs, tags, and releases retain the historical record; do not preserve completed task narratives here.

After a task is successfully merged and its plan entry is therefore purged, finish the working session with a ready-to-run prompt for the next remaining task. The handoff prompt must include the repository, authoritative `main` SHA, satisfied dependency, required branch and commit/PR title, task scope and acceptance criteria, validation commands, and the merge/purge completion rule. Do not begin the subsequent task in the same session unless the user explicitly asks to continue.

## 7. Sequenced controlled changes

### ST-062 — REFACTOR — Remove implementation history from the runtime product surface

**Depends on:** ST-050 and preferably ST-057.

Required outcome:

- retire the checked-in `ROADMAP_MANIFEST`/ST-by-ST delivery history as product content;
- retain current operational state, incidents, control receipts, release identity, and other evidence only where they are true current/operating records;
- source historical code changes from Git/GitHub instead of duplicating them in Worker source;
- remove route/page copy whose only purpose is narrating old implementation changes.

### ST-063 — DOCS — Consolidate current-state documentation

**Depends on:** ST-061 and ST-062.

Required outcome:

- review every remaining `docs/**` file against WG-ARCH-001 documentation authority;
- keep concise current Architecture, Security, Operations, Continuity, Deployment, Release, AI applicability, and Parity material only where each has a distinct current purpose;
- retire `docs/RECONSTRUCTION.md`, `docs/history/LEGACY-INVENTORY.md`, and other historical narrative once the exact provenance validator data is sufficient;
- remove duplicate, former, prior, retired, migrated, and implementation-history prose from current-state docs;
- update README links and make `README.md` the concise entry point rather than another policy store.

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

## 8. Completion definition

Normalization is complete when ST-064 is merged and green. At that point:

- `npm run check` is the single credential-free repository acceptance gate;
- Git/GitHub are the historical source of truth rather than Markdown mirrors;
- the Worker is separated into understandable route/domain/presentation modules;
- non-game HTML is React-rendered and no-JavaScript usable;
- `/play/` is the one explicit client-application boundary;
- CSP does not require `unsafe-inline`;
- repository settings match the committed organization baseline;
- remaining docs describe the system that exists now.

A release or production deployment after that acceptance is a separate controlled change and is not implied by this plan.
