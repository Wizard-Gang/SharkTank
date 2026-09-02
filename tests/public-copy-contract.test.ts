import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = read("../src/worker/index.ts");
const conformance = read("../src/worker/conformance.ts");
const deploy = read("../scripts/deploy-prod.mjs");
const gameShell = read("../index.html");
const gameMenu = read("../vendor/ModuleReact3Fiber/src/client/ui/MainMenu.tsx");

describe("concise public copy", () => {
  it("uses the current WizardGang mark on the evidence site and game menu", () => {
    expect(worker).toContain('class="brand-mark" aria-hidden="true"');
    expect(worker).toContain('<strong>WIZARDGANG</strong><small>SharkTank</small>');
    expect(worker).toContain("background:#d9ff43;box-shadow:.5rem -.5rem 0 #a489ff");
    expect(gameMenu).toContain('className="wizardgang-menu-mark"');
    expect(gameMenu).toContain("<span>WIZARDGANG</span>");
    expect(gameShell).toContain('rel="icon"');
    expect(gameShell).toContain("%23d9ff43");
    expect(gameShell).toContain("%23a489ff");
  });

  it("removes the retired explanatory blocks and game case-study link", () => {
    for (const text of [
      "Engineering case study",
      "Server availability is derived from the project-start window",
      "Scheduled tank downtime is tracked separately",
      "Records older than 24 hours are purged at the source",
      "The public evidence estate and the game’s menus",
    ]) expect(worker + gameShell + gameMenu).not.toContain(text);

    for (const text of [
      "The implementation starts with the governed system",
      "The AI-system definition comes before the control mapping",
      "This is a readiness register, not a certificate",
      "Readiness counts only the controls this organisation has to close",
      "ISO/IEC 27001 asks for change control in four separate places",
    ]) expect(worker + conformance).not.toContain(text);
  });

  it("provides one short public summary for every change listing", () => {
    const block = worker.match(/const PUBLIC_ROADMAP_SUMMARIES:[\s\S]*?\n};/)?.[0] ?? "";
    const summaries = [...block.matchAll(/"ST-\d{3}": "([^"]+)"/g)].map((match) => match[1]);
    expect(summaries).toHaveLength(52);
    for (const summary of summaries) {
      expect(summary.length).toBeLessThanOrEqual(140);
      expect(summary.match(/[.!?](?:\s|$)/g)?.length ?? 0).toBeLessThanOrEqual(2);
    }
    expect(worker).toContain("POST_DELIVERY_ENTRIES.map(publicRoadmapEntry)");
  });
});

describe("deployment metrics", () => {
  it("recalculates commit velocity for every production deploy", () => {
    expect(deploy).toContain('run("git", ["rev-list", "--count", "HEAD"]');
    expect(deploy).toContain('run("git", ["log", "--reverse", "--format=%ct", "HEAD"]');
    for (const name of [
      "SHARKTANK_COMMIT_COUNT",
      "SHARKTANK_COMMIT_WINDOW_HOURS",
      "SHARKTANK_COMMIT_VELOCITY",
      "SHARKTANK_DEPLOYED_AT",
    ]) {
      expect(deploy).toContain(name);
      expect(worker).toContain(name);
    }
  });
});
