import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const releasePattern = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
  };
}

export function validateReleaseIdentity({ cwd, release, expectedSha }) {
  const failures = [];
  const value = (release ?? "").trim();

  if (!releasePattern.test(value)) {
    return [`release identity must match semantic vX.Y.Z: ${value || "(empty)"}`];
  }

  const ref = `refs/tags/${value}`;
  const type = git(cwd, ["cat-file", "-t", ref]);
  if (type.status !== 0) {
    failures.push(`release tag does not exist: ${value}`);
  } else if (type.stdout !== "tag") {
    failures.push(`release tag must be annotated: ${value}`);
  }

  if (type.status === 0) {
    const tagged = git(cwd, ["rev-parse", `${ref}^{commit}`]);
    const head = git(cwd, ["rev-parse", "HEAD"]);
    if (tagged.status !== 0) failures.push(`release tag does not resolve to a commit: ${value}`);
    if (head.status !== 0) failures.push("unable to resolve checked-out HEAD");
    if (tagged.status === 0 && head.status === 0 && tagged.stdout !== head.stdout) {
      failures.push(`release tag ${value} does not point at checked-out HEAD`);
    }
    if (expectedSha !== undefined) {
      if (!/^[0-9a-f]{40}$/.test(expectedSha)) failures.push("expected accepted main SHA must be 40 lowercase hex characters");
      else {
        if (tagged.status === 0 && tagged.stdout !== expectedSha) failures.push(`release tag ${value} does not point at expected accepted main SHA`);
        if (head.status === 0 && head.stdout !== expectedSha) failures.push("checked-out HEAD does not match expected accepted main SHA");
        const ancestor = git(cwd, ["merge-base", "--is-ancestor", expectedSha, "refs/remotes/origin/main"]);
        if (ancestor.status !== 0) failures.push("expected accepted commit is not an ancestor of current origin/main");
      }
    }
  }

  try {
    const packageVersion = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).version;
    if (typeof packageVersion !== "string") {
      failures.push("root package.json version must be a string");
    } else if (packageVersion !== value.slice(1)) {
      failures.push(`package.json version ${packageVersion} does not match release ${value}`);
    }
  } catch {
    failures.push("unable to read root package.json version");
  }

  return failures;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const release = process.env.SHARKTANK_RELEASE;
  const expectedSha = process.env.SHARKTANK_EXPECTED_SHA;
  const failures = validateReleaseIdentity({ cwd: process.cwd(), release, expectedSha });
  if (process.env.GITHUB_ACTIONS === "true") {
    if (process.env.GITHUB_REPOSITORY !== "Wizard-Gang/SharkTank") failures.push("release requires the SharkTank repository");
    if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") failures.push("release requires explicit workflow dispatch");
    if (process.env.GITHUB_REF !== "refs/heads/main") failures.push("release requires the main workflow ref");
    if (process.env.SHARKTANK_RELEASE_WORKFLOW_REF !== "Wizard-Gang/SharkTank/.github/workflows/release.yml@refs/heads/main") {
      failures.push("release requires the exact main Release workflow identity");
    }
    if (expectedSha === undefined) failures.push("release requires the expected accepted main SHA");
  }
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(`Release identity verified: ${release}`);
}
