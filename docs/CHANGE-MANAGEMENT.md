# Change management

Git history is the authority for forward SharkTank change sequencing. Every human controlled non-merge commit uses the next sequential ST identifier, one WG-ARCH-001 §16 type, and a structured body describing change, reason, impact, risk, controls, validation, and evidence. Medium- and high-risk operational changes include rollback guidance.

Published reconstruction commits that used the earlier `GOV` or `UX` labels are immutable. The history validator carries only exact ID/type exceptions for those published commits; new changes must use the current §16 vocabulary.

The provenance files under `docs/history/` exist only to prove imported source lineage from the private reconstruction sources. `docs/history/CHANGE-MAP.csv` contains source-backed reconstruction mappings, and `NESTED-SOURCE-MAP.csv` records imported nested-source commits. Forward changes do not add provenance rows merely to duplicate Git.

`npm run check` is the complete credential-free acceptance gate. It validates TypeScript, tests, PHP parity, the production build, the controlled-change contract, sequential history, reconstruction provenance, local public information architecture and evidence routes, dependency audit, and patch whitespace. Its local HTTP acceptance owns a local-only Wrangler lifecycle and strips Cloudflare provider credentials before starting the Worker.

Pull-request CI supplies event metadata to that same repository-owned gate and otherwise runs only the locked install plus `npm run check`. Provider-authenticated repository administration and production deployment remain separate explicit operations.

Published commits and tags are immutable. Corrections move forward as new controlled changes.
