/* eslint-env node */
// Windows only: compile the REAL wizard around a harmless stub app and a unique registry identity.
// No production Gryt registry key, shortcut, protocol or helper process is used.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { cleanupWindowsMigrationBackup } from "../electron/windowsInstallMigration.ts";

if (process.platform !== "win32") throw new Error("Run this installer integration check on Windows.");
const require = createRequire(import.meta.url);
const { build, Platform, Arch } = require("electron-builder");
const { UUID } = require("builder-util-runtime");
// Namespace used by electron-builder 26's NsisTarget.
const namespace = UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3");
const repo = resolve(import.meta.dirname, "..");
const root = mkdtempSync(join(tmpdir(), "gryt-wizard-test-"));
const driveRoot = mkdtempSync(join(dirname(repo), ".windows-wizard-test-"));
const appId = `chat.gryt.installer-test.${randomUUID()}`;
const guid = UUID.v5(appId, namespace);
const migrationKey = `Software\\GrytInstallerTests\\${guid}`;
const installKey = `Software\\${guid}`;
const uninstallKey = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`;
const packageName = `gryt-installer-test-${guid}`;
const updaterCache = join(process.env.LOCALAPPDATA, `${packageName}-updater`);
const isolatedKeys = [migrationKey, installKey, uninstallKey];
const source = join(root, "旧安装 with spaces", "gryt-chat");
const target = join(driveRoot, "新安装 with spaces", "gryt-chat");
const unused = join(root, "must-not-install-here");
const fixtureProject = join(root, "project");
const stub = join(root, "app");
const run = (file, args, options = {}) => {
  for (let attempt = 0; ; attempt++) {
    try { return execFileSync(file, args, { windowsHide: true, timeout: 60_000, encoding: "utf8", stdio: "pipe", ...options }); }
    catch (error) {
      if (attempt < 20 && ["EBUSY", "EACCES", "EPERM"].includes(error.code)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
        continue;
      }
      error.message += `\nstatus=${error.status} signal=${error.signal} code=${error.code}`;
      throw error;
    }
  }
};
const reg = (...args) => run("reg.exe", [...args, "/reg:64"]);
const put = (key, name, value, type = "REG_SZ") => reg("add", `HKCU\\${key}`, "/v", name, "/t", type, "/d", value, "/f");
const query = (key, name) => {
  // reg.exe's redirected output can lose Unicode on English Windows runners.
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $item = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('${key}'); if ($null -eq $item) { exit 1 }; $value = $item.GetValue('${name}', $null); if ($null -eq $value) { exit 1 }; [Console]::Write($value)`]);
};

