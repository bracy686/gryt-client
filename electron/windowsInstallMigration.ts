import { existsSync, lstatSync, readFileSync, rmSync } from "fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "path";

const RECEIPT = "gryt-migration.ini";

function field(file: string, key: string): string | null {
  const bytes = readFileSync(file);
  const text = bytes[0] === 0xff && bytes[1] === 0xfe
    ? bytes.subarray(2).toString("utf16le")
    : bytes.toString("utf8");
  const section = text.split(/^\[migration\]\s*$/im)[1]?.split(/^\[/m)[0];
  const value = section?.match(new RegExp(`^${key}=(.*)$`, "im"))?.[1].trim();
  return value?.replace(/^"(.*)"$/, "$1") || null;
}

function samePath(left: string, right: string): boolean {
  return relative(resolve(left), resolve(right)) === "";
}

/** Delete only a backup with a matching receipt, after the replacement app has launched. */
export function cleanupWindowsMigrationBackup(installDir: string, log: (message: string) => void): void {
  const receipt = join(installDir, RECEIPT);
  if (!existsSync(receipt)) return;
  try {
    const backup = field(receipt, "backup");
    if (!backup || !isAbsolute(backup) || !/^.+\.gryt-backup(?:\.\d+)?$/.test(basename(backup))) {
      throw new Error("invalid backup path");
    }
    const insideBackup = relative(backup, installDir);
    const outsideBackup = insideBackup === ".." || insideBackup.startsWith(`..${sep}`) || isAbsolute(insideBackup);
    if (!outsideBackup) {
      throw new Error("backup contains the running installation");
    }
    if (existsSync(backup)) {
      const target = field(join(backup, RECEIPT), "target");
      if (lstatSync(backup).isSymbolicLink() || !target || !samePath(target, installDir)
        || !existsSync(join(backup, "Gryt Chat.exe")) || !existsSync(join(backup, "Uninstall Gryt Chat.exe"))) {
        throw new Error("backup ownership could not be verified");
      }
      rmSync(backup, { recursive: true });
      log(`Windows migration: removed verified backup ${backup}`);
    }
    rmSync(receipt);
  } catch (error) {
    // A failed cleanup must leave the receipt and backup available for recovery.
    log(`Windows migration: kept recovery backup: ${String(error)}`);
  }
}
