import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { validateHistoryRecords } from "./change-contract.mjs";
import { validateImplementationPlan } from "./implementation-plan.mjs";

const raw = execFileSync("git", ["log", "--reverse", "--no-merges", "--format=%H%x1f%s%x1f%b%x1f%an%x1f%ae%x1e"], { encoding: "utf8" });
const records = raw.split("\x1e").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const [sha = "", subject = "", body = "", authorName = "", authorEmail = ""] = entry.split("\x1f");
  return { sha, subject, body, authorName, authorEmail };
});
const history = validateHistoryRecords(records);
if (history.failures.length) {
  console.error("Implementation-plan history authority is invalid:");
  console.error(history.failures.join("\n"));
  process.exit(1);
}
const planExists = existsSync("implementation_plan.md");
const planContent = planExists ? readFileSync("implementation_plan.md", "utf8") : "";
const failures = validateImplementationPlan({ planExists, planContent, lastDeliveredId: history.lastId });
if (failures.length) {
  for (const failure of failures) console.error("FAIL " + failure);
  process.exit(1);
}
if (planExists) console.log(`Implementation plan contains current/future work ahead of ${history.lastId}.`);
else console.log(`Implementation plan is absent after ${history.lastId}; the active queue is exhausted.`);
