import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateReleaseWorkflow } from "./release-workflow.mjs";

const releasePath = new URL("../.github/workflows/release.yml", import.meta.url);
const workflow = readFileSync(releasePath, "utf8");

function replaceRequired(source, from, to) {
  assert.ok(source.includes(from), "fixture is missing expected text: " + from);
  return source.replace(from, to);
}

test("release workflow orders verification, publication, then optional production", () => {
  assert.deepEqual(validateReleaseWorkflow(workflow), []);
});

test("production cannot depend directly on verification", () => {
  const changed = replaceRequired(workflow, "    needs: publish-release", "    needs: verify");
  assert.match(validateReleaseWorkflow(changed).join("\n"), /depend on successful publish-release/);
});

test("publication cannot bypass verification", () => {
  const changed = replaceRequired(workflow, "    needs: verify", "    needs: deploy-production");
  assert.match(validateReleaseWorkflow(changed).join("\n"), /depend on successful verify/);
});

test("production remains explicitly opt in", () => {
  const changed = replaceRequired(workflow, "    if: vars.PRODUCTION_DEPLOY_ENABLED == 'true'", "    if: always()");
  assert.match(validateReleaseWorkflow(changed).join("\n"), /PRODUCTION_DEPLOY_ENABLED opt-in/);
});

test("production remains protected by its environment", () => {
  const changed = replaceRequired(workflow, "    environment: production", "    environment: preview");
  assert.match(validateReleaseWorkflow(changed).join("\n"), /protected production environment/);
});
