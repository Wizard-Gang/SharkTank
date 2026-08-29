# Contributing to SharkTank

Thank you for helping improve SharkTank. This repository contains the complete Worker host, deterministic TypeScript game runtime, browser client, and PHP parity proof.

## Local setup

Use Node.js 24, npm, and PHP 8.2 or newer:

```sh
npm ci
npm run verify
```

For the local Worker, copy `.env.example` to an ignored local configuration file, provide non-production values, and run:

```sh
npm run dev
```

The application is available at `http://127.0.0.1:8787`. In a second terminal, verify the evidence-bearing routes with:

```sh
npm run check:evidence -- http://127.0.0.1:8787
```

## Pull requests

Keep a pull request focused on one auditable outcome. Explain risk, controls, evidence, rollback needs, and the commands actually run. New behavior needs tests. Changes to public assurance claims must update their evidence and must not turn a limitation into an unsupported assertion.

Use the structured commit format in `AGENTS.md`. Maintainers may squash a pull request only if the resulting commit retains that structure and the provenance map remains accurate.

## Security reports

Do not open a public issue for a vulnerability. Follow `SECURITY.md` instead.
