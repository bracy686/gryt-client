// 中文本地化：扫描与替换的共用逻辑。
//
// 设计要点：只在「确定是界面文案的位置」上看字符串，并且必须与字典完整命中才替换。
// 这样 CSS 值、IPC 通道名、枚举、URL 之类即使出现在源码里也不会被误改，
// 字典没收录的串一律原样显示英文（降级安全）。

import ts from "typescript";
import { TEMPLATE_RULES } from "./template-rules.mjs";

/** 这些 JSX 属性直接渲染给用户看。 */
const ATTR_NAMES = new Set([
  "title",
  "placeholder",
  "label",
  "alt",
  "aria-label",
  "aria-description",
  "ariaDescription",
  "tooltip",
  "helperText",
  "errorText",
  "emptyText",
  "confirmText",
  "cancelText",
  "description",
  "heading",
  "message",
  "confirmLabel",
  "cancelLabel",
  "submitLabel",
  "pendingLabel",
  "secondaryLabel",
  "copyLabel",
  "hint",
  "note",
  "tip",
  "data-tip",
]);

/** 这些对象属性名在 React/组件里就是文案位。保守取值，避免打到接口数据上。 */
const PROP_NAMES = new Set([
  "children",
  "title",
  "label",
  "placeholder",
  "alt",
  "aria-label",
  "tooltip",
  "helperText",
  "errorText",
  "emptyText",
  "confirmText",
  "cancelText",
  "header",
  "subheader",
  ...ATTR_NAMES,
]);

/** 变量名像文案的，取它的字符串字面量。 */
const VAR_NAME_RE =
  /(label|title|text|copy|placeholder|hint|tooltip|description|status|error|warning|message|prompt|heading|cta|caption|subtitle|notice|note|empty|confirm|cancel|button|tab)$/i;

/** 函数名像弹提示/弹窗的，取第一个字符串参数。 */
const CALL_NAME_RE =
  /^(toast|showToast|notify|showNotice|alert|confirm|warn|showError|setError|setStatus|setMessage|pushToast|reportError|setNotice|showWarning)$/i;

// Only result positions carry copy. Conditions, object keys and arbitrary call arguments do not.
function visitValue(node, onLiteral, onTemplate, onJoin) {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) onLiteral(node);
  else if (ts.isTemplateExpression(node)) onTemplate?.(node);
  else if (ts.isConditionalExpression(node)) {
    visitValue(node.whenTrue, onLiteral, onTemplate, onJoin);
    visitValue(node.whenFalse, onLiteral, onTemplate, onJoin);
  } else if (ts.isBinaryExpression(node)) {
    if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) {
      visitValue(node.left, onLiteral, onTemplate, onJoin);
      visitValue(node.right, onLiteral, onTemplate, onJoin);
    } else if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      visitValue(node.right, onLiteral, onTemplate, onJoin);
    }
  } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
    visitValue(node.expression, onLiteral, onTemplate, onJoin);
  } else if (onJoin && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "join") {
    onJoin(node.arguments[0]);
  }
}

export function scriptKindFor(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JSX; // .js/.jsx/.mjs/.cjs —— dist 里的 jsx() 调用也走这条
}

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&middot;": "·",
  "&times;": "×",
};

export function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|mdash|ndash|hellip|middot|times);/g, (m) => ENTITIES[m] ?? m);
}

