import { execFileSync } from "node:child_process";
import { LEGACY_TYPE_EXCEPTIONS, validateHistoryRecords } from "./change-contract.mjs";

const raw = execFileSync(
  "git",
  ["log", "--reverse", "--no-merges", "--format=%H%x1f%s%x1f%b%x1f%an%x1f%ae%x1e"],
  { encoding: "utf8" },
);

const records = raw
  .split("\x1e")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [sha = "", subject = "", body = "", authorName = "", authorEmail = ""] = entry.split("\x1f");
    return { sha, subject, body, authorName, authorEmail };
  });

const { failures, controlledCount, lastId } = validateHistoryRecords(records);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Structured history: ${controlledCount} sequential controlled changes through ${lastId} passed; `
  + `${LEGACY_TYPE_EXCEPTIONS.size} immutable pre-vocabulary type exceptions remain explicit.`,
);
