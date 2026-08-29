// OpenAPI 3.0 description of the Shark server's HTTP surface, plus a self-contained
// (no external CDN) server-side HTML renderer. `/docs/` renders this as HTML;
// `/docs/openapi.json` serves the raw document for tooling.
//
// Note: the realtime endpoint is a WebSocket upgrade. OpenAPI 3.0 has no first-class
// WebSocket type, so it's documented as the GET that performs the 101 upgrade, with the
// message protocol described in prose (the convention for OAS 3.0).

export const OPENAPI = {
  openapi: "3.0.3",
  info: {
    title: "Shark Tank Control API",
    version: "1.1.0",
  },
  servers: [{ url: "/", description: "This server" }],
  security: [],
  tags: [
    { name: "system", description: "Health and service metadata" },
    { name: "tank", description: "Ocean tanks, presence, and the global leaderboard" },
    { name: "profile", description: "Per-player cosmetics + settings" },
    { name: "realtime", description: "WebSocket gameplay" },
    { name: "ops", description: "Public status, incidents, billing inquiry, logs, the public ISO 27001 / ISO 42001 conformance register, and the authenticated Admin controls" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["system"],
        summary: "Liveness probe",
        description: "Returns module name and server time.",
        responses: {
          "200": jsonResponse("Healthy", "HealthResponse"),
        },
      },
    },
    "/api/tank": {
      get: {
        tags: ["tank"],
        summary: "List joinable tanks",
        description: "Stable catalog of ocean-named tanks with live player counts and top score.",
        responses: { "200": jsonResponse("Tank list", "TankResponse") },
      },
    },
    "/api/leaderboard": {
      get: {
        tags: ["tank"],
        summary: "Global leaderboard",
        description: "Top scores across all tanks, persisted by the control plane.",
        responses: { "200": jsonResponse("Top scores", "LeaderboardResponse") },
      },
    },
    "/api/profile": {
      get: {
        tags: ["profile"],
        summary: "Read a player profile",
        parameters: [idQuery()],
        responses: { "200": jsonResponse("Profile", "ProfileResponse") },
      },
      post: {
        tags: ["profile"],
        summary: "Upsert a player profile",
        parameters: [idQuery()],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Profile" } } },
        },
        responses: { "200": jsonResponse("Saved profile", "ProfileResponse") },
      },
    },
    "/api/security-report": {
      post: { tags: ["system"], summary: "Report a security issue", description: "Same-origin public white-hat intake. One request creates a linked report, a retained audit event, and an append-only SHA-256 control-history receipt, and raises the report to operations. It does not change service state: the game stays online, no incident is opened, and no tank is disconnected. Whether a report warrants downtime is a separate authenticated operator decision made at /admin/security-report. Accepted reports are throttled globally to one per minute. Returned metadata is limited to environment, deployment, colo, and country; it contains no secrets or IP data. A report is not confirmation of compromise.", parameters: [{ name: "X-WG-Security-Report", in: "header", required: true, schema: { type: "string", enum: ["white-hat"] } }], responses: { "200": jsonResponse("Security report receipt"), "403": { description: "Same-origin report required" }, "429": { description: "A security report was accepted moments ago" }, "502": { description: "Report could not be persisted" } } },
    },
    "/room/{id}/ws": {
      get: {
        tags: ["realtime"],
        summary: "Realtime play (WebSocket upgrade)",
        description:
          "Upgrades the connection (HTTP 101) into the tank's realtime Room. **Client → server** messages: `{t:'hello',name,skin,debugLanguage}`, `{t:'debug',language}` (selected TypeScript/PHP capture tag), `{t:'input',action}` (action = setHeading/setBoost/rocket/respawn), `{t:'ping',ts}`. **Server → client**: `welcome`, `state` (per-tick snapshot), `leaderboard`, `died`, `pong`.",
        parameters: [
          { name: "id", in: "path", required: true, description: "Tank id (e.g. room-1)", schema: { type: "string" } },
          { name: "roomName", in: "query", required: false, description: "Display name for the tank", schema: { type: "string" } },
        ],
        responses: {
          "101": { description: "Switching Protocols — WebSocket established" },
          "426": { description: "Upgrade Required — request was not a WebSocket upgrade" },
        },
      },
    },
    "/docs/": {
      get: {
        tags: ["ops"],
        summary: "API documentation (this page)",
        description: "Renders this OpenAPI document as HTML. Raw document at /docs/openapi.json.",
        responses: { "200": htmlResponse("HTML documentation") },
      },
    },
    "/docs/openapi.json": {
      get: {
        tags: ["ops"],
        summary: "OpenAPI document",
        responses: { "200": jsonResponse("OpenAPI 3.0 document") },
      },
    },
    "/roadmap/": {
      get: {
        tags: ["ops"],
        summary: "Mission, availability, and feature-to-deployment map",
        description: "Presents the one-day Portal Framework mission, project goals, independent server and tank availability, eight-hour elapsed delivery, commit velocity, feature updates, and deployment batches.",
        responses: { "200": htmlResponse("HTML roadmap") },
      },
    },
    "/roadmap.json": {
      get: {
        tags: ["ops"],
        summary: "Mission and feature-to-deployment map (JSON)",
        responses: { "200": jsonResponse("Availability, delivery velocity, elapsed time, deployment batches, and feature updates") },
      },
    },
    "/status/": {
      get: {
        tags: ["ops"],
        summary: "Status dashboard",
        description: "Server availability, scheduled tank downtime, unscheduled outages, and tank presence. Billing remains in Inquiry and authenticated Admin.",
        responses: { "200": htmlResponse("HTML dashboard") },
      },
    },
    "/status.json": {
      get: {
        tags: ["ops"],
        summary: "Status (JSON)",
        responses: { "200": jsonResponse("Independent server and tank availability, scheduled downtime, rooms, incidents, and control receipts", "StatusResponse") },
      },
    },
    "/incidents/": {
      get: { tags: ["ops"], summary: "Public incident and control history", description: "Resolved and active maintenance incidents with an availability timeline measured from project start, and human-readable append-only control receipts.", responses: { "200": htmlResponse("Incident dashboard") } },
    },
    "/incidents.json": {
      get: { tags: ["ops"], summary: "Public incident and control history (JSON)", responses: { "200": jsonResponse("Availability summary, incident records, control entries, and SHA-256 chain head") } },
    },
    "/inquiry/": {
      get: { tags: ["ops"], summary: "Public billable-action inquiry", description: "Proof-of-concept dashboard linking normal game and operations actions to measured Workers, Durable Objects, D1, and R2 usage and summarized spend.", responses: { "200": htmlResponse("Public billing inquiry") } },
    },
    "/inquiry.json": {
      get: { tags: ["ops"], summary: "Public billable-action inquiry (JSON)", responses: { "200": jsonResponse("Proof-of-concept statement and reset-window billing summary") } },
    },
    "/logs/": {
      get: { tags: ["ops"], summary: "Public reason-coded logs", description: "Searchable, filterable service evidence with 90-day retention plus the 40 newest reason-coded captures per ocean tank and sanitized TXT downloads.", responses: { "200": htmlResponse("Public Shark Tank log inquiry") } },
    },
    "/logs.json": {
      get: { tags: ["ops"], summary: "Public service and tank logs (JSON)", description: "Every row includes a letter-plus-three-digit reason code. Tank records use the same timestamp, reasonCode, tick, action, language, name, and details fields as the live inspector and TXT export.", responses: { "200": jsonResponse("Public service and tank event stream") } },
    },
    "/logs/game/{id}.txt": {
      get: { tags: ["ops"], summary: "Download a sanitized Shark Tank log", description: "Plain UTF-8 text with timestamp,reason_code,tick,action,language,name,details comma-separated fields and newline-separated records. Internal player ids are omitted.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Downloadable TXT log", content: { "text/plain": { schema: { type: "string" } } } }, "404": { description: "Unknown tank" } } },
    },
    "/audit/": {
      get: {
        tags: ["ops"],
        summary: "ISO/IEC 27001 and ISO/IEC 42001 conformance register",
        description: "Public, unauthenticated readiness register: every clause of ISO/IEC 27001:2022 and ISO/IEC 42001:2023, all 93 Annex A controls, all 38 AI controls, the fourteen documented change-management processes, the Stage 1 documented-information list, and an index of every route that serves as evidence. Each row carries a status, the justification behind it, and links to the live routes that prove it. This is a readiness statement, not a certificate.",
        responses: { "200": htmlResponse("Conformance register") },
      },
    },
    "/audit/manifest.json": {
      get: {
        tags: ["ops"],
        summary: "Conformance register (JSON)",
        description: "The same register as machine-readable data, for independent scoring or import into a compliance tool.",
        responses: { "200": jsonResponse("Standards, status meanings, readiness summary, change processes, mandatory documents, control registers, and the evidence index") },
      },
    },
    "/admin/": {
      get: {
        tags: ["ops"],
        summary: "Operations control panel",
        description: "Protected HTML dashboard for action records, measured billing counters, billing reset, and maintenance mode. Formerly served at /audit/, which is now the public conformance register.",
        security: [{ opsBasic: [] }], responses: { "200": htmlResponse("Control panel"), "401": { description: "Operations authentication required" } },
      },
    },
    "/admin/log.json": {
      get: {
        tags: ["ops"],
        summary: "Action log (JSON array)",
        description: "90-day user and service action record. Also served at the pre-move path /audit.json.",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 500 } }],
        security: [{ opsBasic: [] }], responses: { "200": jsonResponse("Audit events"), "401": { description: "Operations authentication required" } },
      },
    },
    "/admin/log.jsonl": {
      get: { tags: ["ops"], summary: "Action log (newline-delimited JSON)", description: "Also served at the pre-move path /audit.jsonl.", security: [{ opsBasic: [] }], responses: { "200": { description: "Audit event stream", content: { "application/x-ndjson": { schema: { type: "string" } } } }, "401": { description: "Operations authentication required" } } },
    },
    "/admin/game/{id}.jsonl": {
      get: { tags: ["ops"], summary: "Authenticated replayable room action log", description: "Seed plus the ordered action stream for one tank — the ISO/IEC 42001 A.6.2.8 event record. Also served at /audit/game/{id}.jsonl.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], security: [{ opsBasic: [] }], responses: { "200": { description: "Room actions with internal replay identifiers", content: { "application/x-ndjson": { schema: { type: "string" } } } }, "401": { description: "Operations authentication required" } } },
    },
    "/admin/replay/{id}": {
      get: { tags: ["ops"], summary: "Reconstruct a room at a retained tick", description: "Deterministic reconstruction of authoritative state, including every autonomous agent, at a chosen tick. Also served at /audit/replay/{id}.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "tick", in: "query", required: false, schema: { type: "integer", maximum: 100000 } }], security: [{ opsBasic: [] }], responses: { "200": jsonResponse("Reconstructed authoritative state"), "401": { description: "Operations authentication required" }, "410": { description: "Complete replay history expired" } } },
    },
    "/admin/status.json": {
      get: { tags: ["ops"], summary: "Private operational status and billing data", description: "The unredacted operational record, including the running version identifier and instance residency. Also served at /audit/status.json.", security: [{ opsBasic: [] }], responses: { "200": jsonResponse("Full status, audit counters, and billing window"), "401": { description: "Operations authentication required" } } },
    },
    "/admin/maintenance": {
      post: {
        tags: ["ops"], summary: "Enable or disable maintenance mode",
        description: "Same-origin Admin action. Enabling creates a separate operator-maintenance incident, closes active WebSockets, and returns the controlled 503 page for the game shell, game assets, and tank traffic while Roadmap, API, Docs, Status, Incidents, Inquiry, Logs, the conformance register, and Admin remain online. Disabling records the end of service impact but leaves independent security reports active until separately resolved. Every transition is persisted to the action log and the control-history receipt chain.",
        security: [{ opsBasic: [] }],
        parameters: [{ name: "X-WG-Ops-Action", in: "header", required: true, schema: { type: "string", enum: ["maintenance"] } }],
        requestBody: { required: true, content: { "application/json": { schema: obj({ enabled: { type: "boolean" }, reason: str() }) } } },
        responses: { "200": jsonResponse("Maintenance state"), "401": { description: "Operations authentication required" } },
      },
    },
    "/admin/billing-reset": {
      post: {
        tags: ["ops"], summary: "Reset the billing measurement window",
        description: "Resets measured billing baselines without resetting service uptime or status history.",
        security: [{ opsBasic: [] }],
        parameters: [{ name: "X-WG-Ops-Action", in: "header", required: true, schema: { type: "string", enum: ["billing-reset"] } }],
        responses: { "200": jsonResponse("Fresh billing window"), "401": { description: "Operations authentication required" } },
      },
    },
    "/admin/security-resolve": {
      post: {
        tags: ["ops"], summary: "Resolve owner-confirmed security exercises",
        description: "Resolves open white-hat reports as owner-confirmed dry runs without changing the separate maintenance gate. Appends one immutable resolution receipt per report.",
        security: [{ opsBasic: [] }],
        parameters: [{ name: "X-WG-Ops-Action", in: "header", required: true, schema: { type: "string", enum: ["security-resolve"] } }],
        requestBody: { required: true, content: { "application/json": { schema: obj({ ownerConfirmed: { type: "boolean", enum: [true] }, dryRun: { type: "boolean", enum: [true] }, note: str() }) } } },
        responses: { "200": jsonResponse("Owner-confirmed resolution receipts"), "400": { description: "Owner confirmation and dry-run flag required" }, "401": { description: "Operations authentication required" } },
      },
    },
    "/admin/security-report": {
      post: {
        tags: ["ops"], summary: "File a security report and take the game down",
        description: "Same-origin Admin action. Records the same report, audit event, and control-history receipt as the public intake, and additionally opens an active security incident, enables game maintenance, and disconnects active tanks pending operator review. Restoring game traffic records the end of service impact but does not resolve or close the security report; that is /admin/security-resolve. At most one security-report lockdown is open at a time — a repeat call while one is open returns the existing incident and creates no second incident or receipt. Roadmap, Status, Incidents, Inquiry, Logs, Docs, API, the conformance register, and authenticated Admin remain available throughout.",
        security: [{ opsBasic: [] }],
        parameters: [{ name: "X-WG-Ops-Action", in: "header", required: true, schema: { type: "string", enum: ["security-report"] } }],
        responses: { "200": jsonResponse("Linked lockdown and report receipt"), "401": { description: "Operations authentication required" }, "403": { description: "Same-origin operation required" }, "502": { description: "Report and lockdown could not be persisted" } },
      },
    },
    "/admin/test-alert": {
      post: { tags: ["ops"], summary: "Send an authenticated test alert", description: "Accepts exactly one ASCII letter followed by three digits, normalizes the letter uppercase, and records the acknowledgement in the action log.", security: [{ opsBasic: [] }], parameters: [{ name: "X-WG-Ops-Action", in: "header", required: true, schema: { type: "string", enum: ["test-alert"] } }], requestBody: { required: true, content: { "application/json": { schema: obj({ code: { type: "string", pattern: "^[A-Za-z][0-9]{3}$", minLength: 4, maxLength: 4 } }) } } }, responses: { "200": jsonResponse("Test alert receipt"), "400": { description: "Code does not match letter-digit-digit-digit" }, "401": { description: "Operations authentication required" } } },
    },
  },
  components: {
    securitySchemes: { opsBasic: { type: "http", scheme: "basic", description: "Any username; OPS_TOKEN is the password." } },
    schemas: {
      HealthResponse: obj({ ok: bool(true), module: str(), time: str("date-time") }),
      TankRoom: obj({ id: str(), name: str(), players: int(), bots: int(), capacity: int(), topScore: int(), topName: str() }),
      TankResponse: obj({ ok: bool(true), rooms: arr("TankRoom") }),
      ScoreEntry: obj({ id: str(), name: str(), skin: str(), score: int(), alive: { type: "boolean" } }),
      LeaderboardResponse: obj({ ok: bool(true), entries: arr("ScoreEntry") }),
      Profile: obj({ name: str(), skin: str(), best: int(), settings: { type: "object", additionalProperties: true } }),
      ProfileResponse: obj({ ok: bool(true), profile: { $ref: "#/components/schemas/Profile" } }),
      AuditEvent: obj({
        ts: int("Unix ms timestamp"),
        type: { type: "string", enum: ["room-boot", "join", "leave", "death", "play", "customize", "skin", "settings", "nav", "quit", "maintenance-on", "maintenance-off", "billing-reset", "billing-hard-stop", "security-report", "security-resolved", "test-alert"] },
        room: str(),
        subject: str("Player/shark name"),
        detail: str(),
      }),
      ControlHistoryEntry: obj({
        sequence: int("Monotonic receipt sequence"),
        ts: int("Unix ms timestamp"),
        code: str("Stable control code"),
        actor: str("Control actor class"),
        title: str(),
        summary: str(),
        reference: str("Linked report, incident, alert, or billing-window id"),
        detail: str(),
        previousHash: str("Previous SHA-256 receipt"),
        hash: str("SHA-256 receipt for this entry"),
      }),
      Usage: obj({
        startedAt: int(),
        uptimeMs: int(),
        presenceReports: int(),
        durableObjects: obj({ tank: int(), rooms: int(), total: int() }),
      }),
      Availability: obj({
        windowHours: int(),
        uptimeMs: int(),
        downtimeMs: int("Alias for unscheduled downtime"),
        scheduledDowntimeMs: int(),
        unscheduledDowntimeMs: int(),
        availabilityPercent: { type: "number" },
        scheduledDowntimePercent: { type: "number" },
        unscheduledDowntimePercent: { type: "number" },
        calculatedAt: str("date-time"),
      }),
      StatusResponse: obj({
        ok: bool(true),
        maintenance: obj({ enabled: { type: "boolean" }, changedAt: int(), reason: str() }),
        usage: { $ref: "#/components/schemas/Usage" },
        history: arr("ControlHistoryEntry"),
        historyIntegrity: obj({ mode: str(), algorithm: str(), entryCount: int(), headHash: str() }),
        rooms: arr("TankRoom"),
        global: arr("ScoreEntry"),
        portalAvailability: { $ref: "#/components/schemas/Availability" },
        tankAvailability: { $ref: "#/components/schemas/Availability" },
      }),
      ErrorResponse: obj({ ok: bool(false), error: str() }),
    },
  },
} as const;

