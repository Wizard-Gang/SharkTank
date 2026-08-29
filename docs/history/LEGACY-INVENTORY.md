# Legacy source inventory

Inventory captured on 2026-08-28 before public repository creation.

| Source | Committed history inspected | Product role | Public destination |
| --- | ---: | --- | --- |
| `SouthernGentlemen/WizardGangLocal` | 28 commits, 25 tracked paths at the source baseline | Worker host, deployment, operations, governance, client shell | repository root, `src`, `scripts`, `docs`, configuration |
| `SouthernGentlemen/ModuleReact3Fiber` | 8 commits | deterministic engine, protocol, storage, React/Three client | `vendor/ModuleReact3Fiber` as ordinary tracked files |
| `SouthernGentlemen/ModulePHP` | 2 committed source states, 14 tracked paths at committed HEAD | optional PHP protocol and replay parity proof | `packages/php-runtime` as ordinary tracked files |

Every committed source state was inspected. Historical wrapper states were materialized with their referenced module SHAs and build-checked. The `c942d96` wrapper state was inseparable from its immediately following module-pointer correction `d96fae5`; ST-007 consolidates them and records both sources instead of preserving a knowingly unbuildable public commit.

The current private PHP checkout contained local modifications to its README, two server files, and an untracked name-policy file. They were excluded because they had no committed or deployment provenance. The legacy repositories' local `AGENTS.md` and other unrelated working state were also left untouched.

Excluded from every public commit: credentials and local environment values, Cloudflare account identifiers, live profiles, operational exports, raw reports, backup objects, generated dependencies, build output, and local runtime state.
