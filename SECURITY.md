# Security policy

## Supported version

Security fixes are made on the latest published release. Older published releases are not maintained release lines.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature for this repository. Include the affected route or component, reproduction steps, expected impact, and any suggested containment. Do not include real credentials or production data.

If private reporting is unavailable, contact the repository owner through the security contact listed on the GitHub organization profile and ask for a private channel. Please do not create a public issue until a fix or coordinated disclosure is ready.

The public in-product security-report route is evidence for the running service. GitHub private vulnerability reporting is the correct channel for source-repository vulnerabilities.

Canonical `npm run check` includes a bounded scan of tracked files and reachable
Git history for credential patterns. It reports only the path/object and finding
type, not matched values. The empty `.env.example` template, explicit
`test-`/`fake-`/`example` values, and source identifiers or regex syntax are
documented noncredential examples; pure cases cover current and older data.