// ── tiny schema builders (keep the spec above readable) ──────────────────────────
function str(format?: string) {
  return format && format === "date-time" ? { type: "string", format } : format ? { type: "string", description: format } : { type: "string" };
}
function int(description?: string) {
  return description ? { type: "integer", description } : { type: "integer" };
}
function bool(constVal: boolean) {
  return { type: "boolean", example: constVal };
}
function arr(ref: string) {
  return { type: "array", items: { $ref: `#/components/schemas/${ref}` } };
}
function obj(properties: Record<string, unknown>) {
  return { type: "object", properties };
}
function jsonResponse(description: string, schemaRef?: string) {
  return {
    description,
    content: { "application/json": { schema: schemaRef ? { $ref: `#/components/schemas/${schemaRef}` } : { type: "object" } } },
  };
}
function htmlResponse(description: string) {
  return { description, content: { "text/html": { schema: { type: "string" } } } };
}
function idQuery() {
  return { name: "id", in: "query", required: false, description: "Player id (default: local)", schema: { type: "string" } };
}

// ── HTML renderer (server-side, self-contained) ─────────────────────────────────
type AnyRec = Record<string, unknown>;
const METHOD_CLASS: Record<string, string> = { get: "g", post: "o", put: "o", delete: "d", ws: "v" };

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** Turn a `#/components/schemas/Name` ref into a linked schema name. */
function refName(ref: string): string {
  const name = ref.split("/").pop() ?? ref;
  return `<a href="#schema-${esc(name)}">${esc(name)}</a>`;
}

