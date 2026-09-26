import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const MAX_REVISIONS = 10_000;
const MAX_BLOBS = 100_000;
const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const MAX_FINDINGS = 50;

const credentialPath = /(^|\/)(?:\.env(?:\.[^/]*)?|\.dev\.vars|id_rsa|[^/]+\.(?:pem|p12|pfx))$/i;
const knownToken = /\b(?:gh[pousr]_[A-Za-z0-9_]{24,}|github_pat_[A-Za-z0-9_]{24,}|glpat-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/;
const privateKey = /-----BEGIN (?:RSA |OPENSSH |EC |PGP )?PRIVATE KEY-----/;
const credentialUrl = /https?:\/\/[^\s/:]+:[^\s/@]+@|[?&](?:token|api[_-]?key|password|secret)=[^\s&#]+/i;
const assignment = /\b(?:ADMIN_PASSWORD|ADMIN_SESSION_SECRET|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|GH_ADMIN_TOKEN|GH_TOKEN|API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD)\b["']?\s*[:=]\s*["']?([^\s"',;})]+)/gi;

// Exact example paths and values are documentation/test doubles, never provider credentials.
export function classifyPath(file) {
  if (/(^|\/)\.env\.example$/i.test(file)) return [];
  return credentialPath.test(file) ? ["credential path"] : [];
}

export function classifyText(content) {
  if (content.includes("\0")) return [];
  const findings = [];
  if (knownToken.test(content)) findings.push("provider token");
  if (privateKey.test(content)) findings.push("private key");
  if (credentialUrl.test(content)) findings.push("credential URL");
  for (const match of content.matchAll(assignment)) {
    const value = match[1] ?? "";
    if (value.length < 8) continue;
    if (/^(?:test-|fake-|example|placeholder|your_|process\.|env\.|\$|<|\\)/i.test(value)) continue;
    if (value === "provider-token" || value === "developer-token") continue;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\(|$)/.test(value)) continue;
    findings.push("assigned credential");
    break;
  }
  return findings;
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
}

export function scanRepository(root) {
  const findings = [];
  const add = (location, kind) => {
    if (findings.length < MAX_FINDINGS) findings.push(`${location}: ${kind}`);
  };
  const tracked = git(root, "ls-files", "-z").toString("utf8").split("\0").filter(Boolean);
  for (const file of tracked) {
    const location = `tracked ${file}`;
    for (const kind of classifyPath(file)) add(location, kind);
    const absolute = path.join(root, file);
    const info = lstatSync(absolute);
    if (!info.isFile()) continue;
    if (info.size > MAX_BLOB_BYTES) {
      add(location, "oversized file cannot be scanned");
      continue;
    }
    for (const kind of classifyText(readFileSync(absolute).toString("utf8"))) add(location, kind);
  }

  const revisions = git(root, "rev-list", "--all").toString("utf8").trim().split("\n").filter(Boolean);
  if (revisions.length > MAX_REVISIONS) throw new Error(`public-history scan exceeds ${MAX_REVISIONS} revisions`);
  const blobs = new Map();
  for (const revision of revisions) {
    const entries = git(root, "ls-tree", "-r", "-l", "-z", revision).toString("utf8").split("\0").filter(Boolean);
    for (const entry of entries) {
      const match = /^\d+ blob ([0-9a-f]+)\s+(\d+)\t([\s\S]+)$/.exec(entry);
      if (!match) continue;
      const [, object, sizeText, file] = match;
      const location = `${revision.slice(0, 12)} ${file}`;
      for (const kind of classifyPath(file)) add(location, kind);
      if (Number(sizeText) > MAX_BLOB_BYTES) {
        add(location, "oversized blob cannot be scanned");
        continue;
      }
      if (!blobs.has(object)) blobs.set(object, file);
      if (blobs.size > MAX_BLOBS) throw new Error(`public-history scan exceeds ${MAX_BLOBS} unique blobs`);
    }
  }
  for (const [object, file] of blobs) {
    const content = git(root, "cat-file", "blob", object).toString("utf8");
    for (const kind of classifyText(content)) add(`blob ${object.slice(0, 12)} ${file}`, kind);
  }
  return { findings, revisions: revisions.length, blobs: blobs.size };
}
