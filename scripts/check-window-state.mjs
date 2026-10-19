/* eslint-env node */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createWindowStateManager } from "../electron/windowState.ts";
import { DEFAULT_WINDOW_SETTINGS } from "../src/lib/windowSettings.ts";

const primaryArea = { x: 0, y: 0, width: 1707, height: 912 };

class FakeWindow extends EventEmitter {
  constructor(bounds) { super(); this.bounds = { ...bounds }; }
  maximized = false;
  minimized = false;
  fullScreen = false;
  destroyed = false;
  visible = false;
  isDestroyed() { return this.destroyed; }
  isMaximized() { return this.maximized; }
  isMinimized() { return this.minimized; }
  isFullScreen() { return this.fullScreen; }
  getNormalBounds() { return { ...this.bounds }; }
  setBounds(bounds) { this.bounds = { ...bounds }; this.emit("move"); this.emit("resize"); }
  maximize() { this.maximized = true; this.visible = true; this.emit("maximize"); }
  unmaximize() { this.maximized = false; this.emit("unmaximize"); }
  show() { this.visible = true; this.emit("show"); }
  hide() { this.visible = false; this.emit("hide"); }
  close() { this.emit("close"); this.destroyed = true; this.emit("closed"); }
}

function fixture(initial = {}, areas = [primaryArea]) {
  const disk = { ...initial };
  const writes = [];
  const errors = [];
  const screen = new EventEmitter();
  screen.getAllDisplays = () => areas.map((workArea) => ({ workArea }));
  screen.getPrimaryDisplay = () => screen.getAllDisplays()[0];
  const deps = {
    screen,
    readConfig: () => structuredClone(disk),
    writeConfig: (patch) => { Object.assign(disk, structuredClone(patch)); writes.push(patch); },
    onError: (error) => errors.push(error),
  };
  const manager = createWindowStateManager(deps);
  const startup = manager.startupState();
  const window = new FakeWindow(startup.bounds);
  manager.attach(window, startup);
  return { manager, window, disk, writes, errors, screen, deps,
    restart: () => createWindowStateManager(deps) };
}

test("memory is off by default; the first launch fits logical work area at 100%, 150% and 200%", () => {
  for (const scale of [1, 1.5, 2]) {
    const area = { x: 0, y: 0, width: Math.round(2560 / scale), height: Math.round(1440 / scale) - 48 };
    const f = fixture({}, [area]);
    assert.deepEqual(f.manager.getSettings(), DEFAULT_WINDOW_SETTINGS);
    const { bounds, maximized } = f.manager.startupState();
    assert.ok(bounds.width <= Math.round(area.width * 0.8));
    assert.ok(bounds.height <= Math.round(area.height * 0.8));
    assert.ok(bounds.width <= 1200 && bounds.height <= 800);
    assert.equal(maximized, false);
    f.manager.show(f.window);
    f.window.setBounds({ x: 20, y: 20, width: 900, height: 600 });
    f.window.close();
    assert.equal(f.writes.length, 0, "dragging a window with memory off wrote observations");
  }
});

test("custom choices survive a restart and window dragging never changes them", () => {
  const f = fixture({ closeToTray: true });
  f.manager.show(f.window);
  const settings = { remember: false, mode: "custom", width: 1000, height: 650 };
  const before = f.window.getNormalBounds();
  f.manager.setSettings(settings);
  assert.deepEqual(f.window.getNormalBounds(), before, "saving resized the live window");
  f.window.setBounds({ x: 40, y: 40, width: 850, height: 550 });
  f.window.close();
  const next = f.restart();
  assert.deepEqual(next.getSettings(), settings);
  assert.equal(next.startupState().bounds.width, 1000);
  assert.equal(next.startupState().bounds.height, 650);
  assert.equal(f.disk.closeToTray, true);
});

test("memory captures current state, debounces dragging, and flushes when hidden or closed", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.manager.show(f.window);
  f.manager.setSettings({ ...DEFAULT_WINDOW_SETTINGS, remember: true });
  assert.deepEqual(f.disk.windowState.bounds, f.window.getNormalBounds());
  f.window.setBounds({ x: 40, y: 60, width: 950, height: 650 });
  f.window.setBounds({ x: 50, y: 70, width: 980, height: 660 });
  t.mock.timers.tick(499);
  assert.equal(f.writes.length, 1);
  t.mock.timers.tick(1);
  assert.equal(f.writes.length, 2);
  assert.equal(f.disk.windowState.bounds.width, 980);
  f.window.setBounds({ x: 60, y: 80, width: 1000, height: 680 });
  f.window.hide();
  assert.equal(f.disk.windowState.bounds.width, 1000);
  const writes = f.writes.length;
  f.manager.show(f.window);
  assert.deepEqual(f.window.getNormalBounds(), { x: 60, y: 80, width: 1000, height: 680 });
  assert.equal(f.writes.length, writes, "tray restore rewrote the startup geometry");
  f.window.setBounds({ x: 70, y: 90, width: 1020, height: 690 });
  f.window.close();
  assert.deepEqual(f.restart().startupState().bounds, { x: 70, y: 90, width: 1020, height: 690 });
  assert.equal(f.screen.listenerCount("display-removed"), 0);
});

