import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const localSource = readFileSync(new URL("./local.mjs", import.meta.url), "utf8");

test("dev and local share the one safe whole-stack lifecycle implementation", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/local.mjs");
  assert.equal(packageJson.scripts.local, packageJson.scripts.dev);
  assert.notEqual(packageJson.scripts.dev, "wrangler dev --port 8787");
});

test("raw Wrangler remains explicit and start preserves its previous Worker-only behavior", () => {
  assert.equal(packageJson.scripts["dev:worker"], "wrangler dev --port 8787");
  assert.equal(packageJson.scripts.start, "npm run dev:worker");
});

test("the dev lifecycle retains ST-069 ownership and fail-closed port boundaries", () => {
  for (const marker of [
    "await stopRecordedWrangler()",
    "existsSync(WRANGLER_OWNER_FILE)",
    "await requirePortsFree",
    "createOwnershipRecord",
    "writeOwnershipRecord",
  ]) {
    assert.equal(localSource.includes(marker), true, marker);
  }
  assert.equal(/\bpkill\b/.test(localSource), false);
  assert.equal(/kill\s+-9/.test(localSource), false);
  assert.equal(/lsof\s+-ti/.test(localSource), false);
});

test("the dev lifecycle retains ST-070 default-preserving reset and exact opt-in parsing", () => {
  assert.equal(localSource.includes("parseLocalResetArgs(process.argv.slice(2))"), true);
  assert.equal(localSource.includes("createLocalResetPlan(PROJECT_ROOT, { resetPhpData })"), true);
  assert.equal(localSource.includes("executeLocalResetPlan(resetPlan)"), true);
  assert.equal(localSource.includes("preserving PHP data/"), true);
});

test("ST-072 browser readiness work remains out of scope", () => {
  assert.equal(localSource.includes("setTimeout(() => {"), true);
  assert.equal(localSource.includes("}, 4000);"), true);
});
