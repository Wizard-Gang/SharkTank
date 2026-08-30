import { execFileSync } from "node:child_process";

const raw = execFileSync("git", ["log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1f%an%x1f%ae%x1e"], { encoding: "utf8" });
const commits = raw.split("\x1e").map((entry) => entry.trim()).filter(Boolean);
const subjectPattern = /^\[ST-\d{3}\] \[[A-Z][A-Z0-9-]*\] .+/;
const headings = ["Change", "Reason", "Impact", "Risk", "Controls", "Validation", "Evidence"];
const failures = [];

for (const entry of commits) {
  const [sha = "", subject = "", body = "", authorName = "", authorEmail = ""] = entry.split("\x1f");
  const verifiedDependabot = authorName === "dependabot[bot]"
    && /^\d+\+dependabot\[bot\]@users\.noreply\.github\.com$/.test(authorEmail)
    // Dependabot writes a lowercase "bump" and scopes devDependency updates as
    // "deps-dev". Matching only "build(deps): Bump" rejected every devDependency
    // update, and those pull requests re-ran and failed on each push to main.
    && /^build\(deps(?:-dev)?\): [Bb]ump .+ from .+ to .+$/.test(subject);
  if (verifiedDependabot) continue;
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
