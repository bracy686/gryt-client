#!/usr/bin/env node
// 汉化改写的体检：把字典套到真实源码上，检查「除文案以外的一切都没变」。
//
//   node zh/selftest.mjs            # 全量检查
//   node zh/selftest.mjs src/app.tsx  # 只查指定文件
//
// 两条硬性不变量：
//   1) 改写后的代码必须能解析通过（零语法错误）—— 早期 bug 就是把后面的代码切掉了；
//   2) 比较 AST 骨架，保留模板内表达式；换序包装还原成原始求值顺序后再比较。
// 退出码非 0 表示有问题，可直接用作 CI 门禁。

import fs from "node:fs";
import path from "node:path";
import { rewrite, scan } from "./lib.mjs";
import { structureOf as skeleton } from "./structure.mjs";

// 用 import.meta.dirname，别用 new URL(import.meta.url).pathname：Windows 上后者会变成
// "/D:/a/..."，再 path.resolve 就拼成 "D:\D:\a\..."，CI 上直接 ENOENT。
const ROOT = path.resolve(import.meta.dirname, "..");
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, "zh/dict.zh.json"), "utf8"));

const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", "release", ".git", "zh", "out"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => path.resolve(p))
  : [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "electron")), ...walk(path.join(ROOT, "node_modules/@gryt/ui/dist"))];

let checked = 0;
let hits = 0;
let bad = 0;
const problems = [];

for (const file of targets) {
  const rel = path.relative(ROOT, file);
  const code = fs.readFileSync(file, "utf8");
  const items = scan(code, rel);
  if (items.length === 0) continue;
  hits += items.filter((it) => typeof dict[it.key] === "string").length;
  const issues = [];
  const out = rewrite(code, rel, dict, null, (item) => {
    if (item.reason) issues.push(`${item.reason}: ${item.key}`);
  });
  if (issues.length) { bad++; problems.push(`✗ ${rel}\n    ${issues.join("\n    ")}`); }
  if (out === code) continue;
  checked++;

  const before = skeleton(code, rel);
  const after = skeleton(out, rel);
  issues.length = 0;
  if (before.errors !== 0) issues.push(`原文件本身有 ${before.errors} 个语法错误（跳过结构比对）`);
  else if (after.errors !== 0) issues.push(`改写后有 ${after.errors} 个语法错误`);
  if (before.errors === 0 && before.skeleton !== after.skeleton) {
    // 找到首个不同的 AST 节点。
    let i = 0;
    while (i < before.skeleton.length && before.skeleton[i] === after.skeleton[i]) i++;
    issues.push(
      `结构骨架被改动，首个不同处在第 ${before.skeleton.slice(0, i).split("\n").length} 行附近：\n` +
        `      改前 ${JSON.stringify(before.skeleton.slice(Math.max(0, i - 60), i + 60))}\n` +
        `      改后 ${JSON.stringify(after.skeleton.slice(Math.max(0, i - 60), i + 60))}`
    );
  }
  if (issues.length) {
    bad++;
    problems.push(`✗ ${rel}\n    ${issues.join("\n    ")}`);
  }
}

console.log(`检查 ${targets.length} 个文件，其中 ${checked} 个被改写（命中 ${hits} 处文案）。`);
if (bad) {
  console.log(`\n有问题的文件 ${bad} 个：\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("✓ 语法与 AST 检查通过：保留模板内表达式；交互行为由回归测试验证。");
