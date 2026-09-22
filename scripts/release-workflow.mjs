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

export function validateReleaseWorkflow(workflow) {
  const failures = [];
  const publish = jobBlock(workflow, "publish-release");
  const deploy = jobBlock(workflow, "deploy-production");

  if (!publish) failures.push("release workflow must define publish-release");
  if (!deploy) failures.push("release workflow must define deploy-production");

  if (publish && jobValue(publish, "needs") !== "verify") {
    failures.push("publish-release must depend on successful verify");
  }
  if (deploy && jobValue(deploy, "needs") !== "publish-release") {
    failures.push("deploy-production must depend on successful publish-release");
  }
  if (deploy && jobValue(deploy, "if") !== "vars.PRODUCTION_DEPLOY_ENABLED == 'true'") {
    failures.push("deploy-production must retain the PRODUCTION_DEPLOY_ENABLED opt-in");
  }
  if (deploy && jobValue(deploy, "environment") !== "production") {
    failures.push("deploy-production must retain the protected production environment");
  }

  return failures;
}
