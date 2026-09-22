import { setTimeout as sleep } from "node:timers/promises";
import { parseLocalResetArgs } from "./local-reset.mjs";

export const DEFAULT_READINESS_TIMEOUT_MS = 30_000;
export const DEFAULT_READINESS_INTERVAL_MS = 100;
export const DEFAULT_REQUEST_TIMEOUT_MS = 1_000;

export function parseLocalLifecycleArgs(args) {
  if (!Array.isArray(args)) throw new TypeError("local lifecycle arguments must be an array");

  let noOpen = false;
  const resetArgs = [];
  for (const arg of args) {
    if (arg === "--no-open") {
      if (noOpen) throw new Error(`unsupported local lifecycle option: ${JSON.stringify(arg)}`);
      noOpen = true;
      continue;
    }
    resetArgs.push(arg);
  }

  return { noOpen, ...parseLocalResetArgs(resetArgs) };
}

export async function probeHttpReady(
  url,
  {
    fetchFn = globalThis.fetch,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout,
  } = {},
) {
  if (typeof fetchFn !== "function") throw new TypeError("HTTP readiness requires fetch");
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new RangeError("HTTP readiness request timeout must be positive");
  }

  const controller = new AbortController();
  const timer = setTimeoutFn(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchFn(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    return Boolean(
      response &&
      Number.isInteger(response.status) &&
      response.status >= 200 &&
      response.status < 400
    );
  } catch (error) {
    if (controller.signal.aborted) return false;
    throw error;
  } finally {
    clearTimeoutFn(timer);
  }
}

function readinessTimeoutError(timeoutMs, lastError) {
  const detail = lastError instanceof Error && lastError.message
    ? ` Last probe error: ${lastError.message}`
    : "";
  return new Error(`local application readiness timed out after ${timeoutMs}ms.${detail}`);
}

export async function waitForHttpReady({
  url,
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
  intervalMs = DEFAULT_READINESS_INTERVAL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  probeFn = probeHttpReady,
  childExitedFn = () => false,
  nowFn = Date.now,
  sleepFn = sleep,
} = {}) {
  if (typeof url !== "string" || url.length === 0) {
    throw new TypeError("local application readiness requires a URL");
  }
  for (const [label, value] of [["timeout", timeoutMs], ["interval", intervalMs], ["request timeout", requestTimeoutMs]]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`local application readiness ${label} must be positive`);
    }
  }

  const startedAt = nowFn();
  let attempts = 0;
  let lastError = null;

  while (true) {
    if (childExitedFn()) {
      throw new Error("managed Wrangler exited before local application readiness");
    }

    const elapsed = Math.max(0, nowFn() - startedAt);
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) throw readinessTimeoutError(timeoutMs, lastError);

    attempts += 1;
    try {
      if (await probeFn(url, { requestTimeoutMs: Math.min(requestTimeoutMs, remaining) })) {
        if (childExitedFn()) {
          throw new Error("managed Wrangler exited before local application readiness");
        }
        return { attempts, elapsedMs: Math.max(0, nowFn() - startedAt) };
      }
    } catch (error) {
      if (error?.message === "managed Wrangler exited before local application readiness") {
        throw error;
      }
      lastError = error;
    }

    if (childExitedFn()) {
      throw new Error("managed Wrangler exited before local application readiness");
    }

    const afterProbe = Math.max(0, nowFn() - startedAt);
    const remainingAfterProbe = timeoutMs - afterProbe;
    if (remainingAfterProbe <= 0) throw readinessTimeoutError(timeoutMs, lastError);
    await sleepFn(Math.min(intervalMs, remainingAfterProbe));
  }
}

export async function waitForReadinessAndMaybeOpen({
  noOpen = false,
  waitForReadyFn,
  onReadyFn = () => {},
  openFn = () => {},
} = {}) {
  if (typeof waitForReadyFn !== "function") {
    throw new TypeError("local lifecycle requires a readiness function");
  }

  const readiness = await waitForReadyFn();
  await onReadyFn(readiness);
  if (!noOpen) {
    try {
      await openFn();
    } catch {
      // Browser launching remains best-effort after readiness succeeds.
    }
  }
  return readiness;
}
