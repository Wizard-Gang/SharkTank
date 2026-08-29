#!/usr/bin/env node

const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const canonical = ["/", "/controls/", "/evidence/", "/play/"];
const redirects = {
  "/trust": "/", "/trust/": "/",
  "/iso-27001": "/controls/#iso-27001", "/iso-27001/": "/controls/#iso-27001",
  "/iso-42001": "/controls/#iso-42001", "/iso-42001/": "/controls/#iso-42001",
  "/audit": "/controls/#registers", "/audit/": "/controls/#registers",
  "/policies": "/controls/#policies", "/policies/": "/controls/#policies",
  "/status": "/evidence/#availability", "/status/": "/evidence/#availability",
  "/incidents": "/evidence/#incidents", "/incidents/": "/evidence/#incidents",
  "/logs": "/evidence/#logs", "/logs/": "/evidence/#logs",
  "/spend": "/evidence/#spend", "/spend/": "/evidence/#spend",
  "/inquiry": "/evidence/#spend", "/inquiry/": "/evidence/#spend",
  "/roadmap": "/evidence/#changes", "/roadmap/": "/evidence/#changes",
  "/policies/context/": "/controls/#context",
  "/policies/ai-policy/": "/controls/#ai-policy",
};

const failures = [];
const fail = (message) => failures.push(message);
const request = (path, redirect = "manual") => fetch(`${base}${path}`, { redirect, headers: { "cache-control": "no-cache" } });
const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const hrefs = (html) => [...html.matchAll(/\shref="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));

async function main() {
  const pages = new Map();
  for (const path of canonical) {
    const response = await request(path);
    if (response.status !== 200) { fail(`${path} expected 200, got ${response.status}`); continue; }
    const html = await response.text();
    pages.set(path, html);
    if (path !== "/play/" && !html.includes('<nav aria-label="Primary">')) fail(`${path} is missing the primary navigation`);
    if (path !== "/play/" && (html.match(/<h1(?:\s|>)/g) || []).length !== 1) fail(`${path} must contain exactly one h1`);
    if (path !== "/play/") {
      const pageIds = ids(html);
      const duplicates = [...new Set(pageIds.filter((id, index) => pageIds.indexOf(id) !== index))];
      if (duplicates.length) fail(`${path} repeats id(s): ${duplicates.join(", ")}`);
    }
  }

  const home = pages.get("/") || "";
  const headerNav = home.match(/<header[\s\S]*?<nav aria-label="Primary">([\s\S]*?)<\/nav>/)?.[1] || "";
  const primaryLinks = [...headerNav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((match) => [match[1], match[2]]);
  if (JSON.stringify(primaryLinks) !== JSON.stringify([["/", "Overview"], ["/controls/", "Controls"], ["/evidence/", "Evidence"], ["/play/", "Play"]])) fail(`primary navigation is not the four-route contract: ${JSON.stringify(primaryLinks)}`);

  for (const [sourcePath, html] of pages) {
    if (sourcePath === "/play/") continue;
    const sourceUrl = new URL(sourcePath, base);
    for (const href of new Set(hrefs(html))) {
      if (/^(?:https?:|mailto:|tel:)/.test(href)) continue;
      const target = new URL(href, sourceUrl);
      if (target.origin !== new URL(base).origin) continue;
      const targetPath = target.pathname;
      const targetPage = pages.get(targetPath);
      if (target.hash && targetPage) {
        const id = decodeURIComponent(target.hash.slice(1));
        if (!ids(targetPage).includes(id)) fail(`${sourcePath} links to missing ${targetPath}#${id}`);
      }
      if (redirects[targetPath]) fail(`${sourcePath} links through legacy route ${targetPath}`);
    }
  }

  const assetPaths = new Set();
  for (const html of pages.values()) {
    for (const match of html.matchAll(/\ssrc="(\/[^"?#]+\.(?:jpg|png|svg|css|js)(?:\?[^"#]*)?)"/g)) assetPaths.add(match[1]);
    for (const match of html.matchAll(/<link\s[^>]*href="(\/[^"?#]+\.css(?:\?[^"#]*)?)"/g)) assetPaths.add(match[1]);
  }
  for (const path of assetPaths) {
    const response = await request(path);
    if (response.status !== 200) fail(`asset ${path} expected 200, got ${response.status}`);
  }

  for (const [from, to] of Object.entries(redirects)) {
    const response = await request(from);
    if (response.status !== 301) { fail(`${from} expected 301, got ${response.status}`); continue; }
    if (response.headers.get("location") !== to) fail(`${from} expected Location ${to}, got ${response.headers.get("location")}`);
    const destination = new URL(to, base);
    const final = await request(destination.pathname);
    if (final.status >= 300 && final.status < 400) fail(`${from} redirects into another redirect at ${destination.pathname}`);
    const finalHtml = await final.text();
    if (destination.hash && !ids(finalHtml).includes(destination.hash.slice(1))) fail(`${from} targets missing fragment ${to}`);
  }

  const queryRedirect = await request("/status/?source=legacy");
  if (queryRedirect.headers.get("location") !== "/evidence/?source=legacy#availability") fail("legacy redirects do not preserve query strings before fragments");

  const sitemap = await (await request("/sitemap.xml")).text();
  const listed = [...sitemap.matchAll(/<loc>https:\/\/sharktank\.wizardgang\.ai([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (JSON.stringify(listed) !== JSON.stringify(canonical)) fail(`sitemap is not canonical-only: ${JSON.stringify(listed)}`);

  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    console.error(`\n${failures.length} public IA check(s) failed.`);
    process.exit(1);
  }
  console.log(`Verified ${canonical.length} canonical pages, primary navigation, unique IDs, internal anchors, assets, ${Object.keys(redirects).length} one-hop redirects, query preservation, and canonical sitemap.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
