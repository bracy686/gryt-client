// zh/plugin.mjs 的类型声明（该文件是构建期脚本，用 .mjs 写，不进 tsc 编译）。

import type { Plugin } from "vite";

export interface ZhCNOptions {
  /** 项目根目录，默认 process.cwd() */
  root?: string;
  /** 字典路径，默认 <root>/zh/dict.zh.json */
  dictPath?: string;
  /** 是否把未命中的候选写到 zh/unmatched.json */
  report?: boolean;
}

export declare function loadDict(dictPath: string): Record<string, string | null>;
export declare function zhCN(options?: ZhCNOptions): Plugin;
export default zhCN;
