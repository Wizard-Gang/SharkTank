import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessAuditExecution, classifyAdvisories } from "./dependency-advisories.mjs";

const report = (changes = {}) => ({ metadata: { vulnerabilities: {
  info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...changes,
} } });

test("low advisories do not cross the shared moderate threshold", () => {
  assert.deepEqual(classifyAdvisories(report({ low: 2 })).failures, []);
  assert.deepEqual(assessAuditExecution({ status: 0, stdout: JSON.stringify(report({ low: 2 })) }), []);
});

test("moderate, high, and critical advisories each block", () => {
  for (const severity of ["moderate", "high", "critical"]) {
    assert.match(classifyAdvisories(report({ [severity]: 1 })).failures.join("\n"), new RegExp(severity));
  }
});

test("missing counts, malformed output, and network failures fail closed", () => {
  assert.ok(classifyAdvisories({}).failures.length);
  assert.ok(classifyAdvisories({ error: { code: "ENOAUDIT" } }).failures.length);
  assert.ok(assessAuditExecution({ status: 1, stdout: "not JSON" }).length);
  assert.ok(assessAuditExecution({ status: 1, stdout: JSON.stringify(report()) }).length);
  assert.ok(assessAuditExecution({ status: null, stdout: "", error: new Error("network") }).length);
});

test("provider gates run separately and bot version updates are disabled", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const release = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.doesNotMatch(packageJson.scripts.check, /npm audit|audit:dependencies/);
  assert.equal(packageJson.scripts["audit:dependencies"], "node scripts/dependency-advisories.mjs");
  assert.match(ci, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(ci, /run: npm run audit:dependencies/);
  assert.match(release, /run: npm run audit:dependencies/);
  assert.ok(ci.indexOf("run: npm run audit:dependencies") > ci.indexOf("run: npm run check"));
  assert.ok(release.indexOf("run: npm run audit:dependencies") > release.indexOf("run: npm run check"));
});
