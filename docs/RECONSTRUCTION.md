# Historical reconstruction

## Declaration

This public repository history is reconstructed from the original private
`SouthernGentlemen/WizardGangLocal` implementation, the private game and PHP
runtime sources it referenced, deployed artifacts, public operational evidence,
and production behavior.

The reconstructed commit structure does not assert that each public commit
originally existed as an independent Git commit. The new Git timestamps record
when the public reconstruction was performed. Original source commits and dates
are retained in `docs/history/CHANGE-MAP.csv`.

## Sources

| Source | Role |
| --- | --- |
| `SouthernGentlemen/WizardGangLocal` | Primary Worker, client host, operations, governance, deployment, and gitlink history |
| `SouthernGentlemen/ModuleReact3Fiber` | Game engine, browser client, protocol, and storage code formerly referenced as a private gitlink |
| `SouthernGentlemen/ModulePHP` | Optional PHP protocol-parity proof formerly required as a private sibling checkout |
| Deployed `sharktank.wizardgang.ai` | Evidence of the current production boundary and behavior |

The private source repositories remain immutable provenance. Their histories are
not copied wholesale.

## Reconstruction method

Reconstruction is temporal across source commits and spatial within a source
change where independent boundaries can be separated safely.

1. A reconstructed change takes its implementation from the historical source
   state that introduced it, not from the final tree.
2. Large source changes are decomposed in dependency order only when each
   intermediate state remains internally coherent and independently valid.
3. Tightly coupled source changes are consolidated when separating them would
   create a repository that cannot type-check or build. The contributing SHAs
   remain explicit.
4. Tests travel with the subject they verify. Validation is never claimed before
   its command exists and has passed.
5. A deployed defective state remains visible and is corrected forward when the
   later fix is historically meaningful.

## Mapping types

| Type | Meaning |
| --- | --- |
| `direct` | One source commit maps cleanly to one reconstructed change |
| `decomposed` | One source commit contributes to several controlled changes |
| `consolidated` | Several inseparable source commits contribute to one valid controlled change |
| `forward-change` | New public-engineering work performed after the reconstructed baseline |
| `controlled-record` | A record generated from the completed controlled history |

## Flattened private dependencies

The public repository must contain all SharkTank code. The historical
`vendor/ModuleReact3Fiber` gitlink is therefore reconstructed as ordinary tracked
files at the same path. The PHP proof is stored as ordinary first-party source in
`packages/php-runtime`. Exact nested SHAs are recorded in
`docs/history/NESTED-SOURCE-MAP.csv` when those sources enter the history.

This is a repository-topology transform, not a claim that the legacy repositories
had those directory shapes. It makes a public clone complete without changing the
runtime contract.

Local uncommitted changes in the legacy PHP checkout are excluded: they have no
source commit or deployment provenance and cannot truthfully enter reconstructed
history.

## Timestamps and releases

No old Git timestamp is fabricated. Every reconstructed commit carries the current
reconstruction time. Original dates live in the change map and each commit body.

Release boundaries follow meaningful deployed product phases rather than creating
one tag per commit. Each release note states its known limitations. No release or
document claims ISO certification: this is an ISO/IEC 27001:2022 and ISO/IEC
42001:2023 readiness exercise.

## Intentionally excluded information

- secrets, tokens, passwords, keys, `.env`, and `.dev.vars` values;
- Cloudflare account identifiers and unnecessary private infrastructure detail;
- live profiles, raw operational logs, report contents, and backup objects;
- personal information and uncommitted private-repository working state;
- generated dependencies, build output, and local runtime state.

## Audit direction

```text
live software → deployment → release → tag → commit → ST ID → reason and validation
              → source commit
```

```text
source change → ST ID → independently valid commit → release → deployment → live behavior
```

