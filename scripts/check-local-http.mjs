#!/usr/bin/env node
import { runLocalHttpAcceptance } from "./local-worker-acceptance.mjs";

const cleanupProof = process.argv.includes("--cleanup-proof");

if (cleanupProof) {
  let observedIntentionalFailure = false;
  try {
    await runLocalHttpAcceptance({
      runChecksFn: async () => {
        throw new Error("intentional acceptance failure for cleanup proof");
      },
    });
  } catch (error) {
    if (String(error?.message).includes("intentional acceptance failure")) {
      observedIntentionalFailure = true;
    } else {
      throw error;
    }
  }

  if (!observedIntentionalFailure) {
    throw new Error("cleanup proof did not observe the intentional acceptance failure");
  }
  console.log("Local Worker cleanup proof: intentional failure cleaned up successfully.");
} else {
  const { baseUrl } = await runLocalHttpAcceptance();
  console.log(`Local HTTP acceptance passed at ${baseUrl}; Worker cleaned up.`);
}
