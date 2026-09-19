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

## 3. Verified gaps after ST-048

### Toolchain and validation

- TypeScript is still `^5.6.0`; WG-ARCH-001 requires TypeScript 7 in strict mode.
- Vitest is still `^4.1.11`; the baseline requires Vitest 5 for TS/TSX/DOM tests.
- React / React DOM are 18.x and `@react-three/fiber` is 8.x; the baseline presentation target is React 19, and the existing Dependabot policy explicitly blocks the R3F 9 major until that migration occurs.
- `npm run check` currently runs typecheck, tests, PHP parity, build, and dependency audit, while `check:history` and `check:provenance` are separate CI steps.
- `check:evidence` and `check:public-ia` are credential-free local acceptance checks but are not orchestrated by `check`.
- `scripts/check-history.mjs` accepts any uppercase bracketed type rather than the complete §16 type vocabulary, and CI does not validate the pull-request title contract.

### Presentation and Worker structure

- `src/worker/index.ts` still combines routing, security response construction, current operational data, HTML rendering, historical delivery data, and controller behavior in one very large module.
- Human pages are emitted as raw HTML strings rather than React 19 server/build-time components.
- The game shell is a hand-authored `index.html` mounted with `createRoot`; the game is a legitimate client-application boundary, but the document shell itself is not yet generated from the organization presentation model.
- Both the static game CSP and the server-page CSP still require `style-src 'unsafe-inline'`.
- Worker-generated HTML contains many inline `style=` attributes and embedded `<style>` blocks; `index.html` also carries an inline `<style>` block.
- `wrangler.jsonc` uses Static Assets `not_found_handling: "single-page-application"` even though the baseline does not use a client-side router. SharkTank needs an explicit `/play/` client-app boundary and ordinary unknown-path behavior rather than repository-wide SPA fallback semantics.

### History and documentation authority

- `CHANGELOG.md` is still checked in.
- `docs/releases/` still contains 13 per-version Markdown release records plus an index.
- `docs/DEPLOYMENTS.md` is a checked-in historical deployment record.
- `docs/RECONSTRUCTION.md` and `docs/history/LEGACY-INVENTORY.md` retain reconstruction narrative that belongs in Git/GitHub once no validator requires it.
- `docs/history/CHANGE-MAP.csv` still grows with forward changes. WG-ARCH-001 allows exact validator/provenance exception data, but not a parallel forward implementation-history ledger.
- The runtime `ROADMAP_MANIFEST` presents checked-in ST/change history as product content. Current operational evidence may remain; implementation history should come from Git/GitHub.

### GitHub repository settings

- `main` is the default branch and merge commits are enabled.
- Repository metadata still allows squash merges and rebase merges.
- The repository currently exposes no repository rulesets through the GitHub API.
- There is no committed `config/github-repository-settings.json` (or equivalent) and no documented repository-settings verification command.
- The connected GitHub App cannot read the classic branch-protection endpoint, so the settings task must verify protection through an admin-capable path while treating the visible absence of rulesets and enabled squash/rebase methods as confirmed gaps.

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

- `Room` and `Lobby` Durable Object class identityes and migration tag `v1`;
- the stable `global` Lobby identity and room-ID semantics;
- R2 production/development prefix separation and existing production object namespace;
- WebSocket protocol and deterministic game/replay behavior;
- the optional PHP parity runtime and its protocol contract;
- canonical product destinations `/`, `/controls/`, `/evidence/`, and `/play/` until a later route-specific change says otherwise;
- fail-closed production deployment and exact-tag release identity;
- public evidence claims only when backed by executable/runtime evidence.

## 6. Sequenced controlled changes

### ST-050 — REFACTOR — Separate provenance from forward change history

**Depends on:** ST-049.

Make Git history the authority for forward ST sequencing while preserving reconstruction provenance only where it proves imported source lineage.

Required outcome:

- `check:history` validates strict sequential ST IDs from Git non-merge history and enforces the exact WG-ARCH-001 §16 type vocabulary;
- `check:provenance` validates immutable reconstruction/source mappings without requiring a new `CHANGE-MAP.csv` row for every forward change;
- stop extending reconstruction ledgers as a parallel forward changelog;
- update change-management documentation to state the new authority clearly;
- preserve enough immutable source mapping to substantiate the public reconstruction without fabricating or rewriting history.

### ST-051 — BUILD — Enforce the controlled-change contract in CI

**Depends on:** ST-050.

Required outcome:

- validate PR titles as `[ST-NNN] [TYPE] Imperative summary` with exactly one §16 type;
- validate the `st-NNN-imperative-summary` branch convention for human controlled changes;
- keep the narrow verified Dependabot exception without broadening it to arbitrary commits;
- make CI call the repository authority commands rather than duplicating policy in YAML;
- reject duplicate, skipped, or out-of-order controlled IDs.

### ST-052 — TEST — Make `npm run check` the complete credential-free acceptance gate

**Depends on:** ST-051.

Required outcome:

