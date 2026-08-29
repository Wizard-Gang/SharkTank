// Systems-menu state: graphics / audio / controls / accessibility. Single source of
// truth, persisted to localStorage and mirrored onto <html> data-attributes so the
// theme.css tokens react (contrast, motion, font-scale, theme). Game input and the
// renderer read the same object, so a settings change takes effect live.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface Keybinds {
  left: string;
  right: string;
  boost: string;
  pause: string;
}

export interface Settings {
  graphics: {
    quality: "low" | "medium" | "high";
    showMinimap: boolean;
    showGrid: boolean;
    cameraShake: boolean;
  };
  audio: {
    master: number; // 0..1
    sfx: number;
    music: number;
    captions: boolean; // show captions for audio cues (a11y)
  };
  controls: {
    keybinds: Keybinds;
    turnAssist: boolean; // gentler steering — accessibility aid
    invertSteer: boolean;
    /** On-screen thumbstick + ability pads. "auto" follows (pointer: coarse). */
    touchControls: "auto" | "on" | "off";
    /** Which thumb drives. "right" puts the stick right and the ability pads left. */
    stickSide: "right" | "left";
    /**
     * Single-key shortcuts (currently "?" for help). WCAG 2.1.4 requires a single-character
     * shortcut to be switchable, remappable, or focus-scoped — this is the off switch.
     */
    singleKeyShortcuts: boolean;
  };
  a11y: {
    theme: "system" | "dark" | "light";
    contrast: "normal" | "high";
    motion: "full" | "reduced";
    fontScale: number; // 0.9..1.6
    colorblindLabels: boolean; // show skin name labels above snakes
  };
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: { quality: "high", showMinimap: true, showGrid: true, cameraShake: true },
  // BGM is opt-in (0) so nothing autoplays unexpectedly; SFX are brief + event-driven.
  audio: { master: 0.8, sfx: 0.9, music: 0, captions: false },
  controls: {
    keybinds: { left: "ArrowLeft", right: "ArrowRight", boost: "Space", pause: "Escape" },
    turnAssist: false,
    invertSteer: false,
    touchControls: "auto",
    stickSide: "right",
    singleKeyShortcuts: true,
  },
  a11y: { theme: "system", contrast: "normal", motion: "full", fontScale: 1, colorblindLabels: true },
};

const STORAGE_KEY = "snakeio.settings.v1";

interface SettingsApi {
  settings: Settings;
  /** Patch a nested section, e.g. update("audio", { master: 0.5 }). */
  update: <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) => void;
  reset: () => void;
}

const Ctx = createContext<SettingsApi | null>(null);

/**
 * Does the operating system ask for reduced motion?
 *
 * `theme.css` states that this preference is respected, and in CSS it is. The canvas is
 * where all the motion actually lives, and the canvas reads `settings.a11y.motion`, which
 * was hard-coded to "full" — so the claim was true of the stylesheet and false of the game.
 * The draw loop already threads `motion` correctly; only the default was wrong.
 *
 * This is SC 2.3.3 (AAA), so it was never an AA failure. It is fixed because the file said
 * it was already done.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function systemPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
function systemMotion(): Settings["a11y"]["motion"] {
  return systemPrefersReducedMotion() ? "reduced" : "full";
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // The system preference is the default, never an override: once someone has chosen a
    // value in the settings menu, that choice is stored and wins. Only an absent stored
    // value falls through to the media query.
    if (!raw) return { ...DEFAULT_SETTINGS, a11y: { ...DEFAULT_SETTINGS.a11y, motion: systemMotion() } };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Drop any empty/blank stored keybinds so a corrupted value can't leave a control
    // permanently unbound — the default takes over instead.
    const savedBinds = parsed.controls?.keybinds ?? {};
    const cleanBinds = Object.fromEntries(
      Object.entries(savedBinds).filter(([, v]) => typeof v === "string" && v.trim().length > 0),
    );
    // Deep-ish merge so new fields in future versions get defaults.
    return {
      graphics: { ...DEFAULT_SETTINGS.graphics, ...parsed.graphics },
      audio: { ...DEFAULT_SETTINGS.audio, ...parsed.audio },
      controls: {
        ...DEFAULT_SETTINGS.controls,
        ...parsed.controls,
        keybinds: { ...DEFAULT_SETTINGS.controls.keybinds, ...cleanBinds },
      },
      a11y: { ...DEFAULT_SETTINGS.a11y, motion: parsed.a11y?.motion ?? systemMotion(), ...parsed.a11y },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, a11y: { ...DEFAULT_SETTINGS.a11y, motion: systemMotion() } };
  }
}

/**
 * Did the stored settings already carry an explicit motion choice, at the moment this tab
 * started?
 *
 * It has to be read once, before anything is written back. The provider persists the whole
 * settings object on every change, so after the first write the stored blob always has a
 * motion value in it — asking storage a second time would answer "the user chose" for a
 * value the user never touched.
 */
function motionWasChosen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    return typeof (JSON.parse(raw) as Partial<Settings>).a11y?.motion === "string";
  } catch {
    return false;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() =>
    typeof localStorage === "undefined" ? DEFAULT_SETTINGS : load(),
  );

  /**
   * Follow the system preference while the player has not expressed one.
   *
   * `TouchControls` already does exactly this for `(pointer: coarse)`; the same shape is
   * used here so there is one way this codebase reacts to a media query. The subscription
   * stops mattering the moment a stored motion value exists, which is why the guard reads
   * storage rather than state — state has by then been written by the persist effect below
   * on every settings change, stored or not.
   */
  const motionChosen = useRef(motionWasChosen());
  useEffect(() => {
    if (motionChosen.current) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => {
      if (motionChosen.current) return;
      setSettings((prev) => {
        const next = query.matches ? "reduced" : "full";
        return prev.a11y.motion === next ? prev : { ...prev, a11y: { ...prev.a11y, motion: next } };
      });
    };
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Persist + apply accessibility prefs to the document root.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage may be unavailable; non-fatal */
    }
    const html = document.documentElement;
    const { theme, contrast, motion, fontScale } = settings.a11y;
    if (theme === "system") html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", theme);
    html.setAttribute("data-contrast", contrast === "high" ? "high" : "normal");
    html.setAttribute("data-motion", motion === "reduced" ? "reduced" : "full");
    html.style.setProperty("--font-scale", String(fontScale));
  }, [settings]);

  const update = useCallback(<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) => {
    // Setting motion from the settings menu is the explicit choice that stops the system
    // preference from moving it again.
    if (section === "a11y" && "motion" in (patch as Partial<Settings["a11y"]>)) motionChosen.current = true;
    setSettings((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  // Reset goes back to following the system, which is what "reset" means for a preference
  // whose default is the system's.
  const reset = useCallback(() => {
    motionChosen.current = false;
    setSettings({ ...DEFAULT_SETTINGS, a11y: { ...DEFAULT_SETTINGS.a11y, motion: systemMotion() } });
  }, []);

  const api = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings must be used within <SettingsProvider>");
  return v;
}

/** Human-readable label for a KeyboardEvent.code/key used in keybind UIs. */
export function keyLabel(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Arrow")) return code.replace("Arrow", "") + " Arrow";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}
