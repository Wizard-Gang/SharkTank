#!/usr/bin/env node
// One-click local dev for the WHOLE stack: teardown → reset → build → start → readiness → open.
// Starts BOTH backends so the client can toggle between them (menu switch / ?api=):
//   • PHP backend (packages/php-runtime): http://localhost:8080 · ws://localhost:8081
//   • TS/Cloudflare backend + client: http://localhost:8787
// Run with: npm run dev (npm run local is the compatibility alias); Ctrl-C stops managed Wrangler + PHP processes.
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  createOwnershipRecord,
  inspectProcess,
  readOwnershipRecord,
  removeOwnershipRecord,
  requirePortsFree,
  stopOwnedProcess,
  writeOwnershipRecord,
} from "./local-process-ownership.mjs";
import {
  parseLocalLifecycleArgs,
  waitForHttpReady,
  waitForReadinessAndMaybeOpen,
} from "./local-readiness.mjs";
import {
  createLocalResetPlan,
  executeLocalResetPlan,
} from "./local-reset.mjs";

const PORT = 8787;
const PHP_PORTS = [8080, 8081];
const APP_URL = `http://localhost:${PORT}`;
const PROJECT_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const phpScript = fileURLToPath(new URL("./php.mjs", import.meta.url));
const MODULE_PHP = resolve(fileURLToPath(new URL("../packages/php-runtime", import.meta.url)));
const WRANGLER_OWNER_FILE = join(PROJECT_ROOT, ".wrangler", "sharktank-local-owner.json");
const HAS_PHP = existsSync(MODULE_PHP);
const { noOpen, resetPhpData } = parseLocalLifecycleArgs(process.argv.slice(2));

const run = (cmd, opts = {}) =>
  execSync(cmd, { cwd: PROJECT_ROOT, stdio: "inherit", ...opts });
const quiet = (cmd) => {
  try {
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: "ignore" });
  } catch {
    // Best-effort local convenience commands must not redefine lifecycle success.
  }
};
const step = (msg) => console.log(`\n\x1b[35m▸ ${msg}\x1b[0m`);
const php = (cmd) =>
  spawnSync(process.execPath, [phpScript, cmd], { cwd: PROJECT_ROOT, stdio: "inherit" });

function signalManagedChild(child, signal) {
  if (!child || child.exitCode !== null || !child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function stopOwnedWrangler(record) {
  if (!record) return true;
  const result = await stopOwnedProcess(record, {
    kind: "wrangler",
    root: PROJECT_ROOT,
    cwd: PROJECT_ROOT,
    group: true,
  });
  if (result.stopped || result.reason === "not-running") {
    removeOwnershipRecord(WRANGLER_OWNER_FILE);
    return true;
  }
  return false;
}

async function stopRecordedWrangler() {
  const record = readOwnershipRecord(WRANGLER_OWNER_FILE);
  if (!record) return;

  if (await stopOwnedWrangler(record)) return;
  console.warn(
    "\x1b[33m⚠ Existing Wrangler ownership record could not be proven; it will not be signaled.\x1b[0m",
  );
}

async function captureWranglerOwner(child) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const identity = inspectProcess(child.pid);
    if (identity?.cwd === PROJECT_ROOT) {
      return createOwnershipRecord(identity, {
        kind: "wrangler",
        root: PROJECT_ROOT,
        cwd: PROJECT_ROOT,
      });
    }
    if (child.exitCode !== null) break;
    await sleep(50);
  }
  throw new Error("could not establish checkout ownership for the started Wrangler process");
}

function openBrowser(url) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  quiet(`${opener} ${url}`);
}

async function cleanupFailedStartup(ownerRecord) {
  const failures = [];
  try {
    if (!(await stopOwnedWrangler(ownerRecord))) {
      failures.push(new Error(
        "Wrangler ownership changed during startup cleanup; refusing further signals.",
      ));
    }
  } catch (error) {
    failures.push(error);
  }

  if (HAS_PHP) {
    const stoppedPhp = php("stop");
    if (stoppedPhp.error) failures.push(stoppedPhp.error);
    else if (stoppedPhp.status !== 0) {
      failures.push(new Error("PHP backend stop refused because checkout ownership was not proven"));
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "local startup cleanup could not be fully verified");
  }
}

