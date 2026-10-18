import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import test from "node:test";
import ts from "typescript";
import { rebuildTemplate, rewrite } from "./lib.mjs";
import { loadDict, zhCN } from "./plugin.mjs";
import { structureOf } from "./structure.mjs";
import { TEMPLATE_RULES } from "./template-rules.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dict = loadDict(path.join(root, "zh/dict.zh.json"));
const evaluate = (source, names = [], values = []) => Function(...names, `return (${source});`)(...values);
const translated = (code, file = "example.tsx", dictionary = dict) => rewrite(code, file, dictionary);

test("toast methods, conditional messages, copy props and binding defaults are translated", () => {
  const code = 'toast.success("Server address copied"); toast.error(ok ? "Failed to copy" : "Could not restore"); function Dialog({ cancelLabel = "Cancel" }) { return <Panel description="Shown under your name." confirmLabel="Agree" />; }';
  const out = translated(code);
  for (const copy of ["已复制服务器地址", "复制失败", "无法恢复", "取消", "显示在名字下方。", "同意"]) assert.ok(out.includes(copy), copy);
  assert.equal(structureOf(out, "test.tsx").skeleton, structureOf(code, "test.tsx").skeleton);
});

test("conditions, IPC channels, classes, form names and arbitrary call arguments stay intact", () => {
  const code = '<Panel name="Cancel" className="Cancel" title={state === "Online" ? "Online" : "Offline"}>{items.includes("Online") ? "Cancel" : "None"}{send("Cancel")}</Panel>; socket.emit("Cancel");';
  const out = translated(code);
  for (const codePart of ['name="Cancel"', 'className="Cancel"', 'state === "Online"', 'items.includes("Online")', 'send("Cancel")', 'socket.emit("Cancel")']) assert.ok(out.includes(codePart), codePart);
  assert.ok(out.includes('? "在线" : "离线"'));
});

test("JSX quotes, entities and braces retain their rendered values and parse", () => {
  const code = '<div title="Quote">Quote</div>';
  const out = translated(code, "test.tsx", { Quote: '带 "引号" & <标签> {内容}' });
  assert.equal(structureOf(out, "test.tsx").errors, 0);
  assert.ok(out.includes('&quot;引号&quot; &amp; &lt;标签&gt; &#123;内容&#125;'));
});

test("reordered placeholders evaluate and coerce once in the original order", () => {
  const events = [];
  const next = (n) => { events.push(`eval:${n}`); return { toString() { events.push(`string:${n}`); return n; } }; };
  const out = rebuildTemplate("后 {1} 前 {0}", ['next("A")', 'next("B")']);
  assert.equal(evaluate(out, ["next"], [next]), "后 B 前 A");
  assert.deepEqual(events, ["eval:A", "string:A", "eval:B", "string:B"]);
});

test("missing, repeated, unknown and noncanonical placeholders fail closed", () => {
  for (const text of ["{0}", "{0}{0}", "{0}{2}", "{00}{1}"]) assert.equal(rebuildTemplate(text, ["a", "b"]), null);
  const failures = [];
  rewrite('const label = `Hello ${name}`;', "test.ts", { "Hello {0}": "你好" }, null, (item) => failures.push(item.reason));
  assert.deepEqual(failures, ["placeholder-mismatch"]);
});

function actualTemplate(file, fragment) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = (node) => {
    if (!found && ts.isTemplateExpression(node) && node.getText(sf).includes(fragment)) found = node.getText(sf);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert.ok(found, `${file}: ${fragment}`);
  return translated(found, file);
}

test("actual friend summaries have no English is/are at either count", () => {
  const out = actualTemplate("src/packages/socket/src/components/MessagesHome.tsx", "of your friends");
  for (const count of [1, 2]) assert.equal(evaluate(out, ["inVoice", "online"], [[], Array(count)]), `你的好友中有 ${count} 位在线。`);
});

test("actual restored identities have no English plural suffix", () => {
  const out = actualTemplate("src/packages/settings/src/components/localIdentitySection.tsx", "Restored ${");
  for (const count of [1, 2]) assert.equal(evaluate(out, ["restored"], [Array(count)]), `已恢复 ${count} 个身份。正在重新加载…`);
});

