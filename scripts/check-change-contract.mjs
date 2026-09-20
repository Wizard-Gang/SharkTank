import { execFileSync } from "node:child_process";
import { validatePullRequestContext } from "./change-contract.mjs";

const eventName = process.env.CHANGE_EVENT_NAME ?? "";
const title = process.env.CHANGE_PR_TITLE ?? "";
const branch = process.env.CHANGE_HEAD_REF ?? "";
const actor = process.env.CHANGE_ACTOR ?? "";
const headSha = process.env.CHANGE_HEAD_SHA ?? "";

let commitSubject = "";
let commitAuthorName = "";
let commitAuthorEmail = "";

if (eventName === "pull_request") {
  if (!headSha) {
    console.error("CHANGE_HEAD_SHA is required for pull_request validation");
    process.exit(1);
  }

  const raw = execFileSync(
    "git",
    ["show", "-s", "--format=%s%x1f%an%x1f%ae", headSha],
    { encoding: "utf8" },
  ).trim();

  [commitSubject = "", commitAuthorName = "", commitAuthorEmail = ""] = raw.split("\x1f");
}

const result = validatePullRequestContext({
  eventName,
  title,
  branch,
  actor,
  commitSubject,
  commitAuthorName,
  commitAuthorEmail,
});

if (result.failures.length) {
  console.error(result.failures.join("\n"));
  process.exit(1);
}

if (result.kind === "push") {
  console.log("Controlled change contract: push event; PR metadata validation not applicable.");
} else if (result.kind === "dependabot") {
  console.log("Controlled change contract: verified Dependabot pull request accepted.");
} else {
  console.log("Controlled change contract: PR title, branch, head commit ID, and type agree.");
}
