import { readFileSync, existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MainMenu } from "../src/game/ui/MainMenu.js";
import { SKINS } from "../src/engine/index.js";
import { menuName } from "../src/game/ui/menuIdentity.js";
import { describe, expect, it } from "vitest";
import { renderGameDocument } from "../src/client/game-document.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/client/game-document.tsx");
const indexSource = read("../index.html");
const viteSource = read("../vite.config.ts");
const wranglerSource = read("../wrangler.jsonc");
const workerSource = read("../src/worker/index.ts");
const mainSource = read("../src/client/main.tsx");
const appSource = read("../src/game/App.tsx");
const settingsSource = read("../src/game/settings/SettingsContext.tsx");
const menuSource = read("../src/game/ui/MainMenu.tsx");
const mountedPresentationSource = [
  "../src/game/App.tsx",
  "../src/game/game/GameViewport.tsx",
  "../src/game/game/Scene.tsx",
  "../src/game/settings/SettingsContext.tsx",
  "../src/game/ui/Captions.tsx",
  "../src/game/ui/GameScreen.tsx",
  "../src/game/ui/DeathOverlay.tsx",
  "../src/game/ui/HelpOverlay.tsx",
  "../src/game/ui/Leaderboard.tsx",
  "../src/game/ui/MainMenu.tsx",
  "../src/game/ui/DepthRadar.tsx",
  "../src/game/ui/PauseMenu.tsx",
  "../src/game/ui/Settings.tsx",
  "../src/game/ui/SharkLabels.tsx",
  "../src/game/ui/TouchControls.tsx",
].map(read).join("\n");

