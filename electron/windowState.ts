import type { BrowserWindow, Rectangle, Screen } from "electron";

import {
  DEFAULT_WINDOW_SETTINGS,
  isWindowDimension,
  MIN_WINDOW_SIZE,
  readWindowSettings,
  type StartupWindowSettings,
  validWindowSettings,
  type WindowSize,
} from "../src/lib/windowSettings.ts";

interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

interface Dependencies {
  screen: Pick<Screen, "getAllDisplays" | "getPrimaryDisplay" | "on" | "removeListener">;
  readConfig(): Record<string, unknown>;
  writeConfig(patch: Record<string, unknown>): void;
  onError(error: unknown): void;
}

function readBounds(value: unknown): Rectangle | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!isWindowDimension(data.width) || !isWindowDimension(data.height)
    || !Number.isSafeInteger(data.x) || !Number.isSafeInteger(data.y)) return null;
  return { x: data.x as number, y: data.y as number, width: data.width, height: data.height };
}

function readState(value: unknown): WindowState | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const bounds = readBounds(data.bounds);
  return bounds ? { bounds, maximized: data.maximized === true } : null;
}

/** Keep the entire window on a connected display, preserving valid edge positions. */
function fitBounds(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
    width,
    height,
  };
}

function intersection(a: Rectangle, b: Rectangle): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** Owns only desktop geometry. Preferences and observed bounds never overwrite each other. */
export function createWindowStateManager(deps: Dependencies) {
  const config = deps.readConfig();
  let settings = readWindowSettings(config.startupWindow);
  let state = settings.remember ? readState(config.windowState) : null;
  let window: BrowserWindow | null = null;
  let firstShow = true;
  let restoreMaximized = false;
  let lastMaximized = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function areaFor(bounds: Rectangle): Rectangle {
    let area = deps.screen.getPrimaryDisplay().workArea;
    let overlap = 0;
    for (const display of deps.screen.getAllDisplays()) {
      const next = intersection(bounds, display.workArea);
      if (next > overlap) {
        overlap = next;
        area = display.workArea;
      }
    }
    return area;
  }

  function startupState(): WindowState {
    if (settings.remember && state) {
      return { bounds: fitBounds(state.bounds, areaFor(state.bounds)), maximized: state.maximized };
    }
    const area = deps.screen.getPrimaryDisplay().workArea;
    // workArea is already in DIP; multiplying by scaleFactor would apply DPI twice.
    const custom = !settings.remember && settings.mode === "custom";
    const width = custom ? settings.width
      : Math.max(MIN_WINDOW_SIZE, Math.min(DEFAULT_WINDOW_SETTINGS.width, Math.round(area.width * 0.8)));
    const height = custom ? settings.height
      : Math.max(MIN_WINDOW_SIZE, Math.min(DEFAULT_WINDOW_SETTINGS.height, Math.round(area.height * 0.8)));
    return {
      bounds: fitBounds({ x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2), width, height }, area),
      maximized: false,
    };
  }

  function currentState(): WindowState | null {
    if (!window || window.isDestroyed() || firstShow) return state;
    const bounds = readBounds(window.getNormalBounds());
    if (!bounds) return state;
    return { bounds: fitBounds(bounds, areaFor(bounds)),
      maximized: window.isMinimized() || window.isFullScreen() ? lastMaximized : window.isMaximized() };
  }

  function cancelSave() {
    clearTimeout(timer);
    timer = undefined;
  }

  function flush() {
    cancelSave();
    if (!settings.remember) return;
    const next = currentState();
    if (!next || JSON.stringify(next) === JSON.stringify(state)) return;
    try {
      deps.writeConfig({ windowState: next });
      state = next;
    } catch (error) {
      deps.onError(error);
    }
  }

  function scheduleSave() {
    if (!settings.remember || firstShow) return;
    cancelSave();
    timer = setTimeout(flush, 500);
  }

  function repairBounds() {
    if (!window || window.isDestroyed() || window.isMinimized() || window.isFullScreen() || window.isMaximized()) return;
    const bounds = window.getNormalBounds();
    const fitted = fitBounds(bounds, areaFor(bounds));
    if (JSON.stringify(bounds) !== JSON.stringify(fitted)) window.setBounds(fitted);
  }

  return {
    getSettings: (): StartupWindowSettings => ({ ...settings }),
    startupState,
    flush,
    getCurrentSize(): WindowSize {
      const bounds = window && !window.isDestroyed() ? window.getNormalBounds() : startupState().bounds;
      return { width: bounds.width, height: bounds.height };
    },
    setSettings(value: unknown): StartupWindowSettings {
      if (!validWindowSettings(value)) throw new Error("Invalid startup window settings");
      const next = readWindowSettings(value);
      const nextState = next.remember ? currentState() : null;
      // One patch: toggling memory off also forgets stale observations.
      deps.writeConfig({ startupWindow: next, windowState: nextState });
      settings = next;
      state = nextState;
      cancelSave();
      return { ...settings };
    },
    attach(win: BrowserWindow, startup: WindowState) {
      window = win;
      firstShow = true;
      restoreMaximized = startup.maximized;
      lastMaximized = startup.maximized;
      // At fractional Windows DPI, constructor bounds can include rounded borders.
      // Applying the requested outer bounds prevents size drift on every restart.
      if (JSON.stringify(win.getNormalBounds()) !== JSON.stringify(startup.bounds)) win.setBounds(startup.bounds);
      win.on("resize", scheduleSave);
      win.on("move", scheduleSave);
      win.on("maximize", () => { lastMaximized = true; scheduleSave(); });
      win.on("unmaximize", () => { lastMaximized = false; repairBounds(); scheduleSave(); });
      win.on("restore", repairBounds);
      win.on("leave-full-screen", repairBounds);
      win.on("hide", flush);
      win.on("close", flush);
      deps.screen.on("display-removed", repairBounds);
      deps.screen.on("display-metrics-changed", repairBounds);
      win.once("closed", () => {
        cancelSave();
        deps.screen.removeListener("display-removed", repairBounds);
        deps.screen.removeListener("display-metrics-changed", repairBounds);
        window = null;
      });
    },
    /** A hidden auto-start must stay hidden until an existing show path asks for it. */
    show(win: BrowserWindow) {
      if (win === window && firstShow) {
        repairBounds();
        // maximize() can show a hidden window, so defer it to the first requested show.
        if (restoreMaximized) win.maximize();
        firstShow = false;
        scheduleSave();
      } else if (win === window) {
        repairBounds();
      }
      win.show();
    },
  };
}
