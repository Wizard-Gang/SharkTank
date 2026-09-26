import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyPath, classifyText, scanRepository } from "./public-secret-policy.mjs";

function git(root, ...args) {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

test("credential patterns and documented example values are distinguished", () => {
  const token = "ghp_" + "A".repeat(30);
  assert.deepEqual(classifyText(`value=${token}`), ["provider token"]);
  assert.deepEqual(classifyText("ADMIN_PASSWORD=" + "production-value-123"), ["assigned credential"]);
  assert.deepEqual(classifyText("ADMIN_PASSWORD=" + "test-example-value"), []);
  assert.deepEqual(classifyText('CLOUDFLARE_API_TOKEN: "provider-token"'), []);
  const adminName = ["GH", "ADMIN", "TOKEN"].join("_");
  assert.deepEqual(classifyText(`${adminName}: "provider-token-extra"`), ["assigned credential"]);
  assert.deepEqual(classifyText("const password = asString(env.ADMIN_PASSWORD)"), []);
  assert.deepEqual(classifyPath(".env.production"), ["credential path"]);
  assert.deepEqual(classifyPath(".env.example"), []);
});

test("scan detects a current tracked secret and an older reachable secret", () => {
  const root = mkdtempSync(path.join(tmpdir(), "st-public-secrets-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    writeFileSync(path.join(root, "fixture.txt"), "GITHUB_TOKEN=" + "production-value-123\n");
    git(root, "add", "fixture.txt");
    git(root, "commit", "-qm", "fixture old credential");
    writeFileSync(path.join(root, "fixture.txt"), "GITHUB_TOKEN=" + "test-example-value\n");
    git(root, "add", "fixture.txt");
    git(root, "commit", "-qm", "fixture safe current value");
    assert.ok(scanRepository(root).findings.some((finding) => finding.includes("blob") && finding.includes("assigned credential")));
    writeFileSync(path.join(root, "fixture.txt"), "GH_ADMIN_TOKEN=" + "production-value-456\n");
    assert.ok(scanRepository(root).findings.some((finding) => finding.includes("tracked") && finding.includes("assigned credential")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