// 0. First-run setup. Both runtime implementations are tracked in this repository.
if (!existsSync(join(PROJECT_ROOT, "node_modules"))) {
  step("Installing dependencies (first run)");
  run("npm install");
}

// 1. TEARDOWN — stop only processes whose ownership by this checkout is proven.
step("Teardown: stopping checkout-owned local servers only");
await stopRecordedWrangler();
if (HAS_PHP) {
  const stopped = php("stop");
  if (stopped.error) throw stopped.error;
  if (stopped.status !== 0) {
    throw new Error("PHP backend stop refused because checkout ownership was not proven");
  }
}
if (existsSync(WRANGLER_OWNER_FILE)) {
  throw new Error(
    "Wrangler ownership remains ambiguous for this checkout; refusing to reset .wrangler/.",
  );
}
await requirePortsFree([PORT, ...(HAS_PHP ? PHP_PORTS : [])]);

// 2. RESET — clear only positively classified checkout-local state.
const resetPlan = createLocalResetPlan(PROJECT_ROOT, { resetPhpData });
step(
  resetPhpData
    ? "Reset: clearing disposable dist/ and .wrangler/ plus explicitly requested PHP data/"
    : "Reset: clearing disposable dist/ and .wrangler/; preserving PHP data/",
);
executeLocalResetPlan(resetPlan);

// 3. BUILD — the client bundle (served by both backends' clients).
step("Build: vite build");
run("npx vite build");

// 4. START PHP backend (daemonized); non-fatal if php/composer are missing.
if (HAS_PHP) {
  step("Start: PHP backend (packages/php-runtime)");
  const started = php("start");
  if (started.error) throw started.error;
  if (started.status !== 0) {
    console.warn(
      "\x1b[33m⚠ PHP backend didn't start (php/composer installed?). Continuing with TS only.\x1b[0m",
    );
  }
}

// 5. START — TS/Cloudflare server in the foreground.
step(`Start: wrangler dev on port ${PORT}   (toggle backend from the menu)`);
const child = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], {
  cwd: PROJECT_ROOT,
  stdio: "inherit",
  detached: process.platform !== "win32",
});

let stopped = false;
let startupComplete = false;
let observedChildExit = false;
let observedChildExitCode = 1;
const clearWranglerOwner = () => removeOwnershipRecord(WRANGLER_OWNER_FILE);
const stopPhp = () => {
  if (stopped || !HAS_PHP) return;
  stopped = true;
  const result = php("stop");
  if (result.status !== 0) {
    console.error("\x1b[31m✘ PHP stop refused because ownership could not be proven.\x1b[0m");
  }
};

child.on("exit", (code) => {
  observedChildExit = true;
  observedChildExitCode = code ?? 1;
  if (!startupComplete) return;
  clearWranglerOwner();
  stopPhp();
  process.exit(code ?? 0);
});

let ownerRecord;
try {
  ownerRecord = await captureWranglerOwner(child);
  writeOwnershipRecord(WRANGLER_OWNER_FILE, ownerRecord);
} catch (error) {
  if (HAS_PHP) php("stop");
  throw error;
}

process.on("SIGINT", () => signalManagedChild(child, "SIGINT"));
process.on("SIGTERM", () => signalManagedChild(child, "SIGTERM"));
process.on("exit", () => {
  clearWranglerOwner();
  stopPhp();
});

// 6. READINESS + OPEN — HTTP readiness is bounded; browser launching is optional/best-effort.
try {
  await waitForReadinessAndMaybeOpen({
    noOpen,
    waitForReadyFn: () => waitForHttpReady({
      url: APP_URL,
      childExitedFn: () => observedChildExit || child.exitCode !== null,
    }),
    onReadyFn: () => step(
      `Ready: ${APP_URL}${noOpen ? "   (browser opening disabled by --no-open)" : ""}`,
    ),
    openFn: () => openBrowser(APP_URL),
  });
  if (observedChildExit || child.exitCode !== null) {
    throw new Error("managed Wrangler exited before local application readiness completed");
  }
} catch (error) {
  try {
    await cleanupFailedStartup(ownerRecord);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      "local application startup failed and cleanup could not be fully verified",
    );
  }
  throw error;
}

startupComplete = true;
if (observedChildExit || child.exitCode !== null) {
  clearWranglerOwner();
  stopPhp();
  process.exit(observedChildExitCode);
}
