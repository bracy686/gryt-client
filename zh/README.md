# 中文汉化（zh/）

汉化逻辑、字典和检查都集中在这个目录，上游集成点有：

1. `vite.config.ts` —— 引入本插件：`import { zhCN } from "./zh/plugin.mjs"`，然后在 `plugins` 和四个 electron 子构建里各加一行 `zhCN()`。
2. `electron/main.ts:1113` —— 更新源从 `Gryt-chat/gryt` 改成本仓库。否则「检查更新」会把官方英文包装回来，中文界面被覆盖。
3. `electron-builder.config.cjs` —— 中文包额外保留 Chromium 的 `zh-CN` 语言资源。
4. `ChatMediaPlayer.tsx` —— 解密视频后使用播放器的键盘控制启动播放，不依赖可翻译的英文按钮名。

## 开关：GRYT_ZH

插件**默认不生效**，要出中文版必须显式开：

```
GRYT_ZH=1 ELECTRON=1 npx vite build
```

为什么默认关：上游自带的 e2e 测试用英文可访问名找元素（`e2e/support/app.ts` 里的 `getByRole("button", { name: "Add a server" })`），界面一换中文，8 个 e2e 分片全挂。默认关掉，上游 CI 保持绿；出中文包的流水线在 job 级 env 里设 `GRYT_ZH: "1"`。

## 怎么工作

`zh/plugin.mjs` 在**构建期**用 TypeScript 的 AST 解析每个模块，只在下面这些「确定会显示给用户」的位置上找字符串：

- JSX 文本节点（`<div>取消</div>`）
- JSX 属性：`title` / `placeholder` / `aria-label` / `description` / `confirmLabel` 等
- 组件属性：`children` / `title` / `label` / `description` / `confirmText` 等
- 变量名像文案的字符串：`const label = "…"`
- 常见提示函数的实参：`toast("…")`、`toast.success/error/loading("…")`、`notify("…")`
- 解构参数的文案默认值，以及 Electron 弹窗的标题、正文、说明和按钮
- JSX 子表达式里的字符串：`{cond ? "A" : "B"}`
- 模板字符串：`` `Edited ${t}` `` → 字典键 `Edited {0}`

**必须与字典完整命中才替换。** 字典未收录的文案保留英文，`null` 表示经过人工确认的品牌、单位或技术串。条件判断、对象键和任意函数参数不会因位于 JSX 表达式内而被当作文案。模板字符串仍由启发式规则筛选，因此检查通过不等于业务行为已被完整验证。

`template-rules.mjs` 为具体句子的具体插值提供分支译文，例如去除英文的 `is/are`、`y/ies`。规则只作用于插值的结果位置，不改条件或数据。占位符允许换序，但必须各出现一次；换序时通过包装保留原表达式的执行及字符串转换顺序。

中文构建将 HTML 的 `lang` 设为 `zh-CN`。字典缺失、占位符不匹配等改写错误会直接阻止构建。

`node_modules/@gryt/ui/dist` 也走同一套替换（组件库只发 dist，它自带的默认文案在这里）。

## 日常命令

```
node zh/extract.mjs            # 重新抽取全量文案 → zh/inventory.json、zh/untranslated.json
node zh/extract.mjs --src-only # 只扫 src + electron
node zh/check.mjs              # 体检：覆盖率、失效条目、未译清单
node zh/check.mjs --top 40     # 列出现次数最多的未译条目
node zh/check.mjs --stale      # 只列失效条目（上游改了文案或键打错）
node zh/check.mjs --require-ui --min-coverage 98  # 出包检查，必须包含组件库
ELECTRON=1 npx vite build      # 本地构建（含主进程），产物在 dist/ 与 dist-electron/
GRYT_ZH=1 ELECTRON=1 npx vite build   # 中文构建（不设 GRYT_ZH 就是英文）
node zh/selftest.mjs           # 改写安全体检：只许文案变，结构与语法必须不变
node --test zh/rewrite.test.mjs # 单复数、换序求值、代码保护、语言配置等回归测试
node zh/browser-smoke.mjs      # 先构建中文版并安装 Playwright Chromium；检查实际页面和播放交互
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

字典是 `zh/dict.zh.json`，扁平结构，例如 `{"Cancel": "取消", "Gryt": null}`。候选键由扫描器折叠空白、解码部分 HTML 实体后生成，应从抽取清单复制。`check` 的候选完成率排除明确标为 `null` 的条目，仅反映扫描器识别的文案；它不代表整个界面的翻译率。

`selftest` 同时检查应用和组件库，并保留模板内表达式比较 AST。浏览器检查覆盖生产构建的欢迎页、音频说明，以及真实确认弹窗和加密视频启动逻辑；其中媒体播放接口使用桩验证启动调用，不验证视频解码，也不需要连接聊天服务器。翻译规则与术语见 `zh/glossary.md`。

分片译稿在 `zh/parts/`（每片一个 JSON），合并脚本会把它们并进 `dict.zh.json`；`zh/batches/` 是分批的输入文件，都可以删掉重生成。

## 出 Windows 安装包

仓库里带了一个精简的工作流 `.github/workflows/build-windows-zh.yml`，只有 Windows 出包必需的东西（MSVC 编原生组件、Go 编 helper、electron-builder 出 NSIS + 便携版），不碰上游那套依赖 secret 的发布流程。手动触发：

```
gh workflow run build-windows-zh.yml --repo bracy686/gryt-client --ref zh-cn
gh run list --repo bracy686/gryt-client --limit 3
gh run download <run-id> --repo bracy686/gryt-client
```

产物：`Gryt-Chat-<版本>-win-x64-zh-cn.exe`（安装包）、`…-zh-cn-portable.exe`（便携版）。官方包也没签名，所以一样会有 SmartScreen 提示（更多信息 → 仍要运行）。
