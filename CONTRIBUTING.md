# Contributing to SharkTank

Thank you for helping improve SharkTank. This repository contains the complete Worker host, deterministic TypeScript game runtime, browser client, and PHP parity proof.

## Local setup

Use the Node.js version pinned in `.node-version`, npm 11, and PHP 8.2 or newer:

```sh
npm ci
npm run check
```

For the local Worker, copy `.env.example` to an ignored local configuration file, provide non-production values, and run:

```sh
npm run dev
```

The application is available at `http://127.0.0.1:8787`. In a second terminal, verify the evidence-bearing routes with:

```sh
npm run check:evidence -- http://127.0.0.1:8787
```

## Planning queue

`implementation_plan.md` exists only while SharkTank has queued current/future work. Work the first task only; if its dependency is unsatisfied, report it as blocked rather than skipping to a later task. The pull request that delivers a task removes that task from the plan, and if it was the final task, deletes the exhausted plan instead of retaining a placeholder.

When no implementation plan exists, a `do needful` turn is planning-only: re-audit current repository and provider state, publish a new dependency-ordered wave of small tasks, and stop before implementing the first new task. A single turn therefore completes either one controlled delivery or one fresh planning wave.

## Pull requests

Keep a pull request focused on one auditable outcome. Explain risk, controls, evidence, rollback needs, and the commands actually run. New behavior needs tests. Changes to public assurance claims must update their evidence and must not turn a limitation into an unsupported assertion.

Use the structured commit format in `AGENTS.md`. Human-controlled pull requests carry one controlled commit and land as one commit on `main`; squash merge is the accepted merge method when needed to preserve that shape. The landed commit must retain the complete structured record.

## Security reports

Do not open a public issue for a vulnerability. Follow `SECURITY.md` instead.
