export const CONTROLLED_TYPES = Object.freeze([
  "INIT", "FEAT", "FIX", "SEC", "API", "A11Y", "I18N", "AI", "DB",
  "OPS", "TEST", "DOCS", "REFACTOR", "PERF", "BUILD", "REVERT", "CHORE",
]);

export const LEGACY_TYPE_EXCEPTIONS = Object.freeze(new Map([
  ["ST-008", "GOV"],
  ["ST-012", "GOV"],
  ["ST-013", "GOV"],
  ["ST-015", "GOV"],
  ["ST-020", "UX"],
  ["ST-022", "GOV"],
  ["ST-023", "UX"],
  ["ST-027", "GOV"],
]));

const controlledTypeSet = new Set(CONTROLLED_TYPES);
const titlePattern = /^\[(ST-(\d{3}))\] \[([A-Z][A-Z0-9-]*)\] ([^\r\n]+)$/;
const branchPattern = /^st-(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const dependabotSubjectPattern = /^build\(deps(?:-dev)?\): [Bb]ump .+ from .+ to .+$/;
const dependabotEmailPattern = /^\d+\+dependabot\[bot\]@users\.noreply\.github\.com$/;
const requiredHeadings = ["Change", "Reason", "Impact", "Risk", "Controls", "Validation", "Evidence"];

export function parseControlledTitle(subject) {
  const match = subject.match(titlePattern);
  if (!match) return null;
  return {
    id: match[1],
    number: Number(match[2]),
    type: match[3],
    summary: match[4],
  };
}

export function parseControlledBranch(branch) {
  const match = branch.match(branchPattern);
  if (!match) return null;
  return {
    id: `ST-${match[1]}`,
    number: Number(match[1]),
  };
}

export function isVerifiedDependabotCommit({ authorName, authorEmail, subject }) {
  return authorName === "dependabot[bot]"
    && dependabotEmailPattern.test(authorEmail)
    && dependabotSubjectPattern.test(subject);
}

function validateCurrentType(id, type, failures, label) {
  if (!controlledTypeSet.has(type)) {
    failures.push(`${label}: ${id} uses unsupported type ${type}`);
  }
}

function validateHistoricalType(id, type, failures, label) {
  if (controlledTypeSet.has(type)) return;
  if (LEGACY_TYPE_EXCEPTIONS.get(id) === type) return;
  failures.push(`${label}: ${id} uses unsupported type ${type}`);
}

export function validateHistoryRecords(records) {
  const failures = [];
  let expectedNumber = 1;
  let controlledCount = 0;

  for (const record of records) {
    if (isVerifiedDependabotCommit(record)) continue;

    const parsed = parseControlledTitle(record.subject);
    const label = record.sha ? record.sha.slice(0, 12) : "history";

    if (!parsed) {
      failures.push(`${label}: invalid controlled-change subject: ${record.subject}`);
      continue;
    }

    const expectedId = `ST-${String(expectedNumber).padStart(3, "0")}`;
    if (parsed.id !== expectedId) {
      failures.push(`${label}: expected ${expectedId}, found ${parsed.id}`);
    }
    expectedNumber += 1;
    controlledCount += 1;

    validateHistoricalType(parsed.id, parsed.type, failures, label);

    for (const heading of requiredHeadings) {
      if (!new RegExp(`(?:^|\\n)${heading}:\\n`).test(record.body)) {
        failures.push(`${label}: missing ${heading}: heading`);
      }
    }
    if (!/(?:^|\n)(?:Notes|Source):(?:\n| )/.test(record.body)) {
      failures.push(`${label}: missing Notes: or Source: provenance field`);
    }
  }

  if (controlledCount === 0) failures.push("no controlled ST changes found");

  return {
    failures,
    controlledCount,
    lastId: controlledCount === 0
      ? null
      : `ST-${String(controlledCount).padStart(3, "0")}`,
  };
}

export function validatePullRequestContext(context) {
  const failures = [];

  if (!context.eventName) {
    return { failures, kind: "local" };
  }

  if (context.eventName === "push") {
    return { failures, kind: "push" };
  }

  if (context.eventName !== "pull_request") {
    return {
      failures: [`unsupported GitHub event: ${context.eventName || "(empty)"}`],
      kind: "unsupported",
    };
  }

  const title = parseControlledTitle(context.title);
  const branch = parseControlledBranch(context.branch);
  const commit = parseControlledTitle(context.commitSubject);

  if (!title) {
    failures.push(`pull request title must match [ST-NNN] [TYPE] Imperative summary: ${context.title}`);
  } else {
    validateCurrentType(title.id, title.type, failures, "pull request title");
  }

  if (!branch) {
    failures.push(`branch must match st-NNN-imperative-summary: ${context.branch}`);
  }

  if (!commit) {
    failures.push(`head commit must use a controlled title: ${context.commitSubject}`);
  } else {
    validateCurrentType(commit.id, commit.type, failures, "head commit");
  }

  if (title && branch && title.id !== branch.id) {
    failures.push(`pull request/branch ID mismatch: ${title.id} vs ${branch.id}`);
  }
  if (title && commit && title.id !== commit.id) {
    failures.push(`pull request/head commit ID mismatch: ${title.id} vs ${commit.id}`);
  }
  if (title && commit && title.type !== commit.type) {
    failures.push(`pull request/head commit type mismatch: ${title.type} vs ${commit.type}`);
  }

  return { failures, kind: "controlled" };
}
