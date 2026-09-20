import test from "node:test";
import assert from "node:assert/strict";
import {
  localWorkerEnvironment,
  runLocalHttpAcceptance,
  signalWorkerGroup,
  startLocalWorker,
} from "./local-worker-acceptance.mjs";

function fakeChild(pid = 43210) {
  return { pid, exitCode: null, kill() {} };
}

test("child start failure is reported without cleanup of unrelated processes", async () => {
  let stopped = 0;
  await assert.rejects(
    runLocalHttpAcceptance({
      portAvailableFn: async () => true,
      startWorkerFn: () => { throw new Error("spawn failed"); },
      stopWorkerFn: async () => { stopped += 1; },
      sleepFn: async () => {},
    }),
    /spawn failed/,
  );
  assert.equal(stopped, 0);
});

test("readiness timeout always stops the started Worker", async () => {
  const child = fakeChild();
  let stopped = 0;
  await assert.rejects(
    runLocalHttpAcceptance({
      portAvailableFn: async () => true,
      startWorkerFn: () => child,
      waitForReadyFn: async () => { throw new Error("readiness timeout"); },
      stopWorkerFn: async () => { stopped += 1; child.exitCode = 0; },
      sleepFn: async () => {},
    }),
    /readiness timeout/,
  );
  assert.equal(stopped, 1);
});

test("acceptance failure always stops the started Worker", async () => {
  const child = fakeChild();
  let stopped = 0;
  await assert.rejects(
    runLocalHttpAcceptance({
      portAvailableFn: async () => true,
      startWorkerFn: () => child,
      waitForReadyFn: async () => {},
      runChecksFn: async () => { throw new Error("acceptance failed"); },
      stopWorkerFn: async () => { stopped += 1; child.exitCode = 0; },
      sleepFn: async () => {},
    }),
    /acceptance failed/,
  );
  assert.equal(stopped, 1);
});

test("successful acceptance still stops the Worker", async () => {
  const child = fakeChild();
  let stopped = 0;
  const result = await runLocalHttpAcceptance({
    portAvailableFn: async () => true,
    startWorkerFn: () => child,
    waitForReadyFn: async () => {},
    runChecksFn: async () => {},
    stopWorkerFn: async () => { stopped += 1; child.exitCode = 0; },
    sleepFn: async () => {},
  });
  assert.equal(stopped, 1);
  assert.equal(result.baseUrl, "http://127.0.0.1:8792");
});

test("occupied port aborts before starting or killing anything", async () => {
  let started = 0;
  let stopped = 0;
  await assert.rejects(
    runLocalHttpAcceptance({
      portAvailableFn: async () => false,
      startWorkerFn: () => { started += 1; return fakeChild(); },
      stopWorkerFn: async () => { stopped += 1; },
      sleepFn: async () => {},
    }),
    /already in use/,
  );
  assert.equal(started, 0);
  assert.equal(stopped, 0);
});

test("Unix cleanup signals only the spawned process group", () => {
  const calls = [];
  signalWorkerGroup(fakeChild(9876), "SIGTERM", {
    platform: "linux",
    killProcess: (pid, signal) => calls.push([pid, signal]),
  });
  assert.deepEqual(calls, [[-9876, "SIGTERM"]]);
});

test("local Worker environment strips Cloudflare provider credentials", () => {
  const env = localWorkerEnvironment({
    PATH: "/bin",
    CLOUDFLARE_API_TOKEN: "secret",
    CLOUDFLARE_API_KEY: "secret",
    CLOUDFLARE_ACCOUNT_ID: "secret",
    CLOUDFLARE_EMAIL: "secret",
  });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.CI, "1");
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.CLOUDFLARE_API_KEY, undefined);
  assert.equal(env.CLOUDFLARE_ACCOUNT_ID, undefined);
  assert.equal(env.CLOUDFLARE_EMAIL, undefined);
});

test("local Worker receives only a deterministic acceptance auth token", () => {
  let invocation;
  const child = fakeChild();
  startLocalWorker({
    port: 8792,
    spawnFn: (command, args, options) => {
      invocation = { command, args, options };
      return child;
    },
  });
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(
    invocation.args.slice(-4),
    ["--port", "8792", "--var", "OPS_TOKEN:local-acceptance-only"],
  );
  assert.ok(invocation.args.includes("--local"));
});
