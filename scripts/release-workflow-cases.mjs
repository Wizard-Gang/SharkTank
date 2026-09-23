import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateReleaseWorkflow, validateProductionDeployWorkflow } from "./release-workflow.mjs";

const releasePath = new URL("../.github/workflows/release.yml", import.meta.url);
const deployPath = new URL("../.github/workflows/deploy.yml", import.meta.url);
const workflow = readFileSync(releasePath, "utf8");
const deployWorkflow = readFileSync(deployPath, "utf8");

function replaceRequired(source, from, to) {
  assert.ok(source.includes(from), "fixture is missing expected text: " + from);
  return source.replace(from, to);
}

test("release workflow orders verification, publication, then reusable production", () => {
  assert.deepEqual(validateReleaseWorkflow(workflow, deployWorkflow), []);
});

test("release workflow remains semantic-tag driven only", () => {
  const changed = replaceRequired(workflow, '      - "v[0-9]+.[0-9]+.[0-9]+"', '      - "v*"');
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /target only semantic vX\.Y\.Z tags/);
});

test("release verification and publication keep full Git and tag history", () => {
  const changed = replaceRequired(workflow, "          fetch-depth: 0", "          fetch-depth: 1");
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /verify must checkout full Git\/tag history/);
});

test("publication verifies the exact existing tag", () => {
  const changed = replaceRequired(workflow, 'gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes --title "$GITHUB_REF_NAME"', 'gh release create "$GITHUB_REF_NAME" --generate-notes --title "$GITHUB_REF_NAME"');
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /verify and publish the exact release tag/);
});

test("release verification cannot omit or reorder network advisories", () => {
  const removed = replaceRequired(workflow, "      - name: Network dependency advisories\n        run: npm run audit:dependencies\n", "");
  assert.match(validateReleaseWorkflow(removed, deployWorkflow).join("\n"), /separate network advisory gate/);
  const moved = replaceRequired(workflow,
    "      - run: npm run check\n      - name: Network dependency advisories\n        run: npm run audit:dependencies",
    "      - name: Network dependency advisories\n        run: npm run audit:dependencies\n      - run: npm run check");
  assert.match(validateReleaseWorkflow(moved, deployWorkflow).join("\n"), /network advisory gate must follow canonical acceptance/);
});

test("production cannot depend directly on verification", () => {
  const changed = replaceRequired(workflow, "    needs: publish-release", "    needs: verify");
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /depend on successful publish-release/);
});

test("publication cannot bypass verification", () => {
  const changed = replaceRequired(workflow, "    needs: verify", "    needs: deploy-production");
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /depend on successful verify/);
});

test("production remains explicitly opt in", () => {
  const changed = replaceRequired(workflow, "    if: vars.PRODUCTION_DEPLOY_ENABLED == 'true'", "    if: always()");
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /PRODUCTION_DEPLOY_ENABLED opt-in/);
});

test("release delegates production instead of embedding deployment steps", () => {
  const changed = replaceRequired(workflow, "    uses: ./.github/workflows/deploy.yml", "    runs-on: ubuntu-latest");
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /call the reusable production workflow/);
});

test("reusable production workflow cannot be dispatched or branch triggered", () => {
  const changed = replaceRequired(deployWorkflow, "  workflow_call:", "  workflow_dispatch:");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /callable only from another workflow/);
});

test("reusable production workflow stays on the caller tag ref", () => {
  const changed = replaceRequired(deployWorkflow, "          ref: ${{ github.ref }}", "          ref: main");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /checkout the caller tag event ref/);
});

test("reusable production workflow revalidates the release handoff", () => {
  const changed = replaceRequired(deployWorkflow, '          [ "$GITHUB_REF_NAME" = "$SHARKTANK_RELEASE" ] || { echo "::error::release input $SHARKTANK_RELEASE != event tag $GITHUB_REF_NAME"; exit 1; }\n', "");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /input tag to match the event tag/);
});

test("reusable production workflow retains the protected environment", () => {
  const changed = replaceRequired(deployWorkflow, "    environment: production", "    environment: preview");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /protected production environment/);
});

test("reusable production workflow retains provider deployment proof", () => {
  const changed = replaceRequired(deployWorkflow, "          npx wrangler deployments list --env wizardgangprod", "          npx wrangler deployments list --env preview");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /confirm provider deployment state/);
});