/** JSX 渲染时会折叠空白，字典键按折叠后的形式写。 */
export function normalizeText(text) {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

/** 看起来是不是「给人看的文案」——用来把技术字符串挡在候选之外。 */
export function looksLikeCopy(key) {
  if (!key) return false;
  if (key.length < 2) return false;
  if (!/[A-Za-z]/.test(key)) return false;
  if (key.includes("://")) return false;
  if (/^[\s\d.,:%/+-]+$/.test(key)) return false;
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(key)) return false; // kebab-case 标识符
  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(key)) return false; // camelCase 标识符
  if (/^[A-Z][A-Z0-9_]+$/.test(key)) return false; // CONSTANT_CASE
  if (/^[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|png|jpe?g|svg|gif|webp|ico|exe|dll|bat|sh|md|ya?ml)$/i.test(key)) return false;
  if (/^[#@$]/.test(key)) return false;
  if (/^(var|rgba?|hsla?)\(/i.test(key)) return false;
  if (/^(https?|mailto|data|file):/.test(key)) return false;
  if (/^\/[^\s]*$/.test(key)) return false;
  if (/^\d+(\.\d+)?(px|em|rem|%|s|ms|vh|vw)?$/.test(key)) return false;
  if (/^\$\{/.test(key)) return false;
  if (/^[{}()[\],;:]+$/.test(key)) return false;
  // 全小写的样式类串（Tailwind 之类）
  const tokens = key.split(/\s+/);
  if (!/[A-Z]/.test(key) && tokens.every((t) => /^[a-z0-9:./[\]()_%!#'-]+$/.test(t))) return false;
  // 日志行（[Identity] …、[Auth:KC] …）
  if (/^\[/.test(key)) return false;
  // 技术前缀 + 占位符
  if (tokens.length <= 2 && key.includes("{") && /^(Bearer|HTTP|HTTPS|GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|Content-Type|Authorization|WSS?|TCP|UDP|JSON|JWT|IPC)$/i.test(tokens[0])) return false;
  // 单个标识符 + 占位符：avatarHash:{0}、avatar.{0}、servers:{0}
  if (/^[A-Za-z][A-Za-z0-9_.:-]*\{[0-9]+\}$/.test(key)) return false;
  // CSS 值
  if (/\b\d+(\.\d+)?px\b/.test(key) || /\b(solid|dashed|dotted|rgba?\(|hsla?\(|cubic-bezier)\b/.test(key)) return false;
  // 有空格、或有句读、或首字母大写的单/多词短语，才算文案
  const hasSpace = /\s/.test(key);
  const hasPunct = /[.!?,:;'"’“”…—–()]/.test(key);
  const titleCase = /^[A-Z]/.test(key);
  if (!hasSpace && !hasPunct && !titleCase) return false;
  if (!hasSpace && hasPunct && key.length > 40) return false;

  // 带占位符的模板：把占位符抹掉看剩下的是什么。
  if (key.includes("{")) {
    const rest = key.replace(/\{[0-9]+\}/g, " ").replace(/\s+/g, " ").trim();
    if (!rest) return false;
    if (!/[A-Za-z]{2,}/.test(rest)) return false;
    if (/[\\/]/.test(rest)) return false; // 路径/管道名
    if (/^[a-z0-9._-]+$/.test(rest)) return false; // 扩展名、小写标识符
    if (/^[A-Za-z0-9_.]+=$/.test(rest)) return false; // KEY=
    if (/\b(pid|tcp|udp|ws|wss|http|https|json|base64|sha256|utf-?8|ipc|socket|port|chunk|opcode|buffer|heap|gc|sqlite|pid=)\b/i.test(rest)) return false;
  }
  return true;
}

/** 模板字符串 → 字典键，表达式位置写成 {0}、{1}。 */
export function templateKeyOf(node) {
  let key = node.head ? node.head.text : "";
  node.templateSpans.forEach((span, i) => {
    key += `{${i}}` + span.literal.text;
  });
  return normalizeText(key);
}

/**
 * 扫描一段源码，返回所有「可能是界面文案」的候选。
 * 每项：{ kind, key, start, end, raw }，start/end 是要替换的源码区间。
 */
export function scan(code, file) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const out = [];

  const push = (kind, key, start, end, raw) => {
    if (!looksLikeCopy(key)) return;
    out.push({ kind, key, start, end, raw });
  };

  const stringKey = (node) => normalizeText(node.text);
  const copyValue = (node, kind) => visitValue(node, (lit) =>
    push(kind, stringKey(lit), lit.getStart(sf), lit.getEnd(), lit.text));

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const start = node.getStart(sf);
      const end = node.getEnd();
      push("jsx-text", normalizeText(code.slice(start, end)), start, end, code.slice(start, end));
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      const componentName = node.parent.parent?.tagName?.getText(sf);
      if ((ATTR_NAMES.has(name) || (componentName === "EntryCard" && name === "name") ||
        (componentName === "AppStoreUpdates" && name === "store")) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          push("jsx-attr:" + name, stringKey(node.initializer), node.initializer.getStart(sf), node.initializer.getEnd(), node.initializer.text);
        } else if (ts.isJsxExpression(node.initializer)) {
          copyValue(node.initializer.expression, "attr:" + name);
        }
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/^["']|["']$/g, "");
      if (PROP_NAMES.has(name)) copyValue(node.initializer, "prop:" + name);
      const dialog = node.parent?.parent;
      if (ts.isCallExpression(dialog) && /(?:^|\.)showMessageBox(?:Sync)?$/.test(dialog.expression.getText(sf))) {
        if (name === "detail" || name === "message") copyValue(node.initializer, "dialog:" + name);
        if (name === "buttons" && ts.isArrayLiteralExpression(node.initializer)) {
          node.initializer.elements.forEach((el) => copyValue(el, "dialog:button"));
        }
      }
    } else if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node)) {
      const name = node.name.getText(sf);
      if (node.initializer && VAR_NAME_RE.test(name)) copyValue(node.initializer, "var:" + name);
    } else if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      // 日志调用里的字符串不是界面文案，整棵子树跳过。
      const isLog = ts.isPropertyAccessExpression(node.expression)
        ? /^(console|logger|log)$/i.test(node.expression.expression.getText(sf)) && /^(log|warn|error|info|debug|trace)$/i.test(node.expression.name.text)
        : /^(log|warn|error|info|debug|trace)$/i.test(callee);
      if (isLog) return;
      const toastMethod = ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(sf) === "toast" && /^(success|error|loading|custom)$/.test(callee);
      if (CALL_NAME_RE.test(callee) || toastMethod) copyValue(node.arguments[0], "call:" + callee);
      if (/^(showErrorBox)$/.test(callee)) {
        node.arguments.slice(0, 2).forEach((arg) => copyValue(arg, "dialog:" + callee));
      }
    } else if (ts.isTemplateExpression(node)) {
      const key = templateKeyOf(node, sf);
      push("template", key, node.getStart(sf), node.getEnd(), node.getText(sf));
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      copyValue(node.expression, "jsx-expr");
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);

  // 同一个区间可能被多条规则命中，保留第一个（越靠前的规则越精确）。
  const seen = new Set();
  const dedup = [];
  for (const item of out) {
    const sig = `${item.start}:${item.end}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    dedup.push(item);
  }
  return dedup;
}

/** 把扫描到的候选用字典替换掉，返回新代码。 */
export function rewrite(code, file, dict, onHit, onMiss) {
  const items = scan(code, file);
  if (items.length === 0) return code;

  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  // 模板串里可能嵌着别的模板串或字符串：这些内层区间由外层模板的递归改写负责，
  // 否则两个编辑区间重叠，按原始偏移量切片会把后面的代码切掉。
  const templateRanges = [];
  for (const it of items) {
    if (it.kind === "template" && typeof dict[it.key] === "string") templateRanges.push([it.start, it.end]);
  }
  const insideTemplate = (item) =>
    templateRanges.some(([s, e]) => item.start >= s && item.end <= e && !(item.start === s && item.end === e));

  const edits = [];
  for (const item of items) {
    const zh = dict[item.key];
    if (typeof zh !== "string") {
      if (onMiss) onMiss(item, file);
      continue;
    }
    if (insideTemplate(item)) continue;
    if (item.kind === "template") {
      const node = findTemplateAt(sf, item.start);
      if (!node) continue;
      // 表达式内部（如三元里的另一个模板串）先各自过一遍同样的替换。
      const exprSources = node.templateSpans.map((span, i) => {
        const expression = span.expression;
        const start = expression.getStart(sf);
        let source = expression.getText(sf);
        const edits = [];
        const rules = TEMPLATE_RULES[item.key]?.[i] ?? {};
        const translate = (lit, explicitOnly = false) => {
          if (!lit || !(ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit))) return;
          const text = Object.hasOwn(rules, lit.text) ? rules[lit.text] : explicitOnly ? undefined : dict[normalizeText(lit.text)];
          if (typeof text === "string") edits.push({ start: lit.getStart(sf) - start, end: lit.getEnd() - start, text: JSON.stringify(text) });
        };
        visitValue(expression, translate, null, (lit) => translate(lit, true));
        for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
        return rewrite(source, file, dict, onHit, onMiss);
      });
      const rebuilt = rebuildTemplate(zh, exprSources);
      if (!rebuilt) {
        if (onMiss) onMiss({ ...item, key: item.key, reason: "placeholder-mismatch" }, file);
        continue;
      }
      edits.push({ start: item.start, end: item.end, text: rebuilt });
      if (onHit) onHit(item, file);
      continue;
    }
    if (item.kind === "jsx-text") {
      const leading = item.raw.match(/^\s*/)[0];
      const trailing = item.raw.match(/\s*$/)[0];
      edits.push({ start: item.start, end: item.end, text: leading + escapeJsx(zh) + trailing });
    } else if (item.kind.startsWith("jsx-attr:")) {
      edits.push({ start: item.start, end: item.end, text: '"' + escapeJsx(zh).replace(/"/g, "&quot;").replace(/\n/g, "&#10;") + '"' });
    } else {
      edits.push({ start: item.start, end: item.end, text: JSON.stringify(zh) });
    }
    if (onHit) onHit(item, file);
  }

  if (edits.length === 0) return code;
  // 从后往前切，保证前面编辑的偏移量不受影响；有重叠就跳过（前面已排除嵌套模板的情形）。
  edits.sort((a, b) => b.start - a.start);
  let result = code;
  let lastStart = Infinity;
  for (const e of edits) {
    if (e.end > lastStart) continue;
    result = result.slice(0, e.start) + e.text + result.slice(e.end);
    lastStart = e.start;
  }
  return result;
}

function findTemplateAt(sf, start) {
  let found = null;
  const walk = (node) => {
    if (found) return;
    if (ts.isTemplateExpression(node) && node.getStart(sf) === start) {
      found = node;
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

/** 把「已经含有 {0} 的中文」和原表达式拼回一个模板字符串。 */
export function rebuildTemplate(zh, exprSources) {
  const markers = [...zh.matchAll(/\{(\d+)\}/g)];
  const order = markers.map((m) => Number(m[1]));
  if (!exprSources.length || order.length !== exprSources.length || new Set(order).size !== exprSources.length ||
    order.some((i) => i >= exprSources.length) || markers.some((m) => m[0] !== `{${Number(m[1])}}`)) return null;
  const reordered = order.some((n, i) => n !== i);
  const escaped = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  let cursor = 0;
  let body = "";
  for (const marker of markers) {
    body += escaped(zh.slice(cursor, marker.index)) + "${" + (reordered ? `__grytZh${marker[1]}` : exprSources[Number(marker[1])]) + "}";
    cursor = marker.index + marker[0].length;
  }
  const template = "`" + body + escaped(zh.slice(cursor)) + "`";
  if (!reordered) return template;
  // Coerce each argument before evaluating the next, exactly like the original template.
  const params = exprSources.map((_, i) => `__grytZh${i}`).join(", ");
  return `((${params}) => ${template})(${exprSources.map((expr) => "`${" + expr + "}`").join(", ")})`;
}

function escapeJsx(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}
