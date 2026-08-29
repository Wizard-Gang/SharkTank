// Systems-menu state: graphics / audio / controls / accessibility. Single source of
// truth, persisted to localStorage and mirrored onto <html> data-attributes so the
// theme.css tokens react (contrast, motion, font-scale, theme). Game input and the
// renderer read the same object, so a settings change takes effect live.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
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
      a11y: { ...DEFAULT_SETTINGS.a11y, ...parsed.a11y },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() =>
    typeof localStorage === "undefined" ? DEFAULT_SETTINGS : load(),
  );

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
    setSettings((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

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
