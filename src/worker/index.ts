// Local host Worker: serves the built R3F client (via ASSETS), a small JSON API
// (lobby / profile / global leaderboard) backed by the Lobby DO, and
// upgrades /room/:id/ws WebSockets into the Room Durable Object.
//
// Imports ONLY the server-safe entry points of module-react3fiber (never the client),
// so no browser libs leak into the Worker/DO bundle.

import { API } from "module-react3fiber/protocol";
import { OPENAPI, openApiToHtml } from "./openapi.js";
import { conformanceHtml, conformanceManifest, summarise, ALL_CONTROLS } from "./conformance.js";
import { governanceIndexHtml, governanceDocPageHtml, governanceMissingHtml, findGovernanceDoc, governanceManifest } from "./governance.js";

export { Room } from "./room-do.js";
export { Lobby } from "./lobby-do.js";
import type { BackupState } from "./lobby-do.js";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ROOM: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
  ENVIRONMENT?: string;
  OPS_USERNAME?: string;
  OPS_TOKEN?: string;
  AUDIT_GENERATION?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  PHP_HTTP_ORIGIN?: string;
  PHP_WS_ORIGIN?: string;
  PHP_ORIGIN_TOKEN?: string;
  /** Object storage. Bound in wrangler.jsonc; holds the state copies runBackup writes. */
  R2_ASSETS?: R2Bucket;
}

/** Applied to every response this Worker emits. HSTS keeps clients off plaintext after one visit. */
/**
 * CSP for the static asset path — the React game shell, which `html()` never touches.
 * That path had no CSP at all, so the SPA was the one surface with no injection control.
 *
 * The app ships as ES modules under /assets, so `script-src 'self'` is enough and no
 * nonce is needed; the bundle carries no inline script. `'unsafe-inline'` on style-src is
 * unavoidable — React writes `style={{…}}` as inline `style=` attributes, which
 * style-src-attr governs and a nonce cannot cover. `blob:`/`data:` on img-src are for
 * canvas readback and inlined sprites. `connect-src` covers the tank WebSocket, which is
 * same-origin; `wss:` is spelled out because `'self'` alone does not reliably match the
 * ws/wss scheme across browsers.
 */
/**
 * `script-src` carries BOTH `'self'` and a per-response nonce. `'self'` covers the app's own
 * modules under /assets. The nonce is not for anything this Worker writes — the SPA shell has
 * no inline script — it exists so Cloudflare's edge HTML rewriter has a nonce to copy onto the
 * analytics tags it injects downstream of this Worker. Without one it injects an unnonced
 * inline bootstrap and an external beacon, and a strict policy blocks both.
 *
 * This is why no external host is named here: the nonce authorises the edge's own injection
 * without widening the policy for anyone else.
 */
const assetCsp = (nonce: string) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss: https://cloudflareinsights.com; media-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  // Was set on the static asset path only, so the eight server-rendered pages — the ones
  // that exist to demonstrate the controls — shipped without it. It belongs in the one
  // table every response passes through, not on a single branch.
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * The billing window as the public may see it.
 *
 * The DO's own record carries the running deployment version id and the production R2
 * bucket name. Neither is a secret in the credential sense, but both are unauthenticated
 * infrastructure disclosure — the version id dates the running build and the bucket name
 * names a real storage target. `/audit/status.json` still gets the unredacted record; it
 * is behind ops auth and the dashboard reads both.
 *
 * Keyed on field name and applied at every depth, because the same shapes repeat under
 * `services` and `allTime.services`.
 */
const PUBLIC_BILLING_REDACTED = new Set(["versionId", "bucket"]);
function publicBillingWindow(value: Record<string, unknown>): Record<string, unknown> {
  return redactDeep(value) as Record<string, unknown>;
}
function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PUBLIC_BILLING_REDACTED.has(key)) continue;
    out[key] = redactDeep(child);
  }
  return out;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS },
  });
}

/**
 * Every inline `<script>` this file emits is written as `<script nonce="__WG_CSP_NONCE__">`.
 * `html()` is the single place that swaps the slot for a real per-response nonce, so an
 * emitter cannot drift out of sync with the header. Only the fully quoted attribute form is
 * substituted, and `esc()` turns `"` into `&quot;`, so no escaped value reaching the page
 * can forge a slot and read the nonce back out of the document.
 */
const NONCE_SLOT = "__WG_CSP_NONCE__";

/** 128 bits of CSPRNG entropy, base64. Fresh for every HTML response — never cached, never reused. */
function mintNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * `script-src` carries a nonce and NO `'unsafe-inline'`: under CSP3 the nonce alone makes an
 * unmarked inline script inert, which is the point — injected markup cannot guess the nonce.
 * `style-src` carries `'self'` for the one external stylesheet these pages link, and keeps
 * `'unsafe-inline'` because they also carry inline `style=` attributes everywhere and a nonce
 * cannot cover an attribute. `'self'` is the only widening here: without it the linked
 * stylesheet is blocked outright and every page renders unstyled.
 */
function html(body: string, status = 200): Response {
  const nonce = mintNonce();
  const body2 = body.split(`nonce="${NONCE_SLOT}"`).join(`nonce="${nonce}"`);
  const csp = `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'nonce-${nonce}'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
  return new Response(body2, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp, ...SECURITY_HEADERS, "referrer-policy": "no-referrer" },
  });
}

/**
 * A permanent move that keeps the security headers.
 *
 * Every route this restructure moved is cited from the conformance register, from the
 * policy set, and from whatever anyone else has already linked. A moved route that stops
 * answering turns a live evidence link into a dead one, which is a finding in its own
 * right — so the old names keep working rather than being deleted.
 */
function movedTo(url: URL, target: string): Response {
  return new Response(null, { status: 301, headers: { location: target, "cache-control": "no-store", ...SECURITY_HEADERS } });
}

/**
 * Read a request body with a hard byte ceiling, enforced on the bytes that actually arrive.
 *
 * `Content-Length` is absent on a chunked request, so a cap read from that header alone is
 * simply not applied to a body sent with `Transfer-Encoding: chunked` — the check passes on
 * `Number(null) === 0`. The header is still consulted first, because refusing an oversized
 * body before reading it is cheaper, but it is an optimisation rather than the control: the
 * stream is counted as it is consumed and cancelled the moment it passes the cap.
 *
 * Returns null when the body is too large. The caller turns that into a 413.
 */
const BODY_CAP_BYTES = 16_384;
async function readCappedBody(request: Request, cap = BODY_CAP_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > cap) return null;
  const stream = request.body;
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}

/** `/room/:id/ws` → the matching Room DO. Returns the room id, or null if not a room path. */
function parseRoomPath(path: string): string | null {
  const m = path.match(/^\/room\/([^/]+)\/ws$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function lobbyStub(env: Env): DurableObjectStub {
  return env.LOBBY.get(env.LOBBY.idFromName("global"));
}

const ALLOWED_ROOMS = new Set(["room-1", "room-2", "room-3", "room-4"]);
const PUBLIC_AUDIT_TYPES = new Set(["play", "customize"]);
function cookie(request: Request, name: string): string | null {
  const found = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(name + "="));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}
function profileId(request: Request): { id: string; fresh: boolean } {
  const existing = cookie(request, "wg_player");
  return existing && /^[a-f0-9-]{36}$/.test(existing) ? { id: existing, fresh: false } : { id: crypto.randomUUID(), fresh: true };
}
/**
 * Rate-limit identity for unauthenticated public writes. It must not be anything the
 * client chooses: `wg_player` is the caller's own cookie, so omitting it mints a fresh
 * identity — and a fresh bucket — on every request. CF-Connecting-IP is stamped by the
 * edge and cannot be set by the client. When it is absent (`wrangler dev`) every caller
 * falls into one shared bucket, which limits harder rather than softer.
 */
function connectionRateKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "edge";
}
/**
 * Every route that is credentialed or performs a control mutation. One list, used by every
 * gate — so a new control route cannot be added without also being gated.
 *
 * `/audit/` is deliberately absent: it is now the public conformance register, and a
 * register nobody can read proves nothing to anybody. The operator dashboard it used to
 * hold moved to `/admin/`, and the `/audit*` data routes stay credentialed as aliases of
 * their `/admin/` names so existing operator tooling keeps working.
 */
function isOpsPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/") ||
    path === "/audit.json" || path === "/audit.jsonl" ||
    path === "/audit/status.json" || path.startsWith("/audit/game/") || path.startsWith("/audit/replay/");
}

/** Loopback only — traffic that never leaves the machine, so `wrangler dev` still works. */
function isLoopback(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * TLS check. Behind Cloudflare the Worker URL is already https, but `cf-visitor` carries the
 * scheme the *client* actually used, so a plaintext client hop is still detectable.
 */
function isSecureRequest(request: Request, url: URL): boolean {
  const visitor = request.headers.get("cf-visitor");
  if (visitor) {
    try { return (JSON.parse(visitor) as { scheme?: string }).scheme === "https"; } catch { return false; }
  }
  const forwarded = (request.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return url.protocol === "https:";
}

/**
 * Constant-time compare over SHA-256 digests. Comparing the raw strings leaked the secret's
 * length through an early return; digests are always 32 bytes, so nothing is observable.
 */
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * Ops authentication. Fails closed in every direction:
 *  - no minted OPS_TOKEN  → deny (this previously fell open outside `ENVIRONMENT=production`)
 *  - not over TLS         → deny, because Basic auth is reversible base64
 *  - anything else        → deny
 * The only accepted credential is the token minted into the environment as a Worker secret.
 */
async function opsAuthorized(request: Request, env: Env, url: URL): Promise<boolean> {
  const token = env.OPS_TOKEN;
  if (!token) return false;
  if (!isSecureRequest(request, url) && !isLoopback(url)) return false;
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return constantTimeEqual(auth.slice(7), token);
  if (auth.startsWith("Basic ")) {
    let decoded: string;
    try { decoded = atob(auth.slice(6)); } catch { return false; }
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const [userOk, passOk] = await Promise.all([
      constantTimeEqual(decoded.slice(0, separator), env.OPS_USERNAME ?? "ops"),
      constantTimeEqual(decoded.slice(separator + 1), token),
    ]);
    return userOk && passOk;
  }
  return false;
}
function opsDenied(env: Env): Response {
  // No credential prompt when no token is configured — there is nothing valid to send.
  const headers: Record<string, string> = { "cache-control": "no-store", ...SECURITY_HEADERS };
  if (env.OPS_TOKEN) headers["www-authenticate"] = 'Basic realm="WizardGang Ops", charset="UTF-8"';
  return new Response(env.OPS_TOKEN ? "Operations authentication required" : "Operations authentication is not configured", { status: env.OPS_TOKEN ? 401 : 503, headers });
}
function tlsRequired(): Response {
  return new Response("TLS required. This endpoint refuses plaintext HTTP.", { status: 403, headers: { "cache-control": "no-store", ...SECURITY_HEADERS } });
}

interface MaintenanceState { enabled: boolean; changedAt: number; reason: string }
let maintenanceCache: { state: MaintenanceState; expiresAt: number } | null = null;
// `weight` biases the draw; everything defaults to 1.
const DOWNTIME_HEADLINES = [
  "Pool's Closed.",
  "The emergency shutoff valve held.",
  "The leak is plugged.",
  "Spend stopped at the gate.",
  "This outage is doing its job.",
  "Radar caught it.",
  "Spend stopped. Access did not.",
  "Shark sighted; risk stopped.",
] as const;
// Setup, then the turn. Each one runs a different joke engine — catchphrase, valuation,
// reversal, recursion, understatement, escalation, mirror, bureaucracy, euphemism — so a
// reader who sees several in a row never hears the same rhythm twice.
const DOWNTIME_QUIPS = [
  "The sharks pitched infinite scale. For that reason, the five-dollar limit is out.",
  "A shark valued the reef at forty million dollars. Billing valued it at four dollars and eighty cents.",
  "A hammerhead started the free trial. The free trial started on the hammerhead.",
  "The reef hired a consultant to explain the invoice. The consultant is now on the invoice.",
  "A mako called the overage a rounding error. It was the budget, rounded.",
  "The sharks asked for a bigger instance. Turns out we needed a bigger budget.",
  "The sharks called it growth. Finance called it Tuesday.",
  "The reef forecast hockey-stick growth. The meter brought a ruler.",
  "A tiger shark opened a tab. The control plane closed the bar.",
  "The reef found the upgrade button. Audit found the reef.",
  "The sharks formed a procurement committee. Nine meetings later, they approved a stapler.",
  "A great white filed a jet ski under transportation. Audit filed it under no.",
  "The sharks ordered premium chum for the table. Finance approved tap water.",
] as const;
type ChangeLabel = "feature" | "enhancement" | "fix" | "bonus" | "hotfix";
interface RoadmapEntry {
  id: string;
  at: string;
  label: ChangeLabel;
  deployment: string;
  title: string;
  summary: string;
  evidence: string[];
  /** Public evidence this entry answers to, e.g. the security report that triggered a hotfix. */
  reference?: { label: string; href: string };
}
const ROADMAP_MANIFEST: readonly RoadmapEntry[] = [
  { id: "WG-001", at: "00:00", label: "feature", deployment: "D01", title: "Serve the game and its operations pages from one Worker", summary: "Host the game and public operations as one controlled deployment.", evidence: ["Worker routing", "Durable Object tanks", "public operations routes"] },
  { id: "WG-002", at: "00:25", label: "feature", deployment: "D01", title: "Run the game simulation on the server", summary: "Run movement, growth, collisions, bots, and state on the server.", evidence: ["WebSocket simulation", "ocean-named tanks", "durable room state"] },
  { id: "WG-003", at: "00:55", label: "enhancement", deployment: "D01", title: "Add size-based combat, a dash and rockets", summary: "Large sharks eat smaller sharks; rockets beat every shark.", evidence: ["size-based combat", "dash ability", "rocket dot explosions"] },
  { id: "WG-004", at: "01:20", label: "fix", deployment: "D02", title: "Fix frame tearing and input lag", summary: "Tighten rendering and steering for mouse, keyboard, and touch.", evidence: ["snapshot interpolation", "local prediction", "large hit targets"] },
  { id: "WG-005", at: "01:50", label: "enhancement", deployment: "D02", title: "Adapt the game UI to any screen and input", summary: "Support desktop, keyboard-only, mouse-only, and mobile play.", evidence: ["ability controls", "gear menu", "responsive HUD"] },
  { id: "WG-006", at: "02:15", label: "feature", deployment: "D03", title: "Publish service and tank logs with downloads", summary: "Publish service and tank evidence without internal player identifiers.", evidence: ["/logs/", "sortable captures", "TXT CSV-style downloads"] },
  { id: "WG-007", at: "02:40", label: "enhancement", deployment: "D03", title: "Match the debug drawer to the public log format", summary: "Align the selected debug language with public tank logs.", evidence: ["desktop debug drawer", "language toggle", "matching log schema"] },
  { id: "WG-008", at: "03:05", label: "feature", deployment: "D03", title: "Map every product action to the usage it bills", summary: "Map product actions to Workers, Durable Objects, D1, and R2 usage.", evidence: ["/spend/", "binding-aware coverage", "free-tier anchors"] },
  { id: "WG-009", at: "03:30", label: "enhancement", deployment: "D04", title: "Stop gameplay when spend reaches the limit", summary: "Reset current-spend tracking and stop gameplay at the measured limit.", evidence: ["billing reset", "$5 threshold", "service-level gate"] },
  { id: "WG-010", at: "04:00", label: "feature", deployment: "D04", title: "Put maintenance, billing and alerts behind one panel", summary: "Keep maintenance, billing, alerts, and security controls together.", evidence: ["/admin/", "maintenance toggle", "four-character test alerts"] },
  { id: "WG-011", at: "04:25", label: "fix", deployment: "D04", title: "Restore gameplay without closing the investigation", summary: "Restoring gameplay ends impact without closing the investigation.", evidence: ["immediate lockdown", "separate maintenance event", "open investigation state"] },
  { id: "WG-012", at: "04:50", label: "enhancement", deployment: "D05", title: "Chain every control decision into a signed receipt", summary: "Link control decisions in an append-only SHA-256 receipt chain.", evidence: ["linked receipts", "incident references", "digestible history"] },
  { id: "WG-013", at: "05:15", label: "fix", deployment: "D05", title: "Stop tables clipping timestamps and identifiers", summary: "Contain timestamps, subjects, schemas, and identifiers at every viewport.", evidence: ["one-line identity cells", "controlled detail wrap", "contained horizontal scroll"] },
  { id: "WG-014", at: "05:35", label: "enhancement", deployment: "D05", title: "Keep the site up while the tank is closed", summary: "Keep the portal online while billing or operators close the Shark Tank.", evidence: ["independent delivery path", "controlled game access", "game-independent status surface"] },
  { id: "WG-015", at: "06:30", label: "enhancement", deployment: "D06", title: "Organise the evidence for ISO 27001 and 42001", summary: "Organize evidence toward ISO/IEC 27001 and ISO/IEC 42001.", evidence: ["risk and control evidence", "incident accountability", "independent assessment required"] },
  { id: "WG-016", at: "08:00", label: "fix", deployment: "D07", title: "Unify the wording across every page", summary: "Unify Shark Tank language, reason-coded evidence, and the final sales narrative.", evidence: ["mission-led roadmap", "reason-coded logs", "cross-route copy pass"] },
] as const;
async function maintenanceState(env: Env, fresh = false): Promise<MaintenanceState> {
  if (!fresh && maintenanceCache && maintenanceCache.expiresAt > Date.now()) return maintenanceCache.state;
  const res = await lobbyStub(env).fetch("https://lobby/maintenance");
  const data = (await res.json()) as { maintenance?: MaintenanceState };
  const state = data.maintenance ?? { enabled: false, changedAt: 0, reason: "" };
  maintenanceCache = { state, expiresAt: Date.now() + 1_000 };
  return state;
}
/**
 * The public writes that cost money: each one is a write into the single global Lobby
 * Durable Object, which is what the metered spend is mostly made of.
 */
const METERED_PUBLIC_WRITES = new Set<string>([API.profile, "/api/audit"]);
/**
 * Paths that keep answering while the gate is closed.
 *
 * The gate closes for two reasons: an operator opens it deliberately, or measured spend
 * reaches the hard limit and `enforceSpendLimit` closes it. In the second case the whole
 * point is to stop spending, so the routes that generate the billable writes have to close
 * with it — exempting all of `/api/*` meant the ceiling stopped the game while leaving the
 * two unauthenticated write paths taking Durable Object writes at full rate.
 *
 * Reads stay up: the evidence pages, the JSON behind them and `GET /api/*` are how anyone
 * finds out *why* the service stopped, and a transparency estate that goes dark at exactly
 * the moment it has something to explain is worth nothing. `/api/security-report` stays up
 * for the same reason — the white-hat intake must never be closed by a spend event.
 */
function maintenanceBypass(path: string, method: string): boolean {
  if (METERED_PUBLIC_WRITES.has(path) && method !== "GET" && method !== "HEAD") return false;
  // The stylesheet the bypassed trust pages link. Without this it would answer with the
  // downtime page under a text/css request and every bypassed page would render unstyled.
  if (path.startsWith("/styles/")) return true;
  return path === "/" || path === "/robots.txt" || path === "/sitemap.xml" ||
    path === "/api" || path.startsWith("/api/") ||
    path === "/docs" || path.startsWith("/docs/") || path === "/openapi.json" ||
    path === "/status" || path.startsWith("/status/") || path === "/status.json" ||
    path === "/incidents" || path.startsWith("/incidents/") || path === "/incidents.json" ||
    path === "/inquiry" || path.startsWith("/inquiry/") || path === "/inquiry.json" ||
    path === "/spend" || path.startsWith("/spend/") || path === "/spend.json" ||
    path === "/trust" || path.startsWith("/trust/") ||
    path === "/policies" || path.startsWith("/policies/") || path === "/policies.json" ||
    path === "/roadmap" || path.startsWith("/roadmap/") || path === "/roadmap.json" ||
    path === "/logs" || path.startsWith("/logs/") || path === "/logs.json" ||
    path === "/audit" || path.startsWith("/audit/") || path === "/audit.json" || path === "/audit.jsonl" ||
    path === "/admin" || path.startsWith("/admin/");
}
function downtimeResponse(state: MaintenanceState): Response {
  const tick = nextDowntimeTick(), headline = tickPick(DOWNTIME_HEADLINES, tick, 0), quip = tickPick(DOWNTIME_QUIPS, tick, 7);
  const trigger = state.reason || "Safety control active";
  const response = html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Game offline — Wizard Gang</title><style>${PAGE_CSS}body{display:grid;min-height:100vh;place-items:center;overflow-x:hidden;text-align:center}.downtime{width:min(720px,calc(100% - 24px));min-width:0;padding:24px}.downtime .card{width:100%;min-width:0;padding:clamp(26px,7vw,52px)}.downtime-mark{width:min(210px,64vw);margin:0 auto 12px;filter:drop-shadow(0 16px 34px rgba(34,230,255,.2))}.downtime-quip{margin:0 auto 22px;color:var(--muted)}.downtime-trigger{display:flex;align-items:center;justify-content:center;gap:10px;width:max-content;max-width:100%;margin:0 auto 22px;padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:rgba(11,10,20,.52);overflow:hidden}.downtime-trigger span{color:var(--faint);font-size:.68rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.downtime-trigger strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.downtime .action-link{max-width:100%;justify-content:center;text-align:center;white-space:normal}@media(max-width:420px){.downtime{padding:12px}.downtime .card{padding:24px 18px}.downtime-trigger{width:100%}}</style></head><body><main class="downtime"><div class="card hero-card"><div class="downtime-mark">${SHARK_MARK_SVG}</div><div class="eyebrow">Controlled outage · ${esc(headline)}</div><h1>The game is offline right now</h1><p class="downtime-quip">${esc(quip)}</p><div class="downtime-trigger"><span>Current trigger</span><strong>${esc(trigger)}</strong></div><p><a class="action-link" href="/status/">Check live status and incident history →</a></p></div></main></body></html>`, 503);
  response.headers.set("retry-after", "60");
  response.headers.set("cache-control", "no-store");
  return response;
}

function mix(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
function gcd(a: number, b: number): number { while (b) { const t = a % b; a = b; b = t; } return a; }
/**
 * Per-isolate request tick. A wall-clock tick is the wrong source here: several loads
 * inside the same second would all land on the same line, which is what makes a rotation
 * read as broken. Advancing once per rendered page guarantees movement on every refresh.
 * Seeded from CSPRNG on first use so separate isolates do not start in lockstep.
 */
let downtimeTick: number | null = null;
function nextDowntimeTick(): number {
  if (downtimeTick === null) downtimeTick = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  downtimeTick = (downtimeTick + 1) >>> 0;
  return downtimeTick;
}
/**
 * Walks an affine permutation of the list: every entry appears exactly once per cycle and
 * the order is reshuffled each cycle, so a reader never sees a repeat until they have seen
 * them all. Independent random draws clump instead — that is what looked non-random.
 */
function tickPick<T>(items: readonly T[], tick: number, salt: number): T {
  const n = items.length;
  if (n < 2) return items[0];
  const t = (tick + salt) >>> 0;
  const cycle = Math.floor(t / n), position = t % n;
  // `step` must be coprime with n for the walk to cover every entry; 1 always is.
  let step = 1 + (mix(cycle + salt) % (n - 1));
  for (let i = 0; i < n && gcd(step, n) !== 1; i += 1) step = (step % (n - 1)) + 1;
  const offset = mix(cycle * 3 + salt + 1) % n;
  return items[(position * step + offset) % n];
}

/** Post-delivery entries are stamped in elapsed project time, continuing past the
 *  eight-hour build. One formatter keeps them monotonic as hotfixes accumulate. */
function roadmapClock(minutesAfterBuild: number): string {
  const total = 9 * 60 + minutesAfterBuild;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The security report that drove the WG-018 hotfix. Public id, no internal detail. */
const HOTFIX_REPORT_ID = "white-hat-ce395a2b-6d48-49bd-b8e3-f58e6b58b162";
const HOTFIX_MINUTES = 7;
/** Hour nine of an eight-hour build. Shown on the map, deliberately excluded from every metric. */
const BONUS_ROADMAP_ENTRY: RoadmapEntry = { id: "WG-017", at: "09:00", label: "bonus", deployment: "D08", title: "Rewrite the outage jokes", summary: "Spent the bonus hour rewriting the outage jokes. Shipped zero business value, on time and under budget.", evidence: ["setup-and-punchline downtime copy", "tick-driven rotation, no repeats", "no measurable business value"] };
/** Emergency response to an independent white-hat report against the operations gate. */
const HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-018",
  at: roadmapClock(HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D09",
  title: "Require TLS and a token on the operations gate",
  summary: `Closed in ${HOTFIX_MINUTES} minutes. Operations auth had an unauthenticated fallback when no token was set. It now accepts only the minted token, over TLS, and denies when there is none.`,
  evidence: ["TLS required on every route", "no unauthenticated fallback path", "HSTS on every response", "constant-time token comparison"],
  reference: { label: "Security report and control receipts", href: "/status/#incidents" },
};
/** Everything after the eight-hour build. Rendered on the map, excluded from every metric. */
/** Second hotfix: the arena wall was lethal but never drawn, so deaths looked random. */
const GAME_HOTFIX_MINUTES = 10;
const GAME_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-019",
  at: roadmapClock(HOTFIX_MINUTES + GAME_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D10",
  title: "Draw the arena boundary that kills on contact",
  summary: `Closed in ${GAME_HOTFIX_MINUTES} minutes. The arena radius killed on contact but was never drawn. It now renders, with a warning band inside it.`,
  evidence: ["arena boundary drawn every frame", "red proximity band inside the last 14 units", "rockets restricted to players"],
  reference: { label: "Reproduced on production before the fix", href: "/logs/" },
};
/** Third hotfix: mobile play was unusable and the tank was too small to hold a lobby. */
const MOBILE_HOTFIX_MINUTES = 38;
const MOBILE_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-020",
  at: roadmapClock(HOTFIX_MINUTES + GAME_HOTFIX_MINUTES + MOBILE_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D11",
  title: "Add a thumbstick and ability pads for touch",
  summary: `Closed in ${MOBILE_HOTFIX_MINUTES} minutes. Tapping to steer spent the dash on every tap. Touch play now steers from a thumbstick, with the abilities on their own pads.`,
  evidence: ["floating thumbstick, pads under the other thumb", "32 sharks per tank", "centre-weighted dot spawns", "non-modal respawn card", "Feeding Frenzy event"],
  reference: { label: "Controls and layout verified on a phone viewport", href: "/status/#delivery" },
};
/** Fourth hotfix: copy that described the product instead of reporting on it, an
 *  availability window that forgot yesterday, and a log page showing 40 rows of a
 *  90-day record. */
const EVIDENCE_HOTFIX_MINUTES = 21;
const EVIDENCE_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-021",
  at: roadmapClock(HOTFIX_MINUTES + GAME_HOTFIX_MINUTES + MOBILE_HOTFIX_MINUTES + EVIDENCE_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D12",
  title: "Measure availability from project start, not 24 hours",
  summary: `Closed in ${EVIDENCE_HOTFIX_MINUTES} minutes. A rolling 24-hour availability window forgot every incident older than a day. Availability now runs from project start, and the logs page carries the full record.`,
  evidence: ["availability measured since project start", "labelled lanes, counted legend", "every marker links to its record", "full 90-day and 24-hour log windows"],
  reference: { label: "Availability bar and legend", href: "/status/#incidents" },
};
/** Fifth hotfix: three spend tables in three different shapes, and cost reported as a
 *  single instantaneous number with no trend. */
const INQUIRY_HOTFIX_MINUTES = 13;
const INQUIRY_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-022",
  at: roadmapClock(HOTFIX_MINUTES + GAME_HOTFIX_MINUTES + MOBILE_HOTFIX_MINUTES + EVIDENCE_HOTFIX_MINUTES + INQUIRY_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D13",
  title: "Merge three billing tables into one meter",
  summary: `Closed in ${INQUIRY_HOTFIX_MINUTES} minutes. Three billing tables in three column shapes compared against nothing. One meter now reads every service on a shared axis, and spend is sampled hourly and charted.`,
  evidence: ["one four-column meter for every service", "monthly limits normalised per day", "headroom bar on every row", "hourly spend samples charted"],
  reference: { label: "Usage against the free tier", href: "/spend/" },
};
/** Sixth hotfix: the incident report was showing the status page's availability bar. */
const INCIDENT_HOTFIX_MINUTES = 13;
const INCIDENT_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-023",
  at: roadmapClock(HOTFIX_MINUTES + GAME_HOTFIX_MINUTES + MOBILE_HOTFIX_MINUTES + EVIDENCE_HOTFIX_MINUTES + INQUIRY_HOTFIX_MINUTES + INCIDENT_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D14",
  title: "Chart incidents by cause, start and duration",
  summary: `Closed in ${INCIDENT_HOTFIX_MINUTES} minutes. The incident page redrew the status page's availability bar and said nothing about the incidents themselves. It now charts each incident by cause, start and duration.`,
  evidence: ["one lane per incident cause", "duration bars, diamonds for point events", "inception-to-now axis", "every mark links to its record", "shared with the roadmap"],
  reference: { label: "Incident chart", href: "/status/#incidents" },
};
/** Running total of post-delivery development minutes through WG-023. The security and
 *  accessibility hotfixes below continue the same clock. */
const POST_DELIVERY_MINUTES_THROUGH_WG023 =
  HOTFIX_MINUTES + GAME_HOTFIX_MINUTES + MOBILE_HOTFIX_MINUTES + EVIDENCE_HOTFIX_MINUTES + INQUIRY_HOTFIX_MINUTES + INCIDENT_HOTFIX_MINUTES;

/* WG-024 to WG-027 answer an independent security and accessibility review: one critical
 * security finding and three critical accessibility findings, shipped together as D15. */
const TAKEDOWN_HOTFIX_MINUTES = 12;
const TAKEDOWN_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-024",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG023 + TAKEDOWN_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D15",
  title: "Put taking the game offline behind authentication",
  summary: `Closed in ${TAKEDOWN_HOTFIX_MINUTES} minutes. The route that disabled the game was gated by two forgeable headers, one of them published in the public API document. Reporting and taking the game down are now separate operations, and only the takedown is authenticated.`,
  evidence: ["public intake records, never disables", "downtime moved behind operations auth", "one open lockdown at a time", "accepted reports throttled to one a minute"],
  reference: { label: "Control receipts", href: "/status/#incidents" },
};
const STATUS_HOTFIX_MINUTES = 6;
const STATUS_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-025",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG023 + TAKEDOWN_HOTFIX_MINUTES + STATUS_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D15",
  title: "Stop the status page reloading itself",
  summary: `Closed in ${STATUS_HOTFIX_MINUTES} minutes. A three-second full-page reload wiped screen-reader position and keyboard focus, with no way to stop it. Figures now update in place, and the refresh can be paused.`,
  evidence: ["no full-page reload", "values patched into a polite live region", "visible pause control", "20 origin hits a minute down to 4"],
  reference: { label: "Availability status", href: "/status/" },
};
const FOCUS_HOTFIX_MINUTES = 4;
const FOCUS_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-026",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG023 + TAKEDOWN_HOTFIX_MINUTES + STATUS_HOTFIX_MINUTES + FOCUS_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D15",
  title: "Stop dialogs stealing keyboard focus",
  summary: `Closed in ${FOCUS_HOTFIX_MINUTES} minutes. The in-game dialogs re-armed their focus trap on every re-render, throwing keyboard users back to the Close button twice a minute. The trap now arms once per dialog.`,
  evidence: ["focus trap arms once, not per render", "Escape and Tab cycling unchanged", "fix applies to every dialog"],
  reference: { label: "Play the game", href: "/play/" },
};
const CONTRAST_HOTFIX_MINUTES = 5;
const CONTRAST_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-027",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG023 + TAKEDOWN_HOTFIX_MINUTES + STATUS_HOTFIX_MINUTES + FOCUS_HOTFIX_MINUTES + CONTRAST_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D15",
  title: "Fix unreadable overlay text in light mode",
  summary: `Closed in ${CONTRAST_HOTFIX_MINUTES} minutes. The light theme turned overlay text near-black but left the panels behind it dark, hiding the score at 1.05:1. On-canvas overlays now keep one palette in both themes.`,
  evidence: ["1.05:1 to 18:1 in light mode", "dark mode unchanged", "covers heads-up display, leaderboard, banner, tools rail", "contrast preferences still honoured"],
  reference: { label: "Play the game", href: "/play/" },
};
/** Running total through WG-027. The three high-severity fixes below share the clock. */
const POST_DELIVERY_MINUTES_THROUGH_WG027 =
  POST_DELIVERY_MINUTES_THROUGH_WG023 + TAKEDOWN_HOTFIX_MINUTES + STATUS_HOTFIX_MINUTES + FOCUS_HOTFIX_MINUTES + CONTRAST_HOTFIX_MINUTES;

/* WG-028 to WG-030 answer the three high-severity findings from the same independent
 * review, shipped together as D16. Each closes an unauthenticated abuse path. */
const AUDITFLOOD_HOTFIX_MINUTES = 14;
const AUDITFLOOD_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-028",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG027 + AUDITFLOOD_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D16",
  title: "Key log throttling to the connection, not a cookie",
  summary: `Closed in ${AUDITFLOOD_HOTFIX_MINUTES} minutes. Public log writes were throttled against the visitor's own cookie, so dropping it bought a fresh allowance every request. Throttling is now keyed to the connection, under a ceiling shared by every visitor at once.`,
  evidence: ["rate key taken from the edge, never from the client", "global ceiling across every public writer", "public rows held to their own retention floor", "one storage call per write instead of two"],
  reference: { label: "Public service log", href: "/logs/" },
};
const SEATS_HOTFIX_MINUTES = 4;
const SEATS_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-029",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG027 + AUDITFLOOD_HOTFIX_MINUTES + SEATS_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D16",
  title: "Check tank capacity when a seat is taken",
  summary: `Closed in ${SEATS_HOTFIX_MINUTES} minutes. Seats were counted when a connection opened rather than when it sat down, so one client could open enough connections to claim every seat. Capacity is now checked at the moment a seat is taken.`,
  evidence: ["capacity enforced where the seat is claimed", "12 connections, 8 seated, 4 refused", "human seats unchanged at 8 per tank"],
  reference: { label: "Tank occupancy", href: "/status/" },
};
const INCIDENTCAP_HOTFIX_MINUTES = 9;
const INCIDENTCAP_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-030",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG027 + AUDITFLOOD_HOTFIX_MINUTES + SEATS_HOTFIX_MINUTES + INCIDENTCAP_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D16",
  title: "Bound the incident record so it cannot block recovery",
  summary: `Closed in ${INCIDENTCAP_HOTFIX_MINUTES} minutes. Incidents were stored as one ever-growing record, written by the same operation that restores service, so a long enough history would have blocked recovery. The record is now bounded, and only resolved incidents are archived.`,
  evidence: ["record kept well under the storage limit", "active incidents never archived", "oldest resolved incidents archived first", "every archival recorded with a reason code"],
  reference: { label: "Incident record", href: "/status/#incidents" },
};
/** Running total through WG-030. The seven accessibility fixes below share the clock. */
const POST_DELIVERY_MINUTES_THROUGH_WG030 =
  POST_DELIVERY_MINUTES_THROUGH_WG027 + AUDITFLOOD_HOTFIX_MINUTES + SEATS_HOTFIX_MINUTES + INCIDENTCAP_HOTFIX_MINUTES;
