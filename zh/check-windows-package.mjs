// Check the effective packaging configuration and the actual packaged client together.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const release = join(root, "release");
const config = JSON.parse(readFileSync(join(release, "windows-package-config.json"), "utf8"));
assert.equal(config.nsis.oneClick, false, "Chinese installer must show the wizard");
assert.equal(config.nsis.allowToChangeInstallationDirectory, true, "Chinese installer must offer a destination directory");
assert.equal(config.nsis.include, "zh/installer.nsh");
assert.deepEqual(config.nsis.installerLanguages, ["zh_CN"]);

const asar = require("@electron/asar");
const archive = join(release, "win-unpacked", "resources", "app.asar");
const main = asar.extractFile(archive, join("dist-electron", "main.js")).toString("utf8");
const preload = asar.extractFile(archive, join("dist-electron", "preload.cjs")).toString("utf8");
const rendererPath = asar.listPackage(archive).find((file) => /[\\/]dist[\\/]assets[\\/]index-[^\\/]+\.js$/.test(file));
assert.ok(rendererPath, "Packaged renderer is missing");
const renderer = asar.extractFile(archive, rendererPath.replace(/^[\\/]/, "")).toString("utf8");
assert.ok(main.includes("window:set-settings"), "Packaged main process lacks window settings");
assert.ok(preload.includes("getStartupWindowSettings"), "Packaged preload lacks window settings");
for (const label of ["启动窗口", "记住上次窗口状态", "自定义尺寸"]) {
  assert.ok(renderer.includes(label), `Packaged renderer is missing: ${label}`);
}

const info = {
  commit: process.env.GITHUB_SHA || null,
  version: JSON.parse(asar.extractFile(archive, "package.json").toString("utf8")).version,
  variant: process.env.GRYT_VARIANT || "full",
  installer: { wizard: true, chooseDirectory: true, language: "zh_CN", include: config.nsis.include },
  startupWindowSettings: true,
};
writeFileSync(join(release, "build-info.json"), JSON.stringify(info, null, 2) + "\n", "utf8");
console.log("✓ Packaged Chinese installer offers directory selection and contains startup window settings");
