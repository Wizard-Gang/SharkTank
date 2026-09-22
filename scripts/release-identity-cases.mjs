import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateReleaseIdentity } from "./release-identity.mjs";

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
  return (result.stdout ?? "").trim();
}

function fixture(version = "1.2.3") {
  const cwd = mkdtempSync(join(tmpdir(), "sharktank-release-identity-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "Release Identity Test");
  git(cwd, "config", "user.email", "release-identity@example.invalid");
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ version }) + "\n");
  git(cwd, "add", "package.json");
  git(cwd, "commit", "-qm", "fixture");
  return cwd;
}

function cleanup(cwd) {
  rmSync(cwd, { recursive: true, force: true });
}

test("annotated semantic tag at HEAD with matching package version passes", () => {
  const cwd = fixture();
  try {
    git(cwd, "tag", "-a", "v1.2.3", "-m", "v1.2.3");
    assert.deepEqual(validateReleaseIdentity({ cwd, release: "v1.2.3" }), []);
  } finally {
    cleanup(cwd);
  }
});

test("lightweight tag fails", () => {
  const cwd = fixture();
  try {
    git(cwd, "tag", "v1.2.3");
    assert.match(validateReleaseIdentity({ cwd, release: "v1.2.3" }).join("\n"), /must be annotated/);
  } finally {
    cleanup(cwd);
  }
});

test("tag resolving to a different commit fails", () => {
  const cwd = fixture();
  try {
    git(cwd, "tag", "-a", "v1.2.3", "-m", "v1.2.3");
    writeFileSync(join(cwd, "next.txt"), "next\n");
    git(cwd, "add", "next.txt");
    git(cwd, "commit", "-qm", "next");
    assert.match(validateReleaseIdentity({ cwd, release: "v1.2.3" }).join("\n"), /does not point at checked-out HEAD/);
  } finally {
    cleanup(cwd);
  }
});

test("package version mismatch fails", () => {
  const cwd = fixture("1.2.4");
  try {
    git(cwd, "tag", "-a", "v1.2.3", "-m", "v1.2.3");
    assert.match(
      validateReleaseIdentity({ cwd, release: "v1.2.3" }).join("\n"),
      /package\.json version 1\.2\.4 does not match release v1\.2\.3/,
    );
  } finally {
    cleanup(cwd);
  }
});

test("malformed release identity fails before tag inspection", () => {
  const cwd = fixture();
  try {
    assert.match(validateReleaseIdentity({ cwd, release: "1.2.3" }).join("\n"), /must match semantic vX\.Y\.Z/);
  } finally {
    cleanup(cwd);
  }
});
