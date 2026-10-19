/* eslint-env node */

// A real Electron window with its own temp userData. No Gryt login/startup/helper side effects.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect } from "@playwright/test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "gryt-window-smoke-"));
const main = join(temporary, "main.cjs");
const configFile = join(temporary, "window-config.json");
let application;

try {
  await writeFile(configFile, JSON.stringify({ closeToTray: true }));
  await build({
    stdin: { resolveDir: root, loader: "ts", contents: `
      import { app, BrowserWindow, ipcMain, screen } from "electron";
      import { readFileSync, writeFileSync } from "node:fs";
      import { createWindowStateManager } from "./electron/windowState.ts";
      app.setPath("userData", ${JSON.stringify(temporary)});
      const fp = ${JSON.stringify(configFile)};
      const readConfig = () => JSON.parse(readFileSync(fp, "utf8"));
      const manager = createWindowStateManager({ screen, readConfig,
        writeConfig: patch => writeFileSync(fp, JSON.stringify({ ...readConfig(), ...patch })),
        onError: error => { throw error; } });
      globalThis.windowManager = manager;
      app.whenReady().then(() => {
        ipcMain.handle("window:get-settings", () => manager.getSettings());
        ipcMain.handle("window:set-settings", (_event, value) => manager.setSettings(value));
        ipcMain.handle("window:get-current-size", () => manager.getCurrentSize());
        const startup = manager.startupState();
        const win = new BrowserWindow({ ...startup.bounds, show: false, titleBarStyle: "hidden",
          minWidth: 300, minHeight: 300,
          webPreferences: { preload: ${JSON.stringify(join(root, "dist-electron/preload.cjs"))}, contextIsolation: true } });
        manager.attach(win, startup);
        win.loadURL("data:text/html,<title>Gryt window smoke test</title><p>Isolated window test</p>");
        if (process.env.GRYT_WINDOW_SMOKE_HIDDEN !== "1") manager.show(win);
      });
      app.on("before-quit", manager.flush);
      app.on("window-all-closed", () => app.quit());
    ` },
    bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: main,
  });

  async function launch(hidden = false) {
    const env = { ...process.env, GRYT_WINDOW_SMOKE_HIDDEN: hidden ? "1" : "0" };
    delete env.ELECTRON_RUN_AS_NODE;
    application = await electron.launch({ args: [main], env });
    const page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => page.evaluate(() => !!window.electronAPI?.getStartupWindowSettings)).toBe(true);
    return page;
  }

  const bounds = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNormalBounds());
  const setBounds = (size) => application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setBounds(size), size);
  const close = async () => { await application.close(); application = null; };

  let page = await launch();
  const automatic = await bounds();
  const area = await application.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  assert.equal((await page.evaluate(() => window.electronAPI.getStartupWindowSettings())).remember, false);
  assert.ok(automatic.width <= 1200 && automatic.width <= Math.round(area.width * 0.8), JSON.stringify({ automatic, area }));
  assert.ok(automatic.height <= 800 && automatic.height <= Math.round(area.height * 0.8), JSON.stringify({ automatic, area }));
  const custom = { remember: false, mode: "custom", width: Math.min(900, area.width - 80), height: Math.min(600, area.height - 80) };
  await page.evaluate((settings) => window.electronAPI.setStartupWindowSettings(settings), custom);
  assert.deepEqual(await bounds(), automatic, "saving preferences resized the current window");
  await setBounds({ x: area.x + 80, y: area.y + 90, width: 950, height: 650 });
  await close();

  page = await launch();
  assert.equal((await bounds()).width, custom.width);
  assert.equal((await bounds()).height, custom.height);
  await page.evaluate((settings) => window.electronAPI.setStartupWindowSettings({ ...settings, remember: true }), custom);
  const targetSize = { width: Math.min(1000, area.width - 120), height: Math.min(680, area.height - 140) };
  await setBounds({ x: area.x + 60, y: area.y + 70, ...targetSize });
  const remembered = await bounds();
  assert.ok(Math.abs(remembered.width - targetSize.width) <= 2 && Math.abs(remembered.height - targetSize.height) <= 2);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  assert.deepEqual(await page.evaluate(() => window.electronAPI.getCurrentWindowSize()), { width: remembered.width, height: remembered.height });
  await close();
  const disk = JSON.parse(await readFile(configFile, "utf8"));
  assert.equal(disk.closeToTray, true);
  assert.deepEqual(disk.startupWindow, { ...custom, remember: true });
  assert.deepEqual(disk.windowState, { bounds: remembered, maximized: true });

  await launch(true);
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  assert.deepEqual(JSON.parse(await readFile(configFile, "utf8")), disk, "hidden initialization replaced the saved state");
  await application.evaluate(({ BrowserWindow }) => globalThis.windowManager.show(BrowserWindow.getAllWindows()[0]));
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  assert.deepEqual(await bounds(), remembered, "fractional display scaling changed remembered bounds on restart");
  await application.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.unmaximize();
  });
  await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
  await application.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.hide();
    globalThis.windowManager.show(win);
  });
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()), false);
  await close();
  console.log("✓ Real Electron: default auto sizing, preload IPC, custom size after restart, memory, normal bounds while maximized, hidden auto-start and tray restore");
} finally {
  await application?.close();
  // Delete only the directory this run created directly in the OS temp folder.
  assert.equal(resolve(dirname(temporary)), resolve(tmpdir()));
  assert.ok(temporary.startsWith(join(tmpdir(), "gryt-window-smoke-")));
  await rm(temporary, { recursive: true, force: true });
}
