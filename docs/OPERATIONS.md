# Operations

## Routine signals

The public `/` governance overview links every operational figure to its source. `/evidence/` owns availability, incidents, continuity, control receipts, spend, controlled degradation, and logs. `/controls/` owns both standards' complete registers and every maintained governance document. Legacy human routes such as `/trust/`, `/status/`, `/spend/`, `/logs/`, `/audit/`, and `/policies/` redirect directly to the relevant canonical section; their machine-readable JSON and text evidence routes remain stable. `/version.json` identifies the deployed release without exposing a platform deployment identifier.

## Operator boundary

`/admin/` and authenticated JSON routes require TLS and the `OPS_USERNAME` and `OPS_TOKEN` Cloudflare secrets. Public callers should receive 401 without learning which credential field was wrong. State-changing admin requests additionally require same-origin action headers and write control receipts.

## Incident flow

Confirm the signal, contain with the smallest appropriate control, preserve the incident and receipt records, restore service, verify the evidence and version routes, then document cause and corrective action. Spend enforcement fails closed: raising the limit is an owner decision, not an automated recovery action.

## Verification

Run `npm ci` and `npm run check` for the complete credential-free repository gate. For focused manual public-information-architecture or evidence checks, start `npm run dev` and run `npm run check:public-ia -- http://127.0.0.1:8787` or `npm run check:evidence -- http://127.0.0.1:8787`.

GitHub Actions is authoritative for CI/release-run history. After an authorized tagged deployment, Cloudflare/provider evidence is authoritative for deployment state; public-origin checks supplement that provider proof when the edge is reachable.
