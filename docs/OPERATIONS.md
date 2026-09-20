# Operations

## Routine signals

The public `/` overview links operational figures to their source. `/evidence/` owns availability, incidents, continuity, control receipts, spend, controlled degradation, and logs. `/controls/` owns both standards' control registers and maintained governance documents. Compatibility human routes such as `/trust/`, `/status/`, `/spend/`, `/logs/`, `/audit/`, and `/policies/` redirect directly to the relevant canonical section; stable machine-readable JSON and text evidence routes remain available. `/version.json` identifies the deployed release without exposing a platform deployment identifier.

## Operator boundary

`/admin/` and authenticated JSON routes require TLS and the `OPS_USERNAME` and `OPS_TOKEN` Cloudflare secrets. Public callers receive 401 without learning which credential field was wrong. State-changing admin requests additionally require same-origin action headers and write control receipts.

## Incident flow

Confirm the signal, contain with the smallest appropriate control, preserve incident and receipt records, restore service, verify the evidence and version routes, then record cause and corrective action. Spend enforcement fails closed: raising the limit is an owner decision, not an automated recovery action.

## Verification

Run `npm ci` and `npm run check` for the complete credential-free repository gate. For focused manual public-information-architecture or evidence checks, start `npm run dev` and run `npm run check:public-ia -- http://127.0.0.1:8787` or `npm run check:evidence -- http://127.0.0.1:8787`.

GitHub Actions is authoritative for CI and release-workflow execution history. After an authorized tagged deployment, Cloudflare/provider evidence is authoritative for deployment state; public-origin checks supplement that provider proof when the edge is reachable.
