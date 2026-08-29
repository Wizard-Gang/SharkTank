#!/usr/bin/env node
// Drive the PHP protocol-parity backend tracked by SharkTank.
//   node scripts/php.mjs install | start | stop | status
// Resolves php/composer from Homebrew if they're not already on PATH.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MODULE_PHP = fileURLToPath(new URL("../packages/php-runtime", import.meta.url));
// Prepend common Homebrew locations so `php`/`composer` resolve under npm's shell.
const env = { ...process.env, PATH: `/opt/homebrew/opt/php/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` };

if (!existsSync(MODULE_PHP)) {
  console.error(`\x1b[31m✘ PHP runtime not found at ${MODULE_PHP}\x1b[0m`);
  console.error("  The canonical SharkTank checkout must contain packages/php-runtime.");
  process.exit(1);
}

const run = (cmd) => spawnSync(cmd, { cwd: MODULE_PHP, stdio: "inherit", shell: true, env });
const has = (bin) => spawnSync("command", ["-v", bin], { shell: true, env }).status === 0;

const cmd = process.argv[2] ?? "start";
switch (cmd) {
  case "install":
    if (!has("composer")) fail("composer not found — install it (brew install composer).");
    process.exit(run("composer install --no-interaction").status ?? 0);
    break;
  case "start":
    if (!has("php")) fail("php not found — install it (brew install php).");
    if (!existsSync(`${MODULE_PHP}/vendor`)) {
      console.log("\x1b[35m▸ ModulePHP: installing composer deps (first run)\x1b[0m");
      run("composer install --no-interaction");
    }
    console.log("\x1b[35m▸ PHP backend: http://localhost:8080  ·  ws://localhost:8081\x1b[0m");
    process.exit(run("php start.php start -d").status ?? 0);
    break;
  case "stop":
    process.exit(run("php start.php stop").status ?? 0);
    break;
  case "status":
    process.exit(run("php start.php status").status ?? 0);
    break;
  default:
    console.error(`Unknown command: ${cmd}. Use install | start | stop | status.`);
    process.exit(1);
}

function fail(msg) {
  console.error(`\x1b[31m✘ ${msg}\x1b[0m`);
  process.exit(1);
}