function schemaSummary(schema: AnyRec): string {
  if (!schema) return "";
  if (typeof schema.$ref === "string") return refName(schema.$ref);
  if (schema.type === "array" && schema.items) return `array of ${schemaSummary(schema.items as AnyRec)}`;
  if (schema.enum) return `enum: ${(schema.enum as string[]).map((e) => `<code>${esc(String(e))}</code>`).join(", ")}`;
  if (schema.type) return `<code>${esc(String(schema.type))}${schema.format ? ` (${esc(String(schema.format))})` : ""}</code>`;
  return "";
}

function renderParams(params: AnyRec[], context: string): string {
  if (!params || params.length === 0) return "";
  const rows = params
    .map(
      (p) =>
        `<tr><td><code>${esc(String(p.name))}</code></td><td>${esc(String(p.in))}</td><td>${p.required ? "yes" : "no"}</td><td>${schemaSummary(p.schema as AnyRec)}</td><td>${esc(String(p.description ?? ""))}</td></tr>`,
    )
    .join("");
  return `<h3>Parameters</h3><div class="table-scroll" role="region" aria-label="${esc(context)} parameters" tabindex="0"><table class="api-table"><thead><tr><th>Name</th><th>In</th><th>Req</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderBody(body: AnyRec | undefined): string {
  if (!body) return "";
  const content = body.content as AnyRec;
  const media = Object.keys(content ?? {})[0];
  const schema = media ? ((content[media] as AnyRec).schema as AnyRec) : undefined;
  return `<h3>Request body${body.required ? " (required)" : ""}</h3><p><code>${esc(media ?? "")}</code> → ${schema ? schemaSummary(schema) : ""}</p>`;
}

function renderResponses(responses: AnyRec, context: string): string {
  const rows = Object.entries(responses)
    .map(([code, r]) => {
      const rr = r as AnyRec;
      const content = rr.content as AnyRec | undefined;
      const media = content ? Object.keys(content)[0] : "";
      const schema = media && content ? ((content[media] as AnyRec).schema as AnyRec) : undefined;
      const type = schema ? ` — <code>${esc(media)}</code> ${schemaSummary(schema)}` : "";
      return `<tr><td><code>${esc(code)}</code></td><td>${esc(String(rr.description ?? ""))}${type}</td></tr>`;
    })
    .join("");
  return `<h3>Responses</h3><div class="table-scroll" role="region" aria-label="${esc(context)} responses" tabindex="0"><table class="api-table"><thead><tr><th>Status</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSchemas(schemas: AnyRec): string {
  const blocks = Object.entries(schemas)
    .map(([name, sch]) => {
      const s = sch as AnyRec;
      const props = (s.properties as AnyRec) ?? {};
      const rows = Object.entries(props)
        .map(([pname, psch]) => `<tr><td><code>${esc(pname)}</code></td><td>${schemaSummary(psch as AnyRec)}</td></tr>`)
        .join("");
      return `<div class="card" id="schema-${esc(name)}"><h3 style="margin:0 0 8px">${esc(name)}</h3><div class="table-scroll" role="region" aria-label="${esc(name)} schema" tabindex="0"><table class="schema-table"><tbody>${rows}</tbody></table></div></div>`;
    })
    .join("");
  return `<h2 id="schemas">Schemas</h2>${blocks}`;
}

/** Stable per-operation anchor: method plus path, so `/api/tank` becomes `op-get-api-tank`. */
const operationId = (method: string, path: string) =>
  `op-${method.toLowerCase()}-${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;

/**
 * Render the OpenAPI document as the inner HTML for the docs page.
 *
 * Each operation is an `<h2>` rather than a styled `<div>`, which is what lets a screen
 * reader's heading list act as the table of contents for thirty-odd endpoints; the section
 * headings inside sit at `<h3>` so the page runs h1 → h2 → h3 with no skipped level. The
 * `<nav>` index above the cards is the same list for everyone else, and doubles as the
 * page's way past the intro.
 */
export function openApiToHtml(spec: typeof OPENAPI): string {
  const info = spec.info;
  const paths = spec.paths as AnyRec;
  const entries = Object.entries(paths).flatMap(([path, item]) =>
    Object.entries(item as AnyRec).map(([method, op]) => ({ path, method, op: op as AnyRec })),
  );
  const operations = entries
    .map(({ path, method, op }) => {
      const cls = METHOD_CLASS[method] ?? "g";
      // The heading reads "GET /api/tank": the pill carries the method and the code element
      // the path, so the visual route line and the accessible name are the same string.
      const context = `${method.toUpperCase()} ${path}`;
      return `<div class="card api-card ${cls}">
        <h2 class="api-route" id="${esc(operationId(method, path))}">
          <span class="m method-pill ${cls}">${esc(method.toUpperCase())}</span> <code style="font-size:1rem">${esc(path)}</code>
        </h2>
        <p class="api-summary">${esc(String(op.summary ?? ""))}</p>
        ${op.description ? `<p style="margin:6px 0 0;color:#b9b4d6">${esc(String(op.description))}</p>` : ""}
        ${renderParams(op.parameters as AnyRec[], context)}
        ${renderBody(op.requestBody as AnyRec)}
        ${renderResponses(op.responses as AnyRec, context)}
      </div>`;
    })
    .join("");
  const index = entries
    .map(({ path, method }) => {
      const cls = METHOD_CLASS[method] ?? "g";
      return `<li><a href="#${esc(operationId(method, path))}"><span class="m method-pill ${cls}" aria-hidden="true">${esc(method.toUpperCase())}</span><code>${esc(path)}</code></a></li>`;
    })
    .join("");

  return `<section class="page-intro"><div class="eyebrow">Feed the integrations</div><h1>${esc(info.title)}</h1>
    <a class="action-link" href="/docs/openapi.json">OpenAPI 3.0 · raw JSON →</a></section>
    <nav class="card api-index" aria-labelledby="api-index-heading"><h2 id="api-index-heading" style="margin:0 0 10px;font-size:1.05rem">${entries.length} operations</h2><ul>${index}<li><a href="#schemas"><span class="m method-pill v" aria-hidden="true">DATA</span><code>Schemas</code></a></li></ul></nav>
    ${operations}
    ${renderSchemas((spec.components as AnyRec).schemas as AnyRec)}`;
}
