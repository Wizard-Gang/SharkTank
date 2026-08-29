import { execFileSync } from "node:child_process";

const raw = execFileSync("git", ["log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e"], { encoding: "utf8" });
const commits = raw.split("\x1e").map((entry) => entry.trim()).filter(Boolean);
const subjectPattern = /^\[ST-\d{3}\] \[[A-Z][A-Z0-9-]*\] .+/;
const headings = ["Change", "Reason", "Impact", "Risk", "Controls", "Validation", "Evidence"];
const failures = [];

for (const entry of commits) {
  const [sha = "", subject = "", body = ""] = entry.split("\x1f");
  if (!subjectPattern.test(subject)) failures.push(`${sha.slice(0, 12)}: invalid subject: ${subject}`);
  for (const heading of headings) {
    if (!new RegExp(`(?:^|\\n)${heading}:\\n`).test(body)) failures.push(`${sha.slice(0, 12)}: missing ${heading}: heading`);
  }
  if (!/(?:^|\n)(?:Notes|Source):(?:\n| )/.test(body)) failures.push(`${sha.slice(0, 12)}: missing Notes: or Source: provenance field`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Structured history: ${commits.length} non-merge commits passed.`);
