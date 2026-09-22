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

export function validateReleaseIdentity({ cwd, release }) {
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
  const failures = validateReleaseIdentity({ cwd: process.cwd(), release });
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(`Release identity verified: ${release}`);
}
