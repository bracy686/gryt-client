#!/usr/bin/env node
// 汉化体检：看覆盖率、失效条目、未译清单。
//
//   node zh/check.mjs            # 用 zh/inventory.json（extract 的产物）比对字典
//   node zh/check.mjs --top 40   # 列出出现次数最多的未译条目
//   node zh/check.mjs --stale    # 只列失效条目
//
// 「失效」= 字典里有、但当前源码里已经找不到完全一致的串。上游改文案后就会出现，
// 需要人工判断是删掉还是改键。

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const topN = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : 25;
const staleOnly = args.includes("--stale");

const dict = JSON.parse(fs.readFileSync(path.join(ROOT, "zh/dict.zh.json"), "utf8"));
const invPath = path.join(ROOT, "zh/inventory.json");
if (!fs.existsSync(invPath)) {
  console.error("缺少 zh/inventory.json，先跑 node zh/extract.mjs");
  process.exit(1);
}
const inv = JSON.parse(fs.readFileSync(invPath, "utf8"));
const byKey = new Map(inv.items.map((i) => [i.key, i]));

const dictKeys = Object.keys(dict);
const hit = dictKeys.filter((k) => byKey.has(k));
const stale = dictKeys.filter((k) => !byKey.has(k));
const untranslated = inv.items.filter((i) => !(i.key in dict));

console.log(`字典条目      ${dictKeys.length}`);
console.log(`源码候选      ${inv.uniqueKeys}（${inv.candidates} 处，${inv.filesScanned} 个文件）`);
console.log(`有效条目      ${hit.length}`);
console.log(`失效条目      ${stale.length}`);
console.log(`覆盖率        ${((hit.length / inv.uniqueKeys) * 100).toFixed(1)}%`);
console.log(`未译条目      ${untranslated.length}`);

if (stale.length) {
  console.log("\n=== 失效条目（源码里已找不到） ===");
  for (const k of stale) console.log(`  ${k}`);
}

if (!staleOnly && untranslated.length) {
  const sorted = [...untranslated].sort((a, b) => b.count - a.count);
  console.log(`\n=== 未译条目 top ${topN}（按出现次数） ===`);
  for (const i of sorted.slice(0, topN)) {
    console.log(`  ${String(i.count).padStart(3)}x ${i.key.slice(0, 110)}`);
  }
}

// 顺带看一眼构建产物里到底有没有中文。
const distDir = path.join(ROOT, "dist/assets");
if (fs.existsSync(distDir)) {
  let files = 0;
  let chars = 0;
  for (const f of fs.readdirSync(distDir)) {
    if (!f.endsWith(".js")) continue;
    const text = fs.readFileSync(path.join(distDir, f), "utf8");
    const n = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    if (n) {
      files += 1;
      chars += n;
    }
  }
  console.log(`\n产物里的中文    ${files} 个 js 文件，共 ${chars} 个汉字（dist/assets）`);
}