test("turning memory off cancels pending saves and retains the fixed size", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.manager.show(f.window);
  const custom = { mode: "custom", remember: true, width: 1100, height: 700 };
  f.manager.setSettings(custom);
  f.window.setBounds({ x: 60, y: 60, width: 900, height: 600 });
  f.manager.setSettings({ ...custom, remember: false });
  const count = f.writes.length;
  t.mock.timers.tick(1000);
  f.window.close();
  assert.equal(f.writes.length, count);
  assert.equal(f.disk.windowState, null);
  assert.equal(f.restart().startupState().bounds.width, 1100);
});

test("tray restore preserves a valid window touching the work area edges", () => {
  const f = fixture();
  f.manager.show(f.window);
  f.window.setBounds(primaryArea);
  f.window.hide();
  f.manager.show(f.window);
  assert.deepEqual(f.window.getNormalBounds(), primaryArea);
  f.window.close();
});

test("maximized state restores only on the first requested show, including hidden auto-start", () => {
  const bounds = { x: 80, y: 90, width: 950, height: 650 };
  const f = fixture({ startupWindow: { ...DEFAULT_WINDOW_SETTINGS, remember: true }, windowState: { bounds, maximized: true } });
  assert.equal(f.window.visible, false, "attachment exposed the hidden auto-start window");
  f.manager.flush();
  assert.equal(f.writes.length, 0, "hidden initialization replaced the previous state");
  f.manager.show(f.window);
  assert.equal(f.window.isMaximized(), true);
  assert.deepEqual(f.manager.getCurrentSize(), { width: 950, height: 650 });
  f.window.unmaximize();
  f.window.hide();
  f.manager.show(f.window);
  assert.equal(f.window.isMaximized(), false, "tray restore reapplied the old maximized flag");
  f.window.maximize();
  f.window.minimized = true;
  f.window.maximized = false;
  f.window.close();
  assert.deepEqual(f.disk.windowState, { bounds, maximized: true });
});

test("memory on with no history uses automatic sizing even if an old custom choice exists", () => {
  const f = fixture({ startupWindow: { remember: true, mode: "custom", width: 500, height: 400 } });
  const automatic = fixture().manager.startupState();
  assert.deepEqual(f.manager.startupState(), automatic);
});

test("off-screen state and oversized custom choices are fitted to the remaining display", () => {
  const f = fixture({ startupWindow: { ...DEFAULT_WINDOW_SETTINGS, remember: true },
    windowState: { bounds: { x: 5000, y: -3000, width: 2500, height: 1800 }, maximized: false } });
  const { bounds } = f.manager.startupState();
  assert.ok(bounds.x >= 0 && bounds.y >= 0);
  assert.ok(bounds.x + bounds.width <= primaryArea.width);
  assert.ok(bounds.y + bounds.height <= primaryArea.height);
  f.manager.setSettings({ ...DEFAULT_WINDOW_SETTINGS, mode: "custom", width: 16000, height: 16000 });
  assert.deepEqual(f.manager.getSettings().width, 16000, "fitting overwrote the user's choice");
  assert.ok(f.restart().startupState().bounds.width <= primaryArea.width);
});

test("negative monitor coordinates work, and unplugging that monitor repairs the live window", () => {
  const external = { x: -1920, y: 0, width: 1920, height: 1040 };
  const areas = [primaryArea, external];
  const bounds = { x: -1600, y: 100, width: 1000, height: 700 };
  const f = fixture({ startupWindow: { ...DEFAULT_WINDOW_SETTINGS, remember: true }, windowState: { bounds, maximized: false } }, areas);
  assert.deepEqual(f.manager.startupState().bounds, bounds);
  f.manager.show(f.window);
  areas.pop();
  f.screen.emit("display-removed");
  assert.ok(f.window.bounds.x >= 0);
  f.window.close();
  assert.ok(f.disk.windowState.bounds.x >= 0);
});

test("broken config falls back safely and malformed IPC updates cannot overwrite it", () => {
  const f = fixture({ startupWindow: { remember: "true", mode: "broken", width: -1, height: "900" },
    windowState: { bounds: { x: NaN }, maximized: true } });
  assert.deepEqual(f.manager.getSettings(), DEFAULT_WINDOW_SETTINGS);
  for (const bad of [null, {}, { ...DEFAULT_WINDOW_SETTINGS, width: Infinity },
    { ...DEFAULT_WINDOW_SETTINGS, height: 800.5 }, { ...DEFAULT_WINDOW_SETTINGS, remember: "false" }]) {
    assert.throws(() => f.manager.setSettings(bad));
  }
  assert.equal(f.writes.length, 0);
});

test("a failed save leaves the applied preferences intact and observation failures do not crash quit", () => {
  const f = fixture();
  f.manager.show(f.window);
  f.manager.setSettings({ ...DEFAULT_WINDOW_SETTINGS, remember: true });
  f.deps.writeConfig = () => { throw new Error("disk unavailable"); };
  assert.throws(() => f.manager.setSettings({ ...DEFAULT_WINDOW_SETTINGS, mode: "custom" }));
  assert.equal(f.manager.getSettings().remember, true);
  f.window.setBounds({ x: 40, y: 40, width: 900, height: 600 });
  assert.doesNotThrow(() => f.window.close());
  assert.equal(f.errors.length, 1);
});
