import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import {
  createLocalResetPlan,
  executeLocalResetPlan,
  parseLocalResetArgs,
  validateResetTarget,
} from "./local-reset.mjs";

function fixture() {
  const root = resolve(mkdtempSync(join(tmpdir(), "sharktank-reset-")));
  mkdirSync(join(root, "packages", "php-runtime", "data"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, ".wrangler"), { recursive: true });
  writeFileSync(join(root, "packages", "php-runtime", "data", "developer.json"), "keep");
  writeFileSync(join(root, "dist", "bundle.js"), "generated");
  writeFileSync(join(root, ".wrangler", "cache"), "generated");
  return root;
}

test("default reset preserves PHP developer state while removing disposable generated paths", () => {
  const root = fixture();
  const plan = createLocalResetPlan(root);

  assert.deepEqual(
    plan.targets.map(({ key, classification }) => [key, classification]),
    [["dist", "disposable"], ["wrangler", "disposable"]],
  );
  assert.deepEqual(
    plan.preserved.map(({ key, classification }) => [key, classification]),
    [["php-data", "developer-state"]],
  );

  executeLocalResetPlan(plan);

  assert.equal(existsSync(join(root, "dist")), false);
  assert.equal(existsSync(join(root, ".wrangler")), false);
  assert.equal(
    readFileSync(join(root, "packages", "php-runtime", "data", "developer.json"), "utf8"),
    "keep",
  );
});

test("PHP data deletion requires the one explicit local option", () => {
  assert.deepEqual(parseLocalResetArgs([]), { resetPhpData: false });
  assert.deepEqual(parseLocalResetArgs(["--reset-php-data"]), { resetPhpData: true });

  for (const args of [
    [""],
    ["../data"],
    ["/tmp/data"],
    ["--reset-path=/tmp/data"],
    ["--reset-php-data", "--reset-php-data"],
  ]) {
    assert.throws(() => parseLocalResetArgs(args), /unsupported local reset option/);
  }
});

test("explicit opt-in removes only this checkout's canonical PHP data target", () => {
  const root = fixture();
  const outside = resolve(mkdtempSync(join(tmpdir(), "sharktank-reset-outside-")));
  writeFileSync(join(outside, "keep.txt"), "outside");

  const plan = createLocalResetPlan(root, { resetPhpData: true });
  assert.deepEqual(plan.targets.map(({ key }) => key), ["dist", "wrangler", "php-data"]);

  executeLocalResetPlan(plan);

  assert.equal(existsSync(join(root, "packages", "php-runtime", "data")), false);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "outside");
});

test("unsafe, escaped, ambiguous, and malformed PHP reset paths are refused", () => {
  const root = fixture();
  const parent = dirname(root);
  const canonical = join(root, "packages", "php-runtime", "data");
  const candidates = [
    parent,
    join(root, "packages", "php-runtime"),
    join(root, "packages", "php-runtime", "data-sibling"),
    join(parent, "another-checkout", "packages", "php-runtime", "data"),
    resolve(tmpdir(), "arbitrary-absolute-reset"),
    `${root}${sep}packages${sep}php-runtime${sep}..${sep}php-runtime${sep}data`,
    "",
    "packages/php-runtime/data",
    `${canonical}\0escape`,
  ];

  for (const targetPath of candidates) {
    assert.throws(
      () => validateResetTarget({
        projectRoot: root,
        key: "php-data",
        targetPath,
        resetPhpData: true,
      }),
      /reset target|path|checkout|canonical/,
    );
  }

  assert.throws(
    () => validateResetTarget({
      projectRoot: root,
      key: "php-data",
      targetPath: canonical,
    }),
    /requires --reset-php-data/,
  );
});

test("symlinked canonical data cannot redirect an opted-in reset outside the checkout", () => {
  const root = fixture();
  const data = join(root, "packages", "php-runtime", "data");
  const outside = resolve(mkdtempSync(join(tmpdir(), "sharktank-reset-link-target-")));
  writeFileSync(join(outside, "keep.txt"), "outside");
  rmSync(data, { recursive: true, force: true });
  symlinkSync(outside, data, "dir");

  const mutations = [];
  assert.throws(
    () => executeLocalResetPlan(createLocalResetPlan(root, { resetPhpData: true }), {
      rmFn: (...args) => mutations.push(args),
    }),
    /symbolic link/,
  );
  assert.deepEqual(mutations, []);
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "outside");
});

test("all reset targets are validated before the first destructive mutation", () => {
  const root = fixture();
  const plan = createLocalResetPlan(root, { resetPhpData: true });
  plan.targets[2] = { ...plan.targets[2], path: join(dirname(root), "outside-data") };

  const mutations = [];
  assert.throws(
    () => executeLocalResetPlan(plan, { rmFn: (...args) => mutations.push(args) }),
    /canonical php-data path/,
  );
  assert.deepEqual(mutations, []);
  assert.equal(existsSync(join(root, "dist", "bundle.js")), true);
});

test("reset remains ordered after ST-069 ownership cleanup and fail-closed port checks", () => {
  const source = readFileSync(new URL("./local.mjs", import.meta.url), "utf8");
  const resetCall = source.indexOf("executeLocalResetPlan(resetPlan)");
  assert.ok(resetCall > 0);
  assert.ok(source.indexOf("await stopRecordedWrangler()") < resetCall);
  assert.ok(source.indexOf("existsSync(WRANGLER_OWNER_FILE)") < resetCall);
  assert.ok(source.indexOf("await requirePortsFree") < resetCall);
});
