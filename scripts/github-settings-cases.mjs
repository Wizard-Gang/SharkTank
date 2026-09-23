import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compareGithubSettings,
  rulesetPayload,
  verifyLiveGithubSettings,
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


const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const verifyScript = await readFile(
  new URL("./verify-github-settings.mjs", import.meta.url),
  "utf8",
);
const applyScript = await readFile(
  new URL("./apply-github-settings.mjs", import.meta.url),
  "utf8",
);

test("settings CLI exposes the normalized pure, verify, and apply contract", () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(scripts["test:github-settings"], "node --test scripts/github-settings-cases.mjs");
  assert.equal(scripts["verify:github-settings"], "node scripts/verify-github-settings.mjs");
  assert.equal(scripts["apply:github-settings"], "node scripts/apply-github-settings.mjs");
  assert.equal(scripts["check:github-settings"], undefined);
  assert.match(scripts.check, /npm run test:github-settings/);
  assert.doesNotMatch(scripts.check, /npm run (?:verify|apply|check):github-settings/);
});

test("live GitHub settings verification performs read-only provider requests", async () => {
  const state = actual();
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? "GET";
    requests.push({ url, method });
    assert.equal(method, "GET");

    let value;
    if (url.endsWith("/repos/Wizard-Gang/SharkTank")) {
      value = state.repository;
    } else if (url.endsWith("/rulesets")) {
      value = state.rulesets.map((ruleset, index) => ({
        id: index + 1,
        name: ruleset.name,
      }));
    } else if (url.endsWith("/rulesets/1")) {
      value = state.rulesets[0];
    } else if (url.endsWith("/rulesets/2")) {
      value = state.rulesets[1];
    } else {
      throw new Error("unexpected provider read: " + url);
    }

    return {
      status: 200,
      ok: true,
      json: async () => structuredClone(value),
      text: async () => JSON.stringify(value),
    };
  };

  const { failures } = await verifyLiveGithubSettings(expected, {
    token: "test-token",
    fetchImpl,
  });
  assert.deepEqual(failures, []);
  assert.ok(requests.length >= 4);
});

test("apply is the explicit mutation path and re-reads provider state after mutation", () => {
  assert.match(verifyScript, /verifyLiveGithubSettings/);
  assert.doesNotMatch(verifyScript, /method:\s*["'](?:PATCH|PUT|POST|DELETE)["']/);

  const mutationIndexes = [
    applyScript.lastIndexOf('method: "PATCH"'),
    applyScript.lastIndexOf('method: "PUT"'),
    applyScript.lastIndexOf('method: "POST"'),
  ];
  assert.ok(mutationIndexes.every((index) => index >= 0));
  const freshReadIndex = applyScript.lastIndexOf("await fetchLiveGithubSettings");
  assert.ok(freshReadIndex > Math.max(...mutationIndexes));
});
