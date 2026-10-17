#!/usr/bin/env node
// 把待译清单切成若干片，供翻译使用；结果合并回 zh/dict.zh.json。
//
//   node zh/make-batches.mjs [每片条数，默认 120]
//   node zh/make-batches.mjs --merge        # 把 zh/parts/*.json 并进 dict.zh.json
//
// 分片按出现次数从多到少排（先译最显眼的），已译的不再出现。

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ZH = path.join(ROOT, "zh");

const load = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback);

function merge() {
  const dictPath = path.join(ZH, "dict.zh.json");
  const dict = load(dictPath, {});
  const partsDir = path.join(ZH, "parts");
  const files = fs.existsSync(partsDir)
    ? fs.readdirSync(partsDir).filter((f) => f.endsWith(".json")).sort()
    : [];

  const report = [];
  let added = 0;
  for (const f of files) {
    const part = load(path.join(partsDir, f), {});
    let n = 0;
    for (const [k, v] of Object.entries(part)) {
      if (v === null || typeof v !== "string" || !v.trim()) continue; // 不译的条目
      if (dict[k] === v) continue;
      dict[k] = v;
      n += 1;
    }
    added += n;
    report.push(`  ${f}: 新增 ${n} 条`);
  }

  const sorted = Object.fromEntries(Object.keys(dict).sort().map((k) => [k, dict[k]]));
  fs.writeFileSync(dictPath, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(report.join("\n"));
  console.log(`合并完成：字典共 ${Object.keys(sorted).length} 条（本次新增 ${added}）`);
}

function split(size) {
  const inv = load(path.join(ZH, "inventory.json"), null);
  if (!inv) throw new Error("先跑 node zh/extract.mjs");
  const dict = load(path.join(ZH, "dict.zh.json"), {});
  const todo = inv.items
    .filter((i) => !(i.key in dict))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const dir = path.join(ZH, "batches");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  let n = 0;
  for (let i = 0; i < todo.length; i += size) {
    const items = todo.slice(i, i + size);
    const name = `batch-${String(n + 1).padStart(3, "0")}.json`;
    fs.writeFileSync(path.join(dir, name), JSON.stringify({ batch: n + 1, items }, null, 1) + "\n", "utf8");
    n += 1;
  }
  console.log(`待译 ${todo.length} 条 → ${n} 片，每片 ${size} 条，写在 zh/batches/`);
}

const arg = process.argv[2];
if (arg === "--merge") merge();
else split(Number(arg) || 120);
