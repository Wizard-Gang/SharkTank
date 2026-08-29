# Change management

Every non-merge commit uses an ST identifier, a change type, and a structured body describing change, reason, impact, risk, controls, validation, evidence, and provenance. Medium- and high-risk operational changes include rollback guidance. `npm run check:history` enforces the mechanical portion of that contract.

Pull requests should represent one auditable outcome. CI is read-only and verifies the lockfile install, TypeScript, unit tests, PHP parity, production bundle, dependency audit, structured history, and patch whitespace. Trust-route changes additionally require the live local evidence walk.

The provenance ledger maps reconstructed commits to immutable private-source SHAs without claiming that the public commits existed historically. Forward changes are marked separately. Published history and tags are immutable; corrections are new changes.
