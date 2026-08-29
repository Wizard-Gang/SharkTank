# Operations

## Routine signals

The public `/` governance overview links every operational figure to its source. `/evidence/` owns availability, incidents, continuity, control receipts, spend, controlled degradation, logs, and change records. `/controls/` owns both standards' complete registers and every maintained governance document. Legacy human routes such as `/trust/`, `/status/`, `/spend/`, `/logs/`, `/audit/`, and `/policies/` redirect directly to the relevant canonical section; their machine-readable JSON and text evidence routes remain stable. `/version.json` identifies the deployed release without exposing a platform deployment identifier.

## Operator boundary

`/admin/` and authenticated JSON routes require TLS and the `OPS_USERNAME` and `OPS_TOKEN` Cloudflare secrets. Public callers should receive 401 without learning which credential field was wrong. State-changing admin requests additionally require same-origin action headers and write control receipts.

## Incident flow

Confirm the signal, contain with the smallest appropriate control, preserve the incident and receipt records, restore service, verify the evidence and version routes, then document cause and corrective action. Spend enforcement fails closed: raising the limit is an owner decision, not an automated recovery action.

## Local verification

Run `npm run verify`, start `npm run dev`, then run `npm run check:public-ia -- http://127.0.0.1:8787` and `npm run check:evidence -- http://127.0.0.1:8787`. The public information-architecture check covers canonical pages, navigation, IDs, anchors, assets, direct redirects, query preservation, and the sitemap. Production verification uses both checks against the canonical origin after an authorized tagged deployment.
