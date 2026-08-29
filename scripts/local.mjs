#!/usr/bin/env node
// One-click local dev: teardown -> reset -> build -> start -> open.
// Run with: npm run local
import { execSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const PORT = 8787;
const URL = `http://localhost:${PORT}`;
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });
const quiet = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); } catch {} };
const step = (msg) => console.log(`\n\x1b[35m▸ ${msg}\x1b[0m`);

// 0. First-run setup. The game source is tracked directly by this repository.
if (!existsSync("node_modules")) {
  step("Installing dependencies (first run)");
  run("npm install");
}

// 1. TEARDOWN — free the dev port from any previous run
step("Teardown: freeing port " + PORT);
quiet(`lsof -ti tcp:${PORT} | xargs kill -9`);

// 2. RESET — clear built assets + local runtime state (blob store resets)
step("Reset: clearing dist/ and .wrangler/");
rmSync("dist", { recursive: true, force: true });
rmSync(".wrangler", { recursive: true, force: true });

// 3. BUILDUP — build the client bundle into dist/
step("Build: vite build");
run("npx vite build");

// 4. OPEN — pop the browser once the server has had a moment to boot
setTimeout(() => {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  quiet(`${opener} ${URL}`);
}, 4000);

// 5. START — run the server in the foreground (Ctrl-C to stop)
step(`Start: wrangler dev  ->  ${URL}`);
const child = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
