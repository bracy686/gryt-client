#!/usr/bin/env node
// 校验译稿分片：键必须与输入分片一一对应，占位符必须原样保留。
//
//   node zh/verify-parts.mjs            # 全部已存在的分片
//   node zh/verify-parts.mjs 001 002    # 只查指定分片
//
// 退出码非 0 表示有硬错误（缺键、多键、占位符不符）。

import fs from "node:fs";
import path from "node:path";

const ZH = path.resolve(import.meta.dirname);

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const placeholders = (s) => (s.match(/\{\d+\}/g) || []).sort().join(",");

const want = process.argv.slice(2);
const batches = fs
  .readdirSync(path.join(ZH, "batches"))
  .filter((f) => f.endsWith(".json"))
  .filter((f) => want.length === 0 || want.some((w) => f.includes(w)))
  .sort();

let hard = 0;
let total = 0;
let nulls = 0;
let missingFiles = 0;

for (const bf of batches) {
  const partFile = path.join(ZH, "parts", bf.replace("batch-", "part-"));
  if (!fs.existsSync(partFile)) {
    missingFiles += 1;
    console.log(`· ${bf} → 还没有译稿`);
    continue;
  }

  const batch = load(path.join(ZH, "batches", bf));
  const part = load(partFile);
  const keys = batch.items.map((i) => i.key);
  const got = Object.keys(part);

  const missing = keys.filter((k) => !(k in part));
  const extra = got.filter((k) => !keys.includes(k));
  const badPh = [];
  const badType = [];
  for (const k of keys) {
    const v = part[k];
    if (v === null) {
      nulls += 1;
      continue;
    }
    if (typeof v !== "string" || !v.trim()) {
      badType.push(k);
      continue;
    }
    if (placeholders(k) !== placeholders(v)) badPh.push(`${k} → ${v}`);
  }

  total += keys.length;
  const problems = missing.length + extra.length + badPh.length + badType.length;
  if (problems) hard += 1;
  console.log(
    `${problems ? "✗" : "✓"} ${bf}: ${keys.length} 条，缺 ${missing.length}，多 ${extra.length}，占位符不符 ${badPh.length}，空值 ${badType.length}`,
  );
  for (const m of missing.slice(0, 5)) console.log(`    缺：${m}`);
  for (const e of extra.slice(0, 5)) console.log(`    多：${e}`);
  for (const b of badPh.slice(0, 5)) console.log(`    占位符：${b}`);
}

console.log(`\n合计 ${total} 条待译，其中不译（null）${nulls} 条；有问题的分片 ${hard} 个，缺译稿 ${missingFiles} 个`);
process.exit(hard ? 1 : 0);
