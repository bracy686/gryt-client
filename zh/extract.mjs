#!/usr/bin/env node
// 抽出源码里所有候选界面文案，生成待译清单。
//
//   node zh/extract.mjs            # 全量：src + electron + @gryt/ui dist
//   node zh/extract.mjs --src-only # 只扫 src
//
// 产物：
//   zh/inventory.json    全部候选（含出现次数与位置）
//   zh/untranslated.json 还没进字典的候选，按出现次数排序

import fs from "node:fs";
import path from "node:path";
import { scan } from "./lib.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ZH = path.join(ROOT, "zh");

const TARGETS = [
  { dir: "src", exts: [".ts", ".tsx"] },
  { dir: "electron", exts: [".ts"] },
  { dir: "node_modules/@gryt/ui/dist", exts: [".js", ".cjs"] },
];

function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" && dir !== path.join(ROOT, "node_modules/@gryt/ui/dist")) continue;
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function loadDict() {
  const file = path.join(ZH, "dict.zh.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const srcOnly = process.argv.includes("--src-only");
const targets = srcOnly ? TARGETS.filter((t) => !t.dir.startsWith("node_modules")) : TARGETS;

const dict = loadDict();
const byKey = new Map();
let filesScanned = 0;
let candidates = 0;

for (const target of targets) {
  for (const file of walk(path.join(ROOT, target.dir), target.exts)) {
    const rel = path.relative(ROOT, file);
    let code;
    try {
      code = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    filesScanned++;
    let items;
    try {
      items = scan(code, rel);
    } catch (err) {
      console.error(`扫描失败 ${rel}: ${err.message}`);
      continue;
    }
    candidates += items.length;
    for (const item of items) {
      const entry = byKey.get(item.key) ?? { key: item.key, kinds: new Set(), count: 0, where: [] };
      entry.kinds.add(item.kind);
      entry.count++;
      if (entry.where.length < 5 && !entry.where.includes(rel)) entry.where.push(rel);
      byKey.set(item.key, entry);
    }
  }
}

const items = [...byKey.values()]
  .map((e) => ({ key: e.key, kinds: [...e.kinds].sort(), count: e.count, where: e.where }))
  .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

const untranslated = items.filter((i) => typeof dict[i.key] !== "string");

fs.writeFileSync(
  path.join(ZH, "inventory.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      filesScanned,
      candidates,
      uniqueKeys: items.length,
      translated: items.length - untranslated.length,
      items,
    },
    null,
    2,
  ) + "\n",
);
fs.writeFileSync(path.join(ZH, "untranslated.json"), JSON.stringify({ generatedAt: new Date().toISOString(), items: untranslated }, null, 2) + "\n");

console.log(`文件 ${filesScanned} 个，候选 ${candidates} 处，去重 ${items.length} 条`);
console.log(`已译 ${items.length - untranslated.length} 条，待译 ${untranslated.length} 条`);
console.log(`产物：zh/inventory.json、zh/untranslated.json`);
