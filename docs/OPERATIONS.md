# Operations

## Routine signals

The public `/trust/` page links to the owner of each operational figure. `/status/` carries availability, incidents, room capacity, backup results, control-history integrity, and delivery records. `/spend/` owns the metered ceiling. `/logs/` owns retained service and game capture records. `/version.json` identifies the deployed release without exposing a platform deployment identifier.

## Operator boundary

`/admin/` and authenticated JSON routes require TLS and the `OPS_USERNAME` and `OPS_TOKEN` Cloudflare secrets. Public callers should receive 401 without learning which credential field was wrong. State-changing admin requests additionally require same-origin action headers and write control receipts.

## Incident flow

Confirm the signal, contain with the smallest appropriate control, preserve the incident and receipt records, restore service, verify the evidence and version routes, then document cause and corrective action. Spend enforcement fails closed: raising the limit is an owner decision, not an automated recovery action.

## Local verification

Run `npm run verify`, start `npm run dev`, then run `npm run check:evidence -- http://127.0.0.1:8787`. Production verification uses the same evidence walk against the canonical origin after an authorized tagged deployment.
