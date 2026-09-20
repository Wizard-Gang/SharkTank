# Runtime parity

SharkTank's production runtime is TypeScript. The optional PHP runtime under `packages/php-runtime/` exists only to prove that the portable game protocol and deterministic replay contract are not accidentally dependent on the TypeScript implementation.

## Authority

- `vendor/ModuleReact3Fiber/` contains the first-party deterministic engine, protocol, and browser client source.
- The Worker uses that protocol for authoritative room simulation and replay behavior.
- `packages/php-runtime/` independently implements the parity surface used by the repository acceptance gate.

The PHP runtime is not a production host, fallback service, or alternate source of product behavior.

## Parity contract

For the same seed and ordered action stream, the parity proof must reproduce the protocol-level deterministic result expected by the TypeScript implementation. Changes to seeded randomness, action ordering, replay serialization, timing semantics covered by the contract, or protocol fields must keep the cross-language proof green.

## Validation

```sh
npm run test:php
npm run check
```

`npm run test:php` runs the focused PHP self-test. `npm run check` is authoritative repository acceptance and includes that parity proof with the TypeScript tests and production build.

Parity does not claim that PHP reproduces the browser UI, Cloudflare routing, Durable Object storage, R2 behavior, authentication, operations controls, or deployment behavior.