test("actual over-limit prompt is translated with reordered values", () => {
  const out = actualTemplate("src/packages/socket/src/components/ForumView.tsx", "characters over");
  assert.equal(evaluate(out, ["body", "BODY_MAX"], ["x".repeat(110), 100]), "这条消息超出 100 字符上限 10 个字符。");
});

test("nested templates and property expressions keep valid syntax and their trailing code", () => {
  const code = 'const label = `Waiting ${ok ? `Hello ${name}` : "Offline"}`; run();';
  const out = translated(code, "test.ts", { "Waiting {0}": "等待 {0}", "Hello {0}": "你好 {0}", Offline: "离线" });
  assert.equal(structureOf(out, "test.ts").errors, 0);
  assert.ok(out.endsWith("; run();"));
  assert.equal(structureOf(out, "test.ts").skeleton, structureOf(code, "test.ts").skeleton);
});

test("structure checks detect changed or removed logic inside templates", () => {
  const shape = (s) => structureOf(s, "test.ts").skeleton;
  assert.notEqual(shape('`A ${count + 1}`'), shape('`甲 ${count + 2}`'));
  assert.notEqual(shape('`A ${send()}`'), shape('`甲 ${other()}`'));
  assert.notEqual(shape('`A ${send()}`'), shape('`甲`'));
  assert.equal(shape('`A ${first()} B ${second()}`'), shape(rebuildTemplate("乙 {1} 甲 {0}", ["first()", "second()"])));
});

test("dictionary translations preserve every placeholder exactly once", () => {
  const slots = (s) => (s.match(/\{\d+\}/g) ?? []).sort();
  for (const [key, value] of Object.entries(dict)) {
    if (value === null) continue;
    assert.equal(typeof value, "string", key);
    assert.ok(value.trim(), key);
    assert.deepEqual(slots(value), slots(key), key);
  }
  for (const [key, rules] of Object.entries(TEMPLATE_RULES)) {
    assert.equal(typeof dict[key], "string", `Scoped template missing: ${key}`);
    for (const index of Object.keys(rules)) assert.ok(key.includes(`{${index}}`), `Unknown slot: ${key} / ${index}`);
  }
});

test("Chinese build marks the document language and fails on missing dictionary or invalid rewrite", () => {
  const previous = process.env.GRYT_ZH;
  const scratch = fs.mkdtempSync(path.join(tmpdir(), "gryt-zh-"));
  const invalidPath = path.join(scratch, "dict.json");
  try {
    process.env.GRYT_ZH = "1";
    const plugin = zhCN({ root });
    assert.equal(plugin.transformIndexHtml('<html lang="en">'), '<html lang="zh-CN">');
    assert.throws(() => loadDict(path.join(root, "zh/missing-test-dict.json")), /Missing Chinese dictionary/);
    assert.ok(plugin.config().optimizeDeps.include.includes("use-sync-external-store/shim"));
    fs.writeFileSync(invalidPath, JSON.stringify({ "Hello {0}": "你好" }));
    const invalid = zhCN({ root, dictPath: invalidPath });
    assert.throws(() => invalid.transform.call({ error(message) { throw new Error(message); } },
      'const label = `Hello ${name}`;', path.join(root, "src/probe.ts")), /placeholder-mismatch/);
    delete process.env.GRYT_ZH;
    assert.equal(zhCN({ root }).transform, undefined);
  } finally {
    if (fs.existsSync(invalidPath)) fs.unlinkSync(invalidPath);
    fs.rmdirSync(scratch);
    if (previous === undefined) delete process.env.GRYT_ZH; else process.env.GRYT_ZH = previous;
  }
});

test("Electron includes Chinese resources only for Chinese builds", () => {
  const require = createRequire(import.meta.url);
  const configPath = require.resolve("../electron-builder.config.cjs");
  const previous = process.env.GRYT_ZH;
  try {
    for (const enabled of [false, true]) {
      process.env.GRYT_ZH = enabled ? "1" : "0";
      delete require.cache[configPath];
      assert.equal(require(configPath).electronLanguages.includes("zh-CN"), enabled);
    }
  } finally {
    delete require.cache[configPath];
    if (previous === undefined) delete process.env.GRYT_ZH; else process.env.GRYT_ZH = previous;
  }
});
