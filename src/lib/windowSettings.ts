/** Desktop window dimensions are in device-independent pixels, including chrome. */
export interface WindowSize {
  width: number;
  height: number;
}

export interface StartupWindowSettings extends WindowSize {
  remember: boolean;
  mode: "auto" | "custom";
}

export const MIN_WINDOW_SIZE = 300;
export const MAX_WINDOW_SIZE = 16384;
export const DEFAULT_WINDOW_SETTINGS: Readonly<StartupWindowSettings> = {
  remember: false,
  mode: "auto",
  width: 1200,
  height: 800,
};

export function isWindowDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_WINDOW_SIZE && value <= MAX_WINDOW_SIZE;
}

/** Tolerant on disk; the IPC writer below requires a complete, valid choice. */
export function readWindowSettings(value: unknown): StartupWindowSettings {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    remember: data.remember === true,
    mode: data.mode === "custom" ? "custom" : "auto",
    width: isWindowDimension(data.width) ? data.width : DEFAULT_WINDOW_SETTINGS.width,
    height: isWindowDimension(data.height) ? data.height : DEFAULT_WINDOW_SETTINGS.height,
  };
}

export function validWindowSettings(value: unknown): value is StartupWindowSettings {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.remember === "boolean" && (data.mode === "auto" || data.mode === "custom")
    && isWindowDimension(data.width) && isWindowDimension(data.height);
}
