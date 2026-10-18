#!/usr/bin/env node
// 汉化体检：看覆盖率、失效条目、未译清单。自己扫描源码，不依赖中间文件。
//
//   node zh/check.mjs                  # 体检
//   node zh/check.mjs --top 40         # 列出出现次数最多的未译条目
//   node zh/check.mjs --stale          # 只列失效条目
//   node zh/check.mjs --min-coverage 85  # 覆盖率低于 85% 就退出码 1（CI 门禁用）
//
// 「失效」= 字典里有、但当前源码里已经找不到完全一致的串。上游改文案后就会出现，
// 需要人工判断是删掉还是改键。失效条目本身不影响运行（最多是不生效），所以只警告。

import fs from "node:fs";
import path from "node:path";
import { collect } from "./extract.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const topN = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : 25;
const staleOnly = args.includes("--stale");
const minCoverage = args.includes("--min-coverage") ? Number(args[args.indexOf("--min-coverage") + 1]) : null;

const dictPath = path.join(ROOT, "zh/dict.zh.json");
const dict = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, "utf8")) : {};
const inv = collect();
if (args.includes("--require-ui") && inv.missingTargets.some((t) => t.includes("@gryt/ui"))) {
  console.error("✗ 缺少 @gryt/ui/dist，请先按锁文件安装依赖，不能省略组件库检查");
  process.exit(1);
}
const byKey = new Map(inv.items.map((i) => [i.key, i]));

const dictKeys = Object.keys(dict).filter((k) => typeof dict[k] === "string");
const hit = dictKeys.filter((k) => byKey.has(k));
const stale = dictKeys.filter((k) => !byKey.has(k));
const ignored = inv.items.filter((i) => dict[i.key] === null);
const untranslated = inv.items.filter((i) => typeof dict[i.key] !== "string" && dict[i.key] !== null);
const denominator = inv.uniqueKeys - ignored.length;
const coverage = denominator ? (hit.length / denominator) * 100 : 0;

console.log(`字典条目      ${dictKeys.length}`);
console.log(`源码候选      ${inv.uniqueKeys}（${inv.candidates} 处，${inv.filesScanned} 个文件）`);
console.log(`有效条目      ${hit.length}`);
console.log(`失效条目      ${stale.length}`);
console.log(`明确保留原文  ${ignored.length}（品牌、单位、代码等，不计入翻译分母）`);
console.log(`候选完成率    ${coverage.toFixed(1)}%（仅限扫描器识别的文案，不代表整个界面）`);
console.log(`未译条目      ${untranslated.length}`);
if (inv.missingTargets.length) console.log(`未扫描目录    ${inv.missingTargets.join("、")}`);

if (stale.length) {
  console.log("\n=== 失效条目（源码里已找不到，需人工清理） ===");
  for (const k of stale.slice(0, 30)) console.log(`  ${k}`);
  if (stale.length > 30) console.log(`  …还有 ${stale.length - 30} 条`);
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

if (minCoverage !== null && coverage < minCoverage) {
  console.error(`\n✗ 覆盖率 ${coverage.toFixed(1)}% 低于阈值 ${minCoverage}%`);
  process.exit(1);
}
if (dictKeys.length === 0) {
  console.error("\n✗ 字典是空的，检查 zh/dict.zh.json 是否被正确检出");
  process.exit(1);
}
