# 中文汉化（zh/）

## 分支与远端

| 名称 | 用途 |
| --- | --- |
| `upstream` | 官方仓库 `https://github.com/Gryt-chat/client.git` |
| `origin` | 中文 fork `https://github.com/bracy686/gryt-client.git` |
| `main` | 上游镜像，与 `upstream/main` 保持相同提交，只做快进同步 |
| `zh-cn` | 汉化适配、文档和中文打包工作流的维护分支，也是本 fork 的默认分支 |

所有本地定制都提交到 `zh-cn`；不要将 `zh-cn` 合并回 `main`，也不要在 `main` 添加本 fork 的文档或工作流。
本地 `main` 跟踪 `upstream/main`，`zh-cn` 跟踪 `origin/zh-cn`，推送目标为 `origin`。

默认分支设为 `zh-cn`，是为了让只存在于该分支的中文工作流保持可手动触发；GitHub 要求 `workflow_dispatch` 工作流存在于默认分支。
中文 Windows 工作流也限制为只在 `zh-cn` 运行。参见 [GitHub 手动触发说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)。

新克隆仓库后配置官方远端（已有 `upstream` 时先核对 URL，无需重复添加）：

```bash
git remote add upstream https://github.com/Gryt-chat/client.git
git fetch upstream
git branch --track main upstream/main
git config remote.pushDefault origin
```

默认克隆会检出 `zh-cn`；若本地已有 `main`，用 `git branch --set-upstream-to=upstream/main main` 替代创建分支的那一行。

## 汉化集成点

汉化逻辑、字典和检查都集中在这个目录，上游集成点有：

1. `vite.config.ts` —— 引入本插件：`import { zhCN } from "./zh/plugin.mjs"`，然后在 `plugins` 和四个 electron 子构建里各加一行 `zhCN()`。
2. `electron/main.ts:1113` —— 更新源从 `Gryt-chat/gryt` 改成本仓库。否则「检查更新」会把官方英文包装回来，中文界面被覆盖。
3. `electron-builder.config.cjs` —— 中文包保留 Chromium 的 `zh-CN` 语言资源，并通过 `zh/installer.nsh` 启用简体中文 Windows 安装向导和目录选择；共享安装脚本 `build/installer.nsh` 提供安装阶段的扩展点。
4. `ChatMediaPlayer.tsx` —— 解密视频后使用播放器的键盘控制启动播放，不依赖可翻译的英文按钮名。
5. `electron/windowState.ts` 与“外观 → 显示”的启动窗口设置 —— 默认关闭窗口记忆，自动尺寸以 1200 × 800 逻辑像素为基准，宽高分别不超过屏幕可用区域的 80%；可改为自定义尺寸。尺寸设置下次启动生效，拖动窗口不覆盖自定义值。开启记忆后保存普通窗口大小、位置及最大化状态，首次无记录时自动适配；关闭时清除历史状态。配置存于本机 `userData/gryt-config.json` 的 `startupWindow` 和 `windowState`，通过专用 IPC 访问。恢复和显示器变更时校正位置，隐藏自启动不提前显示窗口，从托盘恢复不重新套用启动尺寸。

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
node --test scripts/check-window-state.mjs # 启动尺寸、缩放、记忆、重启及显示器变化
node scripts/check-window-state-electron.mjs # 中文桌面构建后：隔离临时目录实测窗口和 preload IPC
node zh/window-settings-smoke.mjs         # 中文显示页：桌面控件交互、保存、校验与浏览器隐藏
node --test zh/windows-installer.test.mjs # 安装配置及迁移备份归属检查
node zh/windows-installer-smoke.mjs       # Windows：编译隔离测试安装包并实测取消、迁移、更新和卸载
```

## 上游更新后怎么跟进

先确认工作区干净。先快进镜像分支，再将官方更新合并到汉化分支；`origin` 是 fork，获取官方更新必须使用 `upstream`。

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main

git switch zh-cn
git pull --ff-only origin zh-cn
git merge upstream/main
npx yarn@1.22.22 install --frozen-lockfile --ignore-engines
node zh/extract.mjs
node zh/check.mjs --stale                      # 上游改过的文案 → 字典里的旧键失效，照着改
node zh/check.mjs --top 40                     # 新加的文案 → 补进 dict.zh.json
node zh/check.mjs --require-ui --min-coverage 98
node --test zh/rewrite.test.mjs
node zh/selftest.mjs
npx cross-env GRYT_ZH=1 ELECTRON=1 vite build
```

处理合并冲突、补齐译文并通过检查后，将适配改动提交到 `zh-cn`，再执行 `git push origin zh-cn`。
若 `main` 的快进同步失败，先检查分支是否混入定制提交；不要通过合并汉化分支或直接强推来掩盖差异。

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

### Windows 中文安装向导

打包进程通过 `afterPack` 将实际生效的安装器配置保存为 `windows-package-config.json`；云端据此核验中文向导、安装目录选择及 `zh/installer.nsh` 已实际启用，并检查包内窗口设置功能。验证结果写入 `build-info.json`，两份记录与安装包一起归档。

`GRYT_ZH=1` 的 NSIS 安装包使用简体中文向导：欢迎 → 选择目录 → 安装 → 完成，可选择其他磁盘。为兼容现有安装，默认子目录仍为 `gryt-chat`；框架会在不含该名称的所选路径后添加此子目录。当前只支持当前用户安装，拒绝 `/allusers` 和已有的所有用户安装，避免与现有 HKCU 迁移、helper 设置混用。未开启 `GRYT_ZH` 的构建沿用上游一键安装设置。

打开向导只读取旧版状态，取消不会停止程序或改写卸载信息。点击安装后，先检查目标目录为空（或就是当前安装目录）且可写，再检查旧路径中的进程，最后执行必要的旧 NSIS 迁移。切换磁盘时同时修复已启用的 helper 自启动路径，不为新安装启用自启动。

旧版迁移将原目录移到旁边唯一命名的 `.gryt-backup[.序号]`，不覆盖已有备份。新旧目录各保存 UTF-16 INI 回执，支持中文、空格路径；新客户端启动后仅清理归属吻合且包含旧程序和卸载程序的备份。安装或启动失败时保留恢复副本。正常升级仍交给 electron-builder 的卸载/安装流程。

自动更新沿用注册的安装目录；客户端也明确将当前可执行文件目录传给更新器。更新跳过欢迎、目录、范围选择和完成页，保留原有“更新后重新打开”行为。账号、设置、缓存和内置服务器数据继续使用原 `userData` 目录，安装位置选择不迁移这些数据，卸载默认保留它们。安装路径和应用标识保持兼容，更新等待标记仍位于 `%APPDATA%\gryt-chat`。

`windows-installer-smoke.mjs` 为每次运行生成独立 appId、注册表键、更新缓存、模拟用户数据目录和无功能程序，不注册 Gryt 协议或创建生产快捷方式，也不终止真实 helper。它会真实编译 NSIS 安装器/卸载器，验证初始化后取消、非空/不可写目录及所有用户模式拦截、含中文空格路径的迁移、旧备份保护、helper 既有注册的路径修复、更新保持目录、非静默更新自动结束，以及自选目录的新装/卸载/重装。相关检查已接入中文 Windows 工作流。
