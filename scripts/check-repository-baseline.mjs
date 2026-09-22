#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const failures = [];
const fail = (message) => failures.push(message);
const expect = (condition, message) => { if (!condition) fail(message); };
const read = (path) => readFileSync(join(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const has = (text, needle, label) => expect(text.includes(needle), label + ": missing " + needle);
const major = (spec, value) => new RegExp("^[~^]?" + value + "(?:\\.|$)").test(spec ?? "");

const packageJson = json("package.json");
const nodeVersion = read(".node-version").trim();
const npmAgent = process.env.npm_config_user_agent ?? "";

expect(/^26\.\d+\.\d+$/.test(nodeVersion), ".node-version must pin an exact Node 26 release");
expect(process.version === "v" + nodeVersion, "acceptance must execute on the exact .node-version Node release");
expect(packageJson.engines?.node === "26.x", "engines.node must be 26.x");
expect(packageJson.engines?.npm === "11.x", "engines.npm must be 11.x");
expect(/^npm@11\.\d+\.\d+$/.test(packageJson.packageManager ?? ""), "packageManager must pin an exact npm 11 release");
expect(/^npm\/11\./.test(npmAgent), "acceptance must execute through npm 11");
expect(read(".npmrc").trim() === "engine-strict=true", ".npmrc must enforce engine-strict=true");
expect(packageJson.type === "module", "package.json must use ESM");
expect(existsSync(join(root, "package-lock.json")), "package-lock.json must be committed");
expect(JSON.stringify(Object.keys(packageJson.allowScripts ?? {}).sort()) === JSON.stringify(["esbuild","fsevents","workerd"]), "allowScripts must explicitly approve only the required install scripts");

for (const [name, spec, expectedMajor] of [
  ["typescript", packageJson.devDependencies?.typescript, 7],
  ["vite", packageJson.devDependencies?.vite, 8],
  ["vitest", packageJson.devDependencies?.vitest, 5],
  ["wrangler", packageJson.devDependencies?.wrangler, 4],
  ["react", packageJson.dependencies?.react, 19],
  ["react-dom", packageJson.dependencies?.["react-dom"], 19],
  ["@react-three/fiber", packageJson.dependencies?.["@react-three/fiber"], 9],
]) expect(major(spec, expectedMajor), name + " must remain on major " + expectedMajor);

expect(json("tsconfig.json").compilerOptions?.strict === true, "root TypeScript program must keep strict=true");
expect(json("vendor/ModuleReact3Fiber/tsconfig.json").compilerOptions?.strict === true, "vendored first-party TypeScript program must keep strict=true");
has(packageJson.scripts?.typecheck ?? "", "vendor/ModuleReact3Fiber/tsconfig.json", "typecheck must cover the first-party vendor program");

const vite = read("vite.config.ts");
has(vite, 'name: "sharktank-react-game-document"', "Vite must own the React game document");
has(vite, 'assets/[name]-[hash].js', "Vite game modules must remain content hashed");
has(vite, '"human-docs": humanDocsEntry', "Vite must build the first-party human-docs enhancement module");

const wrangler = read("wrangler.jsonc");
for (const needle of [
  '"directory": "./dist"',
  '"binding": "ASSETS"',
  '"html_handling": "none"',
  '"not_found_handling": "none"',
  '"run_worker_first": true',
  '"class_name": "Room"',
  '"class_name": "Lobby"',
  '"tag": "v1"',
  '"R2_PREFIX": "sharktank/development/"',
  '"R2_PREFIX": "sharktank/production/"',
]) has(wrangler, needle, "Wrangler baseline");

const gameDocument = read("src/client/game-document.tsx");
const clientMain = read("src/client/main.tsx");
const workerPresentation = read("src/worker/presentation-react.tsx");
const architecture = read("docs/ARCHITECTURE.md");
has(gameDocument, "renderToStaticMarkup(<GameDocument />)", "/play/ document must render from React at build time");
has(clientMain, "createRoot(el).render(", "/play/ must remain the explicit interactive client boundary");
expect(!/hydrateRoot|BrowserRouter|createBrowserRouter/.test(workerPresentation), "ordinary Worker documents must not hydrate or use a client router");
has(architecture, "`/play/` is the one explicit browser application boundary", "architecture must document the game-client boundary");
has(architecture, "WG-ARCH-001 project-specific boundaries", "architecture must record intentional baseline boundaries");
has(architecture, "squash-only", "architecture must record the repository-specific single-commit delivery departure");

const distIndex = read("dist/index.html");
expect(!distIndex.includes("'unsafe-inline'"), "built game document must not contain unsafe-inline");
expect(!/<style\b/i.test(distIndex), "built game document must not contain an inline style block");
expect(!/\sstyle\s*=/i.test(distIndex), "built game document must not contain style attributes");
expect(!/\son[a-z][a-z0-9_-]*\s*=/i.test(distIndex), "built game document must not contain inline event handlers");
for (const match of distIndex.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  expect(/\ssrc\s*=/.test(match[1] ?? ""), "built game document must not contain inline script bodies");
}
const builtAssets = readdirSync(join(root, "dist/assets"));
expect(builtAssets.some((name) => /^index-[A-Za-z0-9_-]+\.js$/.test(name)), "build must emit a content-hashed game entry");
expect(builtAssets.some((name) => /^index-[A-Za-z0-9_-]+\.css$/.test(name)), "build must emit content-hashed game CSS");
expect(builtAssets.some((name) => name !== "human-docs.js" && !name.startsWith("index-") && /-[A-Za-z0-9_-]+\.js$/.test(name)), "build must retain a content-hashed lazy game chunk");
expect(builtAssets.includes("human-docs.js"), "build must emit the stable first-party human-docs enhancement module");

for (const required of [
  "README.md","AGENTS.md","CONTRIBUTING.md","SECURITY.md","LICENSE",".gitignore",
  ".node-version",".npmrc","package.json","package-lock.json","tsconfig.json","wrangler.jsonc",
  ".github/workflows/ci.yml",".github/workflows/release.yml",
]) expect(existsSync(join(root, required)), "required repository file missing: " + required);

function walk(dir, output = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git","node_modules","dist",".wrangler"].includes(entry.name)) continue;
    const absolute = join(dir, entry.name);
    const rel = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile() && statSync(absolute).isFile()) output.push(rel);
  }
  return output;
}
const repositoryFiles = walk(root);
expect(!repositoryFiles.some((path) => path.toLowerCase() === "changelog.md"), "CHANGELOG.md is not allowed");
expect(!repositoryFiles.some((path) => /^docs\/releases\//i.test(path)), "per-version Markdown release archive directory is not allowed");
expect(!repositoryFiles.some((path) => /(?:^|\/)v\d+\.\d+\.\d+\.md$/i.test(path)), "per-version Markdown release files are not allowed");
expect(!existsSync(join(root, "docs/RECONSTRUCTION.md")), "reconstruction narrative must remain retired");
expect(!existsSync(join(root, "docs/history/LEGACY-INVENTORY.md")), "legacy inventory narrative must remain retired");
expect(JSON.stringify(readdirSync(join(root, "docs/history")).sort()) === JSON.stringify(["CHANGE-MAP.csv","NESTED-SOURCE-MAP.csv"]), "docs/history must contain exact provenance CSV inputs only");

const changeMap = read("docs/history/CHANGE-MAP.csv").trim().split(/\r?\n/).slice(1);
for (const row of changeMap) {
  const id = row.split(",", 1)[0];
  const match = /^ST-(\d{3})$/.exec(id);
  expect(Boolean(match) && Number(match[1]) <= 28, "CHANGE-MAP.csv must not contain forward ST history: " + id);
}
const planPath = join(root, "implementation_plan.md");
if (existsSync(planPath)) {
  const plan = read("implementation_plan.md");
  expect(/^###\s+ST-\d{3,}\s+—\s+\[[A-Z]+\]/m.test(plan), "active implementation plan must contain open controlled tasks");
  expect(!/^#{1,6}\s+(?:Done|Completed|History|Retrospective)\b/im.test(plan), "active implementation plan must not retain completed-task history");
}
expect(!read("SECURITY.md").includes("reconstructed releases"), "security policy must describe supported releases as current state");

const githubSettings = json("config/github-repository-settings.json");
expect(githubSettings.defaultBranch === "main", "GitHub settings must keep main as default");
expect(githubSettings.mergeMethods?.mergeCommit === false, "single-commit policy must disable merge commits");
expect(githubSettings.mergeMethods?.squash === true, "single-commit policy must enable squash");
expect(githubSettings.mergeMethods?.rebase === false, "single-commit policy must disable rebase");
expect(githubSettings.deleteBranchOnMerge === true, "merged branches must be deleted");
expect(githubSettings.requiredStatusChecks?.includes("verify"), "main ruleset must require verify");
expect(githubSettings.rulesets?.some((r) => r.name === "main-protection" && r.rules?.includes("pull_request") && r.rules?.includes("non_fast_forward") && r.rules?.includes("deletion")), "main-protection ruleset contract is incomplete");
expect(githubSettings.rulesets?.some((r) => r.name === "release-tag-immutability" && r.target === "tag" && r.rules?.includes("update") && r.rules?.includes("deletion")), "release tag immutability ruleset contract is incomplete");

const ci = read(".github/workflows/ci.yml");
has(ci, "node-version-file: .node-version", "CI must use the pinned Node version");
has(ci, "run: npm ci", "CI must use npm ci");
has(ci, "run: npm run check", "CI must run the repository acceptance gate");
const release = read(".github/workflows/release.yml");
has(release, "tags:", "release workflow must be tag driven");
has(release, '"v[0-9]+.[0-9]+.[0-9]+"', "release workflow must target semantic version tags");
has(release, "environment: production", "production deploy must use the protected production environment");
has(release, "npm run deploy:wizardgangprod", "release workflow must own production deployment");
const deploy = read("scripts/deploy-prod.mjs");
has(deploy, "SHARKTANK_RELEASE", "deployment must bind to release identity");
has(deploy, "tagsAtHead.includes(release)", "deployment must require the release tag at HEAD");
expect(packageJson.scripts?.dev === "node scripts/local.mjs", "dev must use the safe whole-stack lifecycle");
expect(packageJson.scripts?.local === packageJson.scripts?.dev, "local and dev must share one lifecycle implementation");
expect(packageJson.scripts?.["dev:worker"] === "wrangler dev --port 8787", "dev:worker must be the explicit Worker-only path");
expect(packageJson.scripts?.start === "npm run dev:worker", "start must preserve Worker-only behavior through the explicit command");
expect(packageJson.scripts?.["check:local-readiness"] === "node --test scripts/local-readiness-cases.mjs", "local readiness must have focused behavior coverage");

for (const requiredCheck of [
  "npm run typecheck","npm test","npm run test:php","npm run build","npm run check:repository-baseline",
  "npm run check:change-contract","npm run test:github-settings","npm run check:history","npm run check:provenance",
  "npm run check:local-readiness","npm run check:dev-command","npm run check:local-http","npm audit --audit-level=moderate","npm run check:whitespace",
]) has(packageJson.scripts?.check ?? "", requiredCheck, "npm run check must remain complete");

if (failures.length) {
  for (const failure of failures) console.error("FAIL " + failure);
  console.error("\n" + failures.length + " repository baseline acceptance check(s) failed.");
  process.exit(1);
}
console.log("WG-ARCH-001 repository-baseline inventory passed: pinned Node/npm policy, TS7/Vite8/Vitest5/React19/R3F9/Wrangler4, strict TypeScript coverage, React document boundaries, generated-output CSP surfaces, root/release/history policy, single-commit GitHub settings expectation, tag-driven release policy, and complete repository gate.");
