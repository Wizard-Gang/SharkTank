import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const severities = ["info", "low", "moderate", "high", "critical"];
const blocking = ["moderate", "high", "critical"];

export function classifyAdvisories(report) {
  if (!report || typeof report !== "object" || report.error) {
    return { counts: null, failures: ["npm audit did not return a usable advisory report"] };
  }
  const counts = report.metadata?.vulnerabilities;
  if (!counts || severities.some((level) => !Number.isInteger(counts[level]) || counts[level] < 0)) {
    return { counts: null, failures: ["npm audit advisory counts are missing or malformed"] };
  }
  const failures = blocking.filter((level) => counts[level] > 0)
    .map((level) => `${counts[level]} ${level} dependency advisories`);
  return { counts, failures };
}

export function assessAuditExecution({ status, stdout, error }) {
  if (error || typeof stdout !== "string") return ["npm audit could not run"];
  let report;
  try { report = JSON.parse(stdout); }
  catch { return ["npm audit did not return valid JSON"] }
  const { failures } = classifyAdvisories(report);
  if (status !== 0 && failures.length === 0) return ["npm audit failed without a blocking advisory report"];
  return failures;
}

export function main() {
  const result = spawnSync("npm", ["audit", "--json", "--audit-level=moderate"], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  const failures = assessAuditExecution(result);
  if (failures.length) {
    for (const failure of failures) console.error(`Dependency advisory gate: ${failure}`);
    return 1;
  }
  console.log("Dependency advisory gate: no moderate, high, or critical advisories.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
