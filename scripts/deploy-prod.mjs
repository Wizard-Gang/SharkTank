import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Load the gitignored .env into process.env, without overriding anything already set
 * in the real environment (so CI can supply its own values).
 *
 * The Cloudflare account id lives here rather than in wrangler.jsonc: that file is
 * tracked, and an account identifier does not belong in a tracked file. spawnSync
 * inherits process.env, so wrangler picks it up from the mutation below.
 */
function loadDotEnv() {
  let text;
  try {
    text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const split = line.indexOf("=");
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    process.env[key] = line.slice(split + 1).trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

loadDotEnv();

const env = "wizardgangprod";
const dryRun = process.argv.includes("--dry-run");
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}

const release = (process.env.SHARKTANK_RELEASE ?? "").trim();
const releasePattern = /^v\d+\.\d+\.\d+$/;
const tagsAtHead = run("git", ["tag", "--points-at", "HEAD"], true).split(/\s+/).filter(Boolean);
if (!releasePattern.test(release) || !tagsAtHead.includes(release)) {
  console.error("Refusing production deploy: SHARKTANK_RELEASE must be a semantic vX.Y.Z tag pointing at HEAD.");
  process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error("Refusing production deploy: CLOUDFLARE_ACCOUNT_ID is not set. It lives in .env (gitignored), not in wrangler.jsonc.");
  process.exit(1);
}

run("npm", ["run", "build"]);
if (!dryRun) {
  const secrets = run("npx", ["wrangler", "secret", "list", "--env", env], true);
  const missing = ["OPS_TOKEN", "OPS_USERNAME"].filter((name) => !secrets.includes(name));
  if (missing.length) {
    console.error(`Refusing production deploy: missing required secrets: ${missing.join(", ")}. Configure each with wrangler secret put <NAME> --env wizardgangprod.`);
    process.exit(1);
  }
}
run("npx", ["wrangler", "deploy", ...(dryRun ? ["--dry-run"] : []), "--env", env, "--var", `SHARKTANK_RELEASE:${release}`]);
