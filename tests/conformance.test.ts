import { describe, expect, it } from "vitest";
import { ALL_CONTROLS, conformanceManifest, evidenceWalkStats, summarise } from "../src/worker/conformance.js";

describe("conformance register", () => {
  it("never labels a met row without a live evidence route", () => {
    const stats = evidenceWalkStats();
    expect(stats.metRows).toBeGreaterThan(0);
    expect(stats.distinctRoutes).toBeGreaterThan(0);
    expect(stats.metWithoutRoute).toBe(0);
  });

  it("derives one internally consistent summary", () => {
    const summary = summarise(ALL_CONTROLS);
    expect(Object.values(summary.byStatus).reduce((sum, value) => sum + value, 0)).toBe(summary.total);
    expect(summary.applicable).toBe(summary.total - summary.byStatus.supplier - summary.byStatus.excluded);
    expect(summary.readiness).toBeGreaterThanOrEqual(0);
    expect(summary.readiness).toBeLessThanOrEqual(100);
  });

  it("keeps the data manifest focused on the register", () => {
    const manifest = conformanceManifest();
    expect(manifest).not.toHaveProperty("statement");
    expect(manifest.standards).toEqual(["ISO/IEC 27001:2022", "ISO/IEC 42001:2023"]);
  });
});
