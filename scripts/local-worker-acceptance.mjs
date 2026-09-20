import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const LOCAL_ACCEPTANCE_PORT = 8792;
export const LOCAL_ACCEPTANCE_HOST = "127.0.0.1";

export async function isPortAvailable(port, { host = LOCAL_ACCEPTANCE_HOST } = {}) {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
}

export async function waitForReady({
  baseUrl,
  child,
  fetchImpl = fetch,
  sleepFn = sleep,
  attempts = 80,
  intervalMs = 250,
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`local Worker exited before readiness with code ${child.exitCode}`);
    }

    try {
      const response = await fetchImpl(baseUrl, {
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
      });
      if (response.status === 200) return;
    } catch {
      // Workerd can refuse connections while Wrangler is still starting.
    }

    if (attempt < attempts) await sleepFn(intervalMs);
  }

  throw new Error(`local Worker did not become ready at ${baseUrl}`);
}

export function signalWorkerGroup(
  child,
  signal,
  { platform = process.platform, killProcess = process.kill } = {},
) {
  if (!child || child.exitCode !== null || !child.pid) return;

  try {
    if (platform === "win32") child.kill(signal);
    else killProcess(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForExit(
  child,
  { sleepFn = sleep, attempts = 20, intervalMs = 100 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child.exitCode !== null) return true;
    await sleepFn(intervalMs);
  }
  return child.exitCode !== null;
}

export async function stopWorker(
  child,
  { signalFn = signalWorkerGroup, sleepFn = sleep } = {},
) {
  if (!child || child.exitCode !== null) return;

  signalFn(child, "SIGTERM");
  if (await waitForExit(child, { sleepFn })) return;

  signalFn(child, "SIGKILL");
  if (!(await waitForExit(child, { sleepFn, attempts: 10 }))) {
    throw new Error("local Worker process group did not exit after SIGKILL");
  }
}

export function localWorkerEnvironment(source = process.env) {
  const env = { ...source, CI: "1" };
  for (const name of [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_EMAIL",
  ]) delete env[name];
  return env;
}

export function startLocalWorker({ port = LOCAL_ACCEPTANCE_PORT, spawnFn = spawn } = {}) {
  const wrangler = fileURLToPath(
    new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
  );
  return spawnFn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--local",
      "--port",
      String(port),
      "--var",
      "OPS_TOKEN:local-acceptance-only",
    ],
    {
      stdio: "inherit",
      detached: process.platform !== "win32",
      env: localWorkerEnvironment(),
    },
  );
}

function runNodeScript(path, baseUrl, spawnSyncFn = spawnSync) {
  const result = spawnSyncFn(
    process.execPath,
    [fileURLToPath(new URL(path, import.meta.url)), baseUrl],
    { stdio: "inherit", env: localWorkerEnvironment() },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path} failed with exit code ${result.status}`);
}

export function runHttpAcceptanceChecks(baseUrl, { spawnSyncFn = spawnSync } = {}) {
  runNodeScript("./check-public-ia.mjs", baseUrl, spawnSyncFn);
  runNodeScript("./check-evidence.mjs", baseUrl, spawnSyncFn);
}

async function waitForPortRelease(
  port,
  { portAvailableFn = isPortAvailable, sleepFn = sleep, attempts = 30, intervalMs = 100 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await portAvailableFn(port)) return true;
    await sleepFn(intervalMs);
  }
  return false;
}

export async function runLocalHttpAcceptance({
  port = LOCAL_ACCEPTANCE_PORT,
  portAvailableFn = isPortAvailable,
  startWorkerFn = startLocalWorker,
  waitForReadyFn = waitForReady,
  runChecksFn = runHttpAcceptanceChecks,
  stopWorkerFn = stopWorker,
  sleepFn = sleep,
} = {}) {
  if (!(await portAvailableFn(port))) {
    throw new Error(
      `local acceptance port ${port} is already in use; refusing to terminate an unrelated process`,
    );
  }

  const baseUrl = `http://${LOCAL_ACCEPTANCE_HOST}:${port}`;
  let child;
  let failure;

  try {
    child = startWorkerFn({ port });
    await waitForReadyFn({ baseUrl, child });
    await runChecksFn(baseUrl);
  } catch (error) {
    failure = error;
  } finally {
    if (child) {
      try {
        await stopWorkerFn(child);
      } catch (stopError) {
        failure = failure
          ? new AggregateError([failure, stopError], "local acceptance and cleanup both failed")
          : stopError;
      }
    }
  }

  const released = await waitForPortRelease(port, { portAvailableFn, sleepFn });
  if (!released) {
    const releaseError = new Error(
      `local acceptance port ${port} remained occupied after Worker cleanup`,
    );
    failure = failure
      ? new AggregateError([failure, releaseError], "local acceptance cleanup failed")
      : releaseError;
  }

  if (failure) throw failure;
  return { baseUrl };
}
