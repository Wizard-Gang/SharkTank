# Change management

Git and GitHub are the authority for SharkTank implementation history. Human-controlled changes use the next sequential `ST-###` identifier, one WG-ARCH-001 §16 type, and the structured body required by `AGENTS.md`. Each accepted ST change lands as one non-merge controlled commit on `main`; feature branches remain one controlled commit and are squash-merged when necessary. Published commits and tags are immutable; corrections move forward as new controlled changes.

## Repository acceptance

```sh
npm ci
npm run check
```

`npm run check` is the complete credential-free acceptance gate. It covers TypeScript, tests, PHP parity, the production build, controlled-change policy, sequential history, reconstruction provenance, local public information architecture and evidence HTTP acceptance, GitHub-settings comparison tests, dependency audit, and patch whitespace.

Pull-request CI supplies event metadata to that same gate and otherwise performs the locked install plus `npm run check`.

## Provenance exception data

`docs/history/CHANGE-MAP.csv` and `docs/history/NESTED-SOURCE-MAP.csv` are exact validator inputs for imported source lineage. They are not a changelog, release archive, roadmap, or forward implementation ledger. New controlled changes do not add provenance rows merely to duplicate Git history.

## Provider settings

Expected GitHub merge and ruleset configuration is committed in `config/github-repository-settings.json`. SharkTank's repository-specific delivery policy is squash-only so each accepted ST change remains one controlled commit on `main`; merge commits and rebase merges are disabled. `npm run check:github-settings` is the read-only provider-authenticated verifier. `npm run apply:github-settings` is the explicit administrative mutation path.

Provider administration, release publication, and production deployment remain separate from the credential-free repository gate.
