import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROLLED_TYPES,
  LEGACY_TYPE_EXCEPTIONS,
  validateHistoryRecords,
  validatePullRequestContext,
} from "./change-contract.mjs";

const body = [
  "Change:\nvalue",
  "Reason:\nvalue",
  "Impact:\nvalue",
  "Risk:\nvalue",
  "Controls:\nvalue",
  "Validation:\nvalue",
  "Evidence:\nvalue",
  "Notes:\nvalue",
].join("\n\n");

function controlledRecord(number, type = "BUILD") {
  const id = `ST-${String(number).padStart(3, "0")}`;
  return {
    sha: String(number).padStart(40, "a"),
    subject: `[${id}] [${type}] Do controlled work`,
    body,
    authorName: "WizardGangAI",
    authorEmail: "jacob@wizardgang.ai",
  };
}

function controlledContext(overrides = {}) {
  return {
    eventName: "pull_request",
    title: "[ST-051] [BUILD] Enforce controlled change",
    branch: "st-051-enforce-controlled-change",
    actor: "WizardGangAI",
    commitSubject: "[ST-051] [BUILD] Enforce controlled change",
    commitAuthorName: "WizardGangAI",
    commitAuthorEmail: "jacob@wizardgang.ai",
    ...overrides,
  };
}

test("current type vocabulary is exact", () => {
  assert.deepEqual(CONTROLLED_TYPES, [
    "INIT", "FEAT", "FIX", "SEC", "API", "A11Y", "I18N", "AI", "DB",
    "OPS", "TEST", "DOCS", "REFACTOR", "PERF", "BUILD", "REVERT", "CHORE",
  ]);
});

test("valid controlled pull request passes", () => {
  assert.deepEqual(validatePullRequestContext(controlledContext()).failures, []);
});

test("malformed PR title fails", () => {
  const result = validatePullRequestContext(controlledContext({ title: "ST-051 BUILD nope" }));
  assert.match(result.failures.join("\n"), /pull request title must match/);
});

test("unsupported current type fails even when it was historically used", () => {
  const result = validatePullRequestContext(controlledContext({
    title: "[ST-051] [GOV] Enforce controlled change",
    commitSubject: "[ST-051] [GOV] Enforce controlled change",
  }));
  assert.match(result.failures.join("\n"), /unsupported type GOV/);
});

test("malformed branch fails", () => {
  const result = validatePullRequestContext(controlledContext({ branch: "feature/st-051" }));
  assert.match(result.failures.join("\n"), /branch must match/);
});

test("PR and branch IDs must agree", () => {
  const result = validatePullRequestContext(controlledContext({ branch: "st-052-enforce-controlled-change" }));
  assert.match(result.failures.join("\n"), /pull request\/branch ID mismatch/);
});

test("PR and head commit IDs must agree", () => {
  const result = validatePullRequestContext(controlledContext({
    commitSubject: "[ST-052] [BUILD] Enforce controlled change",
  }));
  assert.match(result.failures.join("\n"), /pull request\/head commit ID mismatch/);
});

test("PR and head commit types must agree", () => {
  const result = validatePullRequestContext(controlledContext({
    commitSubject: "[ST-051] [TEST] Enforce controlled change",
  }));
  assert.match(result.failures.join("\n"), /pull request\/head commit type mismatch/);
});

test("Dependabot pull requests no longer bypass controlled identity", () => {
  const context = controlledContext({
    title: "build(deps-dev): bump vitest from 4.1.11 to 5.0.1",
    branch: "dependabot/npm_and_yarn/vitest-5.0.1",
    actor: "dependabot[bot]",
    commitSubject: "build(deps-dev): bump vitest from 4.1.11 to 5.0.1",
    commitAuthorName: "dependabot[bot]",
    commitAuthorEmail: "49699333+dependabot[bot]@users.noreply.github.com",
  });
  assert.match(validatePullRequestContext(context).failures.join("\n"), /pull request title must match/);
});

test("bot-like title does not bypass validation for a human actor", () => {
  const result = validatePullRequestContext(controlledContext({
    title: "build(deps-dev): bump vitest from 4.1.11 to 5.0.1",
    branch: "dependabot/npm_and_yarn/vitest-5.0.1",
    actor: "WizardGangAI",
    commitSubject: "build(deps-dev): bump vitest from 4.1.11 to 5.0.1",
    commitAuthorName: "dependabot[bot]",
    commitAuthorEmail: "49699333+dependabot[bot]@users.noreply.github.com",
  }));
  assert.ok(result.failures.length > 0);
});

test("Dependabot actor on a human branch does not bypass validation", () => {
  const result = validatePullRequestContext(controlledContext({
    title: "build(deps): bump vite from 8.2.2 to 8.3.0",
    branch: "st-051-enforce-controlled-change",
    actor: "dependabot[bot]",
    commitSubject: "build(deps): bump vite from 8.2.2 to 8.3.0",
    commitAuthorName: "dependabot[bot]",
    commitAuthorEmail: "49699333+dependabot[bot]@users.noreply.github.com",
  }));
  assert.ok(result.failures.length > 0);
});

test("local execution skips only unavailable PR metadata validation", () => {
  const result = validatePullRequestContext(controlledContext({ eventName: "" }));
  assert.deepEqual(result.failures, []);
  assert.equal(result.kind, "local");
});

test("push events skip only PR metadata validation", () => {
  const result = validatePullRequestContext(controlledContext({ eventName: "push" }));
  assert.deepEqual(result.failures, []);
  assert.equal(result.kind, "push");
});

test("sequential controlled history passes", () => {
  const result = validateHistoryRecords([controlledRecord(1), controlledRecord(2), controlledRecord(3)]);
  assert.deepEqual(result.failures, []);
  assert.equal(result.lastId, "ST-003");
});

test("duplicate controlled ID fails", () => {
  const result = validateHistoryRecords([controlledRecord(1), controlledRecord(1)]);
  assert.match(result.failures.join("\n"), /expected ST-002, found ST-001/);
});

test("skipped controlled ID fails", () => {
  const result = validateHistoryRecords([controlledRecord(1), controlledRecord(3)]);
  assert.match(result.failures.join("\n"), /expected ST-002, found ST-003/);
});

test("out-of-order controlled IDs fail", () => {
  const result = validateHistoryRecords([controlledRecord(2), controlledRecord(1)]);
  assert.match(result.failures.join("\n"), /expected ST-001, found ST-002/);
});

test("unsupported history type fails outside an exact legacy exception", () => {
  const result = validateHistoryRecords([controlledRecord(1, "GOV")]);
  assert.match(result.failures.join("\n"), /unsupported type GOV/);
});

test("exact published legacy type exceptions remain accepted", () => {
  const records = Array.from({ length: 8 }, (_, index) => {
    const number = index + 1;
    return controlledRecord(number, LEGACY_TYPE_EXCEPTIONS.get(`ST-${String(number).padStart(3, "0")}`) ?? "BUILD");
  });
  assert.deepEqual(validateHistoryRecords(records).failures, []);
});

test("verified Dependabot commits do not consume an ST sequence number", () => {
  const records = [
    controlledRecord(1),
    {
      sha: "d".repeat(40),
      subject: "build(deps-dev): bump @types/node from 26.4.0 to 26.5.1",
      body: "",
      authorName: "dependabot[bot]",
      authorEmail: "49699333+dependabot[bot]@users.noreply.github.com",
    },
    controlledRecord(2),
  ];
  assert.deepEqual(validateHistoryRecords(records).failures, []);
});