const STATUSMSG_HOTFIX_MINUTES = 11;
const STATUSMSG_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-031",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG030 + STATUSMSG_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D17",
  title: "Announce search and paging results once",
  summary: `Closed in ${STATUSMSG_HOTFIX_MINUTES} minutes. Searching or paging the evidence tables rewrote the record count in silence, and a paging button that switched itself off dropped the keyboard to the top of the page. The count now speaks the whole result once per settled search, and the buttons keep their place.`,
  evidence: ["one announcement per settled query, not per keystroke", "match count and page position in a single sentence", "paging buttons never take focus away", "same fix on the authenticated control panes"],
  reference: { label: "Public evidence", href: "/logs/" },
};
const CHARTSTOP_HOTFIX_MINUTES = 3;
const CHARTSTOP_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-032",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG030 + STATUSMSG_HOTFIX_MINUTES + CHARTSTOP_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D17",
  title: "Stop chart marks swallowing the keyboard",
  summary: `Closed in ${CHARTSTOP_HOTFIX_MINUTES} minutes. Each mark on the incident and availability charts was a keyboard stop that announced nothing and showed no focus ring. The marks are pointer shortcuts again, and the same records are ordinary links beside each chart.`,
  evidence: ["no unnamed stops left in either chart", "mouse and touch behaviour unchanged", "every mark still reachable from the list below", "page copy states the keyboard route"],
  reference: { label: "Incidents", href: "/status/#incidents" },
};
const APIHEADING_HOTFIX_MINUTES = 8;
const APIHEADING_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-033",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG030 + STATUSMSG_HOTFIX_MINUTES + CHARTSTOP_HOTFIX_MINUTES + APIHEADING_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D17",
  title: "Give every API endpoint its own heading",
  summary: `Closed in ${APIHEADING_HOTFIX_MINUTES} minutes. The API reference had one heading and thirty-one identically named sections beneath it, so assistive software could not reach a particular endpoint. Every operation is now its own heading, with an index of all thirty-one at the top.`,
  evidence: ["one heading per operation, no skipped levels", "thirty-one uniquely named sections", "operation index links every endpoint", "index doubles as the page's skip target"],
  reference: { label: "API reference", href: "/docs/" },
};
const GAMEA11Y_HOTFIX_MINUTES = 9;
const GAMEA11Y_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-034",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG030 + STATUSMSG_HOTFIX_MINUTES + CHARTSTOP_HOTFIX_MINUTES + APIHEADING_HOTFIX_MINUTES + GAMEA11Y_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D17",
  title: "Stop the tank list reading itself aloud",
  summary: `Closed in ${GAMEA11Y_HOTFIX_MINUTES} minutes. The tank list read every tank's counts aloud every three seconds, because a moving top score rewrote the whole sentence. It now speaks only what changed, and the same pass fixed the light theme's status colours.`,
  evidence: ["score movement no longer announces anything", "full and open transitions still spoken", "light-theme status colours clear 4.5:1 on every surface", "Feeding Frenzy small print from 2.2:1 to 5.9:1"],
  reference: { label: "Play the game", href: "/play/" },
};
/** Running total through WG-034. The four security fixes below share the clock. */
const POST_DELIVERY_MINUTES_THROUGH_WG034 =
  POST_DELIVERY_MINUTES_THROUGH_WG030 + STATUSMSG_HOTFIX_MINUTES + CHARTSTOP_HOTFIX_MINUTES + APIHEADING_HOTFIX_MINUTES + GAMEA11Y_HOTFIX_MINUTES;
const CSP_HOTFIX_MINUTES = 24;
const CSP_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-035",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG034 + CSP_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D18",
  title: "Replace the content policy that allowed any script",
  summary: `Closed in ${CSP_HOTFIX_MINUTES} minutes. The pages carried a content security policy that allowed any inline script, which is the one thing such a policy exists to refuse. Each response now mints a single-use token and runs only the scripts carrying it.`,
  evidence: ["fresh token per response, never reused", "unmarked scripts are inert", "the game shell is covered for the first time", "forms and embedded objects restricted"],
  reference: { label: "Public evidence", href: "/logs/" },
};
const LEAK_HOTFIX_MINUTES = 12;
const LEAK_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-036",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG034 + CSP_HOTFIX_MINUTES + LEAK_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D18",
  title: "Strip internal detail from errors and exports",
  summary: `Closed in ${LEAK_HOTFIX_MINUTES} minutes. Internal failure messages, build identifiers and exported player names all reached public output, the last of them as text a spreadsheet would run as a formula. All three now say only what a reader needs.`,
  evidence: ["failures return a generic message; detail goes to the operator log", "build and storage identifiers removed from public output", "operator view keeps the full record", "exported names cannot become formulas"],
  reference: { label: "Cost and capacity meters", href: "/spend/" },
};
const CHAIN_HOTFIX_MINUTES = 21;
const CHAIN_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-037",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG034 + CSP_HOTFIX_MINUTES + LEAK_HOTFIX_MINUTES + CHAIN_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D18",
  title: "Verify the receipt chain on every read",
  summary: `Closed in ${CHAIN_HOTFIX_MINUTES} minutes. This page called the control history tamper-evident, but nothing re-checked it and its head was only ever compared against itself. Every receipt is now re-derived on read, and the verdict is stated on the page.`,
  evidence: ["every receipt re-derived from its own contents", "an edited receipt is named by number", "removing entries is detected by the separate record", "verdict shown on the page, not just in the data"],
  reference: { label: "Control receipts", href: "/status/#control-history" },
};
const ABUSE_HOTFIX_MINUTES = 14;
const ABUSE_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-038",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG034 + CSP_HOTFIX_MINUTES + LEAK_HOTFIX_MINUTES + CHAIN_HOTFIX_MINUTES + ABUSE_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D18",
  title: "Strip invisible characters from display names",
  summary: `Closed in ${ABUSE_HOTFIX_MINUTES} minutes. A display name could carry invisible characters that reversed the leaderboard around it or impersonated another player, and saved players had no ceiling. Those characters are stripped, and new saved entries are bounded without evicting a real player.`,
  evidence: ["text-reversing and invisible characters removed", "look-alike names collapse to the same text", "names in every other script still work", "existing players never evicted, at any load"],
  reference: { label: "Play the game", href: "/play/" },
};
/** Running total through WG-038. */
const POST_DELIVERY_MINUTES_THROUGH_WG038 =
  POST_DELIVERY_MINUTES_THROUGH_WG034 + CSP_HOTFIX_MINUTES + LEAK_HOTFIX_MINUTES + CHAIN_HOTFIX_MINUTES + ABUSE_HOTFIX_MINUTES;
/** Free-tier allowances reset daily; the cost page only ever reported lifetime figures. */
const INQUIRY_TODAY_HOTFIX_MINUTES = 18;
const INQUIRY_TODAY_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-039",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG038 + INQUIRY_TODAY_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D19",
  title: "Report today's spend on a readable scale",
  summary: `Closed in ${INQUIRY_TODAY_HOTFIX_MINUTES} minutes. Every included allowance resets daily, but the cost page reported lifetime totals on a linear bar where 0.008% of an allowance and 8% were the same invisible sliver. It now measures the day and plots every meter on a logarithmic axis.`,
  evidence: ["day boundary captured once a day, per meter", "today compared against a whole day's allowance", "average spend per day and spend today, in dollars", "meters on a logarithmic axis with decade ticks", "spend trend on round axis values, current value labelled"],
  reference: { label: "Usage against the free tier", href: "/spend/" },
};
/** Running total through WG-039. The accessibility batch below shares the clock. */
const POST_DELIVERY_MINUTES_THROUGH_WG039 =
  POST_DELIVERY_MINUTES_THROUGH_WG038 + INQUIRY_TODAY_HOTFIX_MINUTES;
const PAGEA11Y_HOTFIX_MINUTES = 26;
const PAGEA11Y_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-040",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG039 + PAGEA11Y_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D20",
  title: "Every page can be navigated without a mouse or a screen",
  summary: `Closed in ${PAGEA11Y_HOTFIX_MINUTES} minutes. None of these pages let you jump past the navigation, so reaching the content meant tabbing through the same links every visit. Sorted columns showed which way they were sorted with an arrow and nothing else. Tables carried no name, and nothing tied a column heading to the figures beneath it. Following a link to a particular receipt scrolled to it but left the keyboard behind.`,
  evidence: ["a skip link on every page", "sort direction stated, not only drawn", "every table named, every column tied to its figures", "a link to a receipt takes the keyboard with it"],
  reference: { label: "Public evidence", href: "/logs/" },
};
const READABILITY_HOTFIX_MINUTES = 11;
const READABILITY_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-041",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG039 + PAGEA11Y_HOTFIX_MINUTES + READABILITY_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D20",
  title: "The outage page says there is an outage",
  summary: `Closed in ${READABILITY_HOTFIX_MINUTES} minutes. When the game was taken down, the page announced itself with a randomised joke in the browser tab and in its only heading — funny, but it never said the game was down. The availability chart had the same fault in another form: the picture carried the downtime, the text beside it did not. Two faint colours were also too close to their background to read comfortably.`,
  evidence: ["the outage page states the outage; the joke keeps its place", "the chart's description carries the downtime it draws", "faint text and links meet the contrast floor", "confetti is not built at all when motion is reduced"],
  reference: { label: "Status", href: "/status/" },
};
const GAMEA11Y2_HOTFIX_MINUTES = 19;
const GAMEA11Y2_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-042",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG039 + PAGEA11Y_HOTFIX_MINUTES + READABILITY_HOTFIX_MINUTES + GAMEA11Y2_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D20",
  title: "The game stops going quiet at the moments that matter",
  summary: `Closed in ${GAMEA11Y2_HOTFIX_MINUTES} minutes. Anything said twice in a row was only said once: a second death at the same score, or a second disconnect, passed in silence. Losing the connection was drawn on screen but never spoken. Turning off the on-screen radar also removed the spoken description of where you are, so a visual setting silenced a non-visual aid. The help shortcut fired from one keypress with no way to switch it off, including while typing.`,
  evidence: ["a repeated message is spoken again", "losing the connection is announced, not only drawn", "spoken position survives turning the radar off", "the single-key shortcut can be switched off and ignores typing"],
  reference: { label: "Play the game", href: "/play/" },
};
/** Running total through WG-042. */
const POST_DELIVERY_MINUTES_THROUGH_WG042 =
  POST_DELIVERY_MINUTES_THROUGH_WG039 + PAGEA11Y_HOTFIX_MINUTES + READABILITY_HOTFIX_MINUTES + GAMEA11Y2_HOTFIX_MINUTES;
const NAMES_HOTFIX_MINUTES = 9;
const NAMES_HOTFIX_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-043",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG042 + NAMES_HOTFIX_MINUTES),
  label: "hotfix",
  deployment: "D21",
  title: "Players can use their own name",
  summary: `Closed in ${NAMES_HOTFIX_MINUTES} minutes. A name written entirely in Chinese, Cyrillic, Greek, Hebrew, Korean or emoji was refused and the player was renamed to Player, while a name mixing one of those with Latin letters was fine. The name check compared against Latin letters only, so a name containing none of them looked empty rather than unscreenable. Names are now accepted on what they actually contain.`,
  evidence: ["names in any script are kept as typed", "the existing word list still blocks what it blocked before", "names built only from invisible characters are still refused", "spoofing defences and the length limit are unchanged"],
  reference: { label: "Play the game", href: "/play/" },
};
/** Running total through WG-043. */
const POST_DELIVERY_MINUTES_THROUGH_WG043 = POST_DELIVERY_MINUTES_THROUGH_WG042 + NAMES_HOTFIX_MINUTES;
const POLICIES_MINUTES = 34;
const POLICIES_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-044",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG043 + POLICIES_MINUTES),
  label: "feature",
  deployment: "D22",
  title: "Publish the policies the standards ask for",
  summary: `Built in ${POLICIES_MINUTES} minutes. The conformance register recorded what this service does against two standards, but the written record behind it did not exist — and the largest block of missing rows was not engineering, it was four documents nobody had written. They are now published at /policies/ as pages rather than filed as documents nobody can check: what the service is and where its boundary sits, what it protects and refuses to do, who is accountable for what, and what the computer-controlled sharks actually are. Twenty-seven gaps closed; readiness moved from 45 to 61 per cent.`,
  evidence: ["four documents, each naming the clauses it is the record for", "the register links to them and they link back", "limits stated plainly where one person cannot separate a duty", "the AI document is exact that the sharks are rules, not a learned model"],
  reference: { label: "Policies", href: "/policies/" },
};
/** Running total through WG-044. */
const POST_DELIVERY_MINUTES_THROUGH_WG044 = POST_DELIVERY_MINUTES_THROUGH_WG043 + POLICIES_MINUTES;
const GOVERNANCE_MINUTES = 58;
const GOVERNANCE_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-045",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG044 + GOVERNANCE_MINUTES),
  label: "feature",
  deployment: "D23",
  title: "Write down how risk is decided, and what the sharks actually are",
  summary: `Built in ${GOVERNANCE_MINUTES} minutes. The register said what this service does but not how it decides what to do about anything. There is now a stated method for scoring a risk, an assessment that names the twelve this service actually carries — the spend ceiling, one durable object holding the receipt chain with no backup, display-name abuse, a provider outage, unscanned dependencies — and objectives measured from live routes rather than asserted. Five more documents cover how the computer-controlled sharks are built and checked, how code is written and released, who may reach what, and which laws and licences apply. Writing them turned up four things the service was describing inaccurately, and those were corrected rather than left flattering. Sixteen gaps closed; readiness moved from 61 to 77 per cent.`,
  evidence: ["a risk method with worded scales and an acceptance threshold, not a colour chart", "twelve assessed risks with scores, decisions and what is left over", "the backup gap, the unscanned dependencies and the missing erasure route recorded as open", "four inaccurate descriptions found and corrected while checking them"],
  reference: { label: "Policies", href: "/policies/" },
};
/** Running total through WG-045. */
const POST_DELIVERY_MINUTES_THROUGH_WG045 = POST_DELIVERY_MINUTES_THROUGH_WG044 + GOVERNANCE_MINUTES;
const PARTIALS_MINUTES = 71;
const PARTIALS_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-046",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG045 + PARTIALS_MINUTES),
  label: "feature",
  deployment: "D24",
  title: "Do the things the register said were only written down",
  summary: `Built in ${PARTIALS_MINUTES} minutes. Forty-two rows were marked partial, and sorting them showed most were not missing writing at all — they were activities defined and never performed, or one piece of engineering nobody had built. The engineering came first: everything the tank holds — the receipt chain, the ninety-day log, player profiles, spend history — is now copied daily to object storage under a digest, and the copy is proven by restoring it into a scratch instance and checking the two digests match. The first drill failed for a real reason and that failure is on the public chain in front of the passes. Then four activities were run for the first time and recorded — an access review, a supplier check, a compliance review and the AI policy review — and seven documents written for what remained. Ten rows are still open and named: no dependency scanning, no erasure route, no audit independence, and supplier certificates nobody has obtained. Readiness moved from 77 to 93 per cent.`,
  evidence: ["state copied daily and proven by a restore that compares digests, not by assertion", "the first restore drill failed, and the failure is published before the passes", "four recurring activities performed for the first time, each stating what was examined", "six controls excluded on the boundary the scope statement already drew, not on convenience", "internal audit stays partial because one person cannot be objective, and says so"],
  reference: { label: "Policies", href: "/policies/" },
};
const POST_DELIVERY_MINUTES_THROUGH_WG046 = POST_DELIVERY_MINUTES_THROUGH_WG045 + PARTIALS_MINUTES;
const NAMESPACE_MINUTES = 96;
const NAMESPACE_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-047",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG046 + NAMESPACE_MINUTES),
  label: "feature",
  deployment: "D25",
  title: "Split the site in two, because it was serving two audiences from one menu",
  summary: `Built in ${NAMESPACE_MINUTES} minutes. The site is a game and a public conformance record, for two sets of people who want nothing from each other, and every page carried the same ten-item menu listing both. Thirteen of the site's sixty thousand words were for players. The game keeps one link out; the record gets its own front door at /trust/ with six figures on it, each one a link to the page that owns it and none of them stored twice. The roadmap and incident pages folded into operations, so the receipt chain renders once instead of on two pages and the uptime and spend numbers appear only where they are measured. Cost moved to /spend/, because "inquiry" was being used for the billing page and for the whole record at the same time. The policy set became one route per document with an anchor on every section — it was 201 KB with no identifier on any of its 144 headings, so nothing in it could be cited. Old addresses redirect and the published JSON did not move. Also fixed on the way through: money could be spent on routes the spend limit exempted, saving a profile had nothing bounding it, a body-size check a chunked request walked straight past, a header set on one branch of the router, chart links no keyboard could reach, thirteen tables with no header row, a button that told a screen reader the opposite of what was happening, and a register that needed three screens of sideways scrolling on a phone.`,
  evidence: ["one menu became two, and the game's competing seven-link menu became one link", "every figure on the trust page is computed from the source the owning page uses", "the receipt chain and the uptime, spend and incident counts each render in exactly one place", "the spend limit now closes the routes that generate the billable writes", "moved routes redirect and every evidence link in the register still resolves", "the agent count is published beside human occupancy, which the AI policy already said it was"],
  reference: { label: "Trust and operations", href: "/trust/" },
};
const POST_DELIVERY_MINUTES_THROUGH_WG047 = POST_DELIVERY_MINUTES_THROUGH_WG046 + NAMESPACE_MINUTES;
const TRUTHFULNESS_MINUTES = 88;
const TRUTHFULNESS_ROADMAP_ENTRY: RoadmapEntry = {
  id: "WG-048",
  at: roadmapClock(POST_DELIVERY_MINUTES_THROUGH_WG047 + TRUTHFULNESS_MINUTES),
  label: "feature",
  deployment: "D26",
  title: "Deploy the split, then close the four things it left behind",
  summary: `Built in ${TRUTHFULNESS_MINUTES} minutes. The previous version was written and never deployed, so for its whole life the register pointed at routes the live service did not serve; that went out first. Then four things that were written down but not true. The restore drill said it restored the most recent copy and did not: it exported the live object and restored that, which proves the object can copy itself and proves nothing about object storage. It now reads the copy back out of the bucket, and with no bucket or no copy it fails and says so instead of quietly testing something else. Three policy records stated the evidence walk's result as a present-tense measurement and all three had the previous version's numbers; they are read off the register when the page is built, so they cannot go stale again. The link checker accepted any 200 as proof a route exists, but every unrouted path here answers 200 with the game — it now requires each response to carry something only the real page emits. And the split had left the spend and API pages reachable from two of the seven trust pages, so every page carries the whole estate in its footer. Two other things: the stylesheet was 38.6 KB re-sent on every page view and is now fetched once and cached, and every link on the delivery chart is a 24-pixel target instead of nine.`,
  evidence: ["the split namespace is live, and the register's routes are routes the service serves", "the restore drill reads backups/state/latest.json and fails loudly when there is nothing to read", "the evidence-walk figures are derived from the register at render time, not transcribed", "a route deleted from the service now fails the link checker instead of passing on the game shell's 200", "/spend/ and /docs/ are reachable from all 27 server-rendered pages, including each of the 20 policy documents", "a trust page dropped from 45 KB to 7 KB, and all 22 delivery-chart links clear 24 by 24 with no overlap"],
  reference: { label: "Operations", href: "/status/#delivery" },
};
/** Development minutes across every post-delivery entry, WG-018 to WG-048. */
const POST_DELIVERY_HOTFIX_MINUTES = POST_DELIVERY_MINUTES_THROUGH_WG047 + TRUTHFULNESS_MINUTES;

const POST_DELIVERY_ENTRIES: readonly RoadmapEntry[] = [BONUS_ROADMAP_ENTRY, HOTFIX_ROADMAP_ENTRY, GAME_HOTFIX_ROADMAP_ENTRY, MOBILE_HOTFIX_ROADMAP_ENTRY, EVIDENCE_HOTFIX_ROADMAP_ENTRY, INQUIRY_HOTFIX_ROADMAP_ENTRY, INCIDENT_HOTFIX_ROADMAP_ENTRY, TAKEDOWN_HOTFIX_ROADMAP_ENTRY, STATUS_HOTFIX_ROADMAP_ENTRY, FOCUS_HOTFIX_ROADMAP_ENTRY, CONTRAST_HOTFIX_ROADMAP_ENTRY, AUDITFLOOD_HOTFIX_ROADMAP_ENTRY, SEATS_HOTFIX_ROADMAP_ENTRY, INCIDENTCAP_HOTFIX_ROADMAP_ENTRY, STATUSMSG_HOTFIX_ROADMAP_ENTRY, CHARTSTOP_HOTFIX_ROADMAP_ENTRY, APIHEADING_HOTFIX_ROADMAP_ENTRY, GAMEA11Y_HOTFIX_ROADMAP_ENTRY, CSP_HOTFIX_ROADMAP_ENTRY, LEAK_HOTFIX_ROADMAP_ENTRY, CHAIN_HOTFIX_ROADMAP_ENTRY, ABUSE_HOTFIX_ROADMAP_ENTRY, INQUIRY_TODAY_ROADMAP_ENTRY,
  PAGEA11Y_HOTFIX_ROADMAP_ENTRY, READABILITY_HOTFIX_ROADMAP_ENTRY, GAMEA11Y2_HOTFIX_ROADMAP_ENTRY,
  NAMES_HOTFIX_ROADMAP_ENTRY, POLICIES_ROADMAP_ENTRY, GOVERNANCE_ROADMAP_ENTRY, PARTIALS_ROADMAP_ENTRY, NAMESPACE_ROADMAP_ENTRY,
  TRUTHFULNESS_ROADMAP_ENTRY];
const ROADMAP_ELAPSED_MINUTES = 8 * 60;
const ROADMAP_DEPLOYMENT_COUNT = 7;
interface RoadmapAvailability { portal: ReturnType<typeof incidentSummary>; tank: ReturnType<typeof incidentSummary>; gateEnabled: boolean }
const formatElapsed = (minutes: number) => minutes < 60 ? `${minutes}m` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
/**
 * The delivery record, as a section of the operations page.
 *
 * It used to be its own route and it led with five metric cards: server uptime, tank
 * uptime, deployment batches, incident count and metered spend. Three of those five are
 * owned by somewhere else — two by the availability section directly above this one, one
 * by the incident section directly below it, one by the spend page — and the spend figure
 * was printed here to four decimal places and there to eight, so the same number read
 * differently depending on which page you opened. Only the two figures delivery actually
 * owns are stated here; the rest are links.
 *
 * The combined chart stays: correlating deployments against incidents and spend on one
 * time axis is the delivery-shaped question, and every series in it is read from the same
 * source the owning page reads.
 */
function deliverySection(entries: readonly RoadmapEntry[], incidents: IncidentRecord[] = [], history: ControlHistoryEntry[] = [], billing: Record<string, unknown> = {}): string {
  const now = Date.now(), all = [...entries, ...POST_DELIVERY_ENTRIES];
  const portal = incidentSummary([], now), tank = incidentSummary(incidents, now);
  const allTime = recordValue(billing.allTime);
  // Spend is the all-time metered figure, matching the series `spendHistory` samples and
  // the number /spend/ leads with. The per-deploy billing window would reset the chart
  // to zero every time the page changed.
  const spendUsd = numberValue(allTime.estimatedVariableUsd);
  const hardLimitUsd = numberValue(billing.hardLimitUsd) || 5;
  const samples = Array.isArray(billing.spendHistory) ? billing.spendHistory as Array<{ ts: number; usd: number }> : [];
  const showcase: ShowcaseInput = { entries: all, incidents, history, portal, tank, samples, spendUsd, hardLimitUsd, now };
  const batchCount = deploymentBatches(all).length;
  const rows = all.map((entry) => { const duration = roadmapElapsedMinutes(entry.at); return `<tr id="${roadmapRowAnchor(entry.id)}" data-id="${Number(entry.id.slice(3))}" data-type="${entry.label}" data-duration="${duration}"${entry.label === "bonus" ? ' class="roadmap-row--bonus"' : entry.label === "hotfix" ? ' class="roadmap-row--hotfix"' : ""}><td class="cell-code"><code>${esc(entry.id)}</code></td><td class="cell-key">${esc(entry.label)}</td><td><strong>${esc(entry.title)}</strong><span class="roadmap-summary">${esc(entry.summary)}</span>${entry.reference ? `<a class="roadmap-ref" href="${esc(entry.reference.href)}">${esc(entry.reference.label)} →</a>` : ""}</td><td class="cell-time">${esc(entry.at)}</td><td class="cell-code" title="Production deployment batch"><code>${esc(entry.deployment)}</code></td></tr>`; }).join("");
  const elapsedHours = ROADMAP_ELAPSED_MINUTES / 60, velocity = (entries.length / elapsedHours).toFixed(1);
  return `<section id="delivery" tabindex="-1" aria-labelledby="delivery-heading">
    <div class="eyebrow">Project record</div>
    <h2 id="delivery-heading" style="margin:6px 0 10px">Delivery</h2>
    <p class="sub">Every feature update, the deployment batch that carried it, and how those batches line up against the availability above and the <a href="/spend/">metered spend</a>. The same record is available as <a href="/roadmap.json">data</a>.</p>
    <div class="card hero-card">
      <div class="metric-grid showcase-metrics">
        ${metricCard(batchCount, "Deployment batches", `${all.length} feature updates shipped`, "rooms", "tone-cyan")}
        ${metricCard(`${velocity}/h`, "Commit velocity", `${entries.length} updates in ${Math.floor(elapsedHours)}h of build time`, "requests", "tone-violet")}
      </div>
      ${showcaseChartSvg(showcase)}
    </div>
    <section aria-labelledby="project-goals"><div class="portal-signoff"><div><div class="eyebrow">Project goals</div><h3 id="project-goals">Built for speed. Operated with evidence.</h3></div><span class="goal-status">Next goal · ISO/IEC 42001 + ISO/IEC 27001 certification · In progress</span></div>
      <div class="goal-grid">
        <article class="card"><strong>Speed</strong><p>Ship a complete playable and operational proof of concept inside one working day.</p></article>
        <article class="card"><strong>Security</strong><p>Stop gameplay immediately without hiding status, incidents, or control history.</p></article>
        <article class="card"><strong>Accessibility</strong><p>Support keyboard, mouse, touch, responsive layouts, and readable evidence.</p></article>
        <article class="card"><strong>Human accountable</strong><p>Keep high-impact controls authenticated, attributable, and receipt-backed.</p></article>
      </div>
    </section>
    <section><div class="portal-signoff"><div><div class="eyebrow">${Math.floor(elapsedHours)}h total elapsed</div><h3>Feature-to-deployment map</h3></div><div class="delivery-velocity"><strong>Commit velocity: ${velocity}/hour</strong><span>${entries.length} feature updates · ${ROADMAP_DEPLOYMENT_COUNT} production deployments · ${(entries.length / ROADMAP_DEPLOYMENT_COUNT).toFixed(1)} updates/deployment</span></div></div><div class="table-scroll" role="region" aria-label="Sortable feature-to-deployment map" tabindex="0"><table class="roadmap-table" id="roadmap-table"><caption class="sr-only">Sortable feature-to-deployment map</caption><thead><tr><th scope="col" aria-sort="ascending"><button class="table-sort" data-key="id" data-direction="asc">ID</button></th><th scope="col" aria-sort="none"><button class="table-sort" data-key="type">Type</button></th><th scope="col">Feature update</th><th scope="col" aria-sort="none"><button class="table-sort" data-key="duration">Elapsed</button></th><th scope="col">Deployment</th></tr></thead><tbody>${rows}</tbody></table></div></section>${roadmapSortScript()}
  </section>`;
}

