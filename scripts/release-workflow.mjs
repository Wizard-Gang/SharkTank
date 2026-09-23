function jobBlock(workflow, jobName) {
  const jobsMarker = /^jobs:\s*$/m.exec(workflow);
  if (!jobsMarker) return null;

  const jobsText = workflow.slice(jobsMarker.index + jobsMarker[0].length);
  const start = new RegExp("^  " + jobName + ":\\s*$", "m").exec(jobsText);
  if (!start) return null;

  const afterStart = jobsText.slice(start.index + start[0].length);
  const nextJob = /^  [A-Za-z0-9_-]+:\s*$/m.exec(afterStart);
  return nextJob ? afterStart.slice(0, nextJob.index) : afterStart;
}

function jobValue(block, key) {
  if (!block) return null;
  const match = new RegExp("^    " + key + ":\\s*(.+?)\\s*$", "m").exec(block);
  return match?.[1] ?? null;
}

function indentation(line) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function blockLines(lines, key, indent) {
  const marker = " ".repeat(indent) + key + ":";
  const start = lines.findIndex((line) => line.trimEnd() === marker);
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (indentation(line) <= indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function releaseTriggerFailures(workflow) {
  const failures = [];
  const lines = workflow.split("\n");
  const on = blockLines(lines, "on", 0);
  if (!on) return ["release workflow must define a trigger"];

  const events = on
    .filter((line) => line.trim() && indentation(line) === 2 && /^[A-Za-z0-9_-]+:\s*$/.test(line.trim()))
    .map((line) => line.trim().slice(0, -1));

  if (events.length !== 1 || events[0] !== "push") {
    failures.push("release workflow must be triggered only by semantic release tag pushes");
    return failures;
  }

  const push = blockLines(on, "push", 2);
  if (!push) {
    failures.push("release workflow must define the release tag push trigger");
    return failures;
  }

  if (push.some((line) => indentation(line) === 4 && /^branches(?:-ignore)?:\s*$/.test(line.trim()))) {
    failures.push("release workflow must not publish from branch pushes");
  }

  const tags = blockLines(push, "tags", 4);
  const patterns = (tags ?? [])
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim().replace(/^['"]|['"]$/g, ""));

  if (patterns.length !== 1 || patterns[0] !== "v[0-9]+.[0-9]+.[0-9]+") {
    failures.push("release workflow push trigger must target only semantic vX.Y.Z tags");
  }

  return failures;
}

function hasFullHistoryCheckout(block) {
  return Boolean(block?.includes("uses: actions/checkout@") && block.includes("fetch-depth: 0"));
}

function deployTriggerFailures(workflow) {
  const lines = workflow.split("\n");
  const on = blockLines(lines, "on", 0);
  if (!on) return ["deploy workflow must define workflow_call"];

  const events = on
    .filter((line) => line.trim() && indentation(line) === 2 && /^[A-Za-z0-9_-]+:\s*$/.test(line.trim()))
    .map((line) => line.trim().slice(0, -1));

  if (events.length !== 1 || events[0] !== "workflow_call") {
    return ["deploy workflow must be callable only from another workflow"];
  }
  return [];
}

export function validateProductionDeployWorkflow(workflow) {
  const failures = deployTriggerFailures(workflow);
  const deploy = jobBlock(workflow, "deploy");

  if (!deploy) {
    failures.push("deploy workflow must define deploy");
    return failures;
  }

  if (jobValue(deploy, "environment") !== "production") failures.push("deploy must retain the protected production environment");
  if (!deploy.includes("group: sharktank-production")) failures.push("deploy must retain serialized production concurrency");
  if (!hasFullHistoryCheckout(deploy)) failures.push("deploy must checkout full Git/tag history");
  if (!deploy.includes("ref: ${{ github.ref }}")) failures.push("deploy must checkout the caller tag event ref");
  if (!deploy.includes("node-version-file: .node-version")) failures.push("deploy must use the repository Node authority");
  if (!deploy.includes('npm install --global "$package_manager"')) failures.push("deploy must install the repository npm authority");
  if (!deploy.includes("run: npm ci")) failures.push("deploy must install locked dependencies");
  if (!deploy.includes("SHARKTANK_RELEASE: ${{ inputs.tag }}")) failures.push("deploy must bind release identity from the workflow input");
  if (!deploy.includes('[ "$GITHUB_REF_TYPE" = "tag" ]')) failures.push("deploy must reject non-tag caller events");
  if (!deploy.includes('[ "$GITHUB_REF_NAME" = "$SHARKTANK_RELEASE" ]')) failures.push("deploy must require the input tag to match the event tag");
  if (!deploy.includes("npm run check:release-identity")) failures.push("deploy must revalidate exact annotated release identity");
  if (!deploy.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}")) failures.push("deploy must retain the Cloudflare token boundary");
  if (!deploy.includes("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}")) failures.push("deploy must retain the Cloudflare account boundary");
  if (!deploy.includes("npm run deploy:wizardgangprod")) failures.push("deploy must use the production deployment command");
  if (!deploy.includes("npx wrangler deployments list --env wizardgangprod")) failures.push("deploy must confirm provider deployment state");
  if (!deploy.includes("grep -q '(100%)'")) failures.push("deploy must prove the uploaded version serves 100% of traffic");
  if (!deploy.includes("npm run check:evidence -- https://sharktank.wizardgang.ai")) failures.push("deploy must retain public evidence validation when reachable");

  return failures;
}

export function validateReleaseWorkflow(workflow, deployWorkflow) {
  const failures = releaseTriggerFailures(workflow);
  const verify = jobBlock(workflow, "verify");
  const publish = jobBlock(workflow, "publish-release");
  const deploy = jobBlock(workflow, "deploy-production");

  if (!verify) failures.push("release workflow must define verify");
  if (!publish) failures.push("release workflow must define publish-release");
  if (!deploy) failures.push("release workflow must define deploy-production");

  for (const [name, block] of [["verify", verify], ["publish-release", publish]]) {
    if (block && !hasFullHistoryCheckout(block)) failures.push(`${name} must checkout full Git/tag history`);
  }

  if (verify) {
    const lines = verify.split("\n").map((line) => line.trim().replace(/^- /, ""));
    const checkIndex = lines.indexOf("run: npm run check");
    const advisoryIndex = lines.indexOf("run: npm run audit:dependencies");
    const identityIndex = lines.indexOf("run: npm run check:release-identity");
    if (checkIndex < 0) failures.push("verify must run the canonical repository gate");
    if (advisoryIndex < 0) failures.push("verify must run the separate network advisory gate");
    if (identityIndex < 0) failures.push("verify must run exact release identity validation");
    if (checkIndex >= 0 && advisoryIndex >= 0 && advisoryIndex <= checkIndex) failures.push("network advisory gate must follow canonical acceptance");
    if (advisoryIndex >= 0 && identityIndex >= 0 && identityIndex <= advisoryIndex) failures.push("exact release identity validation must follow network advisories");
    if (checkIndex >= 0 && identityIndex >= 0 && identityIndex <= checkIndex) failures.push("exact release identity validation must run after the canonical repository gate");
    if (!verify.includes("SHARKTANK_RELEASE: ${{ github.ref_name }}")) failures.push("verify must bind release identity from github.ref_name");
  }

  if (publish && jobValue(publish, "needs") !== "verify") failures.push("publish-release must depend on successful verify");
  if (publish && !publish.includes('gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes --title "$GITHUB_REF_NAME"')) failures.push("publish-release must verify and publish the exact release tag");
  if (deploy) {
    if (jobValue(deploy, "needs") !== "publish-release") failures.push("deploy-production must depend on successful publish-release");
    if (jobValue(deploy, "if") !== "vars.PRODUCTION_DEPLOY_ENABLED == 'true'") failures.push("deploy-production must retain the PRODUCTION_DEPLOY_ENABLED opt-in");
    if (jobValue(deploy, "uses") !== "./.github/workflows/deploy.yml") failures.push("deploy-production must call the reusable production workflow");
    if (!deploy.includes("tag: ${{ github.ref_name }}")) failures.push("deploy-production must pass the exact release event tag");
    if (!deploy.includes("secrets: inherit")) failures.push("deploy-production must inherit the caller secret boundary");
    if (deploy.includes("runs-on:") || deploy.includes("steps:")) failures.push("deploy-production must not embed production steps in release.yml");
  }

  if (typeof deployWorkflow !== "string") failures.push("release validation requires the reusable deploy workflow");
  else failures.push(...validateProductionDeployWorkflow(deployWorkflow));

  return failures;
}