- `check` includes every validation that can run without provider credentials;
- start and stop the local Worker automatically for local HTTP acceptance rather than requiring a second terminal;
- include public IA and evidence-route acceptance in the normal gate when they can run locally;
- include history/provenance validation under the same top-level command;
- keep provider-authenticated repository/deployment checks separate and explicitly named;
- CI on PRs and `main` reduces to `npm ci` plus `npm run check` (and only genuinely external checks beyond that).

### ST-053 — BUILD — Codify WizardGang GitHub repository settings

**Depends on:** ST-051.

Required outcome:

- add committed expected repository settings under `config/`;
- only merge commits enabled; squash and rebase merges disabled;
- head branches deleted after merge;
- `main` ruleset requires PR + required CI and blocks force-push/delete;
- `v*` tag ruleset blocks update/delete;
- add a documented verification command/script;
- apply and verify the settings through an admin-capable GitHub path without weakening protections just to make automation convenient.

### ST-054 — BUILD — Upgrade TypeScript 7 and Vitest 5

**Depends on:** ST-052.

Required outcome:

- TypeScript 7 with strict mode remains green for every TS program, including the tracked first-party vendor program;
- Vitest 5 replaces Vitest 4;
- tooling does not depend on the TypeScript compiler API;
- update tests/config only as required by real migration differences;
- keep Vite 8, Wrangler 4, Node 26, and npm 11 fixed as the already-adopted baseline.

### ST-055 — BUILD — Upgrade React 19 and React Three Fiber 9

**Depends on:** ST-054.

Required outcome:

- React and React DOM 19;
- `@react-three/fiber` 9 and compatible first-party game client code;
- remove the obsolete Dependabot major-version ignore;
- preserve deterministic engine/protocol behavior and realtime gameplay acceptance;
- do not use this task to redesign the UI or server rendering architecture.

### ST-056 — REFACTOR — Split Worker routing, data, and presentation boundaries

**Depends on:** ST-055.

Behavior-preserving extraction before the rendering migration.

Required outcome:

- `src/worker/index.ts` becomes an orchestration/entry module rather than the owner of all HTML and operational presentation;
- move human route rendering, shared security-response helpers, route declarations, and presentation data adapters into focused modules;
- keep Durable Object, API, WebSocket, auth, backup, and operational behavior unchanged;
- add characterization tests around canonical routes, status codes, headers, and key generated content before deleting old helpers.

### ST-057 — REFACTOR — Render human documents with React 19 on the Worker

**Depends on:** ST-056.

Required outcome:

- `/`, `/controls/`, `/evidence/`, authenticated `/admin/`, maintenance/error human documents, and other Worker-owned HTML render from React/TSX using server/static rendering;
- documents remain complete and useful without JavaScript;
- progressively enhanced behavior moves to first-party TypeScript modules instead of inline script blocks where practical;
- raw HTML insertion, if still required for a narrow artifact, is confined to one audited component with explicit tests;
- no client hydration is introduced for ordinary documentation/operations pages.

### ST-058 — REFACTOR — Generate the game document shell from React

**Depends on:** ST-055. May run after ST-057 to reuse presentation primitives.

Required outcome:

- replace the hand-authored `index.html` document body/shell with a React 19 build-time document source;
- keep `/play/` documented as the explicit client-application boundary;
- preserve a useful no-JavaScript/loading document before the game mounts;
- keep Vite responsible for content-hashed browser modules/styles;
- do not introduce a client-side router or hydrate the non-game site.

### ST-059 — SEC — Remove inline styling and `unsafe-inline` CSP

**Depends on:** ST-057 and ST-058.

Required outcome:

- no production CSP contains `'unsafe-inline'`;
- no emitted HTML contains inline event handlers;
- remove inline `style=` attributes and embedded `<style>` blocks from Worker pages and the game shell;
- move static styles to Vite-processed CSS files;
- express dynamic charts/meters with safe SVG attributes, classes, or first-party enhancement code that does not require widening CSP;
- keep inline script/style only if explicitly hash- or nonce-authorized and justified; prefer external first-party modules;
- add automated generated-HTML/CSP regression checks.

### ST-060 — REFACTOR — Normalize Static Assets and unknown-route behavior

**Depends on:** ST-058 and ST-059.

Required outcome:

- remove repository-wide SPA fallback semantics;
- `/play/` intentionally serves the game client document and its Vite assets;
- unknown application paths and unknown assets produce ordinary 404 behavior unless a current documented route contract requires otherwise;
- no client-side router is required for canonical navigation;
- update public IA acceptance so it proves the final routing contract rather than legacy Vite fallback behavior.

Existing compatibility redirects are not automatically removed by this task: keep only those that still have a documented current compatibility requirement, and remove stale compatibility prose/logic when no such requirement remains.

### ST-061 — DOCS — Retire checked-in release and deployment history

**Depends on:** ST-050.

Required outcome:

- delete `CHANGELOG.md`;
- delete the per-version Markdown archive under `docs/releases/`;
- retire `docs/DEPLOYMENTS.md` as a checked-in historical receipt;
- point release history to annotated tags and GitHub Releases;
- point CI/deployment history to GitHub Actions and Cloudflare/provider evidence;
- keep only current release/deployment policy and operator instructions in repository prose.

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

## 7. Completion definition

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
