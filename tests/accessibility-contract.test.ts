import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const worker = read("../src/worker/index.ts");
const app = read("../vendor/ModuleReact3Fiber/src/client/App.tsx");
const focusTrap = read("../vendor/ModuleReact3Fiber/src/client/a11y/useFocusTrap.ts");
const input = read("../vendor/ModuleReact3Fiber/src/client/game/useLocalInput.ts");
const theme = read("../vendor/ModuleReact3Fiber/src/client/ui/theme.css");
const settings = read("../vendor/ModuleReact3Fiber/src/client/ui/Settings.tsx");

describe("public accessibility contract", () => {
  it("keeps a keyboard bypass, visible focus, contrast, motion, and hash focus handling on evidence pages", () => {
    expect(worker).toContain('class="skip-link" href="#main"');
    expect(worker).toContain('<main id="main" tabindex="-1">');
    expect(worker).toContain(":focus-visible{outline:3px solid var(--focus)");
    expect(worker).toContain("@media(prefers-reduced-motion:reduce)");
    expect(worker).toContain("@media(prefers-contrast:more)");
    expect(worker).toContain('el.focus({preventScroll:true})');
  });

  it("keeps the validated WCAG claim without the removed explanatory block", () => {
    expect(worker).toContain("WCAG 2.0 AA");
    expect(worker).not.toContain("The public evidence estate and the game’s menus");
    expect(worker).not.toContain("The claim is deliberately scoped");
  });

  it("keeps the game operable by keyboard with managed focus and reduced motion", () => {
    expect(app).toContain('className="skip-link" href="#main"');
    expect(app).toContain("regionRef.current?.focus()");
    expect(input).toContain('window.addEventListener("keydown", onKeyDown)');
    expect(input).toContain("preventDefault()");
    expect(focusTrap).toContain('document.addEventListener("keydown", onKeyDown)');
    expect(focusTrap).toContain("last.focus()");
    expect(focusTrap).toContain("first.focus()");
    expect(focusTrap).toContain("previouslyFocused?.focus?.()");
    expect(theme).toContain("@media (prefers-reduced-motion: reduce)");
    expect(theme).toContain(":focus-visible");
    expect(settings).toContain('formatValue={(value) => `${Math.round(value * 100)}%`}');
  });
});

describe("canonical public information architecture", () => {
  it("keeps exactly four primary navigation destinations", () => {
    const nav = worker.match(/const TRUST_NAV:[\s\S]*?\n\];/)?.[0] ?? "";
    expect(nav).toContain('["/", "Overview"]');
    expect(nav).toContain('["/controls/", "Controls"]');
    expect(nav).toContain('["/evidence/", "Evidence"]');
    expect(nav).toContain('["/play/", "Play"]');
    expect(nav.match(/^  \[/gm)).toHaveLength(4);
  });

  it("redirects former human routes directly to canonical destinations", () => {
    const redirects = worker.match(/export const HUMAN_REDIRECTS:[\s\S]*?\n\}\);/)?.[0] ?? "";
    expect(redirects).toContain('"/trust/": "/"');
    expect(redirects).toContain('"/audit/": "/controls/#registers"');
    expect(redirects).toContain('"/policies/": "/controls/#policies"');
    expect(redirects).toContain('"/status/": "/evidence/#availability"');
    expect(redirects).toContain('"/logs/": "/evidence/#logs"');
    expect(redirects).toContain('"/spend/": "/evidence/#spend"');
    expect(redirects).not.toMatch(/:\s*"\/(?:trust|audit|policies|status|logs|spend)\/?"/);
  });
});
