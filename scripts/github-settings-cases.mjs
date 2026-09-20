import test from "node:test";
import assert from "node:assert/strict";
import {
  compareGithubSettings,
  rulesetPayload,
} from "./github-settings.mjs";

const expected = {
  repository: "Wizard-Gang/SharkTank",
  defaultBranch: "main",
  mergeMethods: { mergeCommit: false, squash: true, rebase: false },
  deleteBranchOnMerge: true,
  requiredStatusChecks: ["verify"],
  rulesets: [
    {
      name: "main-protection",
      target: "branch",
      enforcement: "active",
      include: ["refs/heads/main"],
      rules: ["deletion", "non_fast_forward", "pull_request", "required_status_checks"],
    },
    {
      name: "release-tag-immutability",
      target: "tag",
      enforcement: "active",
      include: ["refs/tags/v*"],
      rules: ["deletion", "update"],
    },
  ],
};

function actual() {
  return {
    repository: {
      default_branch: "main",
      allow_merge_commit: false,
      allow_squash_merge: true,
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
    },
    rulesets: [
      {
        name: "main-protection",
        target: "branch",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
        rules: [
          { type: "deletion" },
          { type: "non_fast_forward" },
          { type: "pull_request", parameters: { allowed_merge_methods: ["squash"] } },
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [{ context: "verify" }],
              strict_required_status_checks_policy: true,
            },
          },
        ],
      },
      {
        name: "release-tag-immutability",
        target: "tag",
        enforcement: "active",
        conditions: { ref_name: { include: ["refs/tags/v*"], exclude: [] } },
        rules: [{ type: "deletion" }, { type: "update" }],
      },
    ],
  };
}

function failuresFor(mutator) {
  const state = structuredClone(actual());
  mutator(state);
  return compareGithubSettings(expected, state).join("\n");
}

test("matching configuration passes", () => {
  assert.deepEqual(compareGithubSettings(expected, actual()), []);
});

test("merge commits unexpectedly enabled fail", () => {
  assert.match(failuresFor((state) => { state.repository.allow_merge_commit = true; }), /merge commits/);
});

test("squash merge unexpectedly disabled fails", () => {
  assert.match(failuresFor((state) => { state.repository.allow_squash_merge = false; }), /squash merges/);
});

test("rebase merge unexpectedly enabled fails", () => {
  assert.match(failuresFor((state) => { state.repository.allow_rebase_merge = true; }), /rebase merges/);
});

test("automatic branch deletion disabled fails", () => {
  assert.match(failuresFor((state) => { state.repository.delete_branch_on_merge = false; }), /delete branch on merge/);
});

test("missing main ruleset fails", () => {
  assert.match(
    failuresFor((state) => { state.rulesets = state.rulesets.filter((r) => r.name !== "main-protection"); }),
    /missing ruleset: main-protection/,
  );
});

test("force-push protection missing fails", () => {
  assert.match(
    failuresFor((state) => {
      state.rulesets[0].rules = state.rulesets[0].rules.filter((rule) => rule.type !== "non_fast_forward");
    }),
    /missing non_fast_forward rule/,
  );
});

test("delete protection missing fails", () => {
  assert.match(
    failuresFor((state) => {
      state.rulesets[0].rules = state.rulesets[0].rules.filter((rule) => rule.type !== "deletion");
    }),
    /missing deletion rule/,
  );
});

test("required CI check missing fails", () => {
  assert.match(
    failuresFor((state) => {
      state.rulesets[0].rules.find((rule) => rule.type === "required_status_checks")
        .parameters.required_status_checks = [];
    }),
    /missing required status check verify/,
  );
});

test("missing release tag ruleset fails", () => {
  assert.match(
    failuresFor((state) => { state.rulesets = state.rulesets.filter((r) => r.target !== "tag"); }),
    /missing ruleset: release-tag-immutability/,
  );
});

test("tag update protection mismatch fails", () => {
  assert.match(
    failuresFor((state) => {
      state.rulesets[1].rules = state.rulesets[1].rules.filter((rule) => rule.type !== "update");
    }),
    /missing update rule/,
  );
});

test("tag deletion protection mismatch fails", () => {
  assert.match(
    failuresFor((state) => {
      state.rulesets[1].rules = state.rulesets[1].rules.filter((rule) => rule.type !== "deletion");
    }),
    /release-tag-immutability: missing deletion rule/,
  );
});

test("inaccessible provider data is never treated as compliant", () => {
  assert.match(
    compareGithubSettings(expected, { repository: null, rulesets: null }).join("\n"),
    /inaccessible or missing/,
  );
});

test("main ruleset payload encodes squash-only PR and required CI policy", () => {
  const payload = rulesetPayload(expected, expected.rulesets[0]);
  const pull = payload.rules.find((rule) => rule.type === "pull_request");
  const checks = payload.rules.find((rule) => rule.type === "required_status_checks");
  assert.deepEqual(pull.parameters.allowed_merge_methods, ["squash"]);
  assert.deepEqual(checks.parameters.required_status_checks, [{ context: "verify" }]);
  assert.ok(payload.rules.some((rule) => rule.type === "deletion"));
  assert.ok(payload.rules.some((rule) => rule.type === "non_fast_forward"));
});

test("tag payload encodes update and deletion restrictions", () => {
  const payload = rulesetPayload(expected, expected.rulesets[1]);
  assert.deepEqual(payload.rules.map((rule) => rule.type).sort(), ["deletion", "update"]);
});
