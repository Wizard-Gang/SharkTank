import test from "node:test";
import assert from "node:assert/strict";
import { deploymentPreconditionFailures } from "./deploy-prod.mjs";

const release = "v1.2.3";
const validEnv = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "Wizard-Gang/SharkTank",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF_TYPE: "tag",
  GITHUB_REF_NAME: release,
  GITHUB_REF: `refs/tags/${release}`,
  SHARKTANK_RELEASE_WORKFLOW_REF: `Wizard-Gang/SharkTank/.github/workflows/release.yml@refs/tags/${release}`,
  CLOUDFLARE_ACCOUNT_ID: "test-account",
  CLOUDFLARE_API_TOKEN: "test-token",
};

function real(overrides = {}) {
  return deploymentPreconditionFailures({
    dryRun: false,
    env: { ...validEnv, ...(overrides.env ?? {}) },
    release: overrides.release ?? release,
    tagsAtHead: overrides.tagsAtHead ?? [release],
    releaseIdentityFailures: overrides.releaseIdentityFailures ?? [],
  });
}

test("governed release workflow context can reach the real deployment path", () => {
  assert.deepEqual(real(), []);
});

test("ordinary local invocation cannot reach the real deployment path", () => {
  const failures = real({ env: {
    GITHUB_ACTIONS: undefined,
    GITHUB_REPOSITORY: undefined,
    GITHUB_EVENT_NAME: undefined,
    GITHUB_REF_TYPE: undefined,
    GITHUB_REF_NAME: undefined,
    GITHUB_REF: undefined,
    SHARKTANK_RELEASE_WORKFLOW_REF: undefined,
  } });
  assert.match(failures.join("\n"), /requires GitHub Actions/);
  assert.match(failures.join("\n"), /exact Release workflow tag context/);
});

test("branch or untagged context cannot reach the real deployment path", () => {
  const failures = real({
    env: {
      GITHUB_REF_TYPE: "branch",
      GITHUB_REF_NAME: "main",
      GITHUB_REF: "refs/heads/main",
    },
    tagsAtHead: [],
  });
  assert.match(failures.join("\n"), /semantic vX\.Y\.Z tag pointing at HEAD/);
  assert.match(failures.join("\n"), /requires a tag ref/);
});

test("mismatched release tag cannot reach the real deployment path", () => {
  const failures = real({ env: { GITHUB_REF_NAME: "v1.2.4", GITHUB_REF: "refs/tags/v1.2.4" } });
  assert.match(failures.join("\n"), /GITHUB_REF_NAME to match SHARKTANK_RELEASE/);
  assert.match(failures.join("\n"), /GITHUB_REF to be the exact release tag/);
});

test("a different workflow context cannot reach the real deployment path", () => {
  const failures = real({
    env: {
      SHARKTANK_RELEASE_WORKFLOW_REF: `Wizard-Gang/SharkTank/.github/workflows/deploy.yml@refs/tags/${release}`,
    },
  });
  assert.match(failures.join("\n"), /exact Release workflow tag context/);
});

test("exact release identity failures block real production deployment", () => {
  const failures = real({ releaseIdentityFailures: ["release tag must be annotated: v1.2.3"] });
  assert.match(failures.join("\n"), /exact release identity failed: release tag must be annotated/);
});

test("real deployment requires protected-environment Cloudflare credentials", () => {
  const failures = real({ env: { CLOUDFLARE_ACCOUNT_ID: undefined, CLOUDFLARE_API_TOKEN: undefined } });
  assert.match(failures.join("\n"), /CLOUDFLARE_ACCOUNT_ID is required/);
  assert.match(failures.join("\n"), /CLOUDFLARE_API_TOKEN is required/);
});

test("local dry-run keeps tag and account requirements without GitHub Actions", () => {
  assert.deepEqual(deploymentPreconditionFailures({
    dryRun: true,
    env: { CLOUDFLARE_ACCOUNT_ID: "local-account" },
    release,
    tagsAtHead: [release],
    releaseIdentityFailures: ["ignored for dry-run"],
  }), []);
});
