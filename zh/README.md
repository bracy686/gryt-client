# 中文汉化（zh/）

这个目录是中文版唯一的自研部分。上游源码**只动了两处**，其余全部在这里：

1. `vite.config.ts` —— 引入本插件：`import { zhCN } from "./zh/plugin.mjs"`，然后在 `plugins` 和四个 electron 子构建里各加一行 `zhCN()`。
2. `electron/main.ts:1113` —— 更新源从 `Gryt-chat/gryt` 改成本仓库。否则「检查更新」会把官方英文包装回来，中文界面被覆盖。

## 怎么工作

`zh/plugin.mjs` 在**构建期**用 TypeScript 的 AST 解析每个模块，只在下面这些「确定会显示给用户」的位置上找字符串：

- JSX 文本节点（`<div>取消</div>`）
- JSX 属性：`title` / `placeholder` / `aria-label` / `alt` / `label` / `tooltip`
- 组件属性：`children` / `title` / `label` / `description` / `confirmText` 等
- 变量名像文案的字符串：`const label = "…"`
- 常见提示函数的实参：`toast("…")`、`notify("…")`、`alert("…")`
- JSX 子表达式里的字符串：`{cond ? "A" : "B"}`
- 模板字符串：`` `Edited ${t}` `` → 字典键 `Edited {0}`

**必须与字典完整命中才替换。** 所以 CSS 值、IPC 通道名、枚举、URL 不会被误改；字典没收录的串原样显示英文 —— 翻译漏了最多是英文，不会把界面弄坏。

`node_modules/@gryt/ui/dist` 也走同一套替换（组件库只发 dist，它自带的默认文案在这里）。

## 日常命令

```
node zh/extract.mjs            # 重新抽取全量文案 → zh/inventory.json、zh/untranslated.json
node zh/extract.mjs --src-only # 只扫 src + electron
node zh/check.mjs              # 体检：覆盖率、失效条目、未译清单
node zh/check.mjs --top 40     # 列出现次数最多的未译条目
node zh/check.mjs --stale      # 只列失效条目（上游改了文案或键打错）
ELECTRON=1 npx vite build      # 本地构建（含主进程），产物在 dist/ 与 dist-electron/
```

## 上游更新后怎么跟进

```
git fetch origin && git merge origin/main      # 或 rebase
npx yarn@1.22.22 install --frozen-lockfile --ignore-engines
node zh/extract.mjs
node zh/check.mjs --stale                      # 上游改过的文案 → 字典里的旧键失效，照着改
node zh/check.mjs --top 40                     # 新加的文案 → 补进 dict.zh.json
ELECTRON=1 npx vite build
```

字典是 `zh/dict.zh.json`，扁平结构 `{"英文原文": "中文"}`，键必须与源码**一字不差**（含空格、标点、`&rsquo;` 这类 HTML 实体）。翻译规则与术语见 `zh/glossary.md`。

分片译稿在 `zh/parts/`（每片一个 JSON），合并脚本会把它们并进 `dict.zh.json`；`zh/batches/` 是分批的输入文件，都可以删掉重生成。

## 出 Windows 安装包

仓库里带了一个精简的工作流 `.github/workflows/build-windows-zh.yml`，只有 Windows 出包必需的东西（MSVC 编原生组件、Go 编 helper、electron-builder 出 NSIS + 便携版），不碰上游那套依赖 secret 的发布流程。手动触发：

```
gh workflow run build-windows-zh.yml --repo bracy686/gryt-client --ref zh-cn
gh run list --repo bracy686/gryt-client --limit 3
gh run download <run-id> --repo bracy686/gryt-client
```

产物：`Gryt-Chat-<版本>-win-x64-zh-cn.exe`（安装包）、`…-zh-cn-portable.exe`（便携版）。官方包也没签名，所以一样会有 SmartScreen 提示（更多信息 → 仍要运行）。