try {
  // Find a downloaded NSIS bundle even if an NTFS junction made app-builder's cache rename fail.
  const cache = join(process.env.LOCALAPPDATA, "electron-builder", "Cache", "nsis");
  const bundles = existsSync(cache) ? readdirSync(cache).map((name) => join(cache, name)) : [];
  const nsisDir = bundles.find((dir) => existsSync(join(dir, "Bin", "makensis.exe")));
  const resourcesDir = bundles.find((dir) => existsSync(join(dir, "plugins", "x86-unicode", "StdUtils.dll")));
  if (nsisDir) process.env.ELECTRON_BUILDER_NSIS_DIR ??= nsisDir;
  if (resourcesDir) process.env.ELECTRON_BUILDER_NSIS_RESOURCES_DIR ??= resourcesDir;
  mkdirSync(fixtureProject);
  mkdirSync(join(stub, "resources", "helper"), { recursive: true });
  writeFileSync(join(fixtureProject, "package.json"), JSON.stringify({ name: packageName, version: "99.0.0", description: "Installer test fixture", author: "Gryt" }));
  const cs = join(root, "Stub.cs");
  writeFileSync(cs, "class Program { static int Main() { return 0; } }");
  const csc = join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  run(csc, ["/nologo", "/target:winexe", `/out:${join(stub, "Gryt Chat.exe")}`, cs]);
  const productionInclude = join(repo, "zh", "installer.nsh");
  const prefix = [
    `!define GRYT_MIGRATION_REG_KEY "${migrationKey}"`,
    `!define GRYT_USER_DATA "${root}\\user-data"`,
    `!define GRYT_LEGACY_INSTALL_KEY "${migrationKey}\\LegacyInstall"`,
    `!define GRYT_LEGACY_UNINSTALL_KEY "${migrationKey}\\LegacyUninstall"`,
    `!define GRYT_HELPER_RUN_KEY "${migrationKey}\\Run"`,
    '!define GRYT_HELPER_NAME "gryt-installer-test-helper.exe"',
    '!undef PROJECT_DIR',
    `!define PROJECT_DIR "${repo}"`,
    `!include "${productionInclude}"`,
  ].join("\n");
  const include = join(root, "fixture.nsh");
  writeFileSync(include, prefix);
  const config = require("../electron-builder.config.cjs");
  const nsis = { ...config.nsis, oneClick: false, allowToChangeInstallationDirectory: true,
    installerLanguages: ["zh_CN"], include, createDesktopShortcut: false, createStartMenuShortcut: false,
    installerIcon: join(repo, "build", "icon.ico"), uninstallerIcon: join(repo, "build", "icon.ico"),
    installerHeaderIcon: join(repo, "build", "icon.ico"),
    uninstallDisplayName: `Gryt installer test ${guid}` };
  const buildFixture = async (out, fixtureInclude = include) => {
    for (let attempt = 0; ; attempt++) {
      try {
        await build({ projectDir: fixtureProject, prepackaged: stub,
          targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
          config: { extends: null, appId, productName: "Gryt Chat", artifactName: "fixture.exe",
            electronVersion: require("electron/package.json").version,
            directories: { output: out, buildResources: join(repo, "build") },
            // Fixtures are unsigned. Let Windows release its scan of each freshly generated PE.
            win: { signAndEditExecutable: false, signtoolOptions: {
              sign: async () => new Promise((done) => setTimeout(done, 1000)),
            } }, nsis: { ...nsis, include: fixtureInclude } } });
        break;
      } catch (error) {
        if (attempt >= 5 || !/failed opening file|Can't open output file|Cannot open 1 file|EPERM/.test(error.message)) throw error;
        await new Promise((done) => setTimeout(done, 1000));
      }
    }
    return join(out, "fixture.exe");
  };
  const installer = await buildFixture(join(root, "out"));

  // A wizard cancelled after initialization has run the same customInit, with no install section.
  const initBody = readFileSync(productionInclude, "utf8").match(/!macro customInit\b([\s\S]*?)!macroend/)[1];
  const cancelInclude = join(root, "cancel.nsh");
  writeFileSync(cancelInclude, `${prefix}\n!macroundef customInit\n!macro customInit\n${initBody}\nSetErrorLevel 0\nQuit\n!macroend\n`);
  const cancelInstaller = await buildFixture(join(root, "cancel-out"), cancelInclude);

  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "Gryt Chat.exe"), "legacy app must survive cancellation");
  writeFileSync(join(source, "Uninstall Gryt Chat.exe"), "poisoned uninstaller must never run");
  put(installKey, "InstallLocation", source);
  put(uninstallKey, "UninstallString", `"${join(source, "Uninstall Gryt Chat.exe")}"`);
  put(migrationKey, "LegacyNsisMigrationV1", "0", "REG_DWORD");
  const helper = `"${join(source, "resources", "helper", "gryt-installer-test-helper.exe")}"`;
  put(`${migrationKey}\\Run`, "GrytHelper", helper);
  run(cancelInstaller, ["/S", `/D=${target}`]);
  assert.equal(readFileSync(join(source, "Gryt Chat.exe"), "utf8"), "legacy app must survive cancellation");
  assert.match(query(uninstallKey, "UninstallString"), /poisoned|Uninstall Gryt Chat/);
  assert.equal(existsSync(target), false);
  assert.ok(query(`${migrationKey}\\Run`, "GrytHelper").includes(helper));
  console.log("PASS: cancellation after initialization leaves the old app and registration intact");

  const occupied = join(driveRoot, "occupied", "gryt-chat");
  mkdirSync(occupied, { recursive: true });
  writeFileSync(join(occupied, "keep.txt"), "unrelated files");
  assert.throws(() => run(installer, ["/S", `/D=${occupied}`]), { status: 2 });
  assert.equal(readFileSync(join(occupied, "keep.txt"), "utf8"), "unrelated files");
  const blocked = join(driveRoot, "file-instead-of-directory");
  writeFileSync(blocked, "cannot create a child directory here");
  assert.throws(() => run(installer, ["/S", `/D=${join(blocked, "gryt-chat")}`]), { status: 2 });
  assert.throws(() => run(installer, ["/S", "/allusers", `/D=${target}`]), { status: 2 });
  assert.equal(readFileSync(join(source, "Gryt Chat.exe"), "utf8"), "legacy app must survive cancellation");
  assert.ok(query(installKey, "InstallLocation").includes(source));
  console.log("PASS: occupied/unwritable directories and all-users mode are rejected before migration");

  const olderBackup = `${source}.gryt-backup`;
  mkdirSync(olderBackup);
  writeFileSync(join(olderBackup, "keep.txt"), "preserve");
  run(installer, ["/S", `/D=${target}`]);
  assert.equal(existsSync(join(target, "Gryt Chat.exe")), true);
  assert.equal(existsSync(source), false);
  assert.equal(existsSync(`${source}.gryt-backup.1`), true);
  assert.equal(readFileSync(join(olderBackup, "keep.txt"), "utf8"), "preserve");
  assert.ok(query(installKey, "InstallLocation").includes(target));
  assert.ok(query(`${migrationKey}\\Run`, "GrytHelper").includes(join(target, "resources", "helper", "gryt-installer-test-helper.exe")));
  cleanupWindowsMigrationBackup(target, console.log);
  assert.equal(existsSync(`${source}.gryt-backup.1`), false);
  assert.equal(existsSync(olderBackup), true);
  console.log("PASS: legacy migration across directories, Unicode/spaces, helper repair, safe backup cleanup");

  run(installer, ["/S", "--updated", `/D=${unused}`]);
  assert.equal(existsSync(join(unused, "Gryt Chat.exe")), false);
  assert.equal(existsSync(join(target, "Gryt Chat.exe")), true);
  assert.ok(query(installKey, "InstallLocation").includes(target));
  console.log("PASS: silent updates keep the registered directory even with an incorrect /D");
  run(installer, ["--updated", "--force-run"]);
  assert.equal(existsSync(join(target, "Gryt Chat.exe")), true);
  console.log("PASS: restart-for-update finishes without waiting for wizard input");

  const userData = join(root, "user-data");
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, "accounts.json"), "preserve user data");
  // NSIS' special _?= parameter must be last and unquoted, even when it contains spaces.
  run(join(target, "Uninstall Gryt Chat.exe"), ["/S", "/currentuser", "/KEEP_APP_DATA", `_?=${target}`], { windowsVerbatimArguments: true });
  assert.equal(existsSync(join(target, "Gryt Chat.exe")), false);
  assert.throws(() => query(`${migrationKey}\\Run`, "GrytHelper"));
  assert.equal(readFileSync(join(userData, "accounts.json"), "utf8"), "preserve user data");
  put(migrationKey, "LegacyNsisMigrationV1", "1", "REG_DWORD");
  run(installer, ["/S", `/D=${target}`]);
  assert.equal(existsSync(join(target, "Gryt Chat.exe")), true);
  assert.throws(() => query(`${migrationKey}\\Run`, "GrytHelper"));
  console.log("PASS: clean install into a custom directory and uninstall/reinstall");
} finally {
  for (const key of isolatedKeys) {
    try { reg("delete", `HKCU\\${key}`, "/f"); } catch { /* key may not have been created */ }
  }
  process.chdir(repo);
  // Remove only this run's fixture roots and uniquely named updater cache.
  for (const folder of [root, driveRoot, updaterCache]) {
    try { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (error) { console.error(`Fixture cleanup: ${error.message}`); }
  }
}
