import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

process.env.GRYT_ZH = "1";
delete process.env.ELECTRON;
const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
  logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true,
  ...(process.env.ZH_BROWSER_CHANNEL ? { channel: process.env.ZH_BROWSER_CHANNEL } : {}) });
const url = new URL("zh/window-settings-fixture.html", server.resolvedUrls.local[0]).href;

try {
  const web = await browser.newPage();
  await web.goto(url);
  await expect(web.getByRole("heading", { name: "显示", exact: true })).toBeVisible();
  await expect(web.locator('[data-gryt="startup-window-settings"]')).toHaveCount(0);
  await web.close();

  const desktop = await browser.newPage({ viewport: { width: 800, height: 1000 } });
  const errors = [];
  desktop.on("pageerror", (error) => errors.push(error.message));
  await desktop.addInitScript(() => {
    window.electronAPI = {
      isElectron: true,
      getStartupWindowSettings: async () => JSON.parse(localStorage.getItem("window-smoke")
        || '{"remember":false,"mode":"auto","width":1200,"height":800}'),
      setStartupWindowSettings: async (settings) => {
        if (window.__windowSmokeFailSave) throw new Error("simulated write failure");
        localStorage.setItem("window-smoke", JSON.stringify(settings));
        return settings;
      },
      getCurrentWindowSize: async () => ({ width: 1024, height: 700 }),
    };
  });
  await desktop.goto(url);
  const memory = desktop.getByRole("switch", { name: "记住上次窗口状态", exact: true });
  const mode = desktop.getByRole("combobox", { name: "启动窗口大小", exact: true });
  await expect(memory).not.toBeChecked();
  await expect(mode).toBeEnabled();
  await expect(mode).toHaveText("自动适配屏幕");
  await mode.click();
  await desktop.getByRole("option", { name: "自定义尺寸", exact: true }).click();
  const width = desktop.getByRole("spinbutton", { name: "宽度", exact: true });
  const height = desktop.getByRole("spinbutton", { name: "高度", exact: true });
  await expect(width).toHaveValue("1200");
  await width.fill("900");
  await height.fill("640");
  await desktop.getByRole("button", { name: "保存尺寸", exact: true }).click();
  const saved = () => desktop.evaluate(() => JSON.parse(localStorage.getItem("window-smoke")));
  await expect.poll(saved).toEqual({ remember: false, mode: "custom", width: 900, height: 640 });
  await desktop.getByRole("button", { name: "使用当前窗口大小", exact: true }).click();
  await expect(width).toHaveValue("1024");
  await expect(height).toHaveValue("700");
  assert.equal((await saved()).width, 900, "copying the current size saved without the size button");
  await width.fill("123");
  await desktop.getByRole("button", { name: "保存尺寸", exact: true }).click();
  await expect(desktop.getByRole("alert")).toContainText("300 至 16384");
  assert.equal((await saved()).width, 900);
  await width.fill("1080");
  await desktop.getByRole("button", { name: "保存尺寸", exact: true }).click();
  await expect.poll(async () => (await saved()).width).toBe(1080);
  await memory.click();
  await expect(memory).toBeChecked();
  await expect(mode).toBeDisabled();
  await expect(width).toBeDisabled();
  await expect(desktop.getByRole("button", { name: "使用当前窗口大小", exact: true })).toBeDisabled();
  await desktop.reload();
  await expect(memory).toBeChecked();
  await expect(width).toHaveValue("1080");
  await memory.click();
  await expect(width).toBeEnabled();
  await desktop.evaluate(() => { window.__windowSmokeFailSave = true; });
  await memory.click();
  await expect(desktop.getByRole("alert")).toHaveText("无法保存窗口设置，请重试。");
  await expect(memory).not.toBeChecked();
  await desktop.evaluate(() => { window.__windowSmokeFailSave = false; });
  await desktop.setViewportSize({ width: 420, height: 1000 });
  await width.fill("1000");
  await desktop.getByRole("button", { name: "保存尺寸", exact: true }).click();
  await expect(desktop.getByRole("status")).toHaveText("已保存，下次启动 Gryt 时生效。");
  assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    "window settings overflow a narrow display");
  if (process.env.WINDOW_SETTINGS_SCREENSHOT) await desktop.screenshot({ path: process.env.WINDOW_SETTINGS_SCREENSHOT, fullPage: true });
  assert.deepEqual(errors, []);
  console.log("✓ 中文显示页：默认关闭记忆、自定义保存、当前尺寸、无效输入、记忆互斥、重载、保存失败和窄窗口");
  console.log("✓ 浏览器显示页隐藏桌面窗口设置");
} finally {
  await browser.close();
  await server.close();
}
