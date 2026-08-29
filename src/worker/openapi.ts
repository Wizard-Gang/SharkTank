// OpenAPI 3.0 description of the Snake server's HTTP surface, plus a self-contained
// (no external CDN) server-side HTML renderer. `/docs/` renders this as HTML;
// `/docs/openapi.json` serves the raw document for tooling.
//
// Note: the realtime endpoint is a WebSocket upgrade. OpenAPI 3.0 has no first-class
// WebSocket type, so it's documented as the GET that performs the 101 upgrade, with the
// message protocol described in prose (the convention for OAS 3.0).

export const OPENAPI = {
  openapi: "3.0.3",
  info: {
    title: "Snake Arena API",
    version: "1.0.0",
    description:
      "HTTP + realtime API for the Snake Arena game. Realtime play flows over a WebSocket into a per-arena **Room** Durable Object; presence, the global leaderboard, usage metrics and the audit trail live in a single **Lobby** Durable Object.",
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    { name: "system", description: "Health and service metadata" },
    { name: "lobby", description: "Arenas, presence, and the global leaderboard" },
    { name: "profile", description: "Per-player cosmetics + settings" },
    { name: "realtime", description: "WebSocket gameplay" },
    { name: "ops", description: "Docs, status dashboard, and audit trail" },
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
    "/api/lobby": {
      get: {
        tags: ["lobby"],
        summary: "List joinable arenas",
        description: "Stable catalog of arenas with live player counts and top score (updated as rooms report in).",
        responses: { "200": jsonResponse("Arena list", "LobbyResponse") },
      },
    },
    "/api/leaderboard": {
      get: {
        tags: ["lobby"],
        summary: "Global leaderboard",
        description: "Top scores across all arenas, persisted in the Lobby Durable Object.",
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
    "/room/{id}/ws": {
      get: {
        tags: ["realtime"],
        summary: "Realtime play (WebSocket upgrade)",
        description:
          "Upgrades the connection (HTTP 101) into the arena's Room Durable Object. **Client → server** messages: `{t:'hello',name,skin}`, `{t:'input',action}` (action = setHeading/setBoost/respawn), `{t:'ping',ts}`. **Server → client**: `welcome`, `state` (per-tick snapshot), `leaderboard`, `died`, `pong`.",
        parameters: [
          { name: "id", in: "path", required: true, description: "Arena id (e.g. room-1)", schema: { type: "string" } },
          { name: "roomName", in: "query", required: false, description: "Display name for the arena", schema: { type: "string" } },
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
    "/status/": {
      get: {
        tags: ["ops"],
        summary: "Status dashboard",
        description: "Live Durable Object usage + arena presence as an auto-refreshing HTML dashboard.",
        responses: { "200": htmlResponse("HTML dashboard") },
      },
    },
    "/status.json": {
      get: {
        tags: ["ops"],
        summary: "Status (JSON)",
        responses: { "200": jsonResponse("Usage + rooms + global", "StatusResponse") },
      },
    },
    "/audit/": {
      get: {
        tags: ["ops"],
        summary: "Audit trail (JSONL)",
        description: "Recent join/leave/death/room-boot events, one JSON object per line (application/x-ndjson).",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 500 } }],
        responses: {
          "200": {
            description: "Newline-delimited JSON",
            content: { "application/x-ndjson": { schema: { $ref: "#/components/schemas/AuditEvent" } } },
          },
        },
      },
    },
    "/audit.json": {
      get: {
        tags: ["ops"],
        summary: "Audit trail (JSON array)",
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 500 } }],
        responses: { "200": jsonResponse("Audit events") },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: obj({ ok: bool(true), module: str(), time: str("date-time") }),
      LobbyRoom: obj({ id: str(), name: str(), players: int(), capacity: int(), topScore: int(), topName: str() }),
      LobbyResponse: obj({ ok: bool(true), rooms: arr("LobbyRoom") }),
      ScoreEntry: obj({ id: str(), name: str(), skin: str(), score: int(), alive: { type: "boolean" } }),
      LeaderboardResponse: obj({ ok: bool(true), entries: arr("ScoreEntry") }),
      Profile: obj({ name: str(), skin: str(), best: int(), settings: { type: "object", additionalProperties: true } }),
      ProfileResponse: obj({ ok: bool(true), profile: { $ref: "#/components/schemas/Profile" } }),
      AuditEvent: obj({
        ts: int("Unix ms timestamp"),
        type: { type: "string", enum: ["room-boot", "join", "leave", "death"] },
        room: str(),
        subject: str("Player/snake name"),
        detail: str(),
      }),
      Usage: obj({
        startedAt: int(),
        uptimeMs: int(),
        lobbyRequests: int(),
        presenceReports: int(),
        auditEvents: int(),
        durableObjects: obj({ lobby: int(), rooms: int(), total: int() }),
      }),
      StatusResponse: obj({
        ok: bool(true),
        usage: { $ref: "#/components/schemas/Usage" },
        rooms: arr("LobbyRoom"),
        global: arr("ScoreEntry"),
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

function renderParams(params: AnyRec[]): string {
  if (!params || params.length === 0) return "";
  const rows = params
    .map(
      (p) =>
        `<tr><td><code>${esc(String(p.name))}</code></td><td>${esc(String(p.in))}</td><td>${p.required ? "yes" : "no"}</td><td>${schemaSummary(p.schema as AnyRec)}</td><td>${esc(String(p.description ?? ""))}</td></tr>`,
    )
    .join("");
  return `<h4>Parameters</h4><table><thead><tr><th>Name</th><th>In</th><th>Req</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderBody(body: AnyRec | undefined): string {
  if (!body) return "";
  const content = body.content as AnyRec;
  const media = Object.keys(content ?? {})[0];
  const schema = media ? ((content[media] as AnyRec).schema as AnyRec) : undefined;
  return `<h4>Request body${body.required ? " (required)" : ""}</h4><p><code>${esc(media ?? "")}</code> → ${schema ? schemaSummary(schema) : ""}</p>`;
}

function renderResponses(responses: AnyRec): string {
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
  return `<h4>Responses</h4><table><thead><tr><th>Status</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSchemas(schemas: AnyRec): string {
  const blocks = Object.entries(schemas)
    .map(([name, sch]) => {
      const s = sch as AnyRec;
      const props = (s.properties as AnyRec) ?? {};
      const rows = Object.entries(props)
        .map(([pname, psch]) => `<tr><td><code>${esc(pname)}</code></td><td>${schemaSummary(psch as AnyRec)}</td></tr>`)
        .join("");
      return `<div class="card" id="schema-${esc(name)}"><h3 style="margin:0 0 8px">${esc(name)}</h3><table><tbody>${rows}</tbody></table></div>`;
    })
    .join("");
  return `<h2 id="schemas">Schemas</h2>${blocks}`;
}

/** Render the OpenAPI document as the inner HTML for the docs page. */
export function openApiToHtml(spec: typeof OPENAPI): string {
  const info = spec.info;
  const paths = spec.paths as AnyRec;
  const operations = Object.entries(paths)
    .flatMap(([path, item]) =>
      Object.entries(item as AnyRec).map(([method, op]) => ({ path, method, op: op as AnyRec })),
    )
    .map(({ path, method, op }) => {
      const cls = METHOD_CLASS[method] ?? "g";
      return `<div class="card">
        <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
          <span class="m ${cls}">${esc(method.toUpperCase())}</span><code style="font-size:1rem">${esc(path)}</code>
        </div>
        <p style="margin:6px 0 0;font-weight:600">${esc(String(op.summary ?? ""))}</p>
        ${op.description ? `<p style="margin:6px 0 0;color:#b9b4d6">${esc(String(op.description))}</p>` : ""}
        ${renderParams(op.parameters as AnyRec[])}
        ${renderBody(op.requestBody as AnyRec)}
        ${renderResponses(op.responses as AnyRec)}
      </div>`;
    })
    .join("");

  return `<h1>${esc(info.title)} <span style="color:#b9b4d6;font-size:1rem;font-weight:600">v${esc(info.version)}</span></h1>
    <p class="sub">${esc(info.description)}</p>
    <p class="sub">OpenAPI 3.0 · raw document at <a href="/docs/openapi.json">/docs/openapi.json</a></p>
    ${operations}
    ${renderSchemas((spec.components as AnyRec).schemas as AnyRec)}`;
}