function formatCompactDuration(ms: number): string { const seconds = Math.round(ms / 1000); return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`; }
/**
 * Keeps /status/ current without reloading the document.
 *
 * The page used to run `setTimeout(()=>location.reload(),3000)`. A full reload every three
 * seconds rebuilds the screen-reader virtual buffer, throws keyboard focus back to the top
 * of the document, and drops scroll position — with no way to stop it (WCAG 2.2.1, 2.2.2).
 * It also had every open tab hitting the Lobby DO 20x a minute.
 *
 * Instead: poll the JSON the page already publishes, patch only the values that move, and
 * offer a real pause control. Cells are written with textContent — `topName` is a
 * player-chosen display name and must never reach innerHTML. The polite live region gets a
 * one-line summary and only when that summary actually changes, so a screen reader is not
 * re-read the same sentence every 15 seconds.
 */
/*
 * The button used to ship `aria-pressed="true"` on the label "Pause auto-update", so
 * assistive technology announced "Pause auto-update, pressed" while polling was *running*
 * and the inverse once it had stopped — the name and the state contradicted each other in
 * both positions (SC 4.1.2). Of the two consistent conventions, this takes the action-verb
 * label and drops `aria-pressed` entirely: the label already says what activating the
 * control will do, and the `role="status"` region below it announces what actually changed.
 */
function statusLiveScript(): string {
  return `<script nonce="__WG_CSP_NONCE__">(function(){
  var INTERVAL=15000,KEY='wg-status-autoupdate';
  var btn=document.getElementById('status-autoupdate'),stamp=document.getElementById('status-updated-at'),live=document.getElementById('status-live'),rows=document.getElementById('status-tank-rows');
  if(!btn)return;
  var timer=null,lastSummary='',failures=0;
  function dur(ms){var s=Math.round(ms/1000);return s<60?s+'s':s<3600?Math.round(s/60)+'m':(s/3600).toFixed(1)+'h';}
  function value(id,text){var el=document.getElementById(id);if(el)el.textContent=text;}
  function detail(id,text){var el=document.getElementById(id);if(!el||!el.parentNode)return;var d=el.parentNode.querySelector('.metric-detail');if(d)d.textContent=text;}
  function apply(d){
    var list=d.rooms||[],players=list.reduce(function(n,r){return n+(r.players||0);},0),open=!(d.maintenance&&d.maintenance.enabled);
    if(d.portalAvailability){value('status-portal-availability',d.portalAvailability.availabilityPercent+'%');detail('status-portal-availability',d.portalAvailability.unscheduledDowntimePercent+'% unscheduled downtime');}
    if(d.availability){value('status-tank-availability',d.availability.availabilityPercent+'%');detail('status-tank-availability',d.availability.unscheduledDowntimePercent+'% unscheduled downtime');value('status-scheduled-downtime',dur(d.availability.scheduledDowntimeMs||0));}
    value('status-tank-access',open?'OPEN':'CLOSED');
    detail('status-tank-access',open?players+' active players':'scheduled gate active');
    if(rows){
      var frag=document.createDocumentFragment();
      list.forEach(function(r){
        var tr=document.createElement('tr'),name=document.createElement('td'),strong=document.createElement('strong');
        strong.textContent=String(r.name==null?'':r.name);name.appendChild(strong);tr.appendChild(name);
        [r.players,r.bots,r.topScore,r.topName].forEach(function(cell){var td=document.createElement('td');td.textContent=String(cell==null?'':cell);tr.appendChild(td);});
        frag.appendChild(tr);
      });
      rows.textContent='';rows.appendChild(frag);
    }
    if(stamp){var now=new Date();stamp.dateTime=now.toISOString();stamp.textContent=now.toLocaleTimeString();}
    var summary='Tank access '+(open?'open':'closed')+'. '+players+(players===1?' active player.':' active players.');
    if(live&&summary!==lastSummary){live.textContent=summary;lastSummary=summary;}
  }
  function poll(){
    fetch('/status.json',{headers:{'accept':'application/json'}}).then(function(r){return r.ok?r.json():Promise.reject(r.status);}).then(function(d){failures=0;apply(d);}).catch(function(){
      // Three consecutive failures: stop polling rather than hammer a struggling origin.
      if(++failures>=3){stop();if(stamp)stamp.textContent='paused after repeated errors';}
    });
  }
  function start(){if(timer)return;timer=setInterval(poll,INTERVAL);btn.textContent='Pause auto-update';poll();}
  function stop(){if(timer){clearInterval(timer);timer=null;}btn.textContent='Resume auto-update';}
  btn.addEventListener('click',function(){
    var on=!!timer;
    if(on){stop();if(live)live.textContent='Auto-update paused.';}else{start();if(live)live.textContent='Auto-update resumed.';}
    lastSummary='';
    try{sessionStorage.setItem(KEY,on?'off':'on');}catch(e){}
  });
  var stored=null;try{stored=sessionStorage.getItem(KEY);}catch(e){}
  if(stored==='off')stop();else start();
}());</script>`;
}

function roadmapSortScript(): string { return `<script nonce="__WG_CSP_NONCE__">(()=>{const table=document.getElementById('roadmap-table'),body=table.tBodies[0],buttons=[...table.querySelectorAll('.table-sort')];buttons.forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.key,direction=button.dataset.direction==='asc'?'desc':'asc',factor=direction==='asc'?1:-1;buttons.forEach(item=>{item.removeAttribute('data-direction');if(item.parentElement)item.parentElement.setAttribute('aria-sort','none');});button.dataset.direction=direction;if(button.parentElement)button.parentElement.setAttribute('aria-sort',direction==='asc'?'ascending':'descending');const rows=[...body.rows].sort((a,b)=>{const left=a.dataset[key]||'',right=b.dataset[key]||'';return (key==='type'?left.localeCompare(right):Number(left)-Number(right))*factor;});rows.forEach(row=>body.appendChild(row));}));})();</script>`; }

const PAGE_CSS = `
  :root{color-scheme:dark;--bg:#0b0a14;--surface-1:#16142a;--surface-2:#201d3b;--surface-3:#2b2750;--text:#f3f1ff;--muted:#b9b4d6;--faint:#958eb5;--accent:#9580ff;--cyan:#22e6ff;--border:#3a355e;--strong:#847cb4;--focus:#ffd54a}
  *{box-sizing:border-box}
  html{min-height:100%;background:var(--bg)}
  body{min-height:100vh;margin:0;background:radial-gradient(circle at 14% -12%,rgba(34,230,255,.15),transparent 28rem),radial-gradient(circle at 90% 5%,rgba(143,123,255,.2),transparent 32rem),var(--bg);color:var(--text);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.22;background-image:radial-gradient(circle,#8f7bff 1px,transparent 1.5px);background-size:38px 38px;mask-image:linear-gradient(to bottom,#000,transparent 48%)}
  main{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:28px 20px 64px}
  h1{font-size:clamp(2rem,5vw,3.35rem);line-height:1.02;letter-spacing:-.045em;margin:0 0 10px;background:linear-gradient(100deg,#fff 25%,#aaf6ff 62%,#b9adff);-webkit-background-clip:text;background-clip:text;color:transparent}
  h2{line-height:1.18;letter-spacing:-.015em}
  p.sub{color:var(--muted);margin:0 0 24px;max-width:76ch}
  a{color:#b6a9ff;text-underline-offset:3px}
  a:hover{color:#d4ccff}
  /* Was :where(a,button) only, so the search inputs and selects on the register, the
     evidence pages and the policy index fell back to whatever the browser happened to
     draw — on some, nothing at all. Every focusable control is covered now. */
  :where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:3px solid var(--focus);outline-offset:3px}
  :where(input,select,textarea):focus-visible{outline-offset:1px}
  .site-header{position:relative;z-index:2;max-width:1160px;margin:0 auto;padding:18px 20px 0;display:flex;align-items:center;justify-content:space-between;gap:20px}
  .brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;min-width:max-content}
  .brand svg{width:56px;height:34px;filter:drop-shadow(0 7px 13px rgba(34,230,255,.22))}
  .brand-copy{display:grid;line-height:1.05}.brand-copy strong{font-size:.94rem;letter-spacing:.06em;text-transform:uppercase}.brand-copy small{margin-top:4px;color:var(--muted);font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  nav{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
  nav a{min-height:38px;display:inline-flex;align-items:center;padding:6px 11px;border:1px solid var(--border);border-radius:999px;background:rgba(22,20,42,.72);color:var(--muted);font-size:.8rem;font-weight:800;text-decoration:none;backdrop-filter:blur(14px)}
  nav a:hover{border-color:var(--strong);background:var(--surface-2);color:var(--text)}
  .eyebrow{margin:0 0 8px;color:var(--cyan);font-size:.72rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
  .page-intro{margin:12px 0 28px}.page-intro .sub{font-size:1rem}
  .hero-card{position:relative;overflow:hidden;border-color:#514a81!important;background:linear-gradient(145deg,rgba(32,29,59,.94),rgba(15,14,29,.96))!important;box-shadow:0 22px 70px rgba(0,0,0,.3)}
  .hero-card:after{content:"";position:absolute;right:-50px;top:-80px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(34,230,255,.17),transparent 68%);pointer-events:none}
  .action-link{display:inline-flex;align-items:center;min-height:42px;padding:8px 15px;border:1px solid var(--strong);border-radius:999px;background:var(--surface-2);font-weight:800;text-decoration:none}
  table{width:100%;border-collapse:collapse}
  .table-scroll{width:100%;max-width:100%;margin:0 0 24px;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;-webkit-overflow-scrolling:touch}
  .table-scroll table{display:table;width:100%;min-width:var(--table-min,620px);margin:0;table-layout:auto}
  .table-scroll:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  th{color:var(--muted);font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
  thead th{background:#17152c}
  tbody tr{transition:background .15s ease}tbody tr:hover{background:rgba(143,123,255,.055)}
  .events-table,.capture-table,.history-table{table-layout:fixed!important}.events-table{--table-min:860px}.capture-table{--table-min:900px}.history-table{--table-min:1160px}.billing-table{--table-min:760px}.capacity-table{--table-min:650px}.api-table{--table-min:680px}.schema-table{--table-min:420px}
  .events-table :is(th,td):nth-child(1){width:15.5rem}.events-table :is(th,td):nth-child(2){width:6.5rem}.events-table :is(th,td):nth-child(3){width:12rem}.events-table :is(th,td):nth-child(4){width:11rem}
  .capture-table :is(th,td):nth-child(1){width:15.5rem}.capture-table :is(th,td):nth-child(2){width:6.5rem}.capture-table :is(th,td):nth-child(3){width:5.5rem}.capture-table :is(th,td):nth-child(4){width:11rem}.capture-table :is(th,td):nth-child(5){width:9rem}
  .history-table :is(th,td):nth-child(1){width:4.5rem}.history-table :is(th,td):nth-child(2){width:13rem}.history-table :is(th,td):nth-child(3){width:15rem}.history-table :is(th,td):nth-child(4){width:25rem}.history-table :is(th,td):nth-child(5){width:14rem}.history-table :is(th,td):nth-child(6){width:17rem}.history-table :is(th,td):nth-child(7){width:11rem}
  .cell-time,.cell-code,.cell-key,.cell-seq{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cell-code code{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:top}.cell-detail>span{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere}.table-note{margin:-14px 0 24px;color:var(--faint);font-size:.72rem}#history-integrity{max-width:100%;overflow-wrap:anywhere;word-break:break-word}
  code{background:var(--surface-2);padding:2px 6px;border-radius:6px;font-family:ui-monospace,monospace}
  .m{font-weight:700;font-family:ui-monospace,monospace;font-size:.85rem}
  .g{color:#57ff5a}.o{color:#ff8a1f}.c{color:#22e6ff}.v{color:#a78bff}
  .card{background:rgba(22,20,42,.92);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin:0 0 14px;box-shadow:0 10px 30px rgba(0,0,0,.12);backdrop-filter:blur(10px)}
  .api-card{position:relative;padding-left:24px;color:var(--text);min-width:0}
  .api-card p,.api-card li,.api-summary,.api-card :is(h2,h3){overflow-wrap:anywhere}.api-card h3{margin:16px 0 8px;font-size:.82rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}.api-index{display:block}.api-index ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(266px,1fr));gap:2px;margin:0;padding:0;list-style:none}.api-index li{min-width:0}.api-index a{min-height:36px;display:flex;gap:9px;align-items:center;padding:5px 8px;border:1px solid transparent;border-radius:9px;background:none;color:var(--text);text-decoration:none;overflow-wrap:anywhere}.api-index a:hover,.api-index a:focus-visible{border-color:var(--strong);background:var(--surface-2);color:var(--text)}.api-index code{font-size:.82rem;color:#b6a9ff}.api-index .method-pill{min-width:54px;flex:none}.api-card:before{content:"";position:absolute;left:0;top:16px;bottom:16px;width:4px;border-radius:4px}.api-card.g:before{background:#57ff5a}.api-card.o:before{background:#ff8a1f}.api-card.c:before{background:#22e6ff}.api-card.v:before{background:#a78bff}.api-route{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0;font-size:1rem;font-weight:800}.api-summary{margin:10px 0 0;font-size:1rem;font-weight:800}.method-pill{display:inline-flex;align-items:center;justify-content:center;min-width:62px;padding:3px 8px;border:1px solid currentColor;border-radius:999px;background:rgba(255,255,255,.035);font-size:.72rem;letter-spacing:.08em}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .kpi{font-size:1.6rem;font-weight:800}
  .kpi small{display:block;font-size:.75rem;color:#b9b4d6;font-weight:600}
  .metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 14px}.metric-grid>*{min-width:0}.stat-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.status-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.showcase-metrics{grid-template-columns:repeat(5,minmax(0,1fr))}.spend-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.spend-metrics .metric-value{display:-webkit-box;min-height:2.15em;overflow:hidden;white-space:normal;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .metric-card{position:relative;display:grid;grid-template-rows:auto auto auto 1fr;align-content:start;overflow:hidden;min-width:0;min-height:124px;padding:15px 16px;border:1px solid #3a355e;border-radius:14px;background:linear-gradient(145deg,#19172f,#121123)}
  .metric-card:after{content:"";position:absolute;right:-35px;bottom:-45px;width:110px;height:110px;border-radius:50%;background:color-mix(in srgb,currentColor 10%,transparent)}
  .metric-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.metric-icon{width:30px;height:30px;color:#a78bff}.metric-icon svg{display:block;width:100%;height:100%}
  .metric-value{max-width:100%;margin-top:10px;overflow:hidden;font-size:clamp(1.25rem,2.6vw,2rem);font-weight:900;line-height:1.08;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}.metric-label,.metric-detail{display:-webkit-box;max-width:100%;overflow:hidden;-webkit-box-orient:vertical}.metric-label{min-height:2.3em;margin-top:7px;color:#d8d4ef;font-size:.72rem;font-weight:800;line-height:1.15;letter-spacing:.07em;text-transform:uppercase;-webkit-line-clamp:2}.metric-detail{color:#8f89ae;font-size:.7rem;line-height:1.25;-webkit-line-clamp:2;overflow-wrap:anywhere}
  .tone-green{color:#4ade80}.tone-yellow{color:#f6c445}.tone-red{color:#ff5f66}.tone-cyan{color:#22e6ff}.tone-violet{color:#a78bff}
  .gauge-card{padding:18px 20px}.gauge-layout{display:grid;grid-template-columns:minmax(260px,1.1fr) minmax(220px,.9fr);gap:24px;align-items:center}.gauge-svg{display:block;width:100%;max-width:430px;margin:auto}.gauge-needle{transition:transform .45s cubic-bezier(.2,.8,.2,1)}.gauge-readout{text-align:center}.gauge-readout strong{display:block;font-size:2.1rem;line-height:1;font-variant-numeric:tabular-nums}.gauge-readout span{display:block;color:#b9b4d6;font-size:.78rem}.meter-pill{display:inline-flex!important;width:max-content;margin:8px auto 0;padding:3px 9px;border:1px solid currentColor;border-radius:999px;font-weight:900;letter-spacing:.08em}
  .seat-bar{width:100%;height:8px;margin-top:5px;overflow:hidden;border-radius:999px;background:#292544}.seat-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22e6ff,#a78bff)}
  button{min-height:44px;font:inherit;font-weight:900;border:0;border-radius:10px;padding:10px 16px;cursor:pointer;box-shadow:0 5px 0 rgba(0,0,0,.22)}
  button:active{transform:translateY(2px);box-shadow:0 3px 0 rgba(0,0,0,.22)}
  button.danger{background:#ff6b6b;color:#1a0606}button.restore{background:#4ade80;color:#07130b}button.secondary{background:#8f7bff;color:#0b0a14}button:disabled{cursor:wait;opacity:.65}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
  .live-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 18px}
  .live-controls .sub{margin:0}
  .server-controls{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap}.server-controls>*{flex:1 1 240px}.security-report-button{background:linear-gradient(100deg,#ff8a1f,#ffd54a);color:#170d02}.security-receipt{margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}.alert-test{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}.alert-code{width:8rem;min-height:44px;border:1px solid var(--strong);border-radius:10px;background:var(--surface-1);color:var(--text);font:900 1rem ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;padding:8px 12px}.report-confetti{position:fixed;z-index:9999;top:-24px;width:9px;height:16px;border-radius:2px;pointer-events:none;animation:report-fall 1.5s cubic-bezier(.2,.7,.3,1) forwards}@keyframes report-fall{to{transform:translate3d(var(--drift),105vh,0) rotate(720deg);opacity:.1}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
  .gov-doc{margin:0 0 14px}.gov-head h2{margin:2px 0 0;font-size:1.2rem}.gov-purpose{margin:8px 0 12px}.gov-satisfies{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 16px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(11,10,20,.48)}.gov-satisfies-label{color:var(--faint);font:900 .66rem/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}.gov-satisfies ul{display:flex;gap:6px;flex-wrap:wrap;margin:0;padding:0;list-style:none}.gov-satisfies code{font-size:.72rem}.gov-section{margin:0 0 14px}.gov-section h3{margin:0 0 6px;font-size:.98rem}.gov-section p{margin:0 0 8px;color:var(--muted)}.gov-review{margin:14px 0 0;padding:10px 12px;border-left:2px solid var(--cyan);color:var(--muted);font-size:.86rem}.gov-index{display:block}.gov-index ul{margin:0;padding:0 0 0 2px;list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:7px 14px}.gov-index a{color:var(--text)}.gov-index a>code{flex:0 0 auto;white-space:nowrap}.skip-link{position:absolute;left:-9999px;top:0;z-index:100;padding:10px 16px;border-radius:0 0 10px 0;background:var(--cyan);color:#07131a;font-weight:800;text-decoration:none}.skip-link:focus{left:0}main:focus{outline:none}table caption{caption-side:top;padding:0 0 8px;color:var(--muted);font-size:.78rem;text-align:left}[hidden]{display:none!important}.history-list{display:grid;gap:10px;margin-top:14px}.history-item{display:grid;grid-template-columns:7.2rem 1fr auto;gap:14px;align-items:start;padding:14px;border:1px solid var(--border);border-radius:12px;background:rgba(11,10,20,.48)}.history-sequence{color:var(--cyan);font:800 .76rem/1.4 ui-monospace,monospace}.history-copy strong{display:block}.history-copy p{margin:3px 0;color:var(--muted)}.history-meta{color:var(--faint);font-size:.75rem}.history-receipt{max-width:11rem;overflow:hidden;color:var(--faint);font:700 .72rem/1.4 ui-monospace,monospace;text-overflow:ellipsis;white-space:nowrap}.history-item--focus{border-color:var(--cyan);box-shadow:0 0 0 2px rgba(34,230,255,.28)}.history-pager{display:flex;gap:12px;align-items:center;justify-content:center;margin:16px 0 0;color:var(--muted);font-size:.8rem}.pager-btn{padding:7px 14px;border:1px solid var(--strong);border-radius:999px;background:rgba(11,10,20,.52);color:var(--text);font:inherit;font-weight:700;cursor:pointer}.pager-btn:disabled{opacity:.4;cursor:default}.pager-btn[aria-disabled="true"]{background:none;color:var(--faint);cursor:default}.integrity-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:var(--muted)}.status-incident-list{display:grid;gap:8px}.status-incident{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(11,10,20,.48);color:var(--text);text-decoration:none}.status-incident:hover,.status-incident:focus-visible{border-color:var(--cyan)}.status-incident--active{border-color:#ff8a1f}.status-incident-state{color:var(--faint);font:900 .66rem/1 ui-monospace,monospace;letter-spacing:.08em}.status-incident-title{min-width:0;font-weight:700;overflow-wrap:anywhere}.status-incident-cause{color:var(--muted);font-size:.74rem;white-space:nowrap}@media(max-width:560px){.status-incident{grid-template-columns:auto auto 1fr}.status-incident-cause{grid-column:2/-1}}.incident-card{margin:0 0 12px}.incident-card--active{border-color:#ff8a1f}.incident-dot{display:inline-block;width:9px;height:9px;margin-right:7px;border-radius:3px;vertical-align:middle}.integrity-line code{overflow-wrap:anywhere}.integrity-badge{display:inline-flex;padding:3px 8px;border:1px solid #4ade80;border-radius:999px;color:#4ade80;font-size:.7rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.integrity-badge.verdict-pass{border-color:#4ade80;color:#4ade80}.integrity-badge.verdict-fail{border-color:#ff6b6b;color:#ff6b6b}.integrity-badge.verdict-idle{border-color:var(--strong);color:var(--muted)}
  /* ── Spend ── */
  .spend-hero{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:14px;margin:0 0 14px}
  .spend-hero>.card{margin:0;min-width:0}
  .spend-hero .gauge-layout{grid-template-columns:1fr;gap:8px}
  .spend-hero .gauge-svg{max-width:260px}
  .spend-hero .gauge-readout>strong{font-size:clamp(1.6rem,4vw,2.2rem)}
  .trend-card{display:grid;align-content:start;gap:2px}
  .trend-card h2{margin:2px 0 10px;font-size:1.05rem}
  .trend-card .sub{margin:10px 0 0;font-size:.78rem}
  .trend-scroll{width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin}
  .trend-scroll:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
  .trend-scroll svg{display:block;min-width:420px;width:100%;height:auto}
  .trend-empty{display:grid;gap:4px;place-content:center;min-height:150px;padding:14px;border:1px dashed var(--border);border-radius:12px;text-align:center}
  .trend-empty strong{color:var(--cyan);font:800 1.35rem/1 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
  .trend-empty span{color:var(--muted);font-size:.78rem}
  /* One shape for every meter: service, used to date, limit, today, daily average. */
  .meter-table{--table-min:940px;table-layout:fixed!important}
  .meter-table :is(th,td){vertical-align:top}
  .meter-table :is(th,td):nth-child(1){width:15rem}
  .meter-table :is(th,td):nth-child(2){width:8rem}
  .meter-table :is(th,td):nth-child(3){width:9.5rem}
  .meter-table :is(th,td):nth-child(4){width:13rem}
  .meter-service{text-align:left;font-weight:400}
  .meter-service strong{display:block;color:var(--text);overflow-wrap:anywhere}
  .meter-service span{display:block;margin-top:2px;color:var(--faint);font-size:.74rem;overflow-wrap:anywhere}
  .meter-usage,.meter-limit{color:var(--muted);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  /* The stack lives in a wrapper, never on the cell: a td with display:grid stops being a
     table-cell and the browser wraps it in an anonymous row of its own. */
  .meter-stack{display:grid;gap:5px;min-width:0}
  .meter-daily__value{color:var(--text);font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  /* The track is a five-decade log axis: ticks at 0.001 / 0.01 / 0.1 / 1 / 10 / 100 % of
     the limit. On a linear axis every real row sits in the bottom tenth and a meter a
     thousand times heavier than its neighbour looks identical to it. */
  .meter-bar{position:relative;display:block;height:9px;border-radius:999px;background:#292544;background-image:repeating-linear-gradient(90deg,rgba(233,230,255,.22) 0 1px,transparent 1px 20%)}
  .meter-bar>i{display:block;height:100%;border-radius:999px;background:#4ade80}
  .meter-bar.is-amber>i{background:#f6c445}.meter-bar.is-red>i{background:#ff5f66}
  .meter-bar>b{position:absolute;top:-3px;width:2px;height:15px;border-radius:1px;background:#e9e6ff;transform:translateX(-1px)}
  .meter-share{color:var(--faint);font-size:.72rem;font-variant-numeric:tabular-nums}
  .meter-share b{color:var(--muted);font-weight:700}
  .meter-legend{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:0 0 12px;color:var(--faint);font-size:.72rem}
  .meter-legend span{display:inline-flex;gap:6px;align-items:center}
  .meter-legend i{display:inline-block;width:22px;height:9px;border-radius:999px;background:#4ade80}
  .meter-legend b{display:inline-block;width:2px;height:13px;border-radius:1px;background:#e9e6ff}
  .meter-none,.meter-note{color:var(--faint);font-style:italic}
  @media(max-width:860px){.spend-hero{grid-template-columns:1fr}}
  .roadmap-hero{padding:clamp(22px,5vw,42px);border:1px solid var(--border);border-radius:18px;background:linear-gradient(135deg,rgba(34,230,255,.1),rgba(143,123,255,.14))}.roadmap-row--bonus{opacity:.85}.roadmap-row--bonus .cell-code code{border-color:#ffe14d;color:#ffe14d}.roadmap-row--hotfix .cell-code code{border-color:#ff6b6b;color:#ff6b6b}.roadmap-ref{display:block;margin-top:5px;color:var(--cyan);font-size:.76rem;font-weight:700}.mission-card{border-color:#5d54a0}.mission-card h2{max-width:30ch;font-size:clamp(1.5rem,3vw,2.25rem);margin:6px 0}.mission-card p{max-width:72ch;margin:0;color:var(--muted);font-size:1.02rem}.goal-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.goal-grid .card{min-width:0}.goal-grid strong{display:block;color:var(--cyan);font-size:1.05rem}.goal-grid p{margin:5px 0 0;color:var(--muted)}.goal-status{max-width:31rem;padding:7px 11px;border:1px solid #f6c445;border-radius:999px;color:#f6c445;font-size:.74rem;font-weight:850}.delivery-velocity{display:grid;gap:2px;text-align:right}.delivery-velocity strong{color:var(--cyan)}.delivery-velocity span{color:var(--muted);font-size:.74rem}.timeline-scroll{width:100%;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;-webkit-overflow-scrolling:touch}.timeline-scroll:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.timeline-scroll svg{display:block;min-width:520px;width:100%;height:112px}.incident-chart svg{min-width:768px}.availability-chart svg{min-width:768px}.timeline-key{display:grid;gap:8px;margin:10px 0 0;color:var(--muted);font-size:.76rem}.timeline-key__group{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.timeline-key__label{min-width:9.5rem;color:var(--faint);font-size:.68rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.timeline-key :is(span,a){display:inline-flex;align-items:center;gap:6px}.timeline-key :is(span,a)>b{color:var(--text);font-variant-numeric:tabular-nums}.timeline-key a{padding:2px 8px;border:1px solid var(--border);border-radius:999px;color:inherit;text-decoration:none}.timeline-key a:hover,.timeline-key a:focus-visible{border-color:var(--cyan);color:var(--text)}.timeline-key i{width:10px;height:10px;border-radius:3px;flex:none}.timeline-key-note{grid-column:1/-1;margin:2px 0 0;color:var(--faint);font-size:.72rem;font-style:italic}svg a{cursor:pointer}svg a:focus-visible{outline:2px solid var(--focus)}@media(max-width:560px){.timeline-key__label{min-width:100%}}.showcase-chart svg{display:block;min-width:2400px;width:100%;height:auto}.showcase-chart svg+svg{margin-top:14px}.showcase-chart svg a:focus-visible{outline:none}.showcase-chart svg a:focus-visible :is(rect,path,circle){stroke:var(--focus);stroke-width:2.5;paint-order:stroke}.key-green{background:#4ade80}.key-violet{background:#8f7bff}.key-red{background:#ff6b6b}.key-indigo{background:#6d8bff}.key-amber{background:#ff8a1f}.key-crimson{background:#e5484d}.key-yellow{background:#ffe14d}.portal-signoff{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}.portal-signoff strong{font-size:1.1rem}.roadmap-table{--table-min:820px;table-layout:fixed!important}.roadmap-table :is(th,td){vertical-align:top}.roadmap-table :is(th,td):nth-child(1){width:6.5rem}.roadmap-table :is(th,td):nth-child(2){width:8rem}.roadmap-table :is(th,td):nth-child(4){width:6.5rem}.roadmap-table :is(th,td):nth-child(5){width:7.5rem}.roadmap-table td:nth-child(3){white-space:normal}.roadmap-table td:nth-child(3)>strong{display:block;margin-bottom:3px;overflow-wrap:anywhere}.roadmap-summary{display:block;color:var(--muted);font-size:.82rem;line-height:1.45;white-space:normal;overflow-wrap:anywhere}.roadmap-table .cell-key{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere}
  .log-room{padding:0;overflow:hidden}.log-room>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;padding:14px 18px;cursor:pointer;list-style:none}.log-room>summary::-webkit-details-marker{display:none}.log-room>summary:after{content:"+";color:var(--cyan);font-size:1.35rem;font-weight:900}.log-room[open]>summary{border-bottom:1px solid var(--border)}.log-room[open]>summary:after{content:"−"}.log-summary{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}.log-count{padding:2px 8px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:.72rem;font-weight:800}.log-room-body{padding:16px 18px 4px}.log-actions{display:flex;justify-content:flex-end;margin-bottom:10px}.log-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) minmax(150px,.42fr) auto;gap:10px;align-items:end;margin:0 0 14px}.log-toolbar label{display:grid;gap:4px;color:var(--muted);font-size:.7rem;font-weight:850;letter-spacing:.06em;text-transform:uppercase}.log-toolbar :is(input,select){width:100%;min-height:42px;border:1px solid var(--strong);border-radius:9px;background:var(--surface-1);color:var(--text);padding:8px 10px;font:inherit}.log-visible-count{padding:10px 0;color:var(--faint);font-size:.74rem;white-space:nowrap}.table-sort{min-height:0;padding:0;border-radius:0;background:none;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;box-shadow:none}.table-sort:active{transform:none;box-shadow:none}.table-sort:after{content:" ↕";color:var(--faint)}.table-sort[data-direction="asc"]:after{content:" ↑";color:var(--cyan)}.table-sort[data-direction="desc"]:after{content:" ↓";color:var(--cyan)}
  pre{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px;overflow:auto}
  /* ── Conformance register (/audit/) ──────────────────────────────────────────
     One pill shape for every status, one table shape for every register. The
     status colours are text-on-transparent with a matching border rather than
     filled chips: a filled amber chip cannot clear 4.5:1 against this surface
     without turning the text near-black, and these pills sit next to body copy. */
  .iso-pill{display:inline-block;padding:3px 10px;border:1px solid currentColor;border-radius:999px;font-size:.7rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
  .iso-pill.is-met{color:#4ade80}.iso-pill.is-partial{color:#f6c445}.iso-pill.is-gap{color:#ff8080}.iso-pill.is-supplier{color:#b6a9ff}.iso-pill.is-excluded{color:#a49dc4}
  .iso-section{margin:36px 0 10px;font-size:clamp(1.25rem,3vw,1.7rem);scroll-margin-top:18px}
  .iso-readiness-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  .iso-readiness{display:grid;gap:6px;min-width:0}
  .iso-readiness__head{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
  .iso-readiness__head a{font-size:.82rem;font-weight:800;text-decoration:none;overflow-wrap:anywhere}
  .iso-readiness__head strong{color:var(--text);font-variant-numeric:tabular-nums}
  .iso-track{display:flex;height:10px;border-radius:999px;background:#292544;overflow:hidden}
  .iso-track>i{display:block;height:100%}.iso-track>i.is-met{background:#4ade80}.iso-track>i.is-partial{background:#f6c445}
  .iso-readiness__foot{margin:0;color:var(--faint);font-size:.72rem}
  .iso-key-table{--table-min:520px}
  .iso-key-table :is(th,td):nth-child(1){width:9rem}
  .iso-lock{display:inline-block;padding:1px 6px;border:1px solid var(--strong);border-radius:999px;color:var(--muted);font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;vertical-align:1px}
  .iso-evidence{margin:0;padding:0;list-style:none;display:grid;gap:5px}
  .iso-evidence li{min-width:0}
  .iso-evidence a{font-size:.78rem;font-weight:700;overflow-wrap:anywhere}
  .iso-missing{color:var(--faint);font-size:.78rem;font-style:italic;overflow-wrap:anywhere}
  .iso-none{color:var(--faint);font-size:.78rem;font-style:italic}
  .iso-toolbar-card{margin-bottom:18px}
  .iso-toolbar{margin:0;grid-template-columns:minmax(220px,1.4fr) minmax(150px,.6fr) minmax(150px,.6fr) auto}
  .iso-toolbar button{align-self:end;min-height:42px}
  .iso-register{padding-bottom:6px}
  .iso-register__head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
  .iso-register__head h3{margin:0 0 6px;font-size:1.1rem}
  .iso-count{padding:3px 10px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:.72rem;font-weight:800;white-space:nowrap}
  .iso-empty{margin:0 0 12px;color:var(--faint);font-size:.78rem;font-style:italic}
  .iso-table{--table-min:1200px;table-layout:fixed!important}
  .iso-table :is(th,td){vertical-align:top}
  .iso-table :is(th,td):nth-child(1){width:6.5rem}
  .iso-table :is(th,td):nth-child(2){width:15rem}
  .iso-table :is(th,td):nth-child(3){width:19rem}
  .iso-table :is(th,td):nth-child(4){width:8.5rem}
  .iso-table :is(th,td):nth-child(6){width:14rem}
  /* The register's control names must wrap; the global one-line rule is for identifiers. */
  .iso-table .cell-key{overflow:visible;text-overflow:clip;white-space:normal;overflow-wrap:anywhere;font-weight:700}
  .iso-ask,.iso-note{color:var(--muted);font-size:.82rem;line-height:1.5;overflow-wrap:anywhere}
  .iso-clauses{margin:0;font-size:.74rem;line-height:2;overflow-wrap:anywhere}
  .iso-doc-table{--table-min:1160px}
  .iso-doc-table :is(th,td):nth-child(3){width:11rem}
  .iso-evidence-table{--table-min:900px}
  .iso-evidence-table :is(th,td):nth-child(1){width:17rem}
  .iso-evidence-table :is(th,td):nth-child(2){width:7.5rem}
  .iso-evidence-table :is(th,td):nth-child(3){width:auto}
  .iso-evidence-table :is(th,td):nth-child(4){width:13rem}
  .iso-process{display:grid;gap:10px}
  .iso-process__head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
  .iso-process__head h3{margin:0;font-size:1.08rem}
  .iso-process__purpose{margin:0;color:var(--text);max-width:88ch}
  .iso-trigger{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(11,10,20,.42)}
  .iso-trigger span{color:var(--faint);font-size:.66rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
  .iso-trigger strong{min-width:0;color:var(--muted);font-weight:600;font-size:.86rem;overflow-wrap:anywhere}
  .iso-process__grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:20px}
  .iso-process__grid h4{margin:0 0 6px;color:var(--faint);font-size:.68rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
  .iso-process__grid h4+*{margin-bottom:14px}
  .iso-steps{margin:0;padding-left:1.2em;display:grid;gap:5px;color:var(--muted);font-size:.85rem}
  .iso-records{margin:0;padding-left:1.2em;display:grid;gap:4px;color:var(--muted);font-size:.85rem}
  .iso-path{margin:0;padding-left:1.2em;display:grid;gap:10px;color:var(--muted);max-width:92ch}
  .iso-path strong{color:var(--text)}
  @media(max-width:900px){.iso-readiness-grid{grid-template-columns:1fr}.iso-process__grid{grid-template-columns:1fr;gap:10px}}
  @media(max-width:760px){.iso-toolbar{grid-template-columns:1fr 1fr}.iso-toolbar button{grid-column:1/-1}}
  @media(max-width:420px){.iso-toolbar{grid-template-columns:1fr}}
  @media(max-width:900px){.goal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:760px){.site-header{align-items:flex-start;flex-direction:column}.site-header nav{justify-content:flex-start}.brand svg{width:48px}.site-header{padding:14px 12px 0}main{padding:22px 12px 48px}.gauge-layout{grid-template-columns:1fr}.metric-grid,.stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.status-metrics,.spend-metrics,.showcase-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric-card{min-height:112px;padding:12px}.metric-icon{width:25px;height:25px}.metric-value{font-size:clamp(1.05rem,5vw,1.45rem)}th,td{padding:8px}.history-item{grid-template-columns:1fr}.history-receipt{max-width:100%}.delivery-velocity{text-align:left}.log-toolbar{grid-template-columns:1fr 1fr}.log-visible-count{grid-column:1/-1;padding:0}}
  @media(max-width:420px){nav a{padding:5px 9px}.brand-copy small{display:none}.goal-grid{grid-template-columns:1fr}.spend-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.spend-metrics .metric-value{font-size:clamp(.95rem,4.4vw,1.2rem)}.log-room>summary{padding:12px}.log-room-body{padding:12px 12px 2px}.log-toolbar{grid-template-columns:1fr}}

  /* ── Trust overview ── */
  .trust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 20px}
  .trust-tile{position:relative;display:grid;gap:4px;min-height:132px;padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface-1);color:var(--text);text-decoration:none}
  .trust-tile:hover{border-color:var(--strong);background:var(--surface-2)}
  .trust-tile__label{color:var(--muted);font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
  .trust-tile__value{font-size:clamp(1.4rem,3.4vw,2rem);font-weight:800;letter-spacing:-.02em;line-height:1.1;overflow-wrap:anywhere}
  .trust-tile__detail{color:var(--muted);font-size:.82rem}
  .trust-tile__go{position:absolute;right:14px;bottom:12px;color:var(--faint);font-weight:900}
  .trust-tile.tone-green .trust-tile__value{color:#4ade80}.trust-tile.tone-cyan .trust-tile__value{color:#22e6ff}.trust-tile.tone-violet .trust-tile__value{color:#c4b5fd}.trust-tile.tone-red .trust-tile__value{color:#ff8c92}
  .trust-what{display:grid;grid-template-columns:minmax(0,10rem) minmax(0,1fr);gap:8px 18px;margin:0}
  .trust-what dt{font-weight:800}.trust-what dd{margin:0;color:var(--muted)}
  .page-intro dfn{font-style:normal;font-weight:800;color:var(--text);border-bottom:1px dotted var(--strong)}
  .action-links{display:flex;flex-wrap:wrap;gap:14px;margin:0}

  /* ── Policy index and documents ── */
  .gov-breadcrumb{margin:0 0 8px;color:var(--muted);font-size:.8rem;font-weight:700}
  .gov-list{display:grid;gap:10px;margin:14px 0 0;padding:0;list-style:none}
  .gov-card{padding:14px;border:1px solid var(--border);border-radius:12px;background:rgba(11,10,20,.42)}
  .gov-card__link{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;font-size:1.02rem;text-decoration:none}
  .gov-card__link strong{color:var(--text)}
  .gov-card__link:hover strong{color:#d4ccff}
  .gov-card .sub{margin:6px 0 8px;font-size:.86rem}
  .gov-card__clauses{margin:0;font-size:.72rem;line-height:2}
  .gov-body{display:grid;gap:4px}
  .gov-body .gov-section h2{margin:22px 0 8px;font-size:1.08rem}
  .gov-body .gov-section:first-child h2{margin-top:0}
  .gov-steps{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:18px 0 0}

  /* ── The register on a phone ──
     .iso-table pins a 1200px minimum at every width, which is 3.1x horizontal scroll on a
     390px viewport across all 184 rows. Below 760px the rows become cards: each cell prints
     the column name it belongs to from data-label, so the header association survives the
     table losing its shape. The filter stays on screen while they scroll, so narrowing the
     set is always one reach away rather than five screens back up. */
  @media(max-width:760px){
    .iso-toolbar-card{position:sticky;top:0;z-index:3;backdrop-filter:blur(14px);background:rgba(11,10,20,.94)}
    /* Doubled class throughout: the base layout rules are written as ".table-scroll table",
       which outranks a single ".iso-table" on specificity no matter which comes last. */
    .iso-table.iso-table{--table-min:0;min-width:0;width:100%;display:block;table-layout:auto}
    .iso-table.iso-table :is(tbody,tr){display:block;width:100%}
    .iso-table.iso-table thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
    .iso-table.iso-table tr{margin:0 0 10px;padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(11,10,20,.42)}
    /* The per-table column pins (.iso-doc-table :is(th,td):nth-child(3){width:11rem} and
       friends) carry a pseudo-class, so they outrank a plain class pair. Nothing here is a
       column any more, so the pins are simply cancelled. */
    .iso-table.iso-table :is(th,td){display:block;width:auto!important;min-width:0;padding:6px 0;border:0;text-align:left;overflow-wrap:anywhere}
    .iso-table.iso-table :is(th,td):empty{display:none}
    .iso-table.iso-table :is(th,td)[data-label]:before{content:attr(data-label);display:block;margin:0 0 3px;color:var(--faint);font-size:.65rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
    .iso-table.iso-table .cell-key{font-size:1rem;white-space:normal}
    .table-scroll:has(.iso-table){overflow-x:visible}
    .trust-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    .trust-what{grid-template-columns:1fr;gap:2px 0}
    .trust-what dd{margin:0 0 10px}
  }
  @media(max-width:420px){.trust-grid{grid-template-columns:1fr}}

  /* ── Contrast preferences ──
     The game's theme implements prefers-contrast three times; these nine pages implemented
     it zero times. On a portal whose whole purpose is to demonstrate conformance, that
     asymmetry is the finding. Borders and muted text move to values that clear 4.5:1
     against the surfaces they sit on, and forced-colors hands every one of them back to the
     system palette rather than fighting it. */
  @media(prefers-contrast:more){
    :root{--muted:#ded9f5;--faint:#cdc7e8;--border:#8079ad;--strong:#c3bce4;--surface-1:#100e20;--surface-2:#191634}
    a{color:#cfc4ff}
    .metric-detail,.sub,.timeline-key-note{color:var(--muted)}
    :where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline-width:4px}
  }
  @media(forced-colors:active){
    .metric-card,.card,.trust-tile,.gov-card,.iso-table tr{border:1px solid CanvasText}
    .iso-pill,.meter-pill,.integrity-badge,.status-pill{border:1px solid CanvasText;forced-color-adjust:none;background:Canvas;color:CanvasText}
    :where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:3px solid Highlight;outline-offset:2px}
    .key-dot,.incident-dot,.meter-bar i{forced-color-adjust:none}
    svg a:focus-visible{outline:3px solid Highlight}
  }
  /* Estate footer. The top nav stays six items for the common path; this carries the
     whole estate so that no page is a dead end. Overrides the bare "nav a" pill rules
     above by specificity (0,1,2 against 0,0,2), not by order. */
  .site-footer{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:0 20px 56px}
  .site-footer-inner{border-top:1px solid var(--border);padding-top:22px}
  .site-footer nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 24px;justify-content:stretch}
  .footer-col{display:grid;gap:8px;align-content:start}
  .footer-head{color:var(--cyan);font-size:.68rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
  .site-footer ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
  .site-footer nav a{min-height:26px;display:inline-flex;align-items:center;padding:3px 2px;border:0;border-radius:6px;background:none;color:var(--muted);font-size:.82rem;font-weight:700;text-decoration:none;backdrop-filter:none}
  .site-footer nav a:hover{border-color:transparent;background:none;color:var(--text);text-decoration:underline}
  .footer-note{margin:20px 0 0;color:var(--muted);font-size:.76rem;max-width:76ch}
  @media(max-width:760px){.site-footer{padding:0 12px 44px}.site-footer nav{grid-template-columns:1fr 1fr}}
`;

/**
 * The page stylesheet, served once and cached, instead of inlined into every response.
 *
 * PAGE_CSS was inlined into every server-rendered page and html() sets `no-store` on all of
 * them, so 38.6 KB of identical CSS crossed the wire on every view: 85% of /trust/, 79% of a
 * policy document, and all of it metered egress against the ceiling /spend/ reports. The
 * policy split made this worse by turning one page into twenty that each carried the whole
 * stylesheet.
 *
 * The file name carries a hash of its own contents, so a `no-store` page can never pair with
 * a stale stylesheet -- different CSS is a different URL, which is what makes the immutable
 * cache-control on it safe. The hash is FNV-1a rather than SHA-256 because it has to be
 * computed synchronously at module scope, and because it is a cache key that nothing trusts
 * rather than a security control.
 */
function cssFingerprint(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
const PAGE_CSS_PATH = `/styles/page-${cssFingerprint(PAGE_CSS)}.css`;

function pageCssResponse(): Response {
  return new Response(PAGE_CSS, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      ...SECURITY_HEADERS,
    },
  });
}

const SHARK_MARK_SVG = `<svg viewBox="0 0 180 110" role="img" aria-label="Goofy Shark Tank mascot"><path d="M35 55 4 26l8 30-8 29 31-25c12 26 67 35 112 4 12-8 20-8 29-9-9-2-17-4-29-12C102 13 47 27 35 55Z" fill="#22e6ff" stroke="#070b14" stroke-width="5" stroke-linejoin="round"/><path d="M76 29 91 5l19 28M76 75 90 102l14-29" fill="#0891b2" stroke="#070b14" stroke-width="5" stroke-linejoin="round"/><path d="M41 48c24-15 62-22 106-5-43-8-79 1-105 19Z" fill="#fff" opacity=".18"/><circle cx="137" cy="40" r="13" fill="#fff" stroke="#070b14" stroke-width="4"/><circle cx="142" cy="43" r="5" fill="#070b14"/><path d="M119 66q21 16 42-2-21 31-42 2Z" fill="#47142a" stroke="#070b14" stroke-width="4" stroke-linejoin="round"/><path d="m126 69 5 10 6-8 6 8 5-11" fill="#fff" stroke="#070b14" stroke-width="2" stroke-linejoin="round"/><circle cx="158" cy="48" r="3" fill="#070b14"/></svg>`;

/**
 * Two products, two audiences, two navigations.
 *
 * One flat ten-item bar used to sit on every page, so a player looking for the game was
 * shown nine governance routes and an assessor looking for evidence was shown the game.
 * Neither audience was served, and roughly half the outstanding usability findings were
 * downstream of that one bar. The game keeps a single way out — one link — and the trust
 * estate keeps its own five-item table of contents.
 */
const TRUST_NAV: ReadonlyArray<readonly [string, string]> = [
  ["/trust/", "Overview"],
  ["/audit/", "Register"],
  ["/policies/", "Policies"],
  ["/status/", "Operations"],
  ["/logs/", "Evidence"],
];
/**
 * The game's single link out is not emitted here — the game is not served by this
 * template. It is one link in the menu the React client renders, and one link in the
 * document the client hydrates into. This is only ever the trust side's own contents.
 * The brand mark returns to the WizardGang portfolio; the estate footer carries the
 * explicit route back to the live game.
 */
/**
 * The whole estate, in the footer of every page the trust shell renders.
 *
 * The split left /spend/ and /docs/ in neither the nav nor the brand link. Measured across
 * the estate afterwards, /policies/, each of the twenty policy documents, /logs/, /docs/
 * and /spend/ itself carried no link to either page -- five of the seven trust surfaces
 * with no route at all to two of the estate's own pages. /spend/ is the cited evidence for
 * A.8.6, 7.1, A.5.9, A.5.23, 9.1 and 6.2, so an assessor following any of those rows landed
 * somewhere with no way onward except the brand mark back to the public root.
 *
 * A footer rather than two more nav items: the nav is the common path and the split existed
 * to make it short, so widening it to eight would undo the thing it was for. This is emitted
 * from shell(), which every trust page and all twenty policy documents render through, so
 * the index cannot be complete on some pages and missing on others.
 */
const ESTATE_FOOTER: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
  ["Trust", [["/trust/", "Overview"], ["/audit/", "Register"], ["/policies/", "Policies"]]],
  ["Operations", [["/status/", "Operations"], ["/spend/", "Spend"], ["/logs/", "Evidence"]]],
  ["Interfaces", [["/docs/", "API"], ["/admin/", "Admin"], ["/play/", "Game"]]],
];

function footerHtml(): string {
  return `<footer class="site-footer"><div class="site-footer-inner"><nav aria-label="All pages on this service">${
    ESTATE_FOOTER.map(([head, links]) => `<div class="footer-col"><span class="footer-head">${head}</span><ul>${
      links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("")
    }</ul></div>`).join("")
  }</nav><p class="footer-note">Every page here is public except the operations console, which answers 401 to an unauthenticated request. The register links each control to the route that demonstrates it.</p></div></footer>`;
}

function navHtml(): string {
  return `<nav aria-label="Trust and operations">${
    TRUST_NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")
  }<a href="/admin/">Admin</a></nav>`;
}

/**
 * `description` is emitted whenever a page supplies one. It is not decoration: these pages
 * are the evidence an assessor is pointed at, and a result with no description is a result
 * that has to be opened to be identified.
 */
function shell(title: string, inner: string, description = ""): string {
  const meta = description ? `<meta name="description" content="${esc(description)}">` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0a14"><title>${title}</title>${meta}<link rel="stylesheet" href="${PAGE_CSS_PATH}"></head><body><a class="skip-link" href="#main">Skip to main content</a><header class="site-header"><a class="brand" href="https://wizardgang.ai/">${SHARK_MARK_SVG}<span class="brand-copy"><strong>Wizard Gang</strong><small>Shark Tank operations</small></span></a>${navHtml()}</header><main id="main" tabindex="-1">${inner}</main>${footerHtml()}<script nonce="__WG_CSP_NONCE__">(function(){function land(){var id=location.hash.slice(1);if(!id)return;var el=document.getElementById(id);if(!el)return;if(!el.hasAttribute("tabindex"))el.setAttribute("tabindex","-1");el.focus({preventScroll:true});}if(location.hash)land();window.addEventListener("hashchange",land);}());</script></body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** Public copy guard: records stored before the Shark Tank rename still read Arena/Lobby. */
function tankCopy(value: string): string {
  return value.replace(/\b(?:Arena|Lobby|Lobbies)\b/g, "Tank").replace(/\b(?:arena|lobby)\b/g, "tank").replace(/\blobbies\b/g, "tanks");
}

type MetricIcon = "players" | "bot" | "rooms" | "uptime" | "availability" | "traffic" | "requests" | "audit";
function metricIcon(name: MetricIcon): string {
  const paths: Record<MetricIcon, string> = {
    players: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19c.5-4 2.4-6 5.5-6s5 2 5.5 6M14 14c3.4-.7 5.7.9 6.5 4.5"/>',
    bot: '<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M8.5 12h.01M15.5 12h.01M9 16h6M3 11h2M19 11h2"/>',
    rooms: '<path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z"/>',
    uptime: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M7 3.8 5.2 2M17 3.8 18.8 2"/>',
    availability: '<path d="M3 12h4l2.2-5 4.2 10 2.2-5H21"/><path d="M4 20h16"/>',
    traffic: '<path d="M4 18h16M6 18l2-8h8l2 8M9 10V6h6v4M10 14h4"/>',
    requests: '<path d="M4 7h12M13 4l3 3-3 3M20 17H8M11 14l-3 3 3 3"/>',
    audit: '<path d="M6 3h9l3 3v15H6zM15 3v4h4M9 11h6M9 15h6"/>',
  };
  return `<span class="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg></span>`;
}
function metricCard(value: string | number, label: string, detail: string, icon: MetricIcon, tone = "tone-violet", id = ""): string {
  return `<div class="metric-card ${tone}"><div class="metric-head">${metricIcon(icon)}</div><div class="metric-value"${id ? ` id="${id}"` : ""}>${value}</div><div class="metric-label">${label}</div><div class="metric-detail">${detail}</div></div>`;
}
function billingGaugeSvg(prefix: string, projectedMonthly = 0, currentSpend = 0, measuredLabel = "Measured this window"): string {
  const ratio = Math.max(0, Math.min(1, projectedMonthly / 5)), angle = -90 + ratio * 180;
  const tone = projectedMonthly > 5 ? "tone-red" : projectedMonthly > 0 ? "tone-yellow" : "tone-green";
  const state = projectedMonthly > 5 ? "REDLINE" : projectedMonthly > 0 ? "METERED" : "INCLUDED";
  return `<div class="gauge-layout"><svg class="gauge-svg" viewBox="0 0 220 145" role="img" aria-labelledby="${prefix}-gauge-title ${prefix}-gauge-desc"><title id="${prefix}-gauge-title">Projected monthly variable spend above included free-tier limits</title><desc id="${prefix}-gauge-desc">Yellow indicates projected spend up to five dollars. Red indicates more than five dollars.</desc><path d="M22 112 A88 88 0 0 1 198 112" pathLength="100" fill="none" stroke="#292544" stroke-width="19"/><path d="M22 112 A88 88 0 0 1 198 112" pathLength="100" fill="none" stroke="#4ade80" stroke-width="19" stroke-dasharray="4 96"/><path d="M22 112 A88 88 0 0 1 198 112" pathLength="100" fill="none" stroke="#f6c445" stroke-width="19" stroke-dasharray="84 16" stroke-dashoffset="-4"/><path d="M22 112 A88 88 0 0 1 198 112" pathLength="100" fill="none" stroke="#ff5f66" stroke-width="19" stroke-dasharray="12 88" stroke-dashoffset="-88"/><g id="${prefix}-gauge-needle" class="gauge-needle ${tone}" style="transform-origin:110px 112px;transform:rotate(${angle.toFixed(1)}deg)"><line x1="110" y1="112" x2="110" y2="35" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="110" cy="112" r="9" fill="currentColor"/><circle cx="110" cy="112" r="4" fill="#16142a"/></g><text x="20" y="137" fill="#8f89ae" font-size="9">$0</text><text x="188" y="137" fill="#ff8c92" font-size="9">$5+</text></svg><div class="gauge-readout ${tone}"><strong id="${prefix}-gauge-value">$${projectedMonthly.toFixed(2)}</strong><span>projected spend above free tier / 30 days</span><span id="${prefix}-gauge-state" class="meter-pill">${state}</span><p class="sub" style="margin:14px 0 0">${esc(measuredLabel)}: <b id="${prefix}-current-spend">$${currentSpend.toFixed(8)}</b></p></div></div>`;
}

/**
 * Spend trend.
 *
 * The page previously reported cost as one instantaneous number, which cannot answer
 * the only question that matters about a bill: is it flat, creeping, or accelerating?
 * This plots the cumulative metered spend samples the Lobby records hourly. The y-axis
 * auto-scales to the data — pinning it to the $5 hard stop would flatten a
 * sub-cent line into the axis and show nothing at all.
 */
function spendTrendSvg(samples: Array<{ ts: number; usd: number }>, hardLimitUsd: number): string {
  const width = 640, height = 180, left = 54, right = 12, top = 14, bottom = 30;
  const plotW = width - left - right, plotH = height - top - bottom;
  if (samples.length < 2) {
    const only = samples[0];
    return `<div class="trend-empty"><strong>$${(only?.usd ?? 0).toFixed(8)}</strong>
      <span>${only ? "First sample recorded. The trend line draws once a second hourly sample lands." : "No spend samples recorded yet."}</span></div>`;
  }
  const first = samples[0].ts, span = Math.max(1, samples[samples.length - 1].ts - first);
  const values = samples.map((sample) => sample.usd);
  const hi = Math.max(...values), lo = Math.min(...values), range = hi - lo;
  // A cumulative bill plotted from $0 is a flat line pinned to the ceiling as soon as the
  // increments are small relative to the total — true, and it shows nothing. The axis is
  // fitted to the data and then snapped out to round tick values, so the line uses the
  // height it has and the labels are readable numbers rather than six-decimal noise. An
  // area fill off a non-zero baseline reads as volume, which would be a lie, so the fill
  // only appears when the axis genuinely starts at zero.
  const flat = range <= 0;
  const pad = flat ? Math.max(hi * 0.1, 1e-8) : range * 0.15;
  const step = niceAxisStep(Math.max(hi + pad - (flat ? 0 : Math.max(0, lo - pad)), 1e-12));
  const base = flat ? 0 : Math.max(0, Math.floor(Math.max(0, lo - pad) / step) * step);
  const top_ = Math.max(Math.ceil((hi + pad) / step) * step, base + step);
  const zoomed = base > 0;
  const scale = Math.max(top_ - base, 1e-12);
  const decimals = Math.min(8, Math.max(2, Math.ceil(-Math.log10(step)) + 1));
  const x = (ts: number) => left + ((ts - first) / span) * plotW;
  const y = (usd: number) => top + plotH - ((usd - base) / scale) * plotH;
  const line = samples.map((sample, index) => `${index ? "L" : "M"}${x(sample.ts).toFixed(1)} ${y(sample.usd).toFixed(1)}`).join(" ");
  const area = zoomed ? "" : `<path d="${line} L${x(samples[samples.length - 1].ts).toFixed(1)} ${(top + plotH).toFixed(1)} L${x(first).toFixed(1)} ${(top + plotH).toFixed(1)} Z" fill="rgba(34,230,255,.14)"/>`;
  const ticks: string[] = [];
  for (let value = base; value <= top_ + step / 2 && ticks.length < 9; value += step) {
    const gy = y(value);
    ticks.push(`<line x1="${left}" y1="${gy.toFixed(1)}" x2="${width - right}" y2="${gy.toFixed(1)}" stroke="#3a355e" stroke-width="1"/>`
      + `<text x="${left - 6}" y="${(gy + 3).toFixed(1)}" class="tr-axis" text-anchor="end">$${value.toFixed(decimals)}</text>`);
  }
  const last = samples[samples.length - 1];
  const dot = `<circle cx="${x(last.ts).toFixed(1)}" cy="${y(last.usd).toFixed(1)}" r="3.5" fill="#22e6ff"/>`
    + `<text x="${(x(last.ts) - 6).toFixed(1)}" y="${Math.max(top + 9, y(last.usd) - 8).toFixed(1)}" class="tr-value" text-anchor="end">$${last.usd.toFixed(decimals)}</text>`;
  // Where today started, so "spend today" above the chart has a visible span on it.
  const midnight = Date.parse(`${new Date(last.ts).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const todayMark = midnight > first && midnight < last.ts
    ? `<line x1="${x(midnight).toFixed(1)}" y1="${top}" x2="${x(midnight).toFixed(1)}" y2="${(top + plotH).toFixed(1)}" stroke="#8f7bff" stroke-width="1.5" stroke-dasharray="3 3"/>`
      + `<text x="${(x(midnight) + 4).toFixed(1)}" y="${(top + 10).toFixed(1)}" class="tr-today">today</text>`
    : "";
  const day = (ts: number) => new Date(ts).toISOString().slice(5, 16).replace("T", " ");
  return `<div class="trend-scroll" role="region" aria-label="Cumulative spend trend" tabindex="0"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Cumulative metered spend rose from $${lo.toFixed(8)} to $${hi.toFixed(8)} across ${samples.length} hourly samples, against a $${hardLimitUsd.toFixed(2)} hard stop${zoomed ? `. The axis starts at $${base.toFixed(decimals)}, not zero` : ""}`)}">
    <style>.tr-axis{fill:#8f89ae;font:500 9px ui-monospace,SFMono-Regular,Consolas,monospace}.tr-value{fill:#22e6ff;font:800 10px ui-monospace,SFMono-Regular,Consolas,monospace}.tr-today{fill:#8f7bff;font:700 9px ui-monospace,SFMono-Regular,Consolas,monospace}</style>
    ${ticks.join("")}
    ${area}
    ${todayMark}
    <path d="${line}" fill="none" stroke="#22e6ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dot}
    <text x="${left}" y="${height - 10}" class="tr-axis">${esc(day(first))}</text>
    ${zoomed ? `<text x="${(left + plotW / 2).toFixed(0)}" y="${height - 10}" class="tr-axis" text-anchor="middle">axis starts at $${base.toFixed(decimals)}</text>` : ""}
    <text x="${width - right}" y="${height - 10}" class="tr-axis" text-anchor="end">${esc(day(last.ts))}</text>
  </svg></div>`;
}

/** Round axis step (1, 2, 2.5 or 5 × a power of ten) covering `range` in about four steps. */
function niceAxisStep(range: number): number {
  const raw = range / 4, magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const factor = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  // Spend is carried to eight decimals, so a finer step would print the same label twice.
  return Math.max(factor * magnitude, 1e-8);
}

/** One row of the unified meter: Service / Used to date / Limit / Today / Daily average. */
interface MeterRow {
  service: string;
  /** Plain-English action that drives this meter — the old mapping table, inlined. */
  driver: string;
  usage: string;
  limit: string;
  /** What today has consumed so far. For a stock (storage) this is the level held. */
  today: string;
  /** Lifetime daily average. For a stock there is no rate, so this reads as a level. */
  daily: string;
  /** 0..1 of today's share of the daily-normalised limit, or null when not comparable. */
  todayShare: number | null;
  /** 0..1 for the daily average, drawn as a marker on the same axis. */
  averageShare: number | null;
  /** What the bar is a share of. Stocks are a level against the whole allowance. */
  shareLabel?: string;
}

/**
 * Five decades, 0.001% → 100% of the limit.
 *
 * Every meter on this page runs three to five orders of magnitude below its free-tier
 * allowance, so a linear bar drew every row as the same invisible sliver at the far left —
 * 0.008% of a limit and 8% of a limit were pixel-identical. The track carries decade ticks
 * so the axis reads as logarithmic, and the exact percentage is always printed beneath it.
 */
const METER_DECADES = 5;
function meterPosition(share: number): number {
  if (share <= 0) return 0;
  if (share >= 1) return 100;
  return Math.max(1.5, Math.min(100, ((Math.log10(share) + METER_DECADES) / METER_DECADES) * 100));
}
function meterPercentLabel(share: number): string {
  const percent = share * 100;
  if (percent === 0) return "0";
  if (percent < 0.001) return "<0.001";
  return percent.toFixed(percent < 1 ? 3 : 1);
}

/** The bar shows today against the daily limit; the tick marks where the average sits. */
function meterBarHtml(todayShare: number | null, averageShare: number | null, limitLabel: string): string {
  // No bar rather than a "not comparable" note: the cell's own value already says why
  // (analytics required, not bound, a level rather than a rate).
  if (todayShare == null) return "";
  const percent = todayShare * 100;
  const tone = percent >= 90 ? " is-red" : percent >= 60 ? " is-amber" : "";
  const marker = averageShare == null || averageShare <= 0
    ? ""
    : `<b style="left:${meterPosition(averageShare).toFixed(2)}%"></b>`;
  // The average is not repeated in this caption — it is the marker on the bar, and the
  // Daily average column prints it as a number one cell to the right.
  return `<span class="meter-bar${tone}" role="img" aria-label="${esc(`${meterPercentLabel(todayShare)} percent of ${limitLabel}, on a logarithmic axis${averageShare ? `; the daily average is ${meterPercentLabel(averageShare)} percent` : ""}`)}"><i style="width:${meterPosition(todayShare).toFixed(2)}%"></i>${marker}</span>`
    + `<span class="meter-share">${meterPercentLabel(todayShare)}% of ${esc(limitLabel)}</span>`;
}

function meterRowHtml(row: MeterRow): string {
  return `<tr><th scope="row" class="meter-service"><strong>${esc(row.service)}</strong><span>${esc(row.driver)}</span></th>`
    + `<td class="meter-usage">${row.usage}</td><td class="meter-limit">${row.limit}</td>`
    + `<td class="meter-today"><div class="meter-stack"><span class="meter-daily__value">${row.today}</span>${meterBarHtml(row.todayShare, row.averageShare, row.shareLabel ?? "today's limit")}</div></td>`
    + `<td class="meter-daily"><div class="meter-stack"><span class="meter-daily__value">${row.daily}</span>${row.averageShare == null ? "" : `<span class="meter-share">${meterPercentLabel(row.averageShare)}% of daily limit</span>`}</div></td></tr>`;
}

function spendHtml(billing: Record<string, unknown>): string {
  const allTime = recordValue(billing.allTime), services = recordValue(allTime.services);
  const durable = recordValue(services.durableObjects), d1 = recordValue(services.d1), r2 = recordValue(services.r2);
  const currentServices = recordValue(billing.services), workers = recordValue(currentServices.workers);
  const averageDaily = recordValue(allTime.averageDaily), today = recordValue(billing.today);
  const freeTier = recordValue(billing.freeTier), freeDo = recordValue(freeTier.durableObjects), freeR2 = recordValue(freeTier.r2), freeWorkers = recordValue(freeTier.workers), sources = recordValue(freeTier.sources);
  const measured = numberValue(allTime.estimatedVariableUsd), monthly = numberValue(billing.freeTierProjectedMonthlyUsd);
  const hardLimit = numberValue(billing.hardLimitUsd);
  // Floored at one day, matching how the Lobby computes its own daily averages. Without
  // the floor, a service a few hours old extrapolates "7 operations" into "168 / day",
  // which reads as a bug sitting next to its own total.
  const observedDays = Math.max(1, numberValue(allTime.observedDays));
  const samples = Array.isArray(billing.spendHistory) ? billing.spendHistory as Array<{ ts: number; usd: number }> : [];

  const n = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
  const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;
  const perDay = (total: number) => total / observedDays;
  // Sub-cent figures are the normal case here, so a fixed 2dp would print every one of them
  // as $0.00. Widen the decimals as the number shrinks instead.
  const usd = (value: number) => `$${value >= 0.01 ? value.toFixed(2) : value >= 0.000001 ? value.toFixed(6) : value.toFixed(8)}`;
  const todayUsd = numberValue(today.estimatedUsd), averageUsd = numberValue(averageDaily.estimatedUsd);
  const todayPartial = today.partial === true, todayHours = numberValue(today.measuredHours);
  // Today is compared against a whole day's allowance, because that is the allowance —
  // "8% of today's limit by lunchtime" is the reading that matters, not a pro-rated one.
  const share = (value: number, limit: number) => (limit > 0 ? value / limit : null);
  const remainingUsd = numberValue(billing.hardLimitRemainingUsd);
  const paceDays = averageUsd > 0 ? remainingUsd / averageUsd : Infinity;
  const headroom = billing.hardLimitExceeded === true
    ? "game traffic disabled"
    : averageUsd <= 0
      ? "no measured spend yet"
      : paceDays >= 365
        ? `${(paceDays / 365).toFixed(1)} years at the current average`
        : paceDays >= 1
          ? `${Math.round(paceDays)} days at the current average`
          : `${Math.max(1, Math.round(paceDays * 24))} hours at the current average`;

  // Every limit is normalised to a per-day figure so one bar compares every row on the
  // same axis — monthly R2 allowances included. That normalisation is the whole point:
  // a monthly cap and a daily cap are not otherwise readable side by side.
  const doStorage = numberValue(durable.storageBytes), doStorageLimit = numberValue(freeDo.storageBytes);
  const r2Storage = numberValue(r2.storageBytes), r2StorageLimit = numberValue(freeR2.storageBytesPerMonth);
  const r2ClassA = numberValue(r2.classAOperations), r2ClassALimit = numberValue(freeR2.classAOperationsPerMonth);
  const r2ClassB = numberValue(r2.classBOperations), r2ClassBLimit = numberValue(freeR2.classBOperationsPerMonth);
  // Monthly R2 allowances are compared against one thirtieth of the month, so a monthly
  // cap and a daily cap read on the same axis.
  const r2ClassADaily = r2ClassALimit / 30, r2ClassBDaily = r2ClassBLimit / 30;
  const rows: MeterRow[] = [
    {
      service: "Worker requests", driver: "Every page view and API call",
      usage: workers.requests == null ? `<span class="meter-note" title="${esc(String(workers.note ?? ""))}">Analytics required</span>` : n(numberValue(workers.requests)),
      limit: `${n(numberValue(freeWorkers.requestsPerDay))} / day`,
      today: "—",
      daily: workers.requests == null ? "—" : `${n(perDay(numberValue(workers.requests)))} / day`,
      todayShare: null,
      averageShare: workers.requests == null ? null : share(perDay(numberValue(workers.requests)), numberValue(freeWorkers.requestsPerDay)),
    },
    {
      service: "Durable Object requests", driver: "Joining a tank, opening a dashboard",
      usage: n(numberValue(durable.requests)),
      limit: `${n(numberValue(freeDo.requestsPerDay))} / day`,
      today: n(numberValue(today.requests)),
      daily: `${n(numberValue(averageDaily.requests))} / day`,
      todayShare: share(numberValue(today.requests), numberValue(freeDo.requestsPerDay)),
      averageShare: share(numberValue(averageDaily.requests), numberValue(freeDo.requestsPerDay)),
    },
    {
      service: "Durable Object duration", driver: "Rooms simulating 32 sharks in real time",
      usage: `${n(numberValue(durable.gbSeconds), 2)} GB-s`,
      limit: `${n(numberValue(freeDo.gbSecondsPerDay))} GB-s / day`,
      today: `${n(numberValue(today.gbSeconds), 2)} GB-s`,
      daily: `${n(numberValue(averageDaily.gbSeconds), 2)} GB-s / day`,
      todayShare: share(numberValue(today.gbSeconds), numberValue(freeDo.gbSecondsPerDay)),
      averageShare: share(numberValue(averageDaily.gbSeconds), numberValue(freeDo.gbSecondsPerDay)),
    },
    {
      service: "SQLite rows read", driver: "Loading profiles, logs, and receipts",
      usage: n(numberValue(durable.rowsRead)),
      limit: `${n(numberValue(freeDo.rowsReadPerDay))} / day`,
      today: n(numberValue(today.rowsRead)),
      daily: `${n(numberValue(averageDaily.rowsRead))} / day`,
      todayShare: share(numberValue(today.rowsRead), numberValue(freeDo.rowsReadPerDay)),
      averageShare: share(numberValue(averageDaily.rowsRead), numberValue(freeDo.rowsReadPerDay)),
    },
    {
      service: "SQLite rows written", driver: "Steering, dashing, and every audit row",
      usage: n(numberValue(durable.rowsWritten)),
      limit: `${n(numberValue(freeDo.rowsWrittenPerDay))} / day`,
      today: n(numberValue(today.rowsWritten)),
      daily: `${n(numberValue(averageDaily.rowsWritten))} / day`,
      todayShare: share(numberValue(today.rowsWritten), numberValue(freeDo.rowsWrittenPerDay)),
      averageShare: share(numberValue(averageDaily.rowsWritten), numberValue(freeDo.rowsWrittenPerDay)),
    },
    {
      service: "Durable Object storage", driver: "Room snapshots and the receipt chain",
      usage: mb(doStorage),
      limit: `${(doStorageLimit / 1_000_000_000).toFixed(0)} GB`,
      today: `${mb(doStorage)} held`,
      daily: `<span class="meter-note">level, not a rate</span>`,
      todayShare: share(doStorage, doStorageLimit),
      averageShare: null,
      shareLabel: "the limit",
    },
    {
      service: "R2 Class A operations", driver: "Writing or listing a stored asset",
      usage: n(r2ClassA),
      limit: `${n(r2ClassALimit)} / month`,
      today: n(numberValue(today.r2ClassA)),
      daily: `${n(perDay(r2ClassA), 2)} / day`,
      todayShare: share(numberValue(today.r2ClassA), r2ClassADaily),
      averageShare: share(perDay(r2ClassA), r2ClassADaily),
    },
    {
      service: "R2 Class B operations", driver: "Reading a stored asset",
      usage: n(r2ClassB),
      limit: `${n(r2ClassBLimit)} / month`,
      today: n(numberValue(today.r2ClassB)),
      daily: `${n(perDay(r2ClassB), 2)} / day`,
      todayShare: share(numberValue(today.r2ClassB), r2ClassBDaily),
      averageShare: share(perDay(r2ClassB), r2ClassBDaily),
    },
    {
      service: "R2 storage", driver: `${n(numberValue(r2.objects))} objects in the bound asset bucket`,
      usage: mb(r2Storage),
      limit: `${(r2StorageLimit / 1_000_000_000).toFixed(0)} GB-month`,
      today: `${mb(r2Storage)} held`,
      daily: `<span class="meter-note">level, not a rate</span>`,
      todayShare: share(r2Storage, r2StorageLimit),
      averageShare: null,
      shareLabel: "the limit",
    },
    {
      service: "D1", driver: "No database bound to this Worker",
      usage: d1.configured ? n(numberValue(d1.rowsRead)) : `<span class="meter-note">Not bound</span>`,
      limit: d1.configured ? "See D1 pricing" : "—",
      today: "—",
      daily: "—",
      todayShare: null,
      averageShare: null,
    },
  ];

  return `<section class="page-intro"><div class="eyebrow">Shark Tank cost control</div><h1>Every bite leaves a receipt.</h1><a class="action-link" href="/spend.json">Raw spend JSON →</a></section>
    <div class="spend-hero">
      <div class="card hero-card gauge-card">${billingGaugeSvg("spend", monthly, measured, "All-time list-price meter")}</div>
      <div class="card hero-card trend-card">
        <div class="eyebrow">Spend trend</div>
        <h2>Cumulative metered spend</h2>
        ${spendTrendSvg(samples, hardLimit)}
        <p class="sub">${samples.length} hourly ${samples.length === 1 ? "sample" : "samples"} · $${hardLimit.toFixed(2)} hard stop · ${billing.hardLimitExceeded === true ? "<b>game traffic and public writes disabled</b>" : "traffic allowed"}</p>
      </div>
    </div>
    <div class="metric-grid spend-metrics">
      ${/* An eight-decimal figure wraps mid-number in a card; the exact value stays on the
            gauge readout below and in this cell's tooltip. */""}
      ${metricCard(`<span title="$${measured.toFixed(8)}">${usd(measured)}</span>`, "All-time meter", `since ${new Date(numberValue(allTime.startedAt)).toLocaleDateString()}`, "audit", "tone-cyan")}
      ${metricCard(`<span title="$${todayUsd.toFixed(8)}">${usd(todayUsd)}</span>`, "Spend today", `${hardLimit > 0 ? `${((todayUsd / hardLimit) * 100).toFixed(todayUsd / hardLimit < 0.01 ? 3 : 1)}% of the $${hardLimit.toFixed(2)} stop` : "measured today"}${todayPartial ? ` · measured ${todayHours < 1 ? "under an hour" : `${Math.round(todayHours)}h`}` : ""}`, "requests", todayUsd > averageUsd * 2 && averageUsd > 0 ? "tone-yellow" : "tone-green")}
      ${metricCard(`<span title="$${averageUsd.toFixed(8)}">${usd(averageUsd)}</span>`, "Average spend / day", `over ${observedDays < 1.5 ? "the first day" : `${observedDays.toFixed(1)} days`}`, "uptime", "tone-violet")}
      ${metricCard(`$${numberValue(billing.hardLimitUsd).toFixed(2)}`, "Spend hard stop", headroom, "traffic", billing.hardLimitExceeded === true ? "tone-red" : "tone-green")}
    </div>
    <div class="card"><h2>Usage against the free tier</h2>
      <p class="sub" style="margin:0 0 12px">Every meter reads the same way: what it is, what it has used to date, what the free tier allows, what <b>today</b> has spent against that allowance, and the lifetime daily average. Monthly allowances are shown as monthly but compared against a thirtieth of the month, so every bar shares one axis. Storage is a stock, so its cells show the level held rather than a rate.${todayPartial ? ` Today is measured from ${new Date(numberValue(today.since)).toISOString().slice(11, 16)} UTC, not from midnight — the day boundary is captured on the first reading of each day.` : ""}</p>
      <p class="meter-legend"><span><i></i> today, against a whole day's allowance</span><span><b></b> where the daily average sits</span><span>ticks mark 0.001 / 0.01 / 0.1 / 1 / 10 / 100% — the axis is logarithmic</span></p>
      <div class="table-scroll" role="region" aria-label="Usage against the free tier" tabindex="0"><table class="billing-table meter-table"><caption class="sr-only">Usage against the free tier</caption><thead><tr><th scope="col">Service</th><th scope="col">Used to date</th><th scope="col">Limit</th><th scope="col">Today${todayPartial ? "*" : ""}</th><th scope="col">Daily average</th></tr></thead><tbody>
      ${rows.map(meterRowHtml).join("")}
    </tbody></table></div><p class="sub" style="margin:12px 0 0">Sources: <a href="${esc(String(sources.workers ?? "#"))}">Workers</a>, <a href="${esc(String(sources.durableObjects ?? "#"))}">Durable Objects</a>, <a href="${esc(String(sources.r2 ?? "#"))}">R2</a>. Worker requests are not counted here: exact request billing is only available from account analytics.</p></div>`;
}

function recordValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function numberValue(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

function securityReportCard(id: string): string {
  return `<div class="card"><div class="eyebrow">Independent white-hat report target</div><h2>Report a security issue</h2><p class="sub">Creates one report, retained audit event, and append-only control-history receipt with limited server metadata, and raises it to operations. It does not change service state: taking the game down is a separate authenticated operator decision. It does not expose secrets or confirm a compromise.</p>${securityReportControl(id)}</div>`;
}

function securityReportControl(id: string): string { return `<button type="button" class="security-report-button" id="${id}">🚀 FILE A SECURITY REPORT AND TAKE THE GAME DOWN 🚀</button><pre class="security-receipt" id="${id}-output" role="status" aria-live="polite" aria-atomic="true" hidden></pre>`; }

function securityReportScript(id: string): string {
  return `<script nonce="__WG_CSP_NONCE__">(function(){var b=document.getElementById('${id}'),o=document.getElementById('${id}-output');if(!b)return;b.addEventListener('click',async function(){b.disabled=true;o.hidden=false;o.textContent='Recording report and forcing game downtime…';try{var r=await fetch('/admin/security-report',{method:'POST',headers:{'x-wg-ops-action':'security-report'}}),d=await r.json();o.textContent=(r.ok?d.message||'Security report recorded and the game is down.':'Rejected: '+(d.error||'the report could not be recorded.'))+'\\n\\n'+JSON.stringify(d,null,2);if(r.ok&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){var colors=['#22e6ff','#8f7bff','#ffd54a','#ff8a1f','#57ff5a'];for(var i=0;i<48;i++){var c=document.createElement('i');c.className='report-confetti';c.style.left=(Math.random()*100)+'vw';c.style.background=colors[i%colors.length];c.style.setProperty('--drift',((Math.random()-.5)*260)+'px');c.style.animationDelay=(Math.random()*.35)+'s';document.body.appendChild(c);setTimeout(function(x){x.remove()},2100,c);}}}catch(e){o.textContent='Unable to record report and lockdown receipt.';}finally{b.disabled=false;}});}());</script>`;
}

/**
 * Record a white-hat security report. Whether it also takes the game down is decided by the
 * route that called this — never by the request — so the unauthenticated public intake can
 * only ever append a report, an audit event, and a control receipt. Only the ops-gated
 * /admin/security-report passes `lockdown`, which enables maintenance and closes tank sockets.
 */
async function securityReport(request: Request, url: URL, env: Env, lockdown: boolean): Promise<Response> {
  const report = {
    id: `white-hat-${crypto.randomUUID()}`,
    reportedAt: new Date().toISOString(),
    environment: env.ENVIRONMENT ?? "unknown",
    deploymentVersion: env.CF_VERSION_METADATA?.id ?? "local",
    route: url.pathname,
    colo: request.cf?.colo ?? null,
    country: request.cf?.country ?? null,
    userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 160),
    lockdown,
  };
  const reportResponse = await lobbyStub(env).fetch("https://lobby/security-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) });
  if (reportResponse.status === 429) return json({ ok: false, error: "a security report was accepted moments ago; please wait before sending another" }, 429);
  if (!reportResponse.ok) return json({ ok: false, error: lockdown ? "report and lockdown could not be persisted" : "report could not be persisted" }, 502);
  const receipt = (await reportResponse.json()) as Record<string, unknown> & { maintenance?: MaintenanceState };
  if (!lockdown) return json(receipt);
  if (receipt.maintenance) maintenanceCache = { state: receipt.maintenance, expiresAt: Date.now() + 1_000 };
  const roomResults = await Promise.allSettled(AUDIT_ROOMS.map((roomId) => roomFetch(env, roomId, "/maintenance?enabled=1", { method: "POST" })));
  const disconnectedRooms = roomResults.filter((result) => result.status === "fulfilled" && result.value.ok).length;
  return json({ ...receipt, disconnectedRooms, roomCount: AUDIT_ROOMS.length });
}

function ndjson(events: unknown[]): Response {
  const body = events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

/** Fetch a path on the Room DO instance for `roomId` (game log / replay). */
function roomFetch(env: Env, roomId: string, pathAndQuery: string, init?: RequestInit): Promise<Response> {
  const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
  const u = new URL("https://room" + pathAndQuery);
  u.searchParams.set("roomId", roomId);
  return stub.fetch(u.toString(), init);
}

/**
 * Availability is reported over the life of the project, not a rolling 24 hours. A
 * 24-hour window silently forgets every incident older than a day, which made the
 * evidence pages read as "nothing has ever happened" the moment a day passed. Anchored
 * to the first hour of the build so the window only ever grows.
 */
const PROJECT_START_MS = Date.parse("2026-08-18T16:15:00.000Z");
const projectWindowMs = (now: number) => Math.max(1, now - PROJECT_START_MS);
/** "2d 7h" / "7h 20m" / "18m" — the span an availability figure is measured over. */
function formatWindow(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const AUDIT_ROOMS = ["room-1", "room-2", "room-3", "room-4"];
const AUDIT_ROOM_NAMES: Record<string, string> = { "room-1": "Pacific", "room-2": "Atlantic", "room-3": "Indian", "room-4": "Arctic" };
interface IncidentRecord { id: string; title: string; cause: string; status: "active" | "resolved"; startedAt: string | number; resolvedAt: string | number | null; impactEndedAt?: string | number | null; summary: string }
interface ControlHistoryEntry { sequence: number; ts: number; code: string; actor: string; title: string; summary: string; reference: string | null; detail: string | null; previousHash: string; hash: string }
interface ControlHistoryIntegrity {
  mode: string; algorithm: string; entryCount: number; headHash: string | null;
  // Added when the chain gained real verification. Optional so a response from an older
  // Durable Object instance still renders — it degrades to "not reported", never to a
  // tamper accusation.
  verified?: boolean;
  chainStatus?: "empty" | "verified" | "tampered" | "unverified";
  anchorState?: "verified" | "adopted" | "stale" | "mismatch" | null;
  checkedEntries?: number;
  coverage?: "full" | "recent" | "none";
  failedAtSequence?: number | null;
}

/**
 * The page states the chain's verdict, not just its head.
 *
 * A hash chain that only validates against itself proves nothing to a reader — the whole
 * claim on this page is tamper-evidence, so the check has to be visible. Colour is never
 * the only cue: the badge carries its own word, and the sentence beside it says what was
 * actually checked.
 */
function integrityVerdict(integrity: ControlHistoryIntegrity): string {
  const status = integrity.chainStatus;
  if (!status) return "";
  const checked = integrity.checkedEntries ?? 0;
  const scope = integrity.coverage === "recent" ? `newest ${checked} entries re-hashed` : `${checked} entries re-hashed`;
  const badge = (tone: string, label: string, detail: string) =>
    `<span class="integrity-badge ${tone}">${label}</span><span>${detail}</span>`;
  if (status === "empty") return badge("verdict-idle", "No receipts", "nothing recorded yet");
  if (status === "verified") {
    const anchor = integrity.anchorState === "adopted" ? "anchor recorded this read" : "matches the stored anchor";
    return badge("verdict-pass", "Verified", `${scope} · ${anchor}`);
  }
  if (status === "tampered") {
    const where = integrity.failedAtSequence != null
      ? `first mismatch at receipt #${integrity.failedAtSequence}`
      : "the chain no longer matches the stored anchor — entries are missing";
    return badge("verdict-fail", "Failed", where);
  }
  return badge("verdict-idle", "Not checked", "verification did not complete on this read");
}
const INCIDENTS: IncidentRecord[] = [{ id: "2026-08-18-maintenance-check", title: "Maintenance control verification", cause: "Planned maintenance", status: "resolved", startedAt: "2026-08-18T21:45:00.000Z", resolvedAt: "2026-08-18T21:49:30.000Z", summary: "The tank was briefly taken offline while root-wide downtime routing and Durable Object reductions were verified." }];
const SCHEDULED_INCIDENT_CAUSES = new Set(["Planned maintenance", "Audit control", "Owner security exercise"]);
/** Timeline/legend colour per incident cause, so the key explains what the bars mean. */
const INCIDENT_TONES: Readonly<Record<string, { key: string; color: string; label: string }>> = {
  "Planned maintenance": { key: "key-violet", color: "#8f7bff", label: "Planned maintenance" },
  "Audit control": { key: "key-indigo", color: "#6d8bff", label: "Operator maintenance" },
  "Owner security exercise": { key: "key-amber", color: "#ff8a1f", label: "Security exercise" },
  "Independent security report": { key: "key-red", color: "#ff6b6b", label: "Security report" },
  "Billing hard limit": { key: "key-crimson", color: "#e5484d", label: "Spend hard stop" },
  "Test alert": { key: "key-yellow", color: "#ffe14d", label: "Test alert" },
};
const INCIDENT_FALLBACK_TONE = { key: "key-red", color: "#ff6b6b", label: "Unscheduled outage" };
function incidentTone(cause: string) { return INCIDENT_TONES[cause] ?? INCIDENT_FALLBACK_TONE; }
/**
 * Legend for the causes actually drawn, grouped and counted.
 *
 * The flat colour list did not say which lane a colour belonged to or how often it
 * occurred, so it explained the palette rather than the chart. Entries are now split
 * into the two lanes the bar draws, each carries its occurrence count, and each is a
 * link into the record it came from — so every mark on the chart is traceable back to
 * the incident and control receipt that produced it.
 */
function timelineLegend(incidents: IncidentRecord[], history: ControlHistoryEntry[] = [], linkBase = ""): string {
  const relevant = incidents.filter((incident) => incident.cause !== "Test alert");
  const counts = new Map<string, number>();
  for (const incident of relevant) counts.set(incident.cause, (counts.get(incident.cause) ?? 0) + 1);
  const causes = [...counts.keys()].sort();
  const entry = (cause: string) => {
    const tone = incidentTone(cause), count = counts.get(cause) ?? 0;
    const first = relevant.find((incident) => incident.cause === cause);
    const href = first ? `${linkBase}#${receiptAnchor(first, history) ?? incidentAnchor(first)}` : "";
    const body = `<i class="${tone.key}"></i>${esc(tone.label)} <b>${count}</b>`;
    return href ? `<a href="${href}">${body}</a>` : `<span>${body}</span>`;
  };
  const scheduled = causes.filter((cause) => SCHEDULED_INCIDENT_CAUSES.has(cause));
  const unscheduled = causes.filter((cause) => !SCHEDULED_INCIDENT_CAUSES.has(cause));
  const group = (label: string, items: string[]) => items.length ? `<div class="timeline-key__group"><span class="timeline-key__label">${label}</span>${items.join("")}</div>` : "";
  return `<div class="timeline-key">
    ${group("Server", [`<span><i class="key-green"></i>Available <b>100%</b></span>`])}
    ${group("Tank · scheduled", scheduled.map(entry))}
    ${group("Tank · unscheduled", unscheduled.map(entry))}
    <p class="timeline-key-note">Every legend entry links to the record that produced it. Chart markers are pointer shortcuts to the same records; by keyboard, reach them through the legend above or the incident list on <a href="/status/#incidents">Incidents</a>.</p>
  </div>`;
}

/**
 * Incident chart: every recorded incident across project inception → now.
 *
 * This is deliberately NOT the availability bar. /status/ answers "is the tank up right
 * now", and it owns the two uptime lanes; repeating those lanes here said the same thing
 * twice and said nothing about the incidents themselves. This chart is incident-shaped:
 * one lane per cause, each incident drawn at its real position and duration on a
 * project-length axis, so the reader can see when trouble clustered and what kind it was.
 *
 * Every incident is a link — a duration bar for anything that lasted, a diamond for the
 * instantaneous ones (a test alert opens and closes on the same millisecond and would
 * otherwise be a zero-width rectangle, i.e. invisible).
 */
function incidentChartSvg(incidents: IncidentRecord[], now: number, history: ControlHistoryEntry[] = [], linkBase = ""): string {
  const start = PROJECT_START_MS, span = Math.max(1, now - start);
  if (!incidents.length) return `<p class="sub">No incidents recorded since the project started.</p>`;
  // Lane height doubles as the hit target for the links inside it — 30 keeps a bar
  // comfortably tappable once the viewBox scales to a phone.
  const width = 768, left = 132, right = 14, laneH = 30, top = 26;
  const plot = width - left - right;
  const x = (ts: number) => left + ((Math.max(start, Math.min(now, ts)) - start) / span) * plot;

  // Scheduled causes first: it groups the deliberate closures apart from the ones
  // nobody chose, which is the distinction the whole page turns on.
  const causes = [...new Set(incidents.map((incident) => incident.cause))]
    .sort((a, b) => Number(SCHEDULED_INCIDENT_CAUSES.has(b)) - Number(SCHEDULED_INCIDENT_CAUSES.has(a)) || a.localeCompare(b));
  const height = top + causes.length * laneH + 30;

  // Day gridlines across the project, labelled at each boundary.
  const dayMs = 86_400_000, firstDay = Math.ceil(start / dayMs) * dayMs;
  const grid: string[] = [];
  for (let ts = firstDay; ts <= now; ts += dayMs) {
    const gx = x(ts).toFixed(1);
    grid.push(`<line x1="${gx}" y1="${top - 6}" x2="${gx}" y2="${top + causes.length * laneH}" stroke="#2b2750" stroke-width="1"/>`
      + `<text x="${gx}" y="${top - 10}" class="ic-axis" text-anchor="middle">${new Date(ts).toISOString().slice(5, 10)}</text>`);
  }

  const lanes = causes.map((cause, index) => {
    const tone = incidentTone(cause), y = top + index * laneH, mid = y + laneH / 2;
    const inLane = incidents.filter((incident) => incident.cause === cause);
    const marks = inLane.map((incident) => {
      const from = incidentTime(incident.startedAt, now), to = incidentImpactEnd(incident, now);
      const anchor = receiptAnchor(incident, history) ?? incidentAnchor(incident);
      const active = incident.status === "active";
      const label = esc(`${incident.status.toUpperCase()} · ${incident.title} · ${new Date(from).toISOString().replace("T", " ").slice(0, 16)}Z · ${formatCompactDuration(Math.max(0, to - from))}`);
      const x1 = x(from), x2 = x(to);
      // An invisible padded rect behind each mark keeps the tap target usable even when
      // the incident itself is a four-second sliver.
      // 26 CSS px tall, and at least 26 wide once the 768-unit viewBox is laid out at any
      // width at or above its own — the transparent rect is the focus ring and the tap
      // target, so it has to clear 24x24 by itself (SC 2.5.8) rather than rely on the
      // four-pixel sliver of colour drawn inside it.
      const hit = `<rect x="${(x1 - 11).toFixed(1)}" y="${(mid - 13).toFixed(1)}" width="${Math.max(26, x2 - x1 + 22).toFixed(1)}" height="26" rx="3" fill="transparent" class="ic-hit"/>`;
      const shape = x2 - x1 < 2
        ? `<path d="M ${x1.toFixed(1)} ${(mid - 7).toFixed(1)} l 7 7 l -7 7 l -7 -7 Z" fill="${tone.color}" stroke="${active ? "#fff" : "#0b0a14"}" stroke-width="1"/>`
        : `<rect x="${x1.toFixed(1)}" y="${(mid - 8).toFixed(1)}" width="${Math.max(4, x2 - x1).toFixed(1)}" height="16" rx="3" fill="${tone.color}" stroke="${active ? "#fff" : "none"}" stroke-width="${active ? 1.5 : 0}"/>`;
      return `<g role="listitem"><a href="${linkBase}#${anchor}" aria-label="${label}"><title>${label}</title>${hit}${shape}</a></g>`;
    }).join("");
    return `<line x1="${left}" y1="${mid.toFixed(1)}" x2="${width - right}" y2="${mid.toFixed(1)}" stroke="#221f3d" stroke-width="1"/>`
      + `<text x="${left - 10}" y="${(mid + 3.5).toFixed(1)}" class="ic-lane" text-anchor="end">${esc(tone.label)} <tspan class="ic-count">${inLane.length}</tspan></text>`
      + `<g role="list" aria-label="${esc(tone.label)}">${marks}</g>`;
  }).join("");

  const nowX = (left + plot).toFixed(1);
  // `role="img"` made every descendant presentational, so the nine links inside were
  // invisible to assistive technology, and `tabindex="-1"` took them off the tab order as
  // well — the chart was reachable by pointer and by nothing else (SC 2.1.1, SC 4.1.2).
  // `role="group"` with a title/desc pair keeps the summary and lets the links exist, which
  // is the pattern the delivery chart on this same page was already using.
  return `<div class="timeline-scroll incident-chart" role="region" aria-label="Incident chart" tabindex="0"><svg viewBox="0 0 ${width} ${height}" role="group" aria-labelledby="ic-chart-title ic-chart-desc" style="height:${height}px">
    <title id="ic-chart-title">Incidents by cause since project start</title>
    <desc id="ic-chart-desc">${esc(`${incidents.length} incidents across ${formatWindow(span)} of project time, grouped into ${causes.length} causes. Each mark is a link to that incident's entry and control receipt.`)}</desc>
    <style>.ic-axis{fill:#8f89ae;font:500 9px ui-monospace,SFMono-Regular,Consolas,monospace}.ic-lane{fill:#b9b4d6;font:600 11px ui-sans-serif,system-ui,sans-serif}.ic-count{fill:#8f89ae;font-weight:800}a:focus-visible .ic-hit{fill:rgba(255,213,74,.22);stroke:#ffd54a;stroke-width:2}</style>
    ${grid.join("")}
    ${lanes}
    <line x1="${nowX}" y1="${top - 6}" x2="${nowX}" y2="${top + causes.length * laneH}" stroke="#22e6ff" stroke-width="1.5" stroke-dasharray="3 3"/>
    <text x="${left}" y="${height - 8}" class="ic-axis">${new Date(start).toISOString().slice(0, 10)} · project start</text>
    <text x="${width - right}" y="${height - 8}" class="ic-axis" text-anchor="end">now</text>
  </svg></div>`;
}

/** Stable anchor for an incident card, so a marker always has somewhere to land. */
function incidentAnchor(incident: IncidentRecord): string { return `incident-${incident.id.replace(/[^a-zA-Z0-9-]/g, "-")}`; }

/** Roadmap `at` is an elapsed HH:MM offset from the first commit, not a clock reading. */
const roadmapElapsedMinutes = (at: string) => at.split(":").reduce((total, part) => total * 60 + Number(part), 0);
/**
 * When a deployment batch actually went live, read off the platform's own release history.
 *
 * A roadmap entry's `at` is elapsed build time, not a clock reading, so bridging it onto the
 * wall clock only tells the truth while the two clocks still agree. They stop agreeing after
 * the first day: the batches below shipped across three more, and plotting their build-clock
 * offsets put every one of them on the wrong date.
 *
 * D01 to D07 have no entry here on purpose. The build ran continuously from PROJECT_START_MS
 * and the first release of this Worker lands at the end of it, so those seven are milestones
 * inside the eight-hour window the chart already shades — the bridge is the honest position
 * for them, and there is no separate release to point at.
 */
const DEPLOYMENT_DATES: Readonly<Record<string, string>> = {
  D08: "2026-08-19T01:12:12.000Z",
  D09: "2026-08-19T01:26:39.000Z",
  D10: "2026-08-19T01:39:16.000Z",
  D11: "2026-08-19T02:29:54.000Z",
  D12: "2026-08-19T02:57:21.000Z",
  D13: "2026-08-19T03:15:17.000Z",
  D14: "2026-08-19T03:29:22.000Z",
  D15: "2026-08-20T23:43:49.000Z",
  D16: "2026-08-21T00:46:01.000Z",
  D17: "2026-08-21T14:50:43.000Z",
  D18: "2026-08-21T16:02:54.000Z",
  D19: "2026-08-21T20:34:19.000Z",
};
/** Deployment batches D01…Dnn, folded out of the `deployment` field on the roadmap entries. */
interface DeploymentBatch { id: string; updates: number; firstEntry: string; from: number; to: number; elapsedMinutes: number; recorded: boolean }
function deploymentBatches(entries: readonly RoadmapEntry[]): DeploymentBatch[] {
  const batches = new Map<string, DeploymentBatch>();
  for (const entry of entries) {
    const recorded = DEPLOYMENT_DATES[entry.deployment];
    const at = recorded ? Date.parse(recorded) : PROJECT_START_MS + roadmapElapsedMinutes(entry.at) * 60_000;
    const found = batches.get(entry.deployment);
    if (found) { found.updates += 1; found.from = Math.min(found.from, at); found.to = Math.max(found.to, at); }
    else batches.set(entry.deployment, { id: entry.deployment, updates: 1, firstEntry: entry.id, from: at, to: at, elapsedMinutes: 0, recorded: Boolean(recorded) });
  }
  // Elapsed is read back off the plotted time, so the label a mark announces always matches
  // where the mark actually sits.
  for (const batch of batches.values()) batch.elapsedMinutes = Math.max(0, Math.round((batch.to - PROJECT_START_MS) / 60_000));
  return [...batches.values()].sort((a, b) => a.id.localeCompare(b.id));
}
/** Row anchor for a feature update, so a deployment column has somewhere to land. */
const roadmapRowAnchor = (id: string) => `entry-${id.replace(/[^a-zA-Z0-9-]/g, "-")}`;

interface ShowcaseInput {
  entries: readonly RoadmapEntry[];
  incidents: IncidentRecord[];
  history: ControlHistoryEntry[];
  portal: ReturnType<typeof incidentSummary>;
  tank: ReturnType<typeof incidentSummary>;
  samples: Array<{ ts: number; usd: number }>;
  spendUsd: number;
  hardLimitUsd: number;
  now: number;
}

/**
 * The whole project on one clock: two graphs, one time axis.
 *
 * TIME AXIS. Both graphs run PROJECT_START_MS → now with identical geometry, so a vertical
 * line means the same instant in either. They share one scroller for the same reason: two
 * scrollers would drift apart the moment a phone scrolled one of them.
 *
 * ONE FACT, ONE PLACE. Deployments sit on the server band and incidents on the tank band,
 * because that is the thing each one happened to. Nothing is drawn twice in two shapes.
 * Scheduled downtime sits inside the tank band since it is excluded from availability; an
 * unscheduled outage cuts through it, which is what it does to the number.
 *
 * NO LEGEND. Uptime is a percentage, spend is dollars and deployments are counts — one shared
 * y-axis cannot hold them, so each graph carries its own scale and names its own units in the
 * gutter. Every mark is a real link, individually named, and the chart is labelled through
 * `<title>`/`<desc>` rather than `role="img"`, so nothing depends on a key beside it.
 */
function showcaseChartSvg(input: ShowcaseInput): string {
  const { entries, incidents, history, portal, tank, samples, spendUsd, hardLimitUsd, now } = input;
  const start = PROJECT_START_MS, span = Math.max(1, now - start);
  // 2400 units wide, not 1000, and pinned by .showcase-chart to render at least that many
  // pixels -- so one unit is one pixel and a time bucket is 26.8 px across. At the old width
  // a bucket was 10 px, and SC 2.5.8's 24 px minimum was unreachable for the deployment marks
  // however they were padded: eight of them sit in consecutive buckets, so any 24 px target
  // overlapped its neighbour. Only the horizontal unit count changed; the heights are as they
  // were, so the chart got wider rather than taller and still scrolls inside .timeline-scroll.
  const width = 2400, left = 132, right = 20, plot = width - left - right;
  const x = (ts: number) => left + ((Math.max(start, Math.min(now, ts)) - start) / span) * plot;
  const batches = deploymentBatches(entries);
  const buildEnd = start + ROADMAP_ELAPSED_MINUTES * 60_000;

  const dayMs = 86_400_000, dayTicks: number[] = [];
  for (let ts = Math.ceil(start / dayMs) * dayMs; ts <= now; ts += dayMs) dayTicks.push(ts);
  const gridLines = (top: number, bottom: number) => dayTicks
    .map((ts) => `<line x1="${x(ts).toFixed(1)}" y1="${top}" x2="${x(ts).toFixed(1)}" y2="${bottom}" stroke="#3a355e" stroke-width="1" opacity=".7"/>`).join("");
  const frame = (top: number, bottom: number) =>
    `<rect x="${x(start).toFixed(1)}" y="${top}" width="${Math.max(2, x(buildEnd) - x(start)).toFixed(1)}" height="${bottom - top}" fill="rgba(34,230,255,.05)"/>`
    + `<line x1="${x(buildEnd).toFixed(1)}" y1="${top}" x2="${x(buildEnd).toFixed(1)}" y2="${bottom}" stroke="#22e6ff" stroke-width="1" stroke-dasharray="2 4" opacity=".75"/>`
    + gridLines(top, bottom)
    + `<line x1="${(left + plot).toFixed(1)}" y1="${top}" x2="${(left + plot).toFixed(1)}" y2="${bottom}" stroke="#22e6ff" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  const laneLabel = (name: string, unit: string, y: number) =>
    `<text x="${left - 10}" y="${y}" class="sc-lane" text-anchor="end">${esc(name)} <tspan class="sc-unit">${esc(unit)}</tspan></text>`;
  const chartStyle = `<style>.sc-axis{fill:#b9b4d6;font:500 9.5px ui-monospace,SFMono-Regular,Consolas,monospace}.sc-lane{fill:#f3f1ff;font:700 11px ui-sans-serif,system-ui,sans-serif}.sc-unit{fill:#b9b4d6;font:500 9.5px ui-monospace,SFMono-Regular,Consolas,monospace}.sc-band-value{fill:#0b0a14;font:800 11px ui-monospace,SFMono-Regular,Consolas,monospace}.sc-note{fill:#b9b4d6;font:600 9.5px ui-monospace,SFMono-Regular,Consolas,monospace}.sc-build{fill:#22e6ff;font:700 9.5px ui-monospace,SFMono-Regular,Consolas,monospace}.sc-pct{fill:#4ade80;font:800 10px ui-monospace,SFMono-Regular,Consolas,monospace}</style>`;

  // ── Graph one: availability, as two segmented strips.
  //
  // A solid bar with marks stamped through it was the wrong shape twice over: a deployment
  // drawn as a dark tick reads as a hole punched in the bar, which is what an outage looks
  // like, and 100% uptime drawn as an unbroken slab is a lot of colour carrying one fact.
  // Slicing each strip into equal time buckets and colouring the bucket by what happened in
  // it gives the bar texture, puts every event *in* the timeline instead of on top of it, and
  // never lets a good event borrow an outage's shape.
  const aTop = 24, serverY = 34, bandH = 20, tankY = 70, aBottom = tankY + bandH, aHeight = 104;
  const TICKS = 84, bucketMs = span / TICKS, tickW = plot / TICKS, segW = Math.max(2.5, tickW - 1.7);
  const bucketOf = (ts: number) => Math.max(0, Math.min(TICKS - 1, Math.floor((Math.max(start, Math.min(now, ts)) - start) / bucketMs)));
  const segX = (index: number) => left + index * tickW;
  const seg = (index: number, y: number, fill: string, inset = 0) =>
    `<rect x="${segX(index).toFixed(1)}" y="${(y + inset).toFixed(1)}" width="${segW.toFixed(1)}" height="${(bandH - inset * 2).toFixed(1)}" rx="2" fill="${fill}"/>`;
  /**
   * The transparent hit area behind a mark, one bucket wide and 24 units tall.
   *
   * The coloured slice is 20 units at most and a hotfix slice is 10, so the visible mark never
   * reaches the 24 px minimum on its own. Adjacent buckets meet edge to edge and never overlap,
   * so this clears SC 2.5.8 outright rather than leaning on the spacing exception -- which the
   * marks would not qualify for anyway, being closer together than 24 px before the widening.
   */
  const HIT = 24;
  // A hair under one bucket wide: x and width are each emitted to one decimal, and rounding
  // them independently can push a rect 0.1 units past its neighbour's edge. Trimming 0.4
  // guarantees a gap at every bucket while leaving the target comfortably over 24.
  const hitW = Math.max(HIT, tickW - 0.4);
  const hit = (index: number, y: number) =>
    `<rect x="${segX(index).toFixed(1)}" y="${(y + bandH / 2 - HIT / 2).toFixed(1)}" width="${hitW.toFixed(1)}" height="${HIT}" fill="transparent"/>`;

  const isHotfix = (batch: DeploymentBatch) => entries.filter((entry) => entry.deployment === batch.id).every((entry) => entry.label === "hotfix");
  const deployBuckets = new Map<number, { batches: DeploymentBatch[]; release: boolean }>();
  for (const batch of batches) {
    const index = bucketOf(batch.to), found = deployBuckets.get(index) ?? { batches: [], release: false };
    found.batches.push(batch);
    found.release = found.release || !isHotfix(batch);
    deployBuckets.set(index, found);
  }
  // Highest-impact state wins the bucket: an outage is never hidden by a maintenance window
  // that overlaps it, and neither is hidden by a test alert.
  const incidentBuckets = new Map<number, { incident: IncidentRecord; rank: number; colour: string }>();
  for (const incident of incidents) {
    const from = incidentTime(incident.startedAt, now), to = incidentImpactEnd(incident, now);
    const scheduled = SCHEDULED_INCIDENT_CAUSES.has(incident.cause), lasted = to - from > 30_000;
    const rank = !lasted ? 1 : scheduled ? 2 : 3;
    const colour = lasted && !scheduled ? "#ff6b6b" : incidentTone(incident.cause).color;
    const last = lasted ? bucketOf(to) : bucketOf(from);
    for (let index = bucketOf(from); index <= last; index += 1) {
      const found = incidentBuckets.get(index);
      if (!found || rank > found.rank) incidentBuckets.set(index, { incident, rank, colour });
    }
  }

  // The green base runs the whole strip and events sit on top of it, so an inset mark still
  // has uptime behind it instead of a hole punched through the bar.
  const strip = (y: number, name: string) =>
    `<a href="/status/" aria-label="${esc(name)}"><title>${esc(name)}</title>`
    // The coloured band is 20 units tall by design, which leaves the strip's own link 4 px
    // short of the 24 px minimum. The marks that sit on it are drawn afterwards and so keep
    // their own hit areas; this only makes the bare stretches of strip reachable.
    + `<rect x="${left}" y="${(y + bandH / 2 - HIT / 2).toFixed(1)}" width="${plot}" height="${HIT}" fill="transparent"/>`
    + Array.from({ length: TICKS }, (_, index) => seg(index, y, "#4ade80")).join("") + `</a>`;

  const deployMarks = [...deployBuckets.entries()].sort((a, b) => a[0] - b[0]).map(([index, entry]) => {
    const updates = entry.batches.reduce((total, batch) => total + batch.updates, 0);
    const first = entry.batches[0], kind = entry.release ? "release" : "hotfix";
    const when = first.recorded ? `${new Date(first.to).toISOString().replace("T", " ").slice(0, 16)}Z` : `${formatElapsed(first.elapsedMinutes)} into the build`;
    const name = esc(`${entry.batches.map((batch) => batch.id).join(" and ")} · ${kind} · ${updates} update${updates === 1 ? "" : "s"} · ${when}`);
    return `<g role="listitem"><a href="#${roadmapRowAnchor(first.firstEntry)}" aria-label="${name}"><title>${name}</title>`
      + hit(index, serverY) + seg(index, serverY, "#22e6ff", entry.release ? 0 : 5) + `</a></g>`;
  }).join("");

  const incidentMarks = [...incidentBuckets.entries()].sort((a, b) => a[0] - b[0]).map(([index, entry]) => {
    const { incident, colour } = entry;
    const from = incidentTime(incident.startedAt, now), to = incidentImpactEnd(incident, now);
    const tone = incidentTone(incident.cause), anchor = receiptAnchor(incident, history) ?? incidentAnchor(incident);
    const scheduled = SCHEDULED_INCIDENT_CAUSES.has(incident.cause), lasted = to - from > 30_000;
    const when = `${new Date(from).toISOString().replace("T", " ").slice(0, 16)}Z`;
    const kind = scheduled ? "scheduled, excluded from availability" : lasted ? "unscheduled outage" : "no impact";
    const name = esc(`${tone.label} · ${incident.title} · ${when} · ${formatCompactDuration(Math.max(0, to - from))} · ${kind}`);
    return `<g role="listitem"><a href="#${anchor}" aria-label="${name}"><title>${name}</title>`
      + hit(index, tankY) + seg(index, tankY, colour, entry.rank === 3 ? 0 : 5) + `</a></g>`;
  }).join("");

  // The percentage lives beside the name, so the strip itself carries nothing but its slices.
  const stripLabel = (name: string, percent: number, y: number) =>
    `<text x="${left - 10}" y="${y}" class="sc-lane" text-anchor="end">${esc(name)}</text>`
    + `<text x="${left - 10}" y="${y + 12}" class="sc-pct" text-anchor="end">${percent}% uptime</text>`;

  const availability = `<svg viewBox="0 0 ${width} ${aHeight}" role="group" aria-labelledby="wg-uptime-title wg-uptime-desc">
    <title id="wg-uptime-title">${esc(`Server and tank availability across ${formatWindow(span)} of project time`)}</title>
    <desc id="wg-uptime-desc">${esc(`Each strip is ${TICKS} equal slices of the project. Server availability ${portal.availabilityPercent} percent, with the slices carrying the ${batches.length} deployments picked out. Tank availability ${tank.availabilityPercent} percent, with the slices carrying its ${incidents.length} incidents picked out, of which ${formatCompactDuration(tank.scheduledDowntimeMs)} was scheduled downtime excluded from the figure.`)}</desc>
    ${chartStyle}
    ${frame(aTop, aBottom)}
    ${dayTicks.map((ts) => `<text x="${x(ts).toFixed(1)}" y="13" class="sc-axis" text-anchor="middle">${new Date(ts).toISOString().slice(5, 10)}</text>`).join("")}
    <text x="${(x(buildEnd) + 5).toFixed(1)}" y="21" class="sc-build">${esc(`${formatElapsed(ROADMAP_ELAPSED_MINUTES)} build ends`)}</text>
    ${stripLabel("Server", portal.availabilityPercent, serverY + 9)}
    ${strip(serverY, `Server availability ${portal.availabilityPercent}% over ${portal.windowLabel}, no unscheduled downtime`)}
    <g role="list" aria-label="${esc(`${batches.length} deployments`)}">${deployMarks}</g>
    ${stripLabel("Shark Tank", tank.availabilityPercent, tankY + 9)}
    ${strip(tankY, `Tank availability ${tank.availabilityPercent}% over ${tank.windowLabel}`)}
    <g role="list" aria-label="${esc(`${incidents.length} incidents`)}">${incidentMarks}</g>
  </svg>`;

  // ── Graph two: spend, on the same geometry. Its own scale, its own units, and stepped in
  // whole cents — sub-cent gridlines were six digits of noise on a bill under three cents.
  const bTop = 12, spendTop = 20, spendH = 68, spendBase = spendTop + spendH;
  const capY = 104, capH = 14, bHeight = 142, axisY = 134;
  const values = samples.map((sample) => sample.usd);
  let series: string;
  if (samples.length >= 2) {
    const hi = Math.max(...values), lo = Math.min(...values);
    const step = Math.max(0.01, Math.ceil(niceAxisStep(Math.max(hi - lo, 1e-9)) / 0.01) * 0.01);
    let base = Math.max(0, Math.floor(lo / step) * step);
    if (base <= step * 1.5) base = 0;
    const ceiling = Math.max(Math.ceil((hi + step * 0.35) / step) * step, base + step);
    const sy = (usd: number) => spendBase - ((usd - base) / (ceiling - base)) * spendH;
    const ticks: string[] = [];
    for (let value = base; value <= ceiling + step / 2 && ticks.length < 6; value += step) {
      const gy = sy(value);
      ticks.push(`<line x1="${left}" y1="${gy.toFixed(1)}" x2="${(left + plot).toFixed(1)}" y2="${gy.toFixed(1)}" stroke="#2b2750" stroke-width="1"/>`
        + `<text x="${left + 5}" y="${(gy - 3).toFixed(1)}" class="sc-axis">$${value.toFixed(2)}</text>`);
    }
    const first = samples[0], last = samples[samples.length - 1];
    const line = samples.map((sample, index) => `${index ? "L" : "M"}${x(sample.ts).toFixed(1)} ${sy(sample.usd).toFixed(1)}`).join(" ");
    // Sampling started partway through, so the untracked stretch is held at the first reading
    // rather than left as a hole in the lane.
    const baseline = x(first.ts) - left > 4
      ? `<path d="M${left + 48} ${sy(first.usd).toFixed(1)} L${x(first.ts).toFixed(1)} ${sy(first.usd).toFixed(1)}" fill="none" stroke="#f0abfc" stroke-width="2" stroke-dasharray="4 4" opacity=".5"/>`
      : "";
    series = `${ticks.join("")}${baseline}`
      + `<g role="listitem"><a href="/spend/" aria-label="${esc(`Metered spend $${last.usd.toFixed(4)}, from $${lo.toFixed(4)} across ${samples.length} hourly samples; the dashed stretch is the baseline for the days before sampling began`)}"><title>${esc(`$${last.usd.toFixed(4)} metered`)}</title>`
      + `<rect x="${left}" y="${spendTop}" width="${plot}" height="${spendH}" fill="transparent"/>`
      + `<path d="${line}" fill="none" stroke="#f0abfc" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`
      + `<circle cx="${x(last.ts).toFixed(1)}" cy="${sy(last.usd).toFixed(1)}" r="3.5" fill="#f0abfc"/></a></g>`;
  } else {
    series = `<text x="${left + 8}" y="${(spendTop + spendH / 2 + 4).toFixed(1)}" class="sc-note">${esc(samples.length ? `$${(values[0] ?? 0).toFixed(4)} metered. The line draws once a second hourly sample lands.` : "No spend samples recorded yet.")}</text>`;
  }
  const used = Math.max(0, Math.min(1, spendUsd / Math.max(hardLimitUsd, 1e-9)));
  const capBar = `<rect x="${left}" y="${capY}" width="${plot}" height="${capH}" rx="4" fill="#2b2750"/>`
    + `<g role="listitem"><a href="/spend/" aria-label="${esc(`Metered spend $${spendUsd.toFixed(4)} of the $${hardLimitUsd.toFixed(2)} hard stop, ${(used * 100).toFixed(2)} percent used`)}"><title>${esc(`$${spendUsd.toFixed(4)} of $${hardLimitUsd.toFixed(2)}`)}</title>`
    + `<rect x="${left}" y="${(capY + capH / 2 - 12).toFixed(1)}" width="${Math.max(24, used * plot).toFixed(1)}" height="24" fill="transparent"/>`
    + `<rect x="${left}" y="${capY}" width="${Math.max(3, used * plot).toFixed(1)}" height="${capH}" rx="4" fill="#f0abfc"/></a></g>`
    + `<text x="${left + 10}" y="${(capY + 11).toFixed(1)}" class="sc-note">${esc(`$${spendUsd.toFixed(4)} used · ${(used * 100).toFixed(2)}% of the $${hardLimitUsd.toFixed(2)} hard stop`)}</text>`
    + `<text x="${(left + plot).toFixed(1)}" y="${(capY - 4).toFixed(1)}" class="sc-axis" text-anchor="end">$${hardLimitUsd.toFixed(2)}</text>`;

  const spend = `<svg viewBox="0 0 ${width} ${bHeight}" role="group" aria-labelledby="wg-spend-title wg-spend-desc">
    <title id="wg-spend-title">${esc(`Metered spend across the same ${formatWindow(span)}`)}</title>
    <desc id="wg-spend-desc">${esc(`Metered spend reached $${spendUsd.toFixed(4)}, ${(used * 100).toFixed(2)} percent of the $${hardLimitUsd.toFixed(2)} hard stop that closes the game.`)}</desc>
    ${chartStyle}
    ${frame(bTop, spendBase)}
    ${laneLabel("Metered spend", "USD", spendTop + 30)}
    <g role="list" aria-label="Metered spend">${series}</g>
    <text x="${left - 10}" y="${capY + 11}" class="sc-lane" text-anchor="end">Budget used</text>
    <g role="list" aria-label="Budget used">${capBar}</g>
    <text x="${left}" y="${axisY}" class="sc-axis">${new Date(start).toISOString().slice(0, 10)} · project start</text>
    <text x="${(left + plot).toFixed(1)}" y="${axisY}" class="sc-axis" text-anchor="end">now · ${esc(formatWindow(span))} measured</text>
  </svg>`;

  return `<div class="timeline-scroll showcase-chart" role="region" aria-label="Project record: availability, deployments, incidents and spend" tabindex="0">${availability}${spend}</div>`;
}

/** Status-page incident strip: active first, each row linking to its receipt in the control log. */
/**
 * What /status/ says about backups. Deliberately reports shape and timing rather than
 * content: when the last copy was taken, how much it covered, its digest, how many copies
 * are retained, and whether the last restore drill reproduced the original. A backup
 * nobody has restored is a claim; a drill with a matching digest is evidence.
 */
function backupPanelHtml(backup?: BackupState): string {
  const state = backup ?? { lastBackupAt: 0, lastBackupKey: "", lastBackupBytes: 0, lastBackupDigest: "", lastBackupCounts: null, lastBackupError: "", retainedCopies: 0, lastDrillAt: 0, lastDrillOk: false, lastDrillDetail: "" };
  const when = (ts: number) => ts ? new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never";
  const counts = state.lastBackupCounts;
  // Counts are small enough at this scale that "1 control receipts" is a visible fault
  // on a page whose argument is that this service describes itself carefully.
  const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const coverage = counts
    ? `${plural(counts.kv, "key")} (${plural(counts.profiles, "player profile")}), ${plural(counts.controlHistory, "control receipt")}, ${plural(counts.audit, "action-log row")}`
    : "not yet taken";
  const drillTone = state.lastDrillAt === 0 ? "key-amber" : state.lastDrillOk ? "key-green" : "key-red";
  const drillWord = state.lastDrillAt === 0 ? "Not yet run" : state.lastDrillOk ? "Passed" : "Failed";
  const rows: Array<[string, string]> = [
    ["Last copy taken", when(state.lastBackupAt)],
    ["What it covered", coverage],
    ["Copy digest (SHA-256)", state.lastBackupDigest ? state.lastBackupDigest : "—"],
    ["Copies retained", state.lastBackupAt ? `${state.retainedCopies} dated, plus the most recent` : "—"],
    ["Last restore drill", `${drillWord}${state.lastDrillAt ? " · " + when(state.lastDrillAt) : ""}`],
    ["Drill result", state.lastDrillDetail || "—"],
  ];
  const failure = state.lastBackupError
    ? `<p class="sub" style="margin:8px 0 0"><span class="key-dot key-red"></span>The last scheduled copy did not complete: ${esc(state.lastBackupError)}</p>`
    : "";
  return `<div class="card" id="backup"><h2 style="margin-top:0;font-size:1.1rem">State copies and restore drills</h2>
    <p class="sub" style="margin:0 0 10px">Everything the tank holds — the control receipt chain, the 90-day action log, player profiles and spend history — is copied to object storage on a daily schedule. A restore drill reads the most recent copy back out of object storage, restores that copy into a scratch instance, and compares the scratch instance&rsquo;s export digest against the copy&rsquo;s; equal digests mean the stored copy reconstitutes the state it was taken from rather than merely something like it. If no copy can be read, the drill fails and says so rather than testing the live object instead. <span class="key-dot ${drillTone}"></span>${esc(drillWord)}.</p>
    <div class="table-scroll" role="region" aria-label="State copies and restore drills" tabindex="0"><table class="capacity-table"><caption class="sr-only">State copies and restore drills</caption><thead><tr><th scope="col">Measure</th><th scope="col">Value</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td><strong>${esc(label)}</strong></td><td>${esc(value)}</td></tr>`).join("")}</tbody></table></div>${failure}</div>`;
}

/**
 * The incident record, as a section of the operations page.
 *
 * This used to be a whole route (`/incidents/`) plus a five-row teaser here, which meant
 * the append-only receipt chain rendered twice on two pages and the incident count was
 * stated in three places at three precisions. It is one section now, on the page that owns
 * availability, and the receipt chain below it is the only copy.
 */
function incidentsSection(incidents: IncidentRecord[], history: ControlHistoryEntry[]): string {
  const now = Date.now();
  const s = incidentSummary(incidents, now);
  // Active incidents first — an open incident is the thing a reader needs to see.
  const ordered = incidents.map((incident, index) => ({ incident, index })).sort((a, b) => {
    const openA = a.incident.status === "active" ? 0 : 1, openB = b.incident.status === "active" ? 0 : 1;
    return openA !== openB ? openA - openB : b.index - a.index;
  }).map((entry) => entry.incident);
  const active = ordered.filter((x) => x.status === "active"), resolved = ordered.filter((x) => x.status !== "active");
  const card = (x: IncidentRecord) => {
    const timing = x.impactEndedAt != null && x.status === "active"
      ? `${new Date(incidentTime(x.startedAt, now)).toISOString()} → impact ended ${new Date(incidentImpactEnd(x, now)).toISOString()} · investigation remains open`
      : `${new Date(incidentTime(x.startedAt, now)).toISOString()} → ${x.resolvedAt == null ? "ongoing" : new Date(incidentTime(x.resolvedAt, now)).toISOString()}`;
    const tone = incidentTone(x.cause), anchor = receiptAnchor(x, history);
    const receipt = anchor ? `<p style="margin:10px 0 0"><a class="action-link" href="#${anchor}">Open control receipt →</a></p>` : "";
    // Every incident card carries its own anchor so a timeline marker without a control
    // receipt still has somewhere to land — no mark on the chart is a dead end.
    return `<article class="card incident-card${x.status === "active" ? " incident-card--active" : ""}" id="${incidentAnchor(x)}" tabindex="-1"><div class="m ${x.status === "active" ? "o" : "g"}"><i class="incident-dot ${tone.key}"></i>${x.status.toUpperCase()} · ${esc(x.cause)}</div><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p><p class="sub" style="margin:0">${timing}</p>${receipt}</article>`;
  };
  const activeBlock = active.length
    ? `<section aria-labelledby="active-incidents"><div class="eyebrow">Needs attention</div><h3 id="active-incidents" style="margin:6px 0 14px">Active incidents (${active.length})</h3>${active.map(card).join("")}</section>`
    : `<section class="card"><div class="m g">ALL CLEAR</div><h3 style="margin:6px 0 0">No active incidents</h3></section>`;
  const resolvedBlock = resolved.length
    ? `<section aria-labelledby="resolved-incidents"><div class="eyebrow">History</div><h3 id="resolved-incidents" style="margin:6px 0 14px">Resolved incidents (${resolved.length})</h3>${resolved.map(card).join("")}</section>`
    : "";
  return `<section id="incidents" tabindex="-1" aria-labelledby="incidents-heading">
    <div class="eyebrow">Availability evidence</div>
    <h2 id="incidents-heading" style="margin:6px 0 10px">Incidents</h2>
    <p class="sub">Scheduled tank downtime is tracked separately from unscheduled outages and from server availability, because only one of the three is a fault. ${incidents.length} recorded over ${s.windowLabel}. <a href="/incidents.json">Raw incident JSON →</a></p>
    <div class="card hero-card"><h3 style="margin:0 0 4px;font-size:1.1rem">Every incident since project start</h3><p class="sub" style="margin:0 0 10px">${formatCompactDuration(s.scheduledDowntimeMs)} of it scheduled and excluded from availability.</p>${incidentChartSvg(incidents, now, history)}<p class="timeline-key-note" style="margin:8px 0 0">Bars show how long impact lasted; diamonds are instantaneous events. Every mark is a link to its incident and control receipt, reachable by keyboard as well as pointer.</p></div>
    ${activeBlock}${resolvedBlock}
  </section>`;
}
/** Control receipt anchor for an incident, so a card can jump to its entry in the log. */
function receiptAnchor(incident: IncidentRecord, history: ControlHistoryEntry[]): string | null {
  const alert = incident.id.match(/^test-alert-([A-Z][0-9]{3})-/);
  const entry = history.find((h) => h.reference === incident.id) ?? (alert ? history.find((h) => h.reference === alert[1]) : undefined);
  return entry ? `receipt-${entry.sequence}` : null;
}
const incidentTime = (value: string | number | null, fallback: number) => value == null ? fallback : typeof value === "number" ? value : new Date(value).getTime();
const incidentImpactEnd = (incident: IncidentRecord, fallback: number) => incident.impactEndedAt == null ? incidentTime(incident.resolvedAt, fallback) : incidentTime(incident.impactEndedAt, fallback);
function mergedIncidentDuration(incidents: IncidentRecord[], now: number): number {
  const start = PROJECT_START_MS;
  const intervals = incidents
    .map((incident) => [Math.max(start, incidentTime(incident.startedAt, now)), Math.min(now, incidentImpactEnd(incident, now))] as const)
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let downtimeMs = 0, openStart = 0, openEnd = 0;
  for (const [from, to] of intervals) {
    if (!openEnd) { openStart = from; openEnd = to; continue; }
    if (from <= openEnd) openEnd = Math.max(openEnd, to);
    else { downtimeMs += openEnd - openStart; openStart = from; openEnd = to; }
  }
  if (openEnd) downtimeMs += openEnd - openStart;
  return downtimeMs;
}
function incidentSummary(incidents: IncidentRecord[], now = Date.now()) {
  const windowMs = projectWindowMs(now), relevant = incidents.filter((incident) => incident.cause !== "Test alert");
  const scheduledDowntimeMs = mergedIncidentDuration(relevant.filter((incident) => SCHEDULED_INCIDENT_CAUSES.has(incident.cause)), now);
  const unscheduledDowntimeMs = mergedIncidentDuration(relevant.filter((incident) => !SCHEDULED_INCIDENT_CAUSES.has(incident.cause)), now);
  const uptimeMs = Math.max(0, windowMs - unscheduledDowntimeMs);
  return { windowStart: new Date(PROJECT_START_MS).toISOString(), windowMs, windowLabel: formatWindow(windowMs), windowHours: Number((windowMs / 3_600_000).toFixed(2)), downtimeMs: unscheduledDowntimeMs, scheduledDowntimeMs, unscheduledDowntimeMs, uptimeMs, availabilityPercent: Number(((uptimeMs / windowMs) * 100).toFixed(4)), scheduledDowntimePercent: Number(((scheduledDowntimeMs / windowMs) * 100).toFixed(4)), unscheduledDowntimePercent: Number(((unscheduledDowntimeMs / windowMs) * 100).toFixed(4)), calculatedAt: new Date(now).toISOString() };
}
async function incidentData(env: Env): Promise<{ incidents: IncidentRecord[]; history: ControlHistoryEntry[]; historyIntegrity: ControlHistoryIntegrity }> { const res = await lobbyStub(env).fetch("https://lobby/incidents"); const data = (await res.json()) as { incidents?: IncidentRecord[]; history?: ControlHistoryEntry[]; historyIntegrity?: ControlHistoryIntegrity }; return { incidents: [...INCIDENTS, ...(data.incidents ?? [])].map((incident) => ({ ...incident, title: tankCopy(incident.title), summary: tankCopy(incident.summary) })), history: data.history ?? [], historyIntegrity: data.historyIntegrity ?? { mode: "append-only tamper-evident hash chain", algorithm: "SHA-256", entryCount: 0, headHash: null } }; }
async function roadmapAvailability(env: Env): Promise<RoadmapAvailability> { const [{ incidents }, gate] = await Promise.all([incidentData(env), maintenanceState(env, true)]); return { portal: incidentSummary([]), tank: incidentSummary(incidents), gateEnabled: gate.enabled }; }
/**
 * Availability bar, measured from the first hour of the project to now.
 *
 * Reorganised into two explicitly labelled lanes with a real time axis. Previously the
 * two stacked strips were unlabelled and `preserveAspectRatio="none"` stretched the
 * markers into wedges, so the chart showed colour without saying what was being
 * measured or when. Every marker is now a link to its control receipt — or, when a
 * control never produced one, to the incident's own card — so nothing on the chart is
 * a dead end.
 */
function incidentTimelineSvg(incidents: IncidentRecord[], now = Date.now(), history: ControlHistoryEntry[] = [], linkBase = ""): string {
  const start = PROJECT_START_MS, span = Math.max(1, now - start);
  const ticks = 120, width = 768, left = 58, plot = width - left - 8, step = plot / ticks;
  const bucket = span / ticks;
  const relevant = incidents.filter((x) => x.cause !== "Test alert");
  const byCause = new Map<number, string>();
  for (const incident of relevant) {
    const a = Math.max(0, Math.floor((incidentTime(incident.startedAt, now) - start) / bucket));
    const b = Math.min(ticks - 1, Math.floor((incidentImpactEnd(incident, now) - start) / bucket));
    for (let i = a; i <= b; i += 1) byCause.set(i, incidentTone(incident.cause).color);
  }
  const bar = (y: number, fill: (i: number) => string) => Array.from({ length: ticks }, (_, i) =>
    `<rect x="${(left + i * step).toFixed(2)}" y="${y}" width="${Math.max(1.2, step - 0.6).toFixed(2)}" height="16" fill="${fill(i)}"/>`).join("");
  const serverLane = bar(20, () => "#4ade80");
  const tankLane = bar(48, (i) => byCause.get(i) ?? "#4ade80");
  const markers = incidents.map((x) => {
    const at = incidentTime(x.startedAt, now);
    const px = left + Math.max(0, Math.min(ticks - 1, Math.floor((at - start) / bucket))) * step + step / 2;
    const tone = incidentTone(x.cause), anchor = receiptAnchor(x, history) ?? incidentAnchor(x);
    const when = new Date(at).toISOString().replace("T", " ").slice(0, 16) + "Z";
    // Marker sits in the gutter with a guide line into the tank lane, so a five-minute
    // incident inside a multi-day window is still findable at a glance.
    const label = esc(`${x.status.toUpperCase()} · ${x.cause} · ${x.title} · ${when}`);
    const shape = `<g class="tl-marker"><title>${label}</title>`
      + `<line x1="${px.toFixed(2)}" y1="44" x2="${px.toFixed(2)}" y2="64" stroke="${tone.color}" stroke-width="1.5" opacity=".85"/>`
      + `<path d="M ${px.toFixed(2)} 44 l -6 -8 l 12 0 Z" fill="${tone.color}" stroke="#0b0a14" stroke-width="1"/></g>`;
    // A padded transparent rect behind the marker: the arrow itself is 12x8, well under the
    // 24x24 target minimum once the link is focusable (SC 2.5.8).
    const hit = `<rect x="${(px - 13).toFixed(2)}" y="34" width="26" height="32" fill="transparent" rx="3" class="tl-hit"/>`;
    return `<g role="listitem"><a href="${linkBase}#${anchor}" aria-label="${label}">${hit}${shape}</a></g>`;
  }).join("");
  const axis = (label: string, x: number, anchorPoint: string) => `<text x="${x}" y="82" class="tl-axis" text-anchor="${anchorPoint}">${esc(label)}</text>`;
  // Wrapped in a scroller with a floor width: letting the chart shrink to a phone's
  // width scaled the lane labels and axis down to a few pixels, which is worse than
  // scrolling. Same containment the data tables already use.
  const downMs = relevant.reduce((total, x) => total + Math.max(0, incidentImpactEnd(x, now) - incidentTime(x.startedAt, now)), 0);
  const spoken = relevant.length === 0
    ? `Server and tank availability from project start to now, ${formatWindow(span)} measured. No downtime recorded on either lane.`
    : `Server and tank availability from project start to now, ${formatWindow(span)} measured. Server lane: no downtime recorded. Tank lane: ${relevant.length} incident${relevant.length === 1 ? "" : "s"} totalling ${formatWindow(downMs)} of degraded availability.`;
  const spokenDetail = relevant.length === 0 ? "" : `<ul class="sr-only">${relevant.map((x) => {
    const from = incidentTime(x.startedAt, now), to = incidentImpactEnd(x, now);
    return `<li>${esc(x.cause)} — ${esc(new Date(from).toISOString().replace("T", " ").slice(0, 16))}Z, lasting ${esc(formatWindow(Math.max(0, to - from)))}.</li>`;
  }).join("")}</ul>`;
  // The floor width is what makes the marker hit areas real: the viewBox is 768 units wide,
  // so below a 768px render one unit is under one CSS pixel and a 26-unit target lands
  // beneath the 24x24 minimum (SC 2.5.8). At 768 the mapping is 1:1 and the scroller —
  // already here, already labelled and focusable — takes the overflow, exactly as the
  // incident chart beside it does.
  return `<div class="timeline-scroll availability-chart" role="region" aria-label="Availability timeline" tabindex="0"><svg role="group" aria-labelledby="tl-title tl-desc" viewBox="0 0 ${width} 90" preserveAspectRatio="xMidYMid meet">
    <title id="tl-title">Availability timeline</title>
    <desc id="tl-desc">${esc(spoken)}</desc>
    <style>.tl-lane{fill:#b9b4d6;font:600 11px ui-sans-serif,system-ui,sans-serif}.tl-axis{fill:#8f89ae;font:500 10px ui-monospace,SFMono-Regular,Consolas,monospace}.tl-marker{transition:transform 120ms ease}a:hover .tl-marker,a:focus-visible .tl-marker{transform:translateY(-2px)}a:focus-visible .tl-hit{fill:rgba(255,213,74,.22);stroke:#ffd54a;stroke-width:2}@media(prefers-reduced-motion:reduce){.tl-marker{transition:none}}</style>
    <text x="0" y="32" class="tl-lane">Server</text>${serverLane}
    <text x="0" y="60" class="tl-lane">Tank</text>${tankLane}
    <g role="list" aria-label="Incident markers">${markers}</g>
    ${axis(new Date(start).toISOString().slice(0, 10), left, "start")}
    ${axis(formatWindow(span) + " measured", left + plot / 2, "middle")}
    ${axis("now", left + plot, "end")}
  </svg>${spokenDetail}</div>`;
}

function historyItemHtml(entry: ControlHistoryEntry, searchable = false): string {
  const search = searchable ? ` data-history-row="1" data-search="${esc(`${entry.sequence} ${entry.code} ${entry.title} ${entry.summary} ${entry.actor} ${entry.reference ?? ""} ${entry.detail ?? ""}`.toLowerCase())}" data-code="${esc(entry.code)}"` : "";
  return `<article class="history-item" id="receipt-${entry.sequence}"${search}><div class="history-sequence">#${entry.sequence}<br>${esc(entry.code)}</div><div class="history-copy"><strong>${esc(entry.title)}</strong><p>${esc(entry.summary)}</p><div class="history-meta">${new Date(entry.ts).toISOString()} · actor ${esc(entry.actor)}${entry.reference ? ` · ref ${esc(entry.reference)}` : ""}</div></div><div class="history-receipt" title="${esc(entry.hash)}">${esc(entry.hash.slice(0, 16))}…</div></article>`;
}

/** Rows per page in the receipt chain — shared by the markup and the inline script. */
const CONTROL_HISTORY_PAGE_SIZE = 10;
const controlHistoryPageCount = (rows: number) => Math.max(1, Math.ceil(rows / CONTROL_HISTORY_PAGE_SIZE));

/**
 * The sentence the live region speaks. Page position rides along with the match count so one
 * announcement carries the whole result state; the server renders the same string the script
 * would compute for the initial view, so nothing is announced merely because the page loaded.
 */
function historyCountText(matched: number, total: number, page: number, pages: number): string {
  const body = matched === total ? `${matched} of ${total} receipts` : `${matched} matching of ${total} receipts`;
  return pages > 1 ? `${body}, page ${page} of ${pages}` : body;
}
function logCountText(matched: number, total: number, page: number, pages: number): string {
  const body = matched === total ? `${matched} ${total === 1 ? "record" : "records"}` : `${matched} of ${total} records`;
  return pages > 1 ? `${body}, page ${page} of ${pages}` : body;
}

/** Full receipt chain: searchable, code-filterable, paged 10 at a time, with the running total. */
function controlHistoryListHtml(history: ControlHistoryEntry[], integrity: ControlHistoryIntegrity): string {
  const ordered = history.slice().reverse();
  const items = ordered.map((entry) => historyItemHtml(entry, true)).join("");
  const codes = [...new Set(history.map((entry) => entry.code))].sort().map((code) => `<option value="${esc(code)}">${esc(code)}</option>`).join("");
  const head = integrity.headHash ? `<code>${esc(integrity.headHash)}</code>` : "No receipt yet";
  return `<section class="card" id="control-history" tabindex="-1"><div class="eyebrow">Control receipts</div><h2 style="margin-top:0">Append-only control history</h2><div class="integrity-line"><span class="integrity-badge">${esc(integrity.algorithm)}</span><span>${integrity.entryCount} entries · chain head ${head}</span></div><div class="integrity-line">${integrityVerdict(integrity)}</div>
    <div class="log-toolbar"><label><span>Search</span><input type="search" id="history-search" placeholder="Title, actor, reference, detail" autocomplete="off"></label><label><span>Control code</span><select id="history-code"><option value="">All codes</option>${codes}</select></label><span class="log-visible-count" id="history-count" role="status" aria-live="polite" aria-atomic="true">${esc(historyCountText(ordered.length, ordered.length, 1, controlHistoryPageCount(ordered.length)))}</span></div>
    <div class="history-list" id="history-list">${items || '<p class="sub">No control events recorded.</p>'}</div>
    <div class="history-pager"><button type="button" class="pager-btn" id="history-prev" aria-disabled="true">← Newer</button><span id="history-page" aria-hidden="true">Page 1 of ${controlHistoryPageCount(ordered.length)}</span><button type="button" class="pager-btn" id="history-next"${ordered.length > CONTROL_HISTORY_PAGE_SIZE ? "" : ' aria-disabled="true"'}>Older →</button></div></section>${controlHistoryScript(ordered.length)}`;
}

/**
 * Receipt-chain behaviour: search, code filter, paging.
 *
 * The count element is the page's live region, so it carries the whole result state in one
 * sentence rather than a bare number, and it is only written when the sentence actually
 * changes — that keeps it silent on load, where the server already rendered the same text.
 * The search path is debounced so a settled query announces once instead of per keystroke;
 * the rows themselves still filter on every input.
 *
 * The pager buttons are never `disabled`: a control that disables itself under the keyboard
 * drops focus to `<body>`. They stay focusable, report `aria-disabled`, and no-op at the ends.
 */
function controlHistoryScript(total: number): string {
  return `<script nonce="__WG_CSP_NONCE__">(function(){var PER=${CONTROL_HISTORY_PAGE_SIZE},page=0,rows=Array.prototype.slice.call(document.querySelectorAll('[data-history-row]')),total=${total},timer=0;
var search=document.getElementById('history-search'),code=document.getElementById('history-code'),count=document.getElementById('history-count'),label=document.getElementById('history-page'),prev=document.getElementById('history-prev'),next=document.getElementById('history-next');
function matching(){var q=(search.value||'').trim().toLowerCase(),c=code.value||'';return rows.filter(function(row){return (!q||(row.dataset.search||'').indexOf(q)>-1)&&(!c||row.dataset.code===c);});}
function announce(text){if(count.textContent!==text)count.textContent=text;}
function schedule(text,delay){if(timer)clearTimeout(timer);if(!delay){announce(text);return;}timer=setTimeout(function(){announce(text);},delay);}
function render(delay){var m=matching(),pages=Math.max(1,Math.ceil(m.length/PER));if(page>=pages)page=pages-1;if(page<0)page=0;
rows.forEach(function(row){row.hidden=true;});m.slice(page*PER,page*PER+PER).forEach(function(row){row.hidden=false;});
var body=m.length===total?m.length+' of '+total+' receipts':m.length+' matching of '+total+' receipts';
schedule(pages>1?body+', page '+(page+1)+' of '+pages:body,delay);
label.textContent='Page '+(page+1)+' of '+pages;
prev.setAttribute('aria-disabled',page===0?'true':'false');next.setAttribute('aria-disabled',page>=pages-1?'true':'false');}
search.addEventListener('input',function(){page=0;render(300);});code.addEventListener('change',function(){page=0;render(0);});
prev.addEventListener('click',function(){if(page===0)return;page-=1;render(0);});
next.addEventListener('click',function(){if(next.getAttribute('aria-disabled')==='true')return;page+=1;render(0);});
function reveal(){var hash=location.hash.replace('#','');if(hash.indexOf('receipt-')!==0)return;var target=document.getElementById(hash);if(!target)return;
var m=matching(),i=m.indexOf(target);if(i<0){search.value='';code.value='';m=matching();i=m.indexOf(target);}
if(i>=0){page=Math.floor(i/PER);render(0);target.classList.add('history-item--focus');target.scrollIntoView({block:'center'});if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
render(0);reveal();window.addEventListener('hashchange',reveal);}());</script>`;
}
/**
 * The trust estate's front door, and the page that defines its vocabulary.
 *
 * Six figures, each one a link to the page that owns it. Nothing here is restated as a
 * literal: every number is computed from the same value the owning page renders, so the
 * two cannot drift apart and be separately true. That is the whole design constraint —
 * a summary page that keeps its own copy of a number is a second source of truth, and a
 * second source of truth on a conformance estate is a finding.
 */
interface TrustInput {
  portal: ReturnType<typeof incidentSummary>;
  tank: ReturnType<typeof incidentSummary>;
  incidents: IncidentRecord[];
  integrity: ControlHistoryIntegrity;
  spendUsd: number;
  hardLimitUsd: number;
  readiness: { percent: number; met: number; partial: number; total: number };
  lastDeployment: { id: string; title: string } | null;
}
function trustHtml(input: TrustInput): string {
  const { portal, tank, incidents, integrity, spendUsd, hardLimitUsd, readiness, lastDeployment } = input;
  const unscheduled = incidents.filter((incident) => incident.cause !== "Test alert" && !SCHEDULED_INCIDENT_CAUSES.has(incident.cause)).length;
  const chainOk = integrity.chainStatus === "verified";
  const tile = (href: string, label: string, value: string, detail: string, tone: string) =>
    `<a class="trust-tile ${tone}" href="${href}"><span class="trust-tile__label">${esc(label)}</span><span class="trust-tile__value">${value}</span><span class="trust-tile__detail">${esc(detail)}</span><span class="trust-tile__go" aria-hidden="true">→</span></a>`;
  return `<section class="page-intro">
    <div class="eyebrow">Trust · operations and conformance</div>
    <h1>Trust &amp; operations</h1>
    <p class="sub">Wizard Gang Shark Tank is a browser game. A <dfn id="tank">tank</dfn> is one of its four game rooms — a single running world with its own players, its own leaderboard and its own log; the word is used that way everywhere on this site. These pages are the evidence behind the service that runs them: what it is doing right now, what it has done, what it costs, and where it falls short.</p>
    <p class="sub">Everything published here is read from the running service at the moment the page is built. Each figure below links to the page that owns it — none of them is stored twice.</p>
  </section>
  <div class="trust-grid">
    ${tile("/status/", "Server availability", `${portal.availabilityPercent}%`, `${portal.windowLabel} measured`, "tone-green")}
    ${tile("/status/#incidents", "Incidents", String(incidents.length), `${unscheduled} unscheduled`, unscheduled ? "tone-violet" : "tone-green")}
    ${tile("/spend/", "Metered spend", `$${spendUsd.toFixed(4)}`, `of the $${hardLimitUsd.toFixed(2)} hard stop`, "tone-cyan")}
    ${tile("/audit/", "Conformance readiness", `${readiness.percent}%`, `${readiness.met} met and ${readiness.partial} partial of ${readiness.total} applicable`, "tone-violet")}
    ${tile("/status/#delivery", "Last deployment", lastDeployment ? esc(lastDeployment.id) : "—", lastDeployment ? lastDeployment.title : "no deployment recorded", "tone-cyan")}
    ${tile("/status/#control-history", "Receipt chain", chainOk ? "Verified" : "Unverified", `${integrity.entryCount} receipts · ${esc(integrity.algorithm)}`, chainOk ? "tone-green" : "tone-red")}
  </div>
  <section class="card">
    <h2 style="margin-top:0;font-size:1.1rem">What is on each page</h2>
    <dl class="trust-what">
      <dt><a href="/audit/">Register</a></dt><dd>Every ISO/IEC 27001 and 42001 control, what this service does about it, and the live route that proves it. A control may only be marked met when a reader can open that route.</dd>
      <dt><a href="/policies/">Policies</a></dt><dd>The written record the two standards ask for — context and scope, risk method and assessment, the Statement of Applicability, and the rest — published as pages rather than filed as documents nobody can check.</dd>
      <dt><a href="/status/">Operations</a></dt><dd>Live availability, the incident record, the append-only control receipt chain, state copies and restore drills, and the delivery record.</dd>
      <dt><a href="/logs/">Evidence</a></dt><dd>The 90-day service action log and the 24-hour per-tank capture logs, searchable and downloadable.</dd>
      <dt><a href="/spend/">Spend</a></dt><dd>What the service consumes against each free allowance and against the hard limit that closes the game rather than billing.</dd>
      <dt><a href="/docs/">API</a></dt><dd>Every route this Worker serves, including the unauthenticated ones and the limits on them.</dd>
    </dl>
  </section>
  <section class="card">
    <h2 style="margin-top:0;font-size:1.1rem">The rule these pages are held to</h2>
    <p class="sub" style="margin:0">A row marked met must name a live route that demonstrates it. Implemented but unrecorded is partial; nothing is silently a gap. An overstated register fails an audit faster than an honest one with open gaps, and it makes every other row suspect — so where this service is weaker than it would like to be, the page says so.</p>
  </section>`;
}


interface PublicLogEvent { ts: number; type: string; room?: string | null; subject?: string | null; detail?: string | null }
interface GameLogWireEvent { ts: number; tick: number; language?: unknown; action: Record<string, unknown> }
interface PublicServiceLogRecord { timestamp: string; reasonCode: string; action: string; subject: string; details: string }
interface PublicGameLogRecord { timestamp: string; reasonCode: string; tick: number; action: string; language: "typescript" | "php"; name: string; details: string }
interface PublicTankLog { room: string; records: PublicGameLogRecord[] }

const SERVICE_REASON_CODES: Readonly<Record<string, string>> = {
  "room-boot": "T100", join: "T110", leave: "T120", death: "T130", play: "T140", quit: "T150",
  customize: "P200", skin: "P210", settings: "P220", nav: "P230",
  "maintenance-on": "O300", "maintenance-off": "O301", "incidents-archived": "O310", "profiles-pruned": "O320", "profiles-refused": "O321", "billing-reset": "B400", "billing-hard-stop": "B499",
  "security-report": "S500", "security-resolved": "S501", "test-alert": "A600",
  "backup-taken": "K700", "backup-restored": "K710", "restore-drill": "K720", "backup-failed": "K799",
};
const GAME_REASON_CODES: Readonly<Record<string, string>> = {
  join: "G100", leave: "G101", setHeading: "G110", setBoost: "G120", rocket: "G130", respawn: "G140", death: "G150", boot: "G160",
};
function reasonCode(codes: Readonly<Record<string, string>>, action: string, fallback: string): string { const code = codes[action] ?? fallback; return /^[A-Z][0-9]{3}$/.test(code) ? code : fallback; }

function normalizeServiceLogEvent(event: PublicLogEvent): PublicServiceLogRecord {
  const tank = event.room ? AUDIT_ROOM_NAMES[event.room] ?? event.room : "";
  const details = [event.detail ?? "", tank ? `tank=${tank}` : ""].filter(Boolean).join("; ");
  return { timestamp: new Date(event.ts).toISOString(), reasonCode: reasonCode(SERVICE_REASON_CODES, event.type, "L999"), action: event.type, subject: tankCopy(event.subject ?? ""), details: tankCopy(details) };
}

function normalizeGameLogEvent(event: GameLogWireEvent): PublicGameLogRecord {
  const action = event.action ?? {}, type = String(action.type ?? "unknown"), name = type === "join" ? String(action.name ?? "") : "";
  const details = Object.entries(action).filter(([key]) => !["type", "playerId", "name"].includes(key)).map(([key, value]) => `${key}=${String(value)}`).join(";");
  return { timestamp: new Date(event.ts).toISOString(), reasonCode: reasonCode(GAME_REASON_CODES, type, "G999"), tick: event.tick, action: type, language: event.language === "php" ? "php" : "typescript", name, details: tankCopy(details) };
}

function reasonOptions(records: Array<{ reasonCode: string }>): string { return [...new Set(records.map((record) => record.reasonCode))].sort().map((code) => `<option value="${esc(code)}">${esc(code)}</option>`).join(""); }

function logToolbar(tableId: string, records: Array<{ reasonCode: string }>, scopeLabel: string): string {
  const pages = Math.max(1, Math.ceil(records.length / LOG_PAGE_SIZE));
  return `<div class="log-toolbar"><label><span>Search</span><input type="search" data-log-search="${tableId}" aria-label="Search ${esc(scopeLabel)}" placeholder="Action, subject, detail" autocomplete="off"></label><label><span>Reason code</span><select aria-label="Reason code, ${esc(scopeLabel)}" data-log-reason="${tableId}"><option value="">All codes</option>${reasonOptions(records)}</select></label><span class="log-visible-count" id="${tableId}-count" role="status" aria-live="polite" aria-atomic="true">${esc(logCountText(records.length, records.length, 1, pages))}</span></div>`;
}

/**
 * Public evidence page.
 *
 * Two windows, each shown in full rather than as a "most recent 40" teaser:
 *   • Service evidence — every record inside the 90-day retention window.
 *   • Tank captures — every capture from the past 24 hours; the room prunes past that,
 *     so what is on the page is the whole record, not a sample of it.
 *
 * Full history means thousands of rows, so each table pages client-side (25 at a time)
 * on top of the existing search / reason-code filter. Anything the fetch ceiling did
 * drop is stated on the page instead of being silently omitted.
 */
const LOG_PAGE_SIZE = 25;
const CAPTURE_WINDOW_MS = 24 * 60 * 60 * 1000;

function logPager(tableId: string, records: number): string {
  const pages = Math.max(1, Math.ceil(records / LOG_PAGE_SIZE));
  return `<div class="history-pager"><button type="button" class="pager-btn" data-log-prev="${tableId}" aria-disabled="true">← Newer</button><span data-log-page="${tableId}" aria-hidden="true">Page 1 of ${pages}</span><button type="button" class="pager-btn" data-log-next="${tableId}"${pages > 1 ? "" : ' aria-disabled="true"'}>Older →</button></div>`;
}

function publicLogsHtml(events: PublicLogEvent[], gameLogs: PublicTankLog[], caps: { serviceTruncated: boolean; captureTruncated: boolean }): string {
  const serviceRecords = events.map(normalizeServiceLogEvent).reverse(), serviceTableId = "service-log-table";
  const rows = serviceRecords.map((record) => { const search = `${record.timestamp} ${record.reasonCode} ${record.action} ${record.subject} ${record.details}`.toLowerCase(); return `<tr data-log-row="1" data-search="${esc(search)}" data-reason="${esc(record.reasonCode)}"><td class="cell-time" title="${esc(record.timestamp)}"><time datetime="${esc(record.timestamp)}">${esc(record.timestamp)}</time></td><td class="cell-code"><code>${esc(record.reasonCode)}</code></td><td class="cell-code" title="${esc(record.action)}"><code>${esc(record.action)}</code></td><td class="cell-key" title="${esc(record.subject)}">${esc(record.subject)}</td><td class="cell-detail" title="${esc(record.details)}"><span>${esc(record.details)}</span></td></tr>`; }).join("");
  const tanks = gameLogs.map(({ room, records }) => {
    const tableId = `game-log-${room}`;
    const captures = records.slice().reverse().map((record) => { const search = `${record.timestamp} ${record.reasonCode} ${record.tick} ${record.action} ${record.language} ${record.name} ${record.details}`.toLowerCase(); return `<tr data-log-row="1" data-search="${esc(search)}" data-reason="${esc(record.reasonCode)}" data-timestamp="${esc(record.timestamp)}" data-code="${esc(record.reasonCode)}" data-tick="${record.tick}" data-action="${esc(record.action.toLowerCase())}" data-language="${esc(record.language)}" data-details="${esc(record.details.toLowerCase())}"><td class="cell-time" title="${esc(record.timestamp)}"><time datetime="${esc(record.timestamp)}">${esc(record.timestamp)}</time></td><td class="cell-code"><code>${esc(record.reasonCode)}</code></td><td class="cell-seq">${record.tick}</td><td class="cell-code" title="${esc(record.action)}"><code>${esc(record.action)}</code></td><td class="cell-key" title="${esc(record.language)}">${esc(record.language)}</td><td class="cell-detail" title="${esc(record.details)}"><span>${esc(record.details)}</span></td></tr>`; }).join("");
    const sortButton = (key: string, label: string, direction = "") => `<th scope="col" aria-sort="${direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}"><button type="button" class="table-sort" data-table="${tableId}" data-key="${key}"${direction ? ` data-direction="${direction}"` : ""}>${label}</button></th>`;
    const tankName = AUDIT_ROOM_NAMES[room] ?? room;
    return `<details class="card log-room"><summary><span class="log-summary"><strong>${esc(tankName)} Tank</strong><code>${esc(room)}</code><span class="log-count">${records.length} ${records.length === 1 ? "capture" : "captures"} · past 24h</span></span></summary><div class="log-room-body"><div class="log-actions"><a class="action-link" href="/logs/game/${encodeURIComponent(room)}.txt" download>Download the full 24-hour capture (TXT)</a></div>${logToolbar(tableId, records, `${tankName} Tank captures`)}<div class="table-scroll" role="region" aria-label="${esc(tankName)} Tank captures" tabindex="0"><table class="capture-table" id="${tableId}"><caption class="sr-only">${esc(tankName)} Tank captures</caption><thead><tr>${sortButton("timestamp", "Timestamp", "desc")}${sortButton("code", "Reason")}${sortButton("tick", "Tick")}${sortButton("action", "Action")}${sortButton("language", "Language")}${sortButton("details", "Details")}</tr></thead><tbody>${captures || '<tr><td colspan="6">No captures in the past 24 hours.</td></tr>'}</tbody></table></div>${records.length > LOG_PAGE_SIZE ? logPager(tableId, records.length) : ""}</div></details>`;
  }).join("");
  const captureTotal = gameLogs.reduce((total, tank) => total + tank.records.length, 0);
  const truncationNote = caps.serviceTruncated || caps.captureTruncated
    ? `<p class="table-note" style="margin:0">Showing the newest ${caps.serviceTruncated ? `${serviceRecords.length} service records` : ""}${caps.serviceTruncated && caps.captureTruncated ? " and " : ""}${caps.captureTruncated ? "captures per tank" : ""} — the retained record is larger than one page can carry. The JSON and TXT exports carry the rest.</p>`
    : "";
  return `<section class="page-intro"><div class="eyebrow">Public Shark Tank evidence</div><h1>Every operational move leaves a reason.</h1><p class="sub">Service evidence is retained for 90 days; tank captures for 24 hours. Both are shown in full below — every row carries a reason code.</p><a class="action-link" href="/logs.json">Public log JSON →</a></section>
    <details class="card log-room"><summary><span class="log-summary"><strong>Service evidence</strong><code>90-day retention</code><span class="log-count">${serviceRecords.length} records</span></span></summary><div class="log-room-body">${logToolbar(serviceTableId, serviceRecords, "service evidence")}<div class="table-scroll" role="region" aria-label="Service evidence" tabindex="0"><table class="events-table" id="${serviceTableId}"><caption class="sr-only">Service evidence</caption><thead><tr><th scope="col">Timestamp</th><th scope="col">Reason</th><th scope="col">Action</th><th scope="col">Subject</th><th scope="col">Detail</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No public events recorded.</td></tr>'}</tbody></table></div>${serviceRecords.length > LOG_PAGE_SIZE ? logPager(serviceTableId, serviceRecords.length) : ""}<p class="table-note">Reason codes are one letter plus three digits. Full detail remains available in JSON.</p></div></details>
    <section><h2>Tank captures · past 24 hours</h2><p class="sub">${captureTotal} ${captureTotal === 1 ? "capture" : "captures"} across four ocean tanks. Records older than 24 hours are purged at the source, so this is the complete window. Expand a tank to search, filter, sort, or download it.</p>${tanks}</section>${truncationNote}${gameLogSortScript()}`;
}

/**
 * Log table behaviour: search, reason filter, column sort, and paging.
 *
 * Paging is what makes "show everything" viable — a 90-day service log is thousands of
 * rows, so the DOM holds them all but paints 25 at a time. Rows are hidden with the
 * `hidden` attribute, which the global `[hidden]{display:none!important}` rule enforces
 * against the table's own display rules.
 *
 * The per-table count element is also the live region for that table. Announcing the rows
 * themselves would read out 25 changed cells, so the count speaks instead, as one sentence
 * carrying both the match count and the page. It is written only when the sentence changes
 * (silent on load, since the server rendered the same text) and the search path is debounced
 * so a settled query announces once rather than once per keystroke — the rows still filter
 * on every input.
 *
 * The pager buttons are never `disabled`. Disabling a focused button drops focus to `<body>`
 * and restarts the next Tab at the top of the document, so they stay focusable, report
 * `aria-disabled`, and no-op past the ends.
 */
function gameLogSortScript(): string {
  return `<script nonce="__WG_CSP_NONCE__">(function(){var PER=${LOG_PAGE_SIZE},pages={},timers={};
function rowsOf(tableId){var t=document.getElementById(tableId);return t?Array.prototype.slice.call(t.querySelectorAll('tr[data-log-row]')):[];}
function announce(tableId,text){var el=document.getElementById(tableId+'-count');if(el&&el.textContent!==text)el.textContent=text;}
function schedule(tableId,text,delay){if(timers[tableId])clearTimeout(timers[tableId]);if(!delay){announce(tableId,text);return;}timers[tableId]=setTimeout(function(){announce(tableId,text);},delay);}
function render(tableId,delay){var input=document.querySelector('[data-log-search="'+tableId+'"]'),select=document.querySelector('[data-log-reason="'+tableId+'"]'),query=(input&&input.value||'').trim().toLowerCase(),reason=select&&select.value||'';
var all=rowsOf(tableId),match=all.filter(function(row){return (!query||(row.dataset.search||'').indexOf(query)>-1)&&(!reason||row.dataset.reason===reason);});
var total=Math.max(1,Math.ceil(match.length/PER)),page=Math.min(pages[tableId]||0,total-1);pages[tableId]=page;
all.forEach(function(row){row.hidden=true;});match.slice(page*PER,page*PER+PER).forEach(function(row){row.hidden=false;});
var body=match.length===all.length?match.length+' '+(all.length===1?'record':'records'):match.length+' of '+all.length+' records';
schedule(tableId,total>1?body+', page '+(page+1)+' of '+total:body,delay);
var label=document.querySelector('[data-log-page="'+tableId+'"]');if(label)label.textContent='Page '+(page+1)+' of '+total;
var prev=document.querySelector('[data-log-prev="'+tableId+'"]');if(prev)prev.setAttribute('aria-disabled',page===0?'true':'false');
var next=document.querySelector('[data-log-next="'+tableId+'"]');if(next)next.setAttribute('aria-disabled',page>=total-1?'true':'false');}
function step(control,tableId,by){if(control.getAttribute('aria-disabled')==='true')return;pages[tableId]=Math.max(0,(pages[tableId]||0)+by);render(tableId,0);}
document.querySelectorAll('[data-log-search],[data-log-reason]').forEach(function(control){var picker=control.matches('select');control.addEventListener(picker?'change':'input',function(){var id=control.dataset.logSearch||control.dataset.logReason;pages[id]=0;render(id,picker?0:300);});});
document.querySelectorAll('[data-log-prev]').forEach(function(b){b.addEventListener('click',function(){step(b,b.dataset.logPrev,-1);});});
document.querySelectorAll('[data-log-next]').forEach(function(b){b.addEventListener('click',function(){step(b,b.dataset.logNext,1);});});
document.querySelectorAll('.table-sort').forEach(function(button){button.addEventListener('click',function(){var tableId=button.dataset.table,table=document.getElementById(tableId),body=table&&table.querySelector('tbody');if(!body)return;var key=button.dataset.key,direction=button.dataset.direction==='asc'?'desc':'asc',rows=rowsOf(tableId);table.querySelectorAll('.table-sort').forEach(function(other){delete other.dataset.direction;if(other.parentElement)other.parentElement.setAttribute('aria-sort','none');});button.dataset.direction=direction;if(button.parentElement)button.parentElement.setAttribute('aria-sort',direction==='asc'?'ascending':'descending');rows.sort(function(a,b){var av=a.dataset[key]||'',bv=b.dataset[key]||'',result=key==='tick'?Number(av)-Number(bv):av.localeCompare(bv);return direction==='asc'?result:-result;});rows.forEach(function(row){body.appendChild(row);});pages[tableId]=0;render(tableId,0);});});
document.querySelectorAll('table[id]').forEach(function(t){if(t.querySelector('tr[data-log-row]'))render(t.id,0);});
}());</script>`;
}

/** Per-surface fetch ceilings. Generous enough to carry the whole retained record in
 *  practice; when one does bite, the page and the JSON both say so rather than
 *  presenting a truncated set as complete. */
const LOG_FETCH_SERVICE = 5_000;
const LOG_FETCH_CAPTURES = 2_000;

/** The whole public log record: 90 days of service evidence, 24 hours of captures. */
async function publicLogData(env: Env) {
  const [serviceResponse, ...roomResponses] = await Promise.all([
    lobbyStub(env).fetch(`https://lobby/audit?limit=${LOG_FETCH_SERVICE}`),
    ...AUDIT_ROOMS.map((room) => roomFetch(env, room, `/log?limit=${LOG_FETCH_CAPTURES}`)),
  ]);
  const serviceData = (await serviceResponse.json()) as { events?: PublicLogEvent[] };
  const roomData = await Promise.all(roomResponses.map((response) => response.json() as Promise<{ events?: GameLogWireEvent[] }>));
  const serviceEvents = serviceData.events ?? [];
  // The room prunes past 24 hours, but a snapshot restored from storage can still hand
  // back an older row; filter here so the page's stated window is always the true one.
  const cutoff = Date.now() - CAPTURE_WINDOW_MS;
  const tanks = AUDIT_ROOMS.map((room, index) => ({
    room,
    records: (roomData[index].events ?? []).filter((event) => event.ts >= cutoff).map(normalizeGameLogEvent),
  }));
  return {
    serviceEvents,
    service: serviceEvents.map(normalizeServiceLogEvent),
    tanks,
    caps: {
      serviceTruncated: serviceEvents.length >= LOG_FETCH_SERVICE,
      captureTruncated: tanks.some((tank) => tank.records.length >= LOG_FETCH_CAPTURES),
    },
  };
}

function gameLogText(roomId: string, events: GameLogWireEvent[]): Response {
  // A display name is user-controlled and this file opens in Excel and Sheets, where a
  // leading =, +, -, @, tab or CR makes the cell a live formula. CSV quoting does not stop
  // that — the quotes are stripped on import and the formula still runs. Prefix a single
  // quote so the cell stays text, then quote as before. Tab and CR are folded into the
  // whitespace pass first so they cannot smuggle a formula lead past the check.
  const field = (value: unknown) => {
    const plain = String(value ?? "").replace(/[\r\n\t]+/g, " ");
    const safe = /^[=+\-@]/.test(plain) ? `'${plain}` : plain;
    return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = ["timestamp,reason_code,tick,action,language,name,details"];
  for (const event of events) {
    const record = normalizeGameLogEvent(event);
    lines.push([record.timestamp, record.reasonCode, record.tick, record.action, record.language, record.name, record.details].map(field).join(","));
  }
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${roomId}-game-log.txt"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

/** Authenticated operations dashboard. Dynamic values are written with textContent. */
function adminViewerHtml(): string {
  // No template literals / ${} inside, to stay valid in this string.
  const script = [
    "function duration(ms){var s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?d+'d '+h+'h':h?h+'h '+m+'m':m+'m';}",
    "function coverageRow(body,name,value,url){var tr=document.createElement('tr'),a=document.createElement('td'),b=document.createElement('td'),span=document.createElement('span');a.className='cell-key';a.title=name;a.textContent=name;b.className='cell-detail';b.title=value;span.textContent=value;b.appendChild(span);if(url){var link=document.createElement('a');link.href=url;link.textContent='Reference';link.style.marginLeft='8px';b.appendChild(link);}tr.appendChild(a);tr.appendChild(b);body.appendChild(tr);}",
    "async function tick(){try{",
    "var sr=await fetch('/admin/status.json');var sd=await sr.json();var b=sd.billingWindow||{};",
    "document.getElementById('billing-cost').textContent=typeof b.estimatedVariableUsd==='number'?'$'+b.estimatedVariableUsd.toFixed(8):'—';",
    "document.getElementById('billing-requests').textContent=(b.requests||0).toLocaleString();",
    "document.getElementById('billing-duration').textContent=(b.gbSeconds||0).toLocaleString();",
    "document.getElementById('billing-do-rows').textContent=(b.storageRowsRead||0).toLocaleString()+' / '+(b.storageRowsWritten||0).toLocaleString();",
    "document.getElementById('billing-rate').textContent=(b.requestRatePerMinute||0).toFixed(2)+'/min';",
    "var services=b.services||{},dob=services.durableObjects||{},d1=services.d1||{},r2s=services.r2||{},workers=services.workers||{},sources=(b.freeTier||{}).sources||{},coverage=document.getElementById('billing-coverage');coverage.textContent='';if(workers.configured!==false)coverageRow(coverage,'Workers',workers.requests==null?String(workers.note||'Account analytics required'):(workers.requests||0).toLocaleString()+' requests',sources.workers);if(dob.configured!==false)coverageRow(coverage,'Durable Objects',(dob.requests||0).toLocaleString()+' requests · '+(dob.rowsRead||0).toLocaleString()+' reads · '+(dob.rowsWritten||0).toLocaleString()+' writes',sources.durableObjects);if(d1.configured)coverageRow(coverage,'D1',(d1.rowsRead||0).toLocaleString()+' reads · '+(d1.rowsWritten||0).toLocaleString()+' writes',sources.d1);if(r2s.configured)coverageRow(coverage,'R2',(r2s.objects||0).toLocaleString()+' objects · '+((r2s.classAOperations||0)+(r2s.classBOperations||0)).toLocaleString()+' operations · '+((r2s.storageBytes||0)/1000000).toFixed(2)+' MB',sources.r2);document.getElementById('billing-coverage-card').hidden=!coverage.children.length;document.getElementById('billing-r2-footprint').textContent=((r2s.classAOperations||0)+(r2s.classBOperations||0)).toLocaleString()+' · '+((r2s.storageBytes||0)/1000000).toFixed(2)+' MB';",
    "var monthly=b.freeTierProjectedMonthlyUsd||0,ratio=Math.max(0,Math.min(1,monthly/5)),angle=-90+ratio*180,tone=monthly>5?'tone-red':monthly>0?'tone-yellow':'tone-green',state=monthly>5?'REDLINE':monthly>0?'METERED':'INCLUDED';",
    "var needle=document.getElementById('billing-gauge-needle');needle.style.transform='rotate('+angle+'deg)';needle.setAttribute('class','gauge-needle '+tone);document.getElementById('billing-gauge-value').textContent='$'+monthly.toFixed(2);document.getElementById('billing-gauge-state').textContent=state;document.getElementById('billing-gauge-state').className='meter-pill '+tone;document.getElementById('billing-gauge-value').parentElement.className='gauge-readout '+tone;document.getElementById('billing-current-spend').textContent='$'+(b.estimatedVariableUsd||0).toFixed(8);",
    "var rooms=sd.rooms||[],players=rooms.reduce(function(n,x){return n+(x.players||0)},0),seats=rooms.reduce(function(n,x){return n+(x.capacity||0)},0),active=rooms.filter(function(x){return x.players>0}).length,bots=rooms.reduce(function(n,x){return n+(x.bots||0)},0);",
    "document.getElementById('kpi-active-players').textContent=players.toLocaleString();document.getElementById('kpi-human-seats').textContent=players+' / '+seats;document.getElementById('kpi-bot-seats').textContent=bots.toLocaleString();document.getElementById('kpi-active-rooms').textContent=active+' / '+rooms.length;document.getElementById('kpi-uptime').textContent=duration((sd.usage||{}).uptimeMs||0);document.getElementById('kpi-audit-events').textContent=((sd.usage||{}).auditEvents||0).toLocaleString();",
    "var hi=sd.history||[],hib=document.getElementById('history-rows');hib.textContent='';hi.slice().reverse().forEach(function(e){var tr=document.createElement('tr'),cells=['#'+e.sequence,e.code,e.title,e.summary,new Date(e.ts).toLocaleString(),e.reference||'',String(e.hash||'').slice(0,16)+'…'],classes=['cell-seq','cell-code','cell-key','cell-detail','cell-time','cell-key','cell-code'];cells.forEach(function(v,i){var td=document.createElement('td');td.className=classes[i];td.title=String(v);if(i===1||i===6){var c=document.createElement('code');c.textContent=v;td.appendChild(c);}else if(i===3){var span=document.createElement('span');span.textContent=v;td.appendChild(span);}else td.textContent=v;tr.appendChild(td);});hib.appendChild(tr);});if(!hi.length){var hr=document.createElement('tr'),hd=document.createElement('td');hd.colSpan=7;hd.textContent='No control events recorded.';hr.appendChild(hd);hib.appendChild(hr);}var integrity=sd.historyIntegrity||{},head=integrity.headHash||'none',integrityNode=document.getElementById('history-integrity');integrityNode.textContent=(integrity.entryCount||0)+' append-only entries · '+(integrity.algorithm||'SHA-256')+' head '+(head==='none'?head:head.slice(0,16)+'…');integrityNode.title=head;",
    "var m=sd.maintenance||{};var mb=document.getElementById('maintenance-toggle');mb.dataset.enabled=m.enabled?'1':'0';mb.textContent=m.enabled?'Bring server online':'Take server down';mb.className=m.enabled?'restore':'danger';",
    "document.getElementById('maintenance-state').textContent=m.enabled?'OFFLINE':'ONLINE';document.getElementById('maintenance-state').className='m '+(m.enabled?'o':'g');",
    "}catch(err){}}",
    "document.getElementById('maintenance-toggle').addEventListener('click',async function(){var b=this,o=document.getElementById('maintenance-output'),enabling=b.dataset.enabled!=='1';if(enabling&&!confirm('Take the game offline and disconnect every active player? Roadmap, API, Docs, Status, Incidents, Inquiry, Logs, Audit, and Admin will remain available.'))return;b.disabled=true;try{var r=await fetch('/admin/maintenance',{method:'POST',headers:{'content-type':'application/json','x-wg-ops-action':'maintenance'},body:JSON.stringify({enabled:enabling,reason:enabling?'Scheduled maintenance':''})}),d=await r.json();if(!r.ok)throw new Error(d.error||'request failed');o.hidden=false;o.textContent=d.message||'Maintenance state updated.';await tick();}catch(e){o.hidden=false;o.textContent='Unable to change maintenance mode.';}finally{b.disabled=false;}});",
    "document.getElementById('billing-reset').addEventListener('click',async function(){var b=this;if(!confirm('Reset the billing measurement window to zero? Uptime and status history will be preserved.'))return;b.disabled=true;try{var r=await fetch('/admin/billing-reset',{method:'POST',headers:{'x-wg-ops-action':'billing-reset'}});if(!r.ok)throw new Error('request failed');await tick();}catch(e){alert('Unable to reset the billing counter.');}finally{b.disabled=false;}});",
    "tick();setInterval(tick,1500);",
  ].join("");
  return `<section class="page-intro"><div class="eyebrow">Control room · sharp teeth</div><h1>Admin</h1>
    <p class="sub">Authenticated traffic controls, incident receipts, billing thresholds, and live runtime KPIs. The conformance register these controls produce evidence for is public at <a href="/audit/">Audit</a>.</p></section>
    <h2 style="font-size:1rem;letter-spacing:.08em;text-transform:uppercase;color:#b9b4d6">Operations pulse</h2>
    <div class="metric-grid stat-grid">
      ${metricCard("—", "Active players", "live human sessions", "players", "tone-cyan", "kpi-active-players")}
      ${metricCard("—", "Human seats", "used / 24 available", "traffic", "tone-violet", "kpi-human-seats")}
      ${metricCard("—", "Bot seats", "server-authoritative rivals", "bot", "tone-yellow", "kpi-bot-seats")}
      ${metricCard("—", "Active tanks", "tanks with human players", "rooms", "tone-green", "kpi-active-rooms")}
      ${metricCard("—", "Service uptime", "preserved across billing resets", "uptime", "tone-green", "kpi-uptime")}
      ${metricCard("—", "Action log events", "lifetime status counter", "audit", "tone-cyan", "kpi-audit-events")}
    </div>
    <div class="card"><h2 style="margin:0 0 10px;font-size:1.1rem">Server control</h2>
      <p>Game traffic: <strong id="maintenance-state" class="m">CHECKING…</strong></p>
      <div class="server-controls"><button type="button" id="maintenance-toggle" class="danger" data-enabled="0">Take server down</button>${securityReportControl("admin-security-report")}</div>
      <pre class="security-receipt" id="maintenance-output" role="status" aria-live="polite" aria-atomic="true" hidden></pre>
      <form class="alert-test" id="test-alert-form"><label for="test-alert-code"><strong>Test alert code</strong></label><input class="alert-code" id="test-alert-code" name="code" maxlength="4" minlength="4" pattern="[A-Za-z][0-9]{3}" placeholder="A000" autocomplete="off" required><button type="submit" class="secondary">Send test alert</button></form><pre class="security-receipt" id="test-alert-output" role="status" aria-live="polite" aria-atomic="true" hidden></pre>
      <p class="sub" style="margin:10px 0 0">Filing a security report here also takes the game down; the unauthenticated public intake at <code>/api/security-report</code> only records a report. Taking the game down disconnects active tanks and gates the game shell, assets, and tank WebSockets. Roadmap, API, Docs, Status, Incidents, Inquiry, Logs, Audit, and Admin stay online. Alert codes are exactly one letter followed by three digits.</p>
    </div>
    <div class="card"><div class="eyebrow">Control receipts</div><h2 style="margin:0 0 8px;font-size:1.1rem">Append-only control history</h2><p class="sub" id="history-integrity">Loading receipt chain…</p><div class="table-scroll" role="region" aria-label="Append-only control history" tabindex="0"><table class="history-table"><caption class="sr-only">Append-only control history</caption><thead><tr><th scope="col">Seq</th><th scope="col">Code</th><th scope="col">Decision</th><th scope="col">Outcome</th><th scope="col">Time</th><th scope="col">Reference</th><th scope="col">Receipt</th></tr></thead><tbody id="history-rows"></tbody></table></div><p class="sub" style="margin:0">SHA-256 receipts link each control decision to the previous entry. These rows are not subject to the 90-day user-action retention policy.</p></div>
    <div class="card gauge-card"><h2 style="margin:0 0 10px;font-size:1.1rem">Billing fuel gauge</h2>
      ${billingGaugeSvg("billing")}
      <div class="metric-grid stat-grid">
        ${metricCard("—", "Window spend", "measured variable estimate", "audit", "tone-cyan", "billing-cost")}
        ${metricCard("—", "Billable requests", "since reset", "requests", "tone-violet", "billing-requests")}
        ${metricCard("—", "Request velocity", "current-window average", "availability", "tone-yellow", "billing-rate")}
        ${metricCard("—", "Duration", "measured GB-s", "uptime", "tone-green", "billing-duration")}
        ${metricCard("—", "DO rows R / W", "SQLite threshold window", "audit", "tone-violet", "billing-do-rows")}
        ${metricCard("—", "R2 ops / storage", "bound asset bucket", "rooms", "tone-green", "billing-r2-footprint")}
      </div>
      <div class="card" id="billing-coverage-card" style="margin-top:14px" hidden><h3 style="margin:0 0 8px">Billing coverage</h3><div class="table-scroll" role="region" aria-label="Billing coverage" tabindex="0" style="margin:0"><table class="billing-table"><caption class="sr-only">Billing coverage</caption><thead><tr><th scope="col">Bound service</th><th scope="col">Measured usage or reference</th></tr></thead><tbody id="billing-coverage"></tbody></table></div></div>
      <p><button type="button" id="billing-reset" class="secondary">Reset billing counter</button></p>
    </div>
    <script nonce="__WG_CSP_NONCE__">${script}</script>${securityReportScript("admin-security-report")}${testAlertScript()}`;
}

/**
 * The output pane is a polite live region, so a rejection is spoken instead of merely
 * appearing. On rejection the input is also marked invalid and pointed at that pane, which
 * is the only text saying what "invalid" means here; both marks clear on the next accepted
 * submit. The receipt leads with one plain sentence — a live region that opens with twelve
 * lines of JSON announces twelve lines of JSON.
 */
function testAlertScript(): string {
  return `<script nonce="__WG_CSP_NONCE__">(function(){var f=document.getElementById('test-alert-form'),i=document.getElementById('test-alert-code'),o=document.getElementById('test-alert-output');if(!f)return;
function show(text,invalid){if(invalid){i.setAttribute('aria-invalid','true');i.setAttribute('aria-describedby','test-alert-output');}else{i.removeAttribute('aria-invalid');i.removeAttribute('aria-describedby');}o.hidden=false;o.textContent=text;}
f.addEventListener('submit',async function(e){e.preventDefault();var code=i.value.toUpperCase();
if(!/^[A-Z][0-9]{3}$/.test(code)){show('Rejected: use exactly one letter followed by three digits.',true);return;}
var b=f.querySelector('button');b.disabled=true;
try{var r=await fetch('/admin/test-alert',{method:'POST',headers:{'content-type':'application/json','x-wg-ops-action':'test-alert'},body:JSON.stringify({code:code})}),d=await r.json();
var refused=!r.ok||d.ok===false;show((refused?'Rejected: '+(d.error||'the server refused this alert code.'):d.message||'Test alert recorded.')+'\\n\\n'+JSON.stringify(d,null,2),refused);}
catch(err){show('Unable to send test alert.',true);}finally{b.disabled=false;}});}());</script>`;
}

/* ── State backup (A.8.13) ────────────────────────────────────────────────────
   The tank Durable Object holds the receipt chain, the 90-day action log, player
   profiles and spend history, and until now none of it was copied anywhere. A copy
   is written to the bound object storage on a schedule, older copies are pruned to a
   retention window, and the outcome — success or failure — is receipted into the same
   chain the copy protects. Restoring is a separate, deliberate act; see runRestoreDrill,
   which proves the path works without touching live state. */
const BACKUP_PREFIX = "backups/state/";
const BACKUP_LATEST_KEY = BACKUP_PREFIX + "latest.json";
/** How many dated copies are kept. Daily copies, so this is roughly a month of history. */
const BACKUP_RETAIN = 30;

interface StateExportShape {
  format: string; version: number; takenAt: number; digest?: string;
  counts?: { kv: number; profiles: number; audit: number; controlHistory: number };
}

/** Fetch a full export from the tank object. */
async function fetchStateExport(env: Env): Promise<StateExportShape | null> {
  const res = await lobbyStub(env).fetch("https://lobby/backup");
  if (!res.ok) return null;
  const body = (await res.json()) as { ok?: boolean; export?: StateExportShape };
  return body.export ?? null;
}

/**
 * Take one copy and record the outcome. Returns a report rather than throwing, because a
 * failed backup must still leave a receipt saying so — a backup path that fails silently
 * is worse than none, since the register would go on claiming it.
 */
async function runBackup(env: Env): Promise<Record<string, unknown>> {
  if (!env.R2_ASSETS) {
    await lobbyStub(env).fetch(new Request("https://lobby/backup/record", { method: "POST", body: JSON.stringify({ ok: false, lastBackupError: "no object storage bound" }), headers: { "content-type": "application/json" } }));
    return { ok: false, error: "no object storage bound" };
  }
  try {
    const data = await fetchStateExport(env);
    if (!data) throw new Error("export refused");
    const body = JSON.stringify(data);
    const stamp = new Date(data.takenAt).toISOString().replace(/[:.]/g, "-");
    const key = `${BACKUP_PREFIX}${stamp}.json`;
    const headers = { httpMetadata: { contentType: "application/json" }, customMetadata: { digest: String(data.digest ?? ""), takenAt: String(data.takenAt) } };
    await env.R2_ASSETS.put(key, body, headers);
    await env.R2_ASSETS.put(BACKUP_LATEST_KEY, body, headers);

    // Prune to the retention window. Keys are ISO-stamped, so lexical order is time order.
    const listed = await env.R2_ASSETS.list({ prefix: BACKUP_PREFIX, limit: 1000 });
    const dated = listed.objects.map((object) => object.key).filter((k) => k !== BACKUP_LATEST_KEY).sort();
    const doomed = dated.slice(0, Math.max(0, dated.length - BACKUP_RETAIN));
    for (const old of doomed) await env.R2_ASSETS.delete(old);

    const record = { ok: true, lastBackupAt: data.takenAt, lastBackupKey: key, lastBackupBytes: body.length, lastBackupDigest: data.digest ?? "", lastBackupCounts: data.counts ?? null, retainedCopies: Math.max(0, dated.length - doomed.length) };
    await lobbyStub(env).fetch(new Request("https://lobby/backup/record", { method: "POST", body: JSON.stringify(record), headers: { "content-type": "application/json" } }));
    return { ...record, pruned: doomed.length };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown failure";
    await lobbyStub(env).fetch(new Request("https://lobby/backup/record", { method: "POST", body: JSON.stringify({ ok: false, lastBackupError: detail }), headers: { "content-type": "application/json" } }));
    return { ok: false, error: detail };
  }
}

/**
 * Restore drill. Reads the most recent copy back out of object storage, restores that copy
 * into a scratch Durable Object addressed by a name nothing else uses, exports the scratch
 * instance and compares digests. A matching digest means the stored copy reconstitutes the
 * state it was taken from exactly, not merely something like it.
 *
 * The stored copy is deliberately the thing under test. An earlier version of this drill
 * exported the live object and restored that, which proved the object could round-trip its
 * own state and proved nothing whatever about object storage -- while /status/ went on
 * saying the most recent copy was what had been restored. If no bucket is bound, or there
 * is no copy in it, the drill fails and says which: it must never quietly fall back to the
 * live export, because that silent fallback is precisely how the published claim became
 * untrue in the first place.
 *
 * Live state is never written to, so this is safe to run against production.
 */
/** The drill detail is rendered on the public status panel, so it has to read as English. */
const countOf = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

async function runRestoreDrill(env: Env): Promise<Record<string, unknown>> {
  const started = Date.now();
  // One fixed scratch name, not one per run: a per-run name would leave a new object
  // holding a full copy of every profile behind after every drill.
  const scratch = env.LOBBY.get(env.LOBBY.idFromName("state-restore-drill"));
  try {
    // No bucket, or nothing in it, is a failed drill and not a reason to test something else.
    if (!env.R2_ASSETS) throw new Error("no object storage bound, so there is no stored copy to restore");
    const stored = await env.R2_ASSETS.get(BACKUP_LATEST_KEY);
    if (!stored) throw new Error(`no copy at ${BACKUP_LATEST_KEY} to restore; take one before drilling`);
    let source: StateExportShape | null = null;
    try { source = (await stored.json()) as StateExportShape; }
    catch { throw new Error(`the copy at ${BACKUP_LATEST_KEY} is not readable JSON`); }
    if (!source || typeof source !== "object") throw new Error("the stored copy is not an export");
    // Without a digest on the copy there is nothing to compare the restore against, and a
    // drill that cannot compare must not report a pass.
    if (!source.digest) throw new Error("the stored copy carries no digest to compare against");

    const restore = await scratch.fetch(new Request("https://lobby/restore", { method: "POST", body: JSON.stringify({ export: source }), headers: { "content-type": "application/json" } }));
    const restored = (await restore.json()) as { ok?: boolean; error?: string };
    if (!restore.ok || !restored.ok) throw new Error(restored.error ?? "restore refused");
    const copyRes = await scratch.fetch("https://lobby/backup");
    const copyBody = (await copyRes.json()) as { export?: StateExportShape };
    const copy = copyBody.export;
    if (!copy) throw new Error("scratch instance would not export");
    // The digest covers state only, deliberately excluding takenAt and generation, so two
    // exports of the same data hash the same however far apart they were taken.
    const match = source.digest === copy.digest;

    // Second assertion, reported rather than asserted. Whether the stored copy still matches
    // the live object says how old the copy is, not whether the restore path works: every
    // request moves spend and the action log on, so the two digests differ most of the time
    // by design. Failing the drill on that would make it fail daily for the expected reason
    // and teach the reader to ignore it.
    const live = await fetchStateExport(env);
    const drift = !live?.digest
      ? "live state could not be exported to compare"
      : live.digest === source.digest ? "live state unchanged since the copy" : "live state has moved on since the copy";

    const takenLabel = Number.isFinite(source.takenAt) && source.takenAt > 0
      ? new Date(source.takenAt).toISOString().slice(0, 16).replace("T", " ") + "Z"
      : "unknown time";
    const detail = match
      ? `copy of ${takenLabel} read back from ${BACKUP_LATEST_KEY}; digest ${String(source.digest).slice(0, 16)}…; ${countOf(source.counts?.kv ?? 0, "key")}, ${countOf(source.counts?.controlHistory ?? 0, "receipt")}, ${countOf(source.counts?.audit ?? 0, "log row")}; ${drift}`
      : `stored copy ${String(source.digest).slice(0, 16)}… vs restored ${String(copy.digest).slice(0, 16)}…`;
    await lobbyStub(env).fetch(new Request("https://lobby/backup/drill-result", { method: "POST", body: JSON.stringify({ ok: match, detail }), headers: { "content-type": "application/json" } }));
    return { ok: match, detail, restoredFrom: BACKUP_LATEST_KEY, storedTakenAt: source.takenAt ?? null, storedBytes: stored.size, storedDigest: source.digest, liveDigest: live?.digest ?? null, liveMatchesStored: Boolean(live?.digest) && live?.digest === source.digest, sourceCounts: source.counts ?? null, restoredCounts: copy.counts ?? null, elapsedMs: Date.now() - started };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown failure";
    await lobbyStub(env).fetch(new Request("https://lobby/backup/drill-result", { method: "POST", body: JSON.stringify({ ok: false, detail }), headers: { "content-type": "application/json" } }));
    return { ok: false, detail, elapsedMs: Date.now() - started };
  } finally {
    // Whether the drill passed or failed, the scratch copy of every profile goes away.
    try { await scratch.fetch(new Request("https://lobby/wipe", { method: "POST" })); }
    catch (e) { console.error("restore drill scratch wipe failed", e); }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // TLS gate, ahead of everything. Ops paths are never redirected: a redirect means the
      // Basic credential already crossed the wire in clear text, so it can only be refused.
      if (!isSecureRequest(request, url) && !isLoopback(url)) {
        if (isOpsPath(path) || request.headers.get("authorization")) return tlsRequired();
        if (request.method === "GET" || request.method === "HEAD") {
          // Build the target explicitly: workerd's URL does not honour the `protocol` setter.
          const secure = `https://${url.host.replace(/:80$/, "")}${url.pathname}${url.search}`;
          return new Response(null, { status: 308, headers: { location: secure, "cache-control": "no-store", ...SECURITY_HEADERS } });
        }
        return tlsRequired();
      }
      if (!maintenanceBypass(path, request.method)) {
        const state = await maintenanceState(env);
        if (state.enabled) {
          // An API caller gets the machine-readable refusal, not the downtime page.
          if (path.startsWith("/api/")) return json({ ok: false, error: "service gated", reason: state.reason || "Safety control active" }, 503);
          return downtimeResponse(state);
        }
      }
      // The page stylesheet, ahead of every other route and of the asset fallback. Only the
      // current fingerprint is served: any other /styles/ path is a miss and says so, rather
      // than falling through to the single-page-application fallback, which would answer a
      // text/css request with the game shell and leave the page unstyled with no error.
      if (path === PAGE_CSS_PATH) return pageCssResponse();
      if (path.startsWith("/styles/")) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS } });

      if (path === "/") return movedTo(url, "/play/");
      if (path === "/play") return movedTo(url, "/play/");
      if (/^\/(?:arena|uno|x4|21|game|checkers|battleship|3d|shark-?run)(?:\/.*)?$/i.test(path)) return movedTo(url, "/play/");
      if (path === "/favicon.ico") return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=3600", ...SECURITY_HEADERS } });
      if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: https://sharktank.wizardgang.ai/sitemap.xml\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600", ...SECURITY_HEADERS } });
      if (path === "/sitemap.xml") {
        const routes = ["/play/", "/docs/", "/trust/", "/status/", "/spend/", "/logs/", "/audit/", "/policies/"];
        const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>https://sharktank.wizardgang.ai${route}</loc></url>`).join("")}</urlset>`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600", ...SECURITY_HEADERS } });
      }

      // Same-origin facade keeps the TypeScript ⇄ PHP proof-of-concept toggle usable
      // on HTTPS production. PHP itself runs on a separately hosted Workerman origin.
      if (path === "/php-room") {
        if (!env.PHP_WS_ORIGIN) return json({ ok: false, error: "PHP WebSocket origin unavailable" }, 503);
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", { status: 426 });
        const target = checkedOrigin(env.PHP_WS_ORIGIN, url.origin); if (!target) return json({ ok: false, error: "invalid PHP origin" }, 503);
        const headers = new Headers(request.headers); if (env.PHP_ORIGIN_TOKEN) headers.set("x-wg-origin-token", env.PHP_ORIGIN_TOKEN);
        return fetch(new Request(target, { method: request.method, headers }));
      }
      if (path === "/php-api" || path.startsWith("/php-api/")) {
        const phpPath = path.slice(8) || "/";
        if (isOpsPath(phpPath) && !(await opsAuthorized(request, env, url))) return opsDenied(env);
        if (!env.PHP_HTTP_ORIGIN) return json({ ok: false, error: "PHP API origin unavailable" }, 503);
        const target = checkedOrigin(env.PHP_HTTP_ORIGIN, url.origin); if (!target) return json({ ok: false, error: "invalid PHP origin" }, 503);
        const proxied = new URL(phpPath, target); proxied.search = url.search;
        const owner = profileId(request);
        if (proxied.pathname === API.profile) proxied.searchParams.set("id", owner.id);
        const headers = new Headers(request.headers); headers.delete("cookie"); headers.delete("authorization"); headers.set("x-forwarded-host", url.host);
        if (env.PHP_ORIGIN_TOKEN) headers.set("x-wg-origin-token", env.PHP_ORIGIN_TOKEN);
        const res = await fetch(new Request(proxied, { method: request.method, headers, body: request.body, redirect: "manual" }));
        if (!owner.fresh || proxied.pathname !== API.profile) return res;
        const out = new Response(res.body, res); out.headers.append("set-cookie", `wg_player=${owner.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000; Secure`); return out;
      }
      // ── WebSocket → Room DO ────────────────────────────────────────────────
      const roomId = parseRoomPath(path);
      if (roomId) {
        if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", { status: 426 });
        if (!ALLOWED_ROOMS.has(roomId)) return json({ ok: false, error: "unknown room" }, 404);
        const origin = request.headers.get("origin");
        if (origin && new URL(origin).host !== url.host) return json({ ok: false, error: "origin rejected" }, 403);
        const id = env.ROOM.idFromName(roomId);
        const stub = env.ROOM.get(id);
        const name = url.searchParams.get("roomName") ?? roomId;
        const fwd = new URL(request.url);
        fwd.searchParams.set("roomId", roomId);
        fwd.searchParams.set("roomName", name);
        return stub.fetch(new Request(fwd.toString(), request));
      }

      // ── HTTP API ───────────────────────────────────────────────────────────
      if (path === API.health) {
        return json({ ok: true, module: "module-react3fiber", time: new Date().toISOString() });
      }

      if (path === API.tank || path === "/api/lobby") {
        const stub = env.LOBBY.get(env.LOBBY.idFromName("global"));
        return stub.fetch("https://lobby/list");
      }

      if (path === API.leaderboard) {
        const stub = env.LOBBY.get(env.LOBBY.idFromName("global"));
        return stub.fetch("https://lobby/leaderboard");
      }

      // Profile read/write. The write is unauthenticated by design — one GET mints a
      // `wg_player` cookie and that cookie is the whole identity — so the cookie cannot be
      // the throttle key: dropping it buys a fresh identity and a fresh allowance on every
      // request. `x-rate-key` is built here from the edge connection, exactly as /api/audit
      // does, and the DO buckets the write on it. Both the body cap and the key are set from
      // scratch so a client-supplied copy of either never reaches the Durable Object.
      if (path === API.profile) {
        if (request.method !== "GET" && request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
        const owner = profileId(request);
        let body: string | undefined;
        if (request.method === "POST") {
          const read = await readCappedBody(request);
          if (read === null) return json({ ok: false, error: "payload too large" }, 413);
          body = read;
        }
        const headers = new Headers(request.headers);
        headers.set("x-profile-id", owner.id);
        headers.set("content-type", "application/json");
        headers.set("x-rate-key", connectionRateKey(request));
        headers.delete("content-length");
        const res = await lobbyStub(env).fetch("https://lobby/profile", { method: request.method, headers, body });
        if (!owner.fresh) return res;
        const out = new Response(res.body, res); out.headers.append("set-cookie", `wg_player=${owner.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol === "https:" ? "; Secure" : ""}`); return out;
      }

      // Client-emitted user actions → the Lobby DO's 90-day user log.
      if (path === "/api/audit" && request.method === "POST") {
        const owner = profileId(request);
        const raw = await readCappedBody(request);
        if (raw === null) return json({ ok: false, error: "payload too large" }, 413);
        let body: { type?: string; room?: string; detail?: string };
        try { body = JSON.parse(raw) as { type?: string; room?: string; detail?: string }; } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
        if (!body.type || !PUBLIC_AUDIT_TYPES.has(body.type)) return json({ ok: false, error: "unsupported public event type" }, 400);
        const room = typeof body.room === "string" && ALLOWED_ROOMS.has(body.room) ? body.room : undefined;
        if (body.type === "play" && !room) return json({ ok: false, error: "valid room required" }, 400);
        const detail = body.type === "play"
          ? `Selected ${room}`
          : /^skin [a-z0-9-]{1,32}$/i.test(body.detail ?? "")
            ? body.detail
            : "Profile customization opened";
        // One Durable Object call, not two. x-rate-key is built here from the edge
        // connection and marks this event as publicly written: the Lobby DO buckets on it
        // instead of on the caller's cookie, and holds these rows to their own retention
        // floor. The display name is resolved inside the DO, behind that rate limit, so a
        // rejected flood costs no profile read. Both headers are built from scratch, so
        // client-supplied copies never reach the DO.
        const auditRes = await lobbyStub(env).fetch("https://lobby/event", {
          method: "POST",
          headers: { "content-type": "application/json", "x-actor-id": owner.id, "x-rate-key": connectionRateKey(request), "x-profile-id": owner.id },
          body: JSON.stringify({ ts: Date.now(), type: body.type, room, detail }),
        });
        const response = auditRes.status === 429 ? json({ ok: false, error: "rate limited" }, 429) : json({ ok: auditRes.ok }, auditRes.ok ? 200 : 400);
        if (owner.fresh) response.headers.append("set-cookie", `wg_player=${owner.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol === "https:" ? "; Secure" : ""}`);
        return response;
      }

      // Public white-hat intake. Records the report and raises it to operations; it must
      // never change service state, because nothing here is authenticated — the origin and
      // x-wg-security-report headers are CSRF defence, not authorization, and both are
      // trivially set by a non-browser client. Taking the game offline is an operator
      // decision made at /admin/security-report below, behind ops auth.
      if (path === "/api/security-report" && request.method === "POST") {
        if (request.headers.get("origin") !== url.origin || request.headers.get("x-wg-security-report") !== "white-hat") return json({ ok: false, error: "same-origin report required" }, 403);
        return securityReport(request, url, env, false);
      }

      if (path.startsWith("/api/")) return json({ ok: false, error: "unknown endpoint" }, 404);

      // ── Ops pages: docs / status / audit ─────────────────────────────────────
      if (isOpsPath(path) && !(await opsAuthorized(request, env, url))) return opsDenied(env);
      if (path === "/admin/maintenance") {
        if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
        if (request.headers.get("origin") !== url.origin || request.headers.get("x-wg-ops-action") !== "maintenance") return json({ ok: false, error: "same-origin operation required" }, 403);
        let body: { enabled?: boolean; reason?: string };
        try { body = await request.json() as { enabled?: boolean; reason?: string }; } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
        if (typeof body.enabled !== "boolean") return json({ ok: false, error: "enabled must be boolean" }, 400);
        const setLobby = () => lobbyStub(env).fetch("https://lobby/maintenance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: body.enabled, reason: body.reason ?? "" }) });
        const setRooms = () => Promise.all(AUDIT_ROOMS.map((roomId) => roomFetch(env, roomId, `/maintenance?enabled=${body.enabled ? "1" : "0"}`, { method: "POST" })));
        const lobbyResponse = body.enabled ? await setLobby() : null;
        await setRooms();
        const finalResponse = lobbyResponse ?? await setLobby();
        if (!finalResponse.ok) return json({ ok: false, error: "unable to persist maintenance state" }, 502);
        const data = (await finalResponse.json()) as { maintenance: MaintenanceState; history?: ControlHistoryEntry | null; message?: string; openSecurityReports?: number };
        maintenanceCache = { state: data.maintenance, expiresAt: Date.now() + 1_000 };
        return json({ ok: true, maintenance: data.maintenance, history: data.history ?? null, message: data.message ?? "Maintenance state updated.", openSecurityReports: data.openSecurityReports ?? 0 });
      }
      if (path === "/admin/security-resolve") {
        if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
        if (request.headers.get("origin") !== url.origin || request.headers.get("x-wg-ops-action") !== "security-resolve") return json({ ok: false, error: "same-origin operation required" }, 403);
        let body: { ownerConfirmed?: boolean; dryRun?: boolean; note?: string };
        try { body = await request.json() as { ownerConfirmed?: boolean; dryRun?: boolean; note?: string }; } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
        if (!body.ownerConfirmed || !body.dryRun) return json({ ok: false, error: "owner confirmation and dry-run flag required" }, 400);
        const res = await lobbyStub(env).fetch("https://lobby/security-report/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (path === "/admin/billing-reset") {
        if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
        if (request.headers.get("origin") !== url.origin || request.headers.get("x-wg-ops-action") !== "billing-reset") return json({ ok: false, error: "same-origin operation required" }, 403);
        const res = await lobbyStub(env).fetch("https://lobby/billing/reset", { method: "POST" });
        if (!res.ok) return json({ ok: false, error: "unable to reset billing counter" }, 502);
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (path === "/admin/security-report") {
        if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
        if (request.headers.get("origin") !== url.origin || request.headers.get("x-wg-ops-action") !== "security-report") return json({ ok: false, error: "same-origin operation required" }, 403);
        return securityReport(request, url, env, true);
      }
      if (path === "/admin/test-alert") {
        if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
        if (request.headers.get("origin") !== url.origin || request.headers.get("x-wg-ops-action") !== "test-alert") return json({ ok: false, error: "same-origin operation required" }, 403);
        let body: { code?: string };
        try { body = await request.json() as { code?: string }; } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
        const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
        if (!/^[A-Z][0-9]{3}$/.test(code)) return json({ ok: false, error: "code must be exactly one ASCII letter followed by three digits" }, 400);
        const event = await lobbyStub(env).fetch("https://lobby/test-alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
        if (!event.ok) return json({ ok: false, error: "unable to record test alert" }, 502);
        return new Response(event.body, { status: event.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
      }
      if (path === "/admin/switch") {
        const api = url.searchParams.get("api") === "php" ? "php" : "ts";
        return Response.redirect(`${url.origin}/${api}/?admin=1`, 302);
      }
      if (path === "/docs/openapi.json" || path === "/openapi.json") {
        return json(OPENAPI);
      }
      if (path === "/docs" || path === "/docs/") {
        return html(shell("Shark — API Docs", openApiToHtml(OPENAPI)));
      }

      if (path === "/roadmap.json") { const availability = await roadmapAvailability(env), elapsedHours = ROADMAP_ELAPSED_MINUTES / 60; return json({ ok: true, elapsedMinutes: ROADMAP_ELAPSED_MINUTES, elapsedHours, commitVelocity: { perHour: Number((ROADMAP_MANIFEST.length / elapsedHours).toFixed(1)), featureUpdates: ROADMAP_MANIFEST.length, productionDeployments: ROADMAP_DEPLOYMENT_COUNT, updatesPerDeployment: Number((ROADMAP_MANIFEST.length / ROADMAP_DEPLOYMENT_COUNT).toFixed(1)) }, nextGoal: { name: "ISO/IEC 42001 + ISO/IEC 27001 certification", status: "in-progress" }, availability, license: "MIT", entries: ROADMAP_MANIFEST, postDelivery: { note: "Excluded from every metric above.", hotfixMinutes: POST_DELIVERY_HOTFIX_MINUTES, entries: POST_DELIVERY_ENTRIES } }); }
      // The roadmap and incident *pages* folded into /status/. The JSON did not move: it is
      // a published contract with fixed figures, and folding a page is no reason to break it.
      if (path === "/roadmap" || path === "/roadmap/") return movedTo(url, "/status/#delivery");

      if (path === "/incidents.json") { const data = await incidentData(env); return json({ ok: true, summary: incidentSummary(data.incidents), ...data }); }
      if (path === "/incidents" || path === "/incidents/") return movedTo(url, "/status/#incidents");

      // "Inquiry" meant two different things on this site — this billing page, and the
      // whole transparency estate — and the word appeared on all seven content pages
      // carrying both senses. The page is /spend/ now, which is what it is about. The old
      // names keep redirecting, and the old JSON keeps answering, because operator tooling
      // and the OpenAPI document were both written against them.
      if (path === "/inquiry" || path === "/inquiry/") return movedTo(url, "/spend/");
      if (path === "/spend.json" || path === "/inquiry.json") {
        const res = await lobbyStub(env).fetch("https://lobby/status");
        const data = (await res.json()) as { billingWindow?: Record<string, unknown> };
        return json({ ok: true, billingWindow: publicBillingWindow(data.billingWindow ?? {}) });
      }
      if (path === "/spend" || path === "/spend/") {
        const res = await lobbyStub(env).fetch("https://lobby/status");
        const data = (await res.json()) as { billingWindow?: Record<string, unknown> };
        return html(shell("Shark — Spend", spendHtml(publicBillingWindow(data.billingWindow ?? {})), "What this service consumes against each free allowance and against the five dollar hard limit that closes the game rather than billing."));
      }

      const publicGameLog = path.match(/^\/logs\/game\/([^/]+)\.txt$/);
      if (publicGameLog) {
        const roomId = decodeURIComponent(publicGameLog[1]);
        if (!AUDIT_ROOMS.includes(roomId)) return json({ ok: false, error: "unknown room" }, 404);
        const res = await roomFetch(env, roomId, `/log?limit=${LOG_FETCH_CAPTURES}`);
        const data = (await res.json()) as { events?: GameLogWireEvent[] };
        const cutoff = Date.now() - CAPTURE_WINDOW_MS;
        return gameLogText(roomId, (data.events ?? []).filter((event) => event.ts >= cutoff));
      }
      if (path === "/logs.json") {
        const { service, tanks, caps } = await publicLogData(env);
        const gameTanks = AUDIT_ROOMS.map((room, index) => ({ tankId: room, tank: AUDIT_ROOM_NAMES[room] ?? room, download: `/logs/game/${room}.txt`, records: tanks[index].records }));
        return json({ ok: true, retention: { serviceDays: 90, captureHours: 24, serviceRecords: service.length, capturesPerTankLimit: LOG_FETCH_CAPTURES, truncated: caps }, serviceFormat: ["timestamp", "reasonCode", "action", "subject", "details"], captureFormat: ["timestamp", "reasonCode", "tick", "action", "language", "name", "details"], events: service, gameTanks });
      }
      if (path === "/logs" || path === "/logs/") {
        const { serviceEvents, tanks, caps } = await publicLogData(env);
        return html(shell("Shark — Logs", publicLogsHtml(serviceEvents, tanks, caps)));
      }

      // ── The trust estate's front door ──────────────────────────────────────
      // Six figures, six links. Each one is computed here from the same source the owning
      // page computes it from, so this page cannot state a number the owning page
      // contradicts — there is no second copy to fall out of step.
      if (path === "/trust" || path === "/trust/") {
        const [statusRes, { incidents, historyIntegrity }] = await Promise.all([
          lobbyStub(env).fetch("https://lobby/status"),
          incidentData(env),
        ]);
        const data = (await statusRes.json()) as { billingWindow?: Record<string, unknown> };
        const billing = publicBillingWindow(data.billingWindow ?? {});
        const summary = summarise(ALL_CONTROLS);
        const lastEntry = [...ROADMAP_MANIFEST, ...POST_DELIVERY_ENTRIES].at(-1) ?? null;
        return html(shell("Shark — Trust and operations", trustHtml({
          portal: incidentSummary([]),
          tank: incidentSummary(incidents),
          incidents,
          integrity: historyIntegrity,
          spendUsd: numberValue(recordValue(billing.allTime).estimatedVariableUsd),
          hardLimitUsd: numberValue(billing.hardLimitUsd) || 5,
          readiness: { percent: summary.readiness, met: summary.byStatus.met, partial: summary.byStatus.partial, total: summary.applicable },
          lastDeployment: lastEntry ? { id: lastEntry.deployment, title: lastEntry.title } : null,
        }), "Availability, incidents, spend, conformance readiness and the control receipt chain for sharktank.wizardgang.ai — each figure linking to the page that owns it."));
      }

      // Public conformance register. Fixed content, no binding read: the evidence is the
      // routes it links to, so the page has nothing to fetch and nothing to get wrong.
      if (path === "/policies.json") return json(governanceManifest());
      if (path === "/policies" || path === "/policies/") return html(shell("Shark — Policies", governanceIndexHtml(), "Index of the governance documents ISO/IEC 27001 and 42001 require, each published as its own route."));
      // One route per document. The set was 201 KB on a single page with 21 h2, 123 h3 and
      // not one id on any of them, so nothing in it could be cited, linked or found. The
      // old fragment names keep working: /policies/#risk-assessment redirects to the
      // document that owns that anchor rather than 404ing an evidence link.
      const policyDoc = path.match(/^\/policies\/([a-z0-9-]+)\/?$/);
      if (policyDoc) {
        const doc = findGovernanceDoc(policyDoc[1]);
        if (!doc) return html(shell("Shark — Policy not found", governanceMissingHtml(policyDoc[1])), 404);
        if (!path.endsWith("/")) return movedTo(url, `/policies/${doc.id}/`);
        return html(shell(`Shark — ${doc.title}`, governanceDocPageHtml(doc), doc.purpose));
      }
      if (path === "/audit/manifest.json") return json(conformanceManifest());
      if (path === "/audit" || path === "/audit/") {
        return html(shell("Shark — ISO 27001 and 42001 register", conformanceHtml(metricCard)));
      }

      if (path === "/admin/status.json" || path === "/audit/status.json") {
        const res = await lobbyStub(env).fetch("https://lobby/status");
        const data = (await res.json()) as Record<string, unknown> & { maintenanceIncidents?: IncidentRecord[] };
        const incidents = [...INCIDENTS, ...(data.maintenanceIncidents ?? [])];
        return json({ ...data, availability: incidentSummary(incidents), incidents });
      }
      if (path === "/status.json") {
        const res = await lobbyStub(env).fetch("https://lobby/status");
        const data = (await res.json()) as Record<string, unknown> & { maintenanceIncidents?: IncidentRecord[]; billingWindow?: unknown; usage?: Record<string, unknown> };
        const incidents = [...INCIDENTS, ...(data.maintenanceIncidents ?? [])];
        const { billingWindow: _billing, usage = {}, ...publicData } = data;
        const { tankRequests: _requests, auditEvents: _auditEvents, storage: _storage, durableObjects: rawDurableObjects, ...publicUsageRest } = usage;
        const durableObjects = recordValue(rawDurableObjects);
        const publicUsage = { ...publicUsageRest, durableObjects: { tank: numberValue(durableObjects.tank), rooms: numberValue(durableObjects.rooms), total: numberValue(durableObjects.total) } };
        const tankAvailability = incidentSummary(incidents), portalAvailability = incidentSummary([]);
        return json({ ...publicData, usage: publicUsage, availability: tankAvailability, tankAvailability, portalAvailability, incidents });
      }
      // ── Operations. Availability, incidents, receipts, backups and delivery ────
      // Three routes folded into this one. Everything below was already reachable, but
      // spread across /status/, /incidents/ and /roadmap/, with the receipt chain rendered
      // twice and three headline numbers stated on pages that do not own them.
      if (path === "/status" || path === "/status/") {
        const [statusRes, { history: fullHistory, historyIntegrity }] = await Promise.all([
          lobbyStub(env).fetch("https://lobby/status"),
          incidentData(env),
        ]);
        const data = (await statusRes.json()) as {
          maintenance: MaintenanceState;
          usage: { uptimeMs: number; durableObjects: { tank: number; rooms: number; total: number } };
          rooms: Array<{ name: string; players: number; bots: number; capacity: number; topScore: number; topName: string }>;
          maintenanceIncidents?: IncidentRecord[];
          history?: ControlHistoryEntry[];
          historyIntegrity?: ControlHistoryIntegrity;
          backup?: BackupState;
          billingWindow?: Record<string, unknown>;
        };
        const players = data.rooms.reduce((n, r) => n + r.players, 0);
        const agents = data.rooms.reduce((n, r) => n + r.bots, 0);
        const incidents = [...INCIDENTS, ...(data.maintenanceIncidents ?? [])], availability = incidentSummary(incidents), portalAvailability = incidentSummary([]);
        const history = data.history ?? fullHistory;
        const integrity = data.historyIntegrity ?? historyIntegrity;
        // The agent count exists — it is `bots` on every row of this same response, and it
        // is what /api/tank has always returned. It was reachable only from behind the
        // authenticated dashboard, while DOC-25 stated twice, publicly, that the
        // availability page publishes it beside human occupancy. One column, and the
        // sentence is true at a public route instead of false.
        const roomRows = data.rooms
          .map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.players}</td><td>${r.bots}</td><td>${r.topScore}</td><td>${esc(r.topName)}</td></tr>`)
          .join("");
        return html(
          shell(
            "Shark — Operations",
            `<section class="page-intro"><div class="eyebrow">Trust · operations</div><h1>Operations</h1><p class="sub">Live availability for the server and for the tanks, every incident since the project started, the append-only receipt chain behind the controls that caused them, the state copies and restore drills, and the delivery record. <a href="/trust/">Trust overview →</a></p><p class="action-links"><a class="action-link" href="/status.json">Raw status JSON →</a> <a class="action-link" href="/incidents.json">Incident JSON →</a> <a class="action-link" href="/roadmap.json">Delivery JSON →</a></p></section>
             <div class="live-controls">
               <button type="button" id="status-autoupdate" class="secondary">Pause auto-update</button>
               <p class="sub">Live figures refresh every 15 seconds in place. Last updated <time id="status-updated-at">just now</time>.</p>
             </div>
             <p class="sr-only" id="status-live" role="status" aria-live="polite"></p>
             <div class="metric-grid status-metrics">
               ${metricCard(`${portalAvailability.availabilityPercent}%`, "Server availability", `${portalAvailability.unscheduledDowntimePercent}% unscheduled downtime`, "availability", "tone-green", "status-portal-availability")}
               ${metricCard(`${availability.availabilityPercent}%`, "Tank availability", `${availability.unscheduledDowntimePercent}% unscheduled downtime`, "availability", "tone-green", "status-tank-availability")}
               ${metricCard(formatCompactDuration(availability.scheduledDowntimeMs), "Scheduled downtime", "excluded from availability", "uptime", "tone-violet", "status-scheduled-downtime")}
               ${metricCard(data.maintenance.enabled ? "CLOSED" : "OPEN", "Tank access", data.maintenance.enabled ? "scheduled gate active" : `${players} active players`, "traffic", data.maintenance.enabled ? "tone-violet" : "tone-green", "status-tank-access")}
             </div>
             <div class="card hero-card"><h2 style="margin-top:0;font-size:1.1rem">Availability since project start</h2>${incidentTimelineSvg(incidents, Date.now(), history)}${timelineLegend(incidents, history)}</div>
             <div class="card"><h2 style="margin-top:0;font-size:1.1rem">Tank activity</h2>
               <p class="sub" style="margin:0 0 12px">${players} human ${players === 1 ? "player" : "players"} and ${agents} computer-controlled ${agents === 1 ? "agent" : "agents"} across the four tanks. Agents are rule-based: fixed steering and target selection, no model and no inference call.</p>
               <div class="table-scroll" role="region" aria-label="Tank activity" tabindex="0"><table class="capacity-table"><caption class="sr-only">Tank activity: human players and computer-controlled agents per tank</caption><thead><tr><th scope="col">Tank</th><th scope="col">Active players</th><th scope="col">Agents</th><th scope="col">Top score</th><th scope="col">Leader</th></tr></thead><tbody id="status-tank-rows">${roomRows}</tbody></table></div>
             </div>
             ${backupPanelHtml(data.backup)}
             ${incidentsSection(incidents, history)}
             ${controlHistoryListHtml(history, integrity)}
             ${deliverySection(ROADMAP_MANIFEST, incidents, history, publicBillingWindow(data.billingWindow ?? {}))}
             ${statusLiveScript()}`,
            "Live availability, the full incident record, the append-only control receipt chain, state copies and restore drills, and the delivery record for sharktank.wizardgang.ai.",
          ),
        );
      }

      // Full state export. Behind operations authentication because it is every profile
      // and every receipt in one body; the public evidence for backups is the shape and
      // timing panel on /status/, not the contents.
      if (path === "/admin/backup.json") {
        const data = await fetchStateExport(env);
        return data ? json({ ok: true, export: data }) : json({ ok: false, error: "export refused" }, 502);
      }
      // Take a copy now, outside the schedule.
      if (path === "/admin/backup/run" && request.method === "POST") {
        const result = await runBackup(env);
        return json(result, result.ok ? 200 : 500);
      }
      // Restore drill: restore live state into a scratch object and compare digests.
      // Never writes to live state, so it is safe to run while the game is up.
      if (path === "/admin/backup/drill" && request.method === "POST") {
        const result = await runRestoreDrill(env);
        return json(result, result.ok ? 200 : 500);
      }

      // User action log (90-day retention) as JSON / JSONL. `/audit.*` are the pre-move
      // names, kept working so operator tooling written against them does not break.
      if (path === "/admin/log.json" || path === "/audit.json") {
        return lobbyStub(env).fetch("https://lobby/audit" + url.search);
      }
      if (path === "/admin/log.jsonl" || path === "/audit.jsonl") {
        const res = await lobbyStub(env).fetch("https://lobby/audit" + url.search);
        const data = (await res.json()) as { events: unknown[] };
        return ndjson(data.events);
      }

      // Per-game deterministic log (3-day retention): seed + action stream.
      const gameLog = path.match(/^\/(?:admin|audit)\/game\/([^/]+?)(\.jsonl|\.json)?$/);
      if (gameLog) {
        const roomId = decodeURIComponent(gameLog[1]);
        const res = await roomFetch(env, roomId, "/log");
        const data = (await res.json()) as { events: unknown[] };
        if (gameLog[2] === ".jsonl") return ndjson(data.events);
        return json(data);
      }

      // Deterministic replay of a game's state at ?tick=T (rollback / fast-forward).
      const replayMatch = path.match(/^\/(?:admin|audit)\/replay\/([^/]+?)(\.json)?$/);
      if (replayMatch) {
        const roomId = decodeURIComponent(replayMatch[1]);
        return roomFetch(env, roomId, "/replay?tick=" + encodeURIComponent(url.searchParams.get("tick") ?? ""));
      }

      // Authenticated control room (HTML). Everything above this line under /admin/ is its
      // data; everything it does lands in the public record the conformance register cites.
      if (path === "/admin" || path === "/admin/") {
        return html(shell("Shark — Admin", adminViewerHtml()));
      }
    } catch (e) {
      // The message can carry internal paths, binding names and storage keys, and this
      // handler answers unauthenticated requests. It goes to the Worker log, where an
      // operator can read it, and never into the response body.
      console.error("unhandled request failure", path, e);
      return json({ ok: false, error: "internal error" }, 500);
    }

    // The SPA fallback is deliberately limited to the current game route. Previously every
    // unknown path — including retired UNO, X4, 21 and Checkers URLs — returned the same
    // Shark Tank document with a 200, which made distinct public routes appear duplicated.
    const gameShell = path === "/play/" || path === "/ts" || path === "/ts/" || path === "/php" || path === "/php/";
    const staticAsset = path.startsWith("/assets/");
    if (!gameShell && !staticAsset) {
      return html(shell("Shark Tank — Route not found", `<section><p class="eyebrow">404</p><h1>Route not found</h1><p>This Shark Tank route does not exist.</p><p><a class="button" href="/play/">Play Shark Tank</a></p></section>`, "The requested Shark Tank route does not exist."), 404);
    }

    // Game shell and immutable static assets.
    const asset = await env.ASSETS.fetch(request);
    const secured = new Response(asset.body, asset); for (const [key, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(key, value); secured.headers.set("content-security-policy", assetCsp(mintNonce())); return secured;
  },

  // Cron. One daily copy of tank state to object storage; see runBackup. The handler
  // never throws: a backup failure is recorded as a receipt and left visible on /status/,
  // because a scheduled job that fails quietly is how a backup gap goes unnoticed.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBackup(env).then((result) => { if (!result.ok) console.error("scheduled backup failed", result.error); }));
  },
};

function checkedOrigin(configured: string, workerOrigin: string): string | null {
  try { const value = new URL(configured); return value.protocol === "https:" && value.origin !== workerOrigin ? value.toString() : null; } catch { return null; }
}
