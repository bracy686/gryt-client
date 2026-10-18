import assert from "node:assert/strict";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";

const root = path.resolve(import.meta.dirname, "..");
process.env.GRYT_ZH = "1";
delete process.env.ELECTRON;
const browser = await chromium.launch({ headless: true, ...(process.env.ZH_BROWSER_CHANNEL ? { channel: process.env.ZH_BROWSER_CHANNEL } : {}) });
const localOnly = async (page) => page.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
let production;
let development;
try {
  production = await preview({ root, logLevel: "error", preview: { host: "127.0.0.1", port: 0 } });
  const page = await browser.newPage();
  await localOnly(page);
  page.setDefaultTimeout(10000);
  await page.goto(production.resolvedUrls.local[0]);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  const welcome = page.getByRole("dialog");
  await expect(welcome).toBeVisible({ timeout: 20000 });
  await welcome.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "设置与账号", exact: true }).click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  await page.locator('[data-tour="settings-sound-video"]').click();
  await page.getByRole("button", { name: "音频", exact: true }).click();
  await expect(page.getByText("麦克风输入音量（100% 为原音量，200% 为两倍）", { exact: true })).toBeVisible();
  console.log("✓ 中文构建：欢迎页、设置入口、音频说明与页面语言标记");
  await page.close();

  development = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await development.listen();
  const fixture = await browser.newPage();
  await localOnly(fixture);
  const errors = [];
  fixture.on("pageerror", (error) => { errors.push(error.message); console.error(`组件页面错误：${error.message}`); });
  fixture.on("requestfailed", (request) => console.error(`组件请求失败：${request.url()} ${request.failure()?.errorText}`));
  fixture.on("console", (message) => { if (message.type() === "error") console.error(message.text()); });
  await fixture.addInitScript(() => {
    window.__zhPlayCalls = 0;
    HTMLMediaElement.prototype.play = function () { window.__zhPlayCalls++; return Promise.resolve(); };
  });
  await fixture.goto(new URL("zh/browser-fixture.html", development.resolvedUrls.local[0]).href);
  await expect(fixture.getByRole("button", { name: "同意", exact: true })).toBeVisible({ timeout: 30000 });
  // Declining must still close the real TermsPrompt after its props are translated.
  await fixture.getByRole("button", { name: "暂不", exact: true }).click();
  await expect(fixture.getByRole("alertdialog")).toHaveCount(0);
  await fixture.locator('.chat-video-player[data-sealed="idle"] > button[aria-label="播放视频"]').click();
  await expect.poll(() => fixture.evaluate(() => window.__zhPlayCalls)).toBe(1);
  assert.equal(await fixture.locator('button[aria-label="Play video"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log("✓ 中文组件：确认按钮、取消交互、加密视频解密后启动播放器");
  await fixture.close();
} finally {
  await browser.close();
  await development?.close();
  if (production) await new Promise((resolve, reject) => production.httpServer.close((err) => err ? reject(err) : resolve()));
}
