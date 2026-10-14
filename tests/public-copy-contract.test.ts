import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SETTINGS, SettingsProvider, type Settings } from "../src/game/settings/SettingsContext.js";
import { HelpOverlay } from "../src/game/ui/HelpOverlay.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = read("../src/worker/index.ts");
const gameShell = read("../src/client/game-document.tsx");
const gameMenu = read("../src/game/ui/MainMenu.tsx");
const gameScreen = read("../src/game/ui/GameScreen.tsx");

describe("game public copy", () => {
  it("keeps the WizardGang mark and game name on the menu and shell", () => {
    expect(gameMenu).toContain('className="wizardgang-menu-mark"');
    expect(gameMenu).toContain("<span>WIZARDGANG</span>");
    expect(gameShell).toContain("Wizard Gang Shark Tank");
    expect(gameShell).toContain('rel="icon"');
  });

  it("uses the current round countdown for active-round speech", () => {
    expect(gameScreen).toContain("${round.secondsLeft} seconds until Apex.");
    expect(gameScreen).not.toContain("Five minutes on the authoritative round clock.");
  });

  it("keeps retired assurance and implementation history off the runtime surface", () => {
    const runtime = worker + gameShell + gameMenu;
    for (const text of ["ISO/IEC 27001", "ISO/IEC 42001", "certification readiness", "/roadmap.json", 'href="/controls/"']) {
      expect(runtime).not.toContain(text);
    }
    expect(gameMenu).not.toContain("Engineering case study");
  });
});


describe("current Controls help", () => {
  afterEach(() => vi.unstubAllGlobals());

  function help(controls: Partial<Settings["controls"]>) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.controls, controls);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => key === "sharktank.player.v1"
        ? JSON.stringify({ settings }) : null,
    });
    return renderToStaticMarkup(createElement(SettingsProvider, null,
      createElement(HelpOverlay, { onClose: () => {} }),
    ));
  }

  it("shows saved desktop remaps and the current devour rule", () => {
    const html = help({ touchControls: "off", keybinds: { ...DEFAULT_SETTINGS.controls.keybinds, bite: "KeyB" } });
    expect(html).toContain('<kbd class="control-key">B</kbd>');
    expect(html).toContain("Devour sharks at most two-thirds your length; other bites deal damage.");
    expect(html).not.toContain("modest bonuses");
    expect(html).toContain("Keyboard steering eases in and out.");
    expect(html).toContain('<kbd class="control-key">?</kbd>');
  });

  it.each(["simple", "dual"] as const)("keeps %s touch help specific to its controls", (touchScheme) => {
    const html = help({ touchControls: "on", touchScheme, stickSide: "right" });
    expect(html).toContain("right flight stick");
    expect(html).toContain(touchScheme === "simple" ? "Automatic recenter" : "left look stick");
    expect(html).toContain("Devour sharks at most two-thirds your length; other bites deal damage.");
    expect(html).not.toContain("Keyboard steering");
    expect(html).not.toContain('<kbd class="control-key">?</kbd>');
  });

  it("omits the disabled single-key shortcut while retaining pause and help tools", () => {
    const html = help({ touchControls: "off", singleKeyShortcuts: false });
    expect(html).not.toContain('<kbd class="control-key">?</kbd>');
    expect(html).toContain('<kbd class="control-key">Escape</kbd>');
    expect(html).toContain("Pause, help, exit and settings");
  });
});
