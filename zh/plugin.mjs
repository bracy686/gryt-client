// Vite 插件：构建期按字典替换界面文案。
//
// 只处理三类目标（见 lib.mjs 的 scan）：
//   1. src/**、electron/** 里的 TS/TSX —— 应用自己的文案
//   2. node_modules/@gryt/ui/dist —— 组件库自带的默认文案（它只发 dist）
// 字典没命中的串原样保留英文。

import fs from "node:fs";
import path from "node:path";
import { rewrite } from "./lib.mjs";

const TARGET_RE = /[\\/](src|electron)[\\/]|[\\/]node_modules[\\/]@gryt[\\/]ui[\\/]dist[\\/]/;
const CODE_RE = /\.(tsx|jsx|ts|mts|cts|mjs|cjs|js)$/;

export function loadDict(dictPath) {
  if (!fs.existsSync(dictPath)) throw new Error(`Missing Chinese dictionary: ${dictPath}`);
  return JSON.parse(fs.readFileSync(dictPath, "utf8"));
}

/**
 * 开关：默认关，GRYT_ZH=1 才替换文案。
 *
 * 为什么默认关：上游自带的 e2e 测试是拿英文可访问名找元素的
 * （e2e/support/app.ts: getByRole("button", { name: "Add a server" })），
 * 界面一换成中文，那 8 个分片全挂。默认关掉，上游 CI 保持绿；
 * 出中文包的流水线里显式设 GRYT_ZH=1。
 */
export function isZhEnabled() {
  return /^(1|true|yes|on)$/i.test(process.env.GRYT_ZH ?? "");
}

/**
 * @param {object} [options]
 * @param {string} [options.dictPath] 字典路径，默认 <root>/zh/dict.zh.json
 * @param {boolean} [options.report]  把未命中的候选写到 zh/unmatched.json
 */
export function zhCN(options = {}) {
  if (!isZhEnabled()) {
    return {
      name: "gryt-zh-cn",
      enforce: "pre",
      buildStart() {
        this.info?.("[zh-cn] 未启用：要出中文版请设 GRYT_ZH=1");
      },
    };
  }

  const root = options.root ?? process.cwd();
  const dictPath = options.dictPath ?? path.join(root, "zh", "dict.zh.json");
  const stats = { files: 0, hits: 0, misses: 0, byKind: {}, missKeys: new Map() };
  const dict = loadDict(dictPath);

  const record = (item, file) => {
    stats.misses++;
    stats.missKeys.set(item.key, (stats.missKeys.get(item.key) ?? 0) + 1);
  };

  return {
    name: "gryt-zh-cn",
    enforce: "pre",

    config() {
      // 开发模式下 Vite 会预打包依赖，那一步在 esbuild 里做，插件看不到，
      // 所以把组件库排除出预打包，让它的 dist 走正常管线。
      return { optimizeDeps: {
        exclude: ["@gryt/ui"],
        include: ["use-sync-external-store/shim", "use-sync-external-store/shim/with-selector"],
      } };
    },

    transformIndexHtml(html) {
      return html.replace(/(<html\b[^>]*\blang=)["'][^"']*["']/i, '$1"zh-CN"');
    },

    buildStart() {
      const n = Object.keys(dict).length;
      this.info?.(`[zh-cn] 字典 ${n} 条`);
    },

    transform(code, id) {
      const clean = id.split("?")[0];
      if (!CODE_RE.test(clean) || !TARGET_RE.test(clean)) return null;
      if (!/["'`]/.test(code)) return null;

      let out;
      try {
        out = rewrite(
          code,
          clean,
          dict,
          (item) => {
            stats.hits++;
            stats.byKind[item.kind] = (stats.byKind[item.kind] ?? 0) + 1;
          },
          (item, file) => {
            if (item.reason) throw new Error(`${item.reason}: ${item.key}`);
            if (options.report) record(item, file);
          },
        );
      } catch (err) {
        this.error(`[zh-cn] ${path.relative(root, clean)} 替换失败：${err.message}`);
      }
      if (out === code) return null;
      stats.files++;
      return { code: out, map: null };
    },

    buildEnd() {
      this.info?.(`[zh-cn] 命中 ${stats.hits} 处，涉及 ${stats.files} 个文件`);
      if (options.report) {
        const misses = [...stats.missKeys.entries()]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count);
        const file = path.join(root, "zh", "unmatched.json");
        fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), total: misses.length, misses }, null, 2) + "\n");
        this.info?.(`[zh-cn] 未命中 ${misses.length} 条 → zh/unmatched.json`);
      }
    },
  };
}

export default zhCN;
