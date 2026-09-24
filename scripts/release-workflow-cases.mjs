import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateReleaseWorkflow,
  validateProductionDeployWorkflow,
  validateReleaseTagWorkflow,
  validateVersionToProductionChain,
} from "./release-workflow.mjs";

const releasePath = new URL("../.github/workflows/release.yml", import.meta.url);
const deployPath = new URL("../.github/workflows/deploy.yml", import.meta.url);
const tagPath = new URL("../.github/workflows/tag-release.yml", import.meta.url);
const workflow = readFileSync(releasePath, "utf8");
const deployWorkflow = readFileSync(deployPath, "utf8");
const tagWorkflow = readFileSync(tagPath, "utf8");

function replaceRequired(source, from, to) {
  assert.ok(source.includes(from), "fixture is missing expected text: " + from);
  return source.replace(from, to);
}

test("complete governed version-to-production chain stays closed", () => {
  assert.deepEqual(validateVersionToProductionChain({
    tagWorkflow,
    releaseWorkflow: workflow,
    deployWorkflow,
  }), []);
});

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

test("publication uses the guarded create-or-verify command", () => {
  const changed = replaceRequired(workflow, "        run: node scripts/release-publication.mjs", '        run: gh release create "$GITHUB_REF_NAME"');
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /guarded create-or-verify publication command/);
  assert.match(validateReleaseWorkflow(changed, deployWorkflow).join("\n"), /must not embed mutable gh release operations/);
});

test("publication binds exact tag and Release workflow identity", () => {
  const withoutTag = replaceRequired(
    workflow,
    "          GH_TOKEN: ${{ github.token }}\n          SHARKTANK_RELEASE: ${{ github.ref_name }}\n",
    "          GH_TOKEN: ${{ github.token }}\n",
  );
  assert.match(validateReleaseWorkflow(withoutTag, deployWorkflow).join("\n"), /bind the exact release event tag/);
  const withoutWorkflow = replaceRequired(
    workflow,
    "          SHARKTANK_RELEASE: ${{ github.ref_name }}\n          SHARKTANK_RELEASE_WORKFLOW_REF: ${{ github.workflow_ref }}\n",
    "          SHARKTANK_RELEASE: ${{ github.ref_name }}\n",
  );
  assert.match(validateReleaseWorkflow(withoutWorkflow, deployWorkflow).join("\n"), /bind the exact Release workflow identity/);
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

test("reusable production workflow binds the caller release workflow identity", () => {
  const changed = replaceRequired(deployWorkflow, "          SHARKTANK_RELEASE_WORKFLOW_REF: ${{ github.workflow_ref }}\n", "");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /bind caller release workflow identity/);
});

test("reusable production workflow retains the protected environment", () => {
  const changed = replaceRequired(deployWorkflow, "    environment: production", "    environment: preview");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /protected production environment/);
});

test("reusable production workflow retains provider deployment proof", () => {
  const changed = replaceRequired(deployWorkflow, "          npx wrangler deployments list --env wizardgangprod", "          npx wrangler deployments list --env preview");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /confirm provider deployment state/);
});

test("provider proof is bound to the uploaded Version ID", () => {
  const withoutBinding = replaceRequired(
    deployWorkflow,
    "          VERSION: ${{ steps.deploy.outputs.version }}\n",
    "",
  );
  assert.match(validateProductionDeployWorkflow(withoutBinding).join("\n"), /bind the uploaded Version ID/);

  const withoutExactVersion = replaceRequired(
    deployWorkflow,
    'grep -q "$VERSION"',
    'grep -q "$SHARKTANK_RELEASE"',
  );
  assert.match(validateProductionDeployWorkflow(withoutExactVersion).join("\n"), /require the uploaded Version ID/);
});

test("provider proof still requires 100 percent traffic", () => {
  const changed = replaceRequired(
    deployWorkflow,
    "grep -q '(100%)'",
    "grep -q '(partial)'",
  );
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /serves 100% of traffic/);
});

test("public edge evidence cannot run before authenticated provider proof", () => {
  const changed = replaceRequired(
    deployWorkflow,
    "    steps:\n",
    "    steps:\n      - name: Premature public edge evidence\n        run: npm run check:evidence -- https://sharktank.wizardgang.ai\n",
  );
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /post-provider-proof fallback/);
});

test("public edge fallback remains limited to the managed challenge", () => {
  const changed = replaceRequired(deployWorkflow, "cf-mitigated: *challenge", "server: cloudflare");
  assert.match(validateProductionDeployWorkflow(changed).join("\n"), /documented managed challenge/);
});

test("release verification cannot omit exact package and tag identity", () => {
  const changed = replaceRequired(
    workflow,
    "        run: npm run check:release-identity\n",
    "",
  );
  assert.match(validateVersionToProductionChain({
    tagWorkflow,
    releaseWorkflow: changed,
    deployWorkflow,
  }).join("\n"), /exact release identity validation/);
});

test("reusable production handoff cannot change the Release event tag", () => {
  const changed = replaceRequired(
    workflow,
    "      tag: ${{ github.ref_name }}",
    "      tag: v0.0.0",
  );
  assert.match(validateVersionToProductionChain({
    tagWorkflow,
    releaseWorkflow: changed,
    deployWorkflow,
  }).join("\n"), /pass the exact release event tag/);
});

test("release tagging observes only successful main push CI", () => {
  assert.deepEqual(validateReleaseTagWorkflow(tagWorkflow), []);
});

test("release tagging cannot observe a different workflow", () => {
  const changed = replaceRequired(tagWorkflow, 'workflows: ["CI"]', 'workflows: ["Release"]');
  assert.match(validateReleaseTagWorkflow(changed).join("\n"), /observe only CI/);
});

test("release tagging cannot run before successful main push CI", () => {
  const changed = replaceRequired(tagWorkflow, "github.event.workflow_run.conclusion == 'success'", "always()");
  assert.match(validateReleaseTagWorkflow(changed).join("\n"), /successful push CI on main/);
});

test("release tagging checks out the exact accepted main commit", () => {
  const changed = replaceRequired(tagWorkflow, "ref: ${{ github.event.workflow_run.head_sha }}", "ref: main");
  assert.match(validateReleaseTagWorkflow(changed).join("\n"), /exact accepted main SHA/);
});

test("release tagging cannot publish a GitHub Release or deploy production", () => {
  const changed = tagWorkflow + "\n# gh release create forbidden\n";
  assert.match(validateReleaseTagWorkflow(changed).join("\n"), /must not publish Releases or deploy production/);
});
