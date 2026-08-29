#!/usr/bin/env node
/**
 * Evidence-link checker for the conformance register.
 *
 * Walks /audit/manifest.json and fetches every evidence href under changeManagement,
 * mandatoryDocuments and registers[].controls. A public route must answer 200; a route
 * marked `auth: true` must answer 401. Where an href carries a #fragment, the fragment
 * must exist as an id= in the returned HTML -- that is the check that catches a renamed
 * document anchor, which is the failure this register is most likely to produce.
 *
 * A 200 is not on its own evidence that a route exists. An earlier deployment sent every
 * unrouted path through the game shell, so the check that was meant to catch a deleted route
 * could not. Unknown routes now answer 404, and each successful response is still required
 * to carry something only the real page emits:
 *
 *   - server-rendered pages: the trust nav landmark, which the SPA shell does not contain;
 *   - JSON routes: an application/json content-type, which the HTML fallback cannot claim;
 *   - operator routes: nothing beyond the 401, which is already the whole assertion;
 *   - `/play/`: the game shell itself, which is the one route whose correct answer IS the shell.
 *
 * Deliberately no table of per-route expected strings: that would have to be maintained
 * alongside every page and would rot into a second source of truth.
 *
 * Also runs the mechanical honesty check: no control with status "met" may have an empty
 * evidence array, or an evidence array in which no entry carries an href. A row that
 * claims met without a route an assessor can open is exactly what this register exists
 * to prevent.
 *
 * Usage: node scripts/check-evidence.mjs [baseUrl]   (default http://127.0.0.1:8787)
 */

const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const bust = () => `cb=${Math.random().toString(36).slice(2)}`;
const withBust = (path) => `${base}${path}${path.includes("?") ? "&" : "?"}${bust()}`;

/**
 * Emitted by shell() in src/worker/index.ts on every server-rendered page, and by nothing
 * the SPA serves. If the trust nav is ever renamed this check fails everywhere at once,
 * which is the right failure: it is load-bearing for the register's central guarantee.
 */
const TRUST_MARKER = '<nav aria-label="Trust and operations">';
/** The mount point in index.html. `/play/` is evidence that the game is served, and the shell is it. */
const GAME_SHELL_MARKER = '<div id="root"';

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL  ${msg}`); };

async function main() {
  const manifestUrl = withBust("/audit/manifest.json");
  const res = await fetch(manifestUrl, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) { console.error(`cannot read /audit/manifest.json -- ${res.status}`); process.exit(1); }
  const manifest = await res.json();

  /* Collect every evidence entry with the row it came from, so a failure names its source. */
  const items = [];
  const push = (source, list) => {
    for (const e of list || []) if (e && e.href) items.push({ source, href: e.href, auth: Boolean(e.auth), label: e.label });
  };
  for (const p of manifest.changeManagement || []) push(`change ${p.id}`, p.evidence);
  for (const d of manifest.mandatoryDocuments || []) push(`document ${d.ref}`, d.evidence);
  for (const r of manifest.registers || []) for (const c of r.controls || []) push(`${r.standard} ${c.ref}`, c.evidence);

  /* Fetch each distinct href once; a route repeated across rows is one request. */
  const byHref = new Map();
  for (const item of items) {
    const key = `${item.href}|${item.auth}`;
    if (!byHref.has(key)) byHref.set(key, { ...item, sources: [] });
    byHref.get(key).sources.push(item.source);
  }

  console.log(`Evidence links: ${byHref.size} distinct across ${items.length} rows`);
  for (const entry of byHref.values()) {
    const [path, fragment] = entry.href.split("#");
    const expect = entry.auth ? 401 : 200;
    let r;
    try {
      r = await fetch(withBust(path), { headers: { "cache-control": "no-cache" }, redirect: "manual" });
    } catch (err) {
      fail(`${entry.href} -- request failed (${err.message}) [${entry.sources[0]}]`);
      continue;
    }
    if (r.status !== expect) { fail(`${entry.href} -- expected ${expect}, got ${r.status} [${entry.sources[0]}]`); continue; }
    /* A 401 is the entire assertion for an operator route: there is no body to inspect. */
    if (entry.auth) continue;

    const type = r.headers.get("content-type") || "";
    const body = await r.text();

    /* JSON evidence. The fallback serves HTML, so a content-type is enough to tell them
       apart, and a fragment on a JSON route would mean nothing. */
    if (path.endsWith(".json") || path.endsWith(".jsonl")) {
      if (!type.includes("json")) fail(`${entry.href} -- answered 200 as ${type || "no content-type"}, so this is the SPA fallback and not the JSON route [${entry.sources[0]}]`);
      continue;
    }

    /* HTML evidence. Require the marker the real page emits, or the 200 proves nothing. */
    if (path === "/play/") {
      if (!body.includes(GAME_SHELL_MARKER)) fail(`${entry.href} -- answered 200 without the game shell mount point [${entry.sources[0]}]`);
      continue;
    }
    if (!body.includes(TRUST_MARKER)) {
      fail(`${entry.href} -- answered 200 but carries no trust nav, so this is the SPA fallback and the route is not served [${entry.sources[0]}]`);
      continue;
    }
    if (fragment) {
      const idRe = new RegExp(`id="${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
      if (!idRe.test(body)) fail(`${entry.href} -- fragment #${fragment} is not an id= in the response [${entry.sources[0]}]`);
    }
  }

  /* Mechanical honesty check: met implies a resolvable route. */
  let met = 0, violations = 0;
  for (const r of manifest.registers || []) for (const c of r.controls || []) {
    if (c.status !== "met") continue;
    met++;
    const hrefs = (c.evidence || []).filter((e) => e && e.href);
    if (hrefs.length === 0) { violations++; fail(`${r.standard} ${c.ref} is met with no evidence href`); }
  }
  console.log(`Honesty check: ${met} met rows, ${violations} without a route`);

  if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
  console.log(`\nAll evidence links resolve, all met rows carry a route.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