describe("React game document", () => {
  it("renders the complete /play/ shell and metadata from TSX", () => {
    const html = renderGameDocument();

    expect(html).toMatch(/^<!doctype html><html lang="en">/);
    expect(html).toContain("<title>Play SharkTank — WizardGang</title>");
    expect(html).toContain(
      'rel="canonical" href="https://sharktank.wizardgang.ai/play/"',
    );
    expect(html).toContain('property="og:url" content="https://sharktank.wizardgang.ai/play/"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('id="root"');
    expect(html).toContain('id="boot"');
    expect(html).toContain("<h1>Wizard Gang Shark Tank</h1>");
    expect(html).toContain("Swim a shark in SharkTank");
    expect(html).not.toContain("one of four tanks");
    expect(html).toContain("The game is loading.");
    expect(html).not.toContain('href="/evidence/"');
    expect(html).not.toContain("View live evidence");
    expect(html).toContain('<script type="module" src="/src/client/main.tsx"></script>');
    expect(source).toContain("renderToStaticMarkup(<GameDocument />)");
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z][a-z0-9_-]*\s*=/i);
  });

  it("keeps the mounted game UI free of DOM inline-style surfaces", () => {
    expect(mountedPresentationSource).not.toMatch(/\bstyle\s*=/);
    expect(mountedPresentationSource).not.toContain(".style.setProperty(");
    expect(mountedPresentationSource).not.toMatch(/setAttribute\(\s*["']style["']/);
  });

  it("keeps index.html as only the Vite entry sentinel", () => {
    expect(indexSource).toContain("wg-game-document-source");
    expect(indexSource).not.toContain('id="root"');
    expect(indexSource).not.toContain("Wizard Gang Shark Tank");
    expect(indexSource).not.toContain("/src/client/main.tsx");
    expect(viteSource).toContain('name: "sharktank-react-game-document"');
    expect(viteSource).toContain('order: "pre"');
    expect(viteSource).toContain("handler: () => renderGameDocument()");
  });

  it("keeps Vite in charge of the browser entry and lazy content-hashed chunks", () => {
    expect(viteSource).toMatch(/assets\/\[name\]-\[hash\]\.js/);
    expect(mainSource).toContain("createRoot(el).render(");
    expect(mainSource).toContain('import "./styles.css"');
    expect(appSource).toContain('lazy(() => import("./ui/GameScreen.js")');
  });

  it("keeps player data device-local and the mounted app free of telemetry HTTP", () => {
    expect(settingsSource).toContain('const STORAGE_KEY = "sharktank.player.v1"');
    expect(settingsSource).toContain('const LEGACY_SETTINGS_KEY = "snakeio.settings.v1"');
    expect(settingsSource).toContain("localStorage.removeItem(LEGACY_SETTINGS_KEY)");
    expect(settingsSource).toContain("recordBest");
    expect(appSource).not.toContain("fetch(");
    expect(appSource).not.toContain("logUserAction");
    expect(menuSource).toContain("Personal best {best}");
  });

  it("makes the game document explicit instead of using a repository-wide SPA fallback", () => {
    expect(wranglerSource).toContain('"html_handling": "none"');
    expect(wranglerSource).toContain('"not_found_handling": "none"');
    expect(wranglerSource).not.toContain('"single-page-application"');
    expect(workerSource).toContain('new Request(new URL("/index.html", request.url)');
    expect(workerSource).toContain("if (!gameShell && !isStaticAssetPath(path)) return null");
  });

  it("keeps the game client on its explicit browser route", () => {
    expect(mainSource).not.toMatch(/BrowserRouter|createBrowserRouter/);
    expect(source).not.toMatch(/BrowserRouter|createBrowserRouter|hydrateRoot/);
    expect(workerSource).toContain('if (path === "/" || path === "/play") return movedTo(url, "/play/");');
  });
});


describe("ST-287 inline menu identity", () => {
  const renderMenu = (playerName = "Pilot", skin = "cyan") => renderToStaticMarkup(
    <MainMenu playerName={playerName} skin={skin} best={42} onPlay={() => {}}
      onIdentityChange={() => {}} onSettings={() => {}} />,
  );

  it("puts Play, name, swatches and the selected shark on one menu", () => {
    const html = renderMenu();
    expect(html).toContain('type="submit"');
    expect(html).toContain('autofocus=""');
    expect(html).toContain('for="menu-name"');
    expect(html).toContain('value="Pilot"');
    expect(html).toContain("Personal best 42");
    expect(html).toContain('role="radiogroup" aria-label="Shark skin"');
    expect(html.match(/type="radio"/g)).toHaveLength(SKINS.length);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).not.toMatch(/Customize|Confirm|Exit/);
    expect(existsSync(new URL("../src/game/ui/Customize.tsx", import.meta.url))).toBe(false);
    expect(appSource).toContain("onIdentityChange={updatePlayer}");
  });

  it.each(SKINS)("renders the $name choice and matching preview palette", (skin) => {
    const html = renderMenu("Pilot", skin.id);
    expect(html).toContain(`aria-label="${skin.name} shark preview"`);
    expect(html).toContain(`<figcaption>${skin.name} shark</figcaption>`);
    expect(html).toContain(`checked="" value="${skin.id}"`);
    const preview = html.slice(html.indexOf('<figure'), html.indexOf('</figure>'));
    expect(preview).toContain(`fill="${skin.color}"`);
    expect(preview).toContain(`fill="${skin.accent}"`);
    expect(preview).not.toMatch(/canvas|style=|animation/);
  });

  it.each(["f.u.c.k", "$h1t", "\u200b\u2066"])("rejects %j with an associated error and disabled Play", (name) => {
    const html = renderMenu(name);
    expect(html).toContain('aria-invalid="true" aria-describedby="menu-name-error"');
    expect(html).toContain('id="menu-name-error" role="alert"');
    expect(html).toContain('disabled=""');
    expect(menuName(name).validName).toBe(false);
  });

  it.each(["", "   ", "Player", "龍王小明", "Владимир", "A\u202eB\u200bC", "🦈".repeat(17)])(
    "keeps the existing canonical name policy for %j", (name) => {
      const identity = menuName(name);
      expect(identity.validName).toBe(true);
      expect(renderMenu(name)).not.toContain('disabled=""');
      expect(identity.storedName).toBe(name.trim() === "" ? "Player"
        : name === "A\u202eB\u200bC" ? "ABC"
        : [...name].slice(0, 16).join(""));
    },
  );
});
