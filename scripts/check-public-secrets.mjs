import { fileURLToPath } from "node:url";
import { scanRepository } from "./public-secret-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const result = scanRepository(root);
  if (result.findings.length > 0) {
    process.stderr.write(`${result.findings.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Scanned ${result.revisions} revisions and ${result.blobs} unique blobs for public credentials.\n`);
  }
} catch (error) {
  process.stderr.write(`Public credential scan failed closed: ${error.message}\n`);
  process.exitCode = 1;
}
