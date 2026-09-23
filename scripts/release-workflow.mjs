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

export function validateReleaseWorkflow(workflow) {
  const failures = releaseTriggerFailures(workflow);
  const verify = jobBlock(workflow, "verify");
  const publish = jobBlock(workflow, "publish-release");
  const deploy = jobBlock(workflow, "deploy-production");

  if (!verify) failures.push("release workflow must define verify");
  if (!publish) failures.push("release workflow must define publish-release");
  if (!deploy) failures.push("release workflow must define deploy-production");

  for (const [name, block] of [["verify", verify], ["publish-release", publish], ["deploy-production", deploy]]) {
    if (block && !hasFullHistoryCheckout(block)) failures.push(`${name} must checkout full Git/tag history`);
  }

  if (verify) {
    const lines = verify.split("\n").map((line) => line.trim().replace(/^- /, ""));
    const checkIndex = lines.indexOf("run: npm run check");
    const identityIndex = lines.indexOf("run: npm run check:release-identity");
    if (checkIndex < 0) failures.push("verify must run the canonical repository gate");
    if (identityIndex < 0) failures.push("verify must run exact release identity validation");
    if (checkIndex >= 0 && identityIndex >= 0 && identityIndex <= checkIndex) failures.push("exact release identity validation must run after the canonical repository gate");
    if (!verify.includes("SHARKTANK_RELEASE: ${{ github.ref_name }}")) failures.push("verify must bind release identity from github.ref_name");
  }

  if (publish && jobValue(publish, "needs") !== "verify") failures.push("publish-release must depend on successful verify");
  if (publish && !publish.includes('gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes --title "$GITHUB_REF_NAME"')) failures.push("publish-release must verify and publish the exact release tag");
  if (deploy && jobValue(deploy, "needs") !== "publish-release") failures.push("deploy-production must depend on successful publish-release");
  if (deploy && jobValue(deploy, "if") !== "vars.PRODUCTION_DEPLOY_ENABLED == 'true'") failures.push("deploy-production must retain the PRODUCTION_DEPLOY_ENABLED opt-in");
  if (deploy && jobValue(deploy, "environment") !== "production") failures.push("deploy-production must retain the protected production environment");

  return failures;
}
