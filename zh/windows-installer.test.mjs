/* eslint-env node */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { cleanupWindowsMigrationBackup } from "../electron/windowsInstallMigration.ts";

const require = createRequire(import.meta.url);
const configFile = require.resolve("../electron-builder.config.cjs");
const validate = require("@develar/schema-utils");
const schema = require("app-builder-lib/scheme.json");

test("Chinese full and slim builds expose a valid wizard without changing upstream builds", () => {
  const old = { ...process.env };
  try {
    for (const variant of ["full", "slim"]) {
      for (const zh of ["0", "1"]) {
        process.env.GRYT_VARIANT = variant;
        process.env.GRYT_ZH = zh;
        delete require.cache[configFile];
        const config = require(configFile);
        validate(schema, config, { name: "electron-builder" });
        assert.equal(config.nsis.oneClick, zh !== "1");
        assert.equal(config.nsis.allowToChangeInstallationDirectory, zh === "1");
        assert.equal(config.nsis.deleteAppDataOnUninstall, false);
        assert.equal(config.appId, "com.gryt.chat");
        if (zh === "1") {
          assert.equal(config.nsis.include, "zh/installer.nsh");
          assert.deepEqual(config.nsis.installerLanguages, ["zh_CN"]);
        }
      }
    }
  } finally {
    for (const key of ["GRYT_VARIANT", "GRYT_ZH"]) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
    delete require.cache[configFile];
  }
});

test("opening/cancelling the wizard cannot move files, stop processes or write registry state", () => {
  const script = readFileSync(new URL("./installer.nsh", import.meta.url), "utf8");
  const init = script.match(/!macro customInit\b([\s\S]*?)!macroend/)[1];
  assert.doesNotMatch(init, /\b(?:Rename|DeleteReg\w*|WriteReg\w*|RMDir|Exec\w*|FileOpen)\b/);
  assert.match(script, /!define APP_FILENAME "gryt-chat"/);
  assert.match(script, /StrCpy \$isForceCurrentInstall "1"/);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gryt-migration-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, "新位置 with spaces", "gryt-chat");
  const backup = join(root, "旧位置 with spaces", "gryt-chat.gryt-backup.1");
  mkdirSync(target, { recursive: true });
  mkdirSync(backup, { recursive: true });
  writeFileSync(join(backup, "Gryt Chat.exe"), "old app");
  writeFileSync(join(backup, "Uninstall Gryt Chat.exe"), "old uninstaller");
  const ini = (folder, key, value) => writeFileSync(join(folder, "gryt-migration.ini"),
    Buffer.from(`\ufeff[migration]\r\n${key}=${value}\r\n`, "utf16le"));
  ini(target, "backup", backup);
  ini(backup, "target", target);
  const messages = [];
  return { root, target, backup, ini, log: (message) => messages.push(message), messages };
}

test("a launched replacement cleans its verified backup across directories, including Unicode INI paths", (t) => {
  const f = fixture(t);
  cleanupWindowsMigrationBackup(f.target, f.log);
  assert.equal(existsSync(f.backup), false);
  assert.equal(existsSync(join(f.target, "gryt-migration.ini")), false);
  assert.equal(existsSync(f.target), true);
});

test("another installation's backup is preserved", (t) => {
  const f = fixture(t);
  f.ini(f.backup, "target", join(f.root, "other"));
  cleanupWindowsMigrationBackup(f.target, f.log);
  assert.equal(existsSync(f.backup), true);
  assert.equal(existsSync(join(f.target, "gryt-migration.ini")), true);
  assert.match(f.messages[0], /kept recovery backup/);
});

test("a normal directory or a backup missing its old executable is preserved", (t) => {
  const f = fixture(t);
  f.ini(f.target, "backup", f.root);
  cleanupWindowsMigrationBackup(f.target, f.log);
  assert.equal(existsSync(f.root), true);
  f.ini(f.target, "backup", f.backup);
  rmSync(join(f.backup, "Gryt Chat.exe"));
  cleanupWindowsMigrationBackup(f.target, f.log);
  assert.equal(existsSync(f.backup), true);
});

test("a backup that contains the running installation is never removed", (t) => {
  const f = fixture(t);
  const nested = join(f.backup, "new-app");
  mkdirSync(nested);
  f.ini(nested, "backup", f.backup);
  f.ini(f.backup, "target", nested);
  cleanupWindowsMigrationBackup(nested, f.log);
  assert.equal(existsSync(nested), true);
});

test("missing and already-cleaned receipts are harmless", (t) => {
  const f = fixture(t);
  rmSync(f.backup, { recursive: true });
  cleanupWindowsMigrationBackup(f.target, f.log);
  cleanupWindowsMigrationBackup(f.target, f.log);
  assert.equal(existsSync(f.target), true);
  assert.deepEqual(f.messages, []);
});
