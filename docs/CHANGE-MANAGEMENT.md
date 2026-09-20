# Change management

Git history is the authority for forward SharkTank change sequencing. Every human controlled non-merge commit uses the next sequential ST identifier, one WG-ARCH-001 §16 type, and a structured body describing change, reason, impact, risk, controls, validation, and evidence. Medium- and high-risk operational changes include rollback guidance. `npm run check:history` validates the mechanical contract directly from Git history.

Published reconstruction commits that used the earlier `GOV` or `UX` labels are immutable. The history validator carries only exact ID/type exceptions for those published commits; new changes must use the current §16 vocabulary.

The provenance files under `docs/history/` exist only to prove imported source lineage from the private reconstruction sources. `docs/history/CHANGE-MAP.csv` contains source-backed reconstruction mappings, and `NESTED-SOURCE-MAP.csv` records imported nested-source commits. `npm run check:provenance` verifies those mappings against immutable Git history. Forward changes do not add provenance rows merely to duplicate Git.

Pull requests represent one auditable outcome. CI is read-only and verifies the lockfile install, repository checks, structured history, provenance, and patch whitespace. Trust/public-IA changes additionally run the applicable local evidence acceptance until ST-052 folds credential-free acceptance into the top-level `check` command.

Published commits and tags are immutable. Corrections move forward as new controlled changes.
