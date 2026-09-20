import { readFile } from "node:fs/promises";

export const GITHUB_API_VERSION = "2026-03-10";

export async function loadExpectedSettings(
  url = new URL("../config/github-repository-settings.json", import.meta.url),
) {
  return JSON.parse(await readFile(url, "utf8"));
}

function valuesOf(list) {
  return Array.isArray(list) ? list : [];
}

function hasAll(actual, expected) {
  const set = new Set(valuesOf(actual));
  return valuesOf(expected).every((value) => set.has(value));
}

function rulesByType(ruleset) {
  return new Map(valuesOf(ruleset?.rules).map((rule) => [rule.type, rule]));
}

function statusContexts(ruleset) {
  const rule = rulesByType(ruleset).get("required_status_checks");
  return valuesOf(rule?.parameters?.required_status_checks).map((check) => check.context);
}

export function compareGithubSettings(expected, actual) {
  const failures = [];
  const repository = actual?.repository;
  const rulesets = actual?.rulesets;

  if (!repository) {
    failures.push("repository settings are inaccessible or missing");
  } else {
    const fields = [
      ["default branch", repository.default_branch, expected.defaultBranch],
      ["merge commits", repository.allow_merge_commit, expected.mergeMethods.mergeCommit],
      ["squash merges", repository.allow_squash_merge, expected.mergeMethods.squash],
      ["rebase merges", repository.allow_rebase_merge, expected.mergeMethods.rebase],
      ["delete branch on merge", repository.delete_branch_on_merge, expected.deleteBranchOnMerge],
    ];
    for (const [label, actualValue, expectedValue] of fields) {
      if (actualValue !== expectedValue) {
        failures.push(label + ": expected " + expectedValue + ", got " + actualValue);
      }
    }
  }

  if (!Array.isArray(rulesets)) {
    failures.push("repository rulesets are inaccessible or missing");
    return failures;
  }

  for (const expectedRuleset of expected.rulesets) {
    const actualRuleset = rulesets.find((ruleset) => ruleset.name === expectedRuleset.name);
    if (!actualRuleset) {
      failures.push("missing ruleset: " + expectedRuleset.name);
      continue;
    }
    if (actualRuleset.target !== expectedRuleset.target) {
      failures.push(
        expectedRuleset.name + ": expected target " + expectedRuleset.target
        + ", got " + actualRuleset.target,
      );
    }
    if (actualRuleset.enforcement !== expectedRuleset.enforcement) {
      failures.push(
        expectedRuleset.name + ": expected enforcement " + expectedRuleset.enforcement
        + ", got " + actualRuleset.enforcement,
      );
    }

    const includes = actualRuleset.conditions?.ref_name?.include;
    if (!hasAll(includes, expectedRuleset.include)) {
      failures.push(
        expectedRuleset.name + ": missing ref include " + expectedRuleset.include.join(", "),
      );
    }

    const ruleMap = rulesByType(actualRuleset);
    for (const ruleType of expectedRuleset.rules) {
      if (!ruleMap.has(ruleType)) {
        failures.push(expectedRuleset.name + ": missing " + ruleType + " rule");
      }
    }

    if (expectedRuleset.target === "branch") {
      const pullRequest = ruleMap.get("pull_request");
      const allowed = pullRequest?.parameters?.allowed_merge_methods;
      if (!Array.isArray(allowed) || allowed.length !== 1 || allowed[0] !== "merge") {
        failures.push(expectedRuleset.name + ": pull request rule must allow merge commits only");
      }

      const contexts = statusContexts(actualRuleset);
      if (!hasAll(contexts, expected.requiredStatusChecks)) {
        failures.push(
          expectedRuleset.name + ": missing required status check "
          + expected.requiredStatusChecks.join(", "),
        );
      }
    }
  }

  return failures;
}

export function rulesetPayload(expected, ruleset) {
  const rules = ruleset.rules.map((type) => {
    if (type === "pull_request") {
      return {
        type,
        parameters: {
          allowed_merge_methods: ["merge"],
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: false,
        },
      };
    }
    if (type === "required_status_checks") {
      return {
        type,
        parameters: {
          do_not_enforce_on_create: true,
          required_status_checks: expected.requiredStatusChecks.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      };
    }
    return { type };
  });

  return {
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    bypass_actors: [],
    conditions: {
      ref_name: {
        include: ruleset.include,
        exclude: [],
      },
    },
    rules,
  };
}

export async function githubApi(
  path,
  { token, method = "GET", body, fetchImpl = fetch } = {},
) {
  if (!token) {
    const error = new Error("GH_ADMIN_TOKEN or GH_TOKEN is required");
    error.code = "GITHUB_AUTH_REQUIRED";
    throw error;
  }

  const response = await fetchImpl("https://api.github.com" + path, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: "Bearer " + token,
      "content-type": "application/json",
      "user-agent": "sharktank-repository-settings",
      "x-github-api-version": GITHUB_API_VERSION,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    const detail = await response.text();
    const error = new Error(
      "GitHub Administration API is inaccessible (" + response.status + "): " + detail,
    );
    error.code = "GITHUB_ADMIN_INACCESSIBLE";
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      "GitHub API " + method + " " + path + " failed (" + response.status + "): " + detail,
    );
  }

  if (response.status === 204) return null;
  return await response.json();
}

export async function fetchLiveGithubSettings(
  expected,
  { token, fetchImpl = fetch } = {},
) {
  const [owner, name] = expected.repository.split("/");
  const root = "/repos/" + owner + "/" + name;
  const repository = await githubApi(root, { token, fetchImpl });
  const summaries = await githubApi(root + "/rulesets", { token, fetchImpl });
  const rulesets = [];
  for (const summary of summaries) {
    rulesets.push(
      await githubApi(root + "/rulesets/" + summary.id, { token, fetchImpl }),
    );
  }
  return { repository, rulesets };
}

export async function verifyLiveGithubSettings(expected, options = {}) {
  const actual = await fetchLiveGithubSettings(expected, options);
  return {
    actual,
    failures: compareGithubSettings(expected, actual),
  };
}
