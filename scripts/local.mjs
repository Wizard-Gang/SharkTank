#!/usr/bin/env node
// One-click local dev for the WHOLE stack: teardown → reset → build → start → open.
// Starts BOTH backends so the client can toggle between them (menu switch / ?api=):
//   • PHP backend (packages/php-runtime): http://localhost:8080 · ws://localhost:8081
//   • TS/Cloudflare backend + client: http://localhost:8787
// Run with: npm run local   (Ctrl-C stops wrangler AND the PHP daemon)
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PORT = 8787;
const APP_URL = `http://localhost:${PORT}`;
const phpScript = fileURLToPath(new URL("./php.mjs", import.meta.url));
const MODULE_PHP = fileURLToPath(new URL("../packages/php-runtime", import.meta.url));
const HAS_PHP = existsSync(MODULE_PHP);

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });
const quiet = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); } catch {} };
const capture = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const step = (msg) => console.log(`\n\x1b[35m▸ ${msg}\x1b[0m`);
const php = (cmd) => spawnSync(process.execPath, [phpScript, cmd], { stdio: "inherit" });

/** Kill everything on a port and wait until it's actually free (backstop for a graceful stop). */
async function freePort(port) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pids = capture(`lsof -ti tcp:${port}`).split(/\s+/).filter(Boolean);
    if (pids.length === 0) return;
    quiet(`kill -9 ${pids.join(" ")}`);
    await sleep(300);
  }
}

// 0. First-run setup. Both runtime implementations are tracked in this repository.
if (!existsSync("node_modules")) {
  step("Installing dependencies (first run)");
  run("npm install");
}

// 1. TEARDOWN — stop both backends + free every port
step("Teardown: stopping any running servers (TS :8787" + (HAS_PHP ? ", PHP :8080/:8081)" : ")"));
quiet(`pkill -f 'wrangler dev'`);
quiet(`pkill -f 'miniflare'`);
if (HAS_PHP) php("stop"); // graceful Workerman stop
await freePort(PORT);
if (HAS_PHP) { await freePort(8080); await freePort(8081); }

// 2. RESET — clear built assets + ALL local runtime state (Durable Object + PHP data)
step("Reset: clearing dist/, .wrangler/, and PHP data/");
rmSync("dist", { recursive: true, force: true });
rmSync(".wrangler", { recursive: true, force: true });
if (HAS_PHP) rmSync(`${MODULE_PHP}/data`, { recursive: true, force: true });

// 3. BUILD — the client bundle (served by both backends' clients)
step("Build: vite build");
run("npx vite build");

// 4. START PHP backend (daemonized); non-fatal if php/composer are missing
if (HAS_PHP) {
  step("Start: PHP backend (packages/php-runtime)");
  if (php("start").status !== 0) {
    console.warn("\x1b[33m⚠ PHP backend didn't start (php/composer installed?). Continuing with TS only.\x1b[0m");
  }
}

// 5. OPEN — pop the browser once the TS server has had a moment to boot
setTimeout(() => {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  quiet(`${opener} ${APP_URL}`);
}, 4000);

// 6. START — TS/Cloudflare server in the foreground (Ctrl-C to stop). Stop PHP on exit.
step(`Start: wrangler dev  ->  ${APP_URL}   (toggle backend from the menu)`);
const child = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], { stdio: "inherit" });
let stopped = false;
const stopPhp = () => { if (stopped || !HAS_PHP) return; stopped = true; php("stop"); };
child.on("exit", (code) => { stopPhp(); process.exit(code ?? 0); });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("exit", stopPhp);
