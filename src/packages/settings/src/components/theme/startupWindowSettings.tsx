import { Button, Select, Switch, TextField } from "@gryt/ui";
import { type FormEvent, useEffect, useState } from "react";

import { getElectronAPI } from "../../../../../lib/electron";
import {
  isWindowDimension,
  MAX_WINDOW_SIZE,
  MIN_WINDOW_SIZE,
  type StartupWindowSettings,
} from "../../../../../lib/windowSettings";
import { SettingGroup } from "../settingsComponents";

export function StartupWindowSettingsPanel() {
  const api = getElectronAPI();
  const supported = !!(api?.getStartupWindowSettings && api.setStartupWindowSettings && api.getCurrentWindowSize);
  const [settings, setSettings] = useState<StartupWindowSettings | null>(null);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"load" | "save" | "size" | "current" | null>(null);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!supported || !api?.getStartupWindowSettings) return;
    let cancelled = false;
    setError(null);
    void api.getStartupWindowSettings().then((value) => {
      if (cancelled) return;
      setSettings(value);
      setWidth(String(value.width));
      setHeight(String(value.height));
    }).catch(() => { if (!cancelled) setError("load"); });
    return () => { cancelled = true; };
  }, [api, supported, retry]);

  if (!supported) return null;

  async function persist(value: StartupWindowSettings) {
    if (!api?.setStartupWindowSettings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api.setStartupWindowSettings(value);
      setSettings(next);
      setSaved(true);
    } catch {
      setError("save");
    } finally {
      setBusy(false);
    }
  }

  function saveSize(event: FormEvent) {
    event.preventDefault();
    if (!settings || busy || settings.remember) return;
    const w = Number(width);
    const h = Number(height);
    if (!isWindowDimension(w) || !isWindowDimension(h)) {
      setSaved(false);
      setError("size");
      return;
    }
    void persist({ ...settings, width: w, height: h });
  }

  async function copyCurrentSize() {
    if (!api?.getCurrentWindowSize) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const size = await api.getCurrentWindowSize();
      setWidth(String(size.width));
      setHeight(String(size.height));
    } catch {
      setError("current");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-gryt="startup-window-settings">
      <h3 className="m-0 text-base font-medium">Startup window</h3>
      {!settings && !error && <p className="m-0 text-xs text-gryt-muted" role="status">Loading window settings…</p>}
      {settings && <>
        <SettingGroup
          title="Remember window state"
          description="Restore the size, position and maximized state when Gryt starts."
        >
          <Switch
            aria-label="Remember window state"
            checked={settings.remember}
            disabled={busy}
            onCheckedChange={(remember) => void persist({ ...settings, remember })}
          />
        </SettingGroup>
        <SettingGroup
          title="Startup window size"
          description="Choose how large the window opens when remembering is off."
        >
          <Select
            label={<span className="sr-only">Startup window size</span>}
            value={settings.mode}
            disabled={busy || settings.remember}
            options={[
              { value: "auto", label: "Automatically fit the screen" },
              { value: "custom", label: "Custom size" },
            ]}
            onValueChange={(mode) => {
              if (mode === "auto" || mode === "custom") void persist({ ...settings, mode });
            }}
          />
          {settings.mode === "custom" && <form noValidate onSubmit={saveSize}>
            <fieldset disabled={busy || settings.remember} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <div className="flex flex-wrap gap-3">
                <TextField
                  label="Width"
                  type="number"
                  min={MIN_WINDOW_SIZE}
                  max={MAX_WINDOW_SIZE}
                  step={1}
                  value={width}
                  fieldClassName="min-w-0 flex-1 basis-32"
                  onChange={(event) => { setWidth(event.target.value); setSaved(false); setError(null); }}
                />
                <TextField
                  label="Height"
                  type="number"
                  min={MIN_WINDOW_SIZE}
                  max={MAX_WINDOW_SIZE}
                  step={1}
                  value={height}
                  fieldClassName="min-w-0 flex-1 basis-32"
                  onChange={(event) => { setHeight(event.target.value); setSaved(false); setError(null); }}
                />
              </div>
              <p className="m-0 text-xs text-gryt-muted">
                Sizes use logical pixels and follow your system display scaling. Oversized windows are fitted to the available screen.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" tone="neutral" size="small" disabled={busy || settings.remember} onClick={() => void copyCurrentSize()}>
                  Use current window size
                </Button>
                <Button type="submit" size="small" disabled={busy || settings.remember}>Save size</Button>
              </div>
            </fieldset>
          </form>}
          {settings.remember && <p className="m-0 text-xs text-gryt-muted">
            Turn off remembering to change the startup size.
          </p>}
          {!settings.remember && settings.mode === "auto" && <p className="m-0 text-xs text-gryt-muted">
            Starts at up to 1200 × 800, within 80% of the available screen width and height.
          </p>}
        </SettingGroup>
      </>}
      {error && <div className="text-xs" role="alert">
        {error === "load" ? "Could not load window settings." : error === "save" ? "Could not save window settings. Try again."
          : error === "current" ? "Could not read the current window size."
            : "Enter whole numbers from 300 to 16384 for width and height."}
        {error === "load" && <Button tone="neutral" size="small" onClick={() => setRetry(retry + 1)}>Retry</Button>}
      </div>}
      {saved && !error && <p className="m-0 text-xs text-gryt-muted" role="status">
        Saved. Changes apply the next time Gryt starts.
      </p>}
    </div>
  );
}
