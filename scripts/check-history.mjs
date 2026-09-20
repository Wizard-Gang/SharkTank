import { execFileSync } from "node:child_process";

const raw = execFileSync(
  "git",
  ["log", "--reverse", "--no-merges", "--format=%H%x1f%s%x1f%b%x1f%an%x1f%ae%x1e"],
  { encoding: "utf8" },
);
const commits = raw.split("\x1e").map((entry) => entry.trim()).filter(Boolean);
const allowedTypes = new Set([
  "INIT", "FEAT", "FIX", "SEC", "API", "A11Y", "I18N", "AI", "DB",
  "OPS", "TEST", "DOCS", "REFACTOR", "PERF", "BUILD", "REVERT", "CHORE",
]);

// These exact type aliases predate WG-ARCH-001's final §16 vocabulary and are
// already published. They are immutable historical exceptions, not types that
// may be used for new controlled changes.
const legacyTypeExceptions = new Map([
  ["ST-008", "GOV"],
  ["ST-012", "GOV"],
  ["ST-013", "GOV"],
  ["ST-015", "GOV"],
  ["ST-020", "UX"],
  ["ST-022", "GOV"],
  ["ST-023", "UX"],
  ["ST-027", "GOV"],
]);

const headings = ["Change", "Reason", "Impact", "Risk", "Controls", "Validation", "Evidence"];
const failures = [];
let expectedNumber = 1;
let controlledCount = 0;

for (const entry of commits) {
  const [sha = "", subject = "", body = "", authorName = "", authorEmail = ""] = entry.split("\x1f");
  const verifiedDependabot = authorName === "dependabot[bot]"
    && /^\d+\+dependabot\[bot\]@users\.noreply\.github\.com$/.test(authorEmail)
    && /^build\(deps(?:-dev)?\): [Bb]ump .+ from .+ to .+$/.test(subject);

  if (verifiedDependabot) continue;

  const match = subject.match(/^\[(ST-(\d{3}))\] \[([A-Z][A-Z0-9-]*)\] (.+)$/);
  if (!match) {
    failures.push(`${sha.slice(0, 12)}: invalid controlled-change subject: ${subject}`);
    continue;
  }

  const [, id, numberText, type] = match;
  const expectedId = `ST-${String(expectedNumber).padStart(3, "0")}`;
  if (id !== expectedId) failures.push(`${sha.slice(0, 12)}: expected ${expectedId}, found ${id}`);
  expectedNumber += 1;
  controlledCount += 1;

  const legacyType = legacyTypeExceptions.get(id);
  if (!allowedTypes.has(type) && legacyType !== type) {
    failures.push(`${sha.slice(0, 12)}: invalid type ${type} for ${id}`);
  }

  // A legacy exception is valid only at its exact published ID/type pair.
  if (legacyType && type !== legacyType && !allowedTypes.has(type)) {
    failures.push(`${sha.slice(0, 12)}: unexpected legacy type for ${id}: ${type}`);
  }

  if (Number(numberText) !== expectedNumber - 1) {
    failures.push(`${sha.slice(0, 12)}: malformed numeric ID ${id}`);
  }

  for (const heading of headings) {
    if (!new RegExp(`(?:^|\\n)${heading}:\\n`).test(body)) {
      failures.push(`${sha.slice(0, 12)}: missing ${heading}: heading`);
    }
  }
  if (!/(?:^|\n)(?:Notes|Source):(?:\n| )/.test(body)) {
    failures.push(`${sha.slice(0, 12)}: missing Notes: or Source: provenance field`);
  }
}

if (controlledCount === 0) failures.push("no controlled ST changes found");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const lastId = `ST-${String(controlledCount).padStart(3, "0")}`;
console.log(
  `Structured history: ${controlledCount} sequential controlled changes through ${lastId} passed; `
  + `${legacyTypeExceptions.size} immutable pre-vocabulary type exceptions remain explicit.`,
);
