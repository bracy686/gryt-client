import ts from "typescript";
import { scriptKindFor } from "./lib.mjs";

// Recognise only the exact wrapper emitted for reordered placeholders.
function reorderedExpressions(node) {
  if (!ts.isCallExpression(node)) return null;
  const arrow = ts.isParenthesizedExpression(node.expression) ? node.expression.expression : null;
  if (!arrow || !ts.isArrowFunction(arrow) || arrow.modifiers?.length || !ts.isTemplateExpression(arrow.body)) return null;
  const names = arrow.parameters.map((p) => p.name.getText());
  if (names.length !== node.arguments.length || !names.every((name, i) => name === `__grytZh${i}`)) return null;
  const refs = arrow.body.templateSpans.map((s) => s.expression);
  if (refs.length !== names.length || !refs.every(ts.isIdentifier) || new Set(refs.map((r) => r.text)).size !== names.length ||
    !refs.every((r) => names.includes(r.text))) return null;
  if (!node.arguments.every((arg) => ts.isTemplateExpression(arg) && arg.head.text === "" && arg.templateSpans.length === 1 && arg.templateSpans[0].literal.text === "")) return null;
  return node.arguments.map((arg) => arg.templateSpans[0].expression);
}

export function structureOf(code, file) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const shape = (node) => {
    const reordered = reorderedExpressions(node);
    if (reordered) return ["template", ...reordered.map(shape)];
    if (ts.isTemplateExpression(node)) return ["template", ...node.templateSpans.map((span) => shape(span.expression))];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return ["string"];
    if (ts.isJsxText(node)) return ["jsx-text"];
    const children = [];
    ts.forEachChild(node, (child) => { children.push(shape(child)); });
    return children.length ? [node.kind, ...children] : [node.kind, node.getText(sf)];
  };
  return { skeleton: JSON.stringify(shape(sf)), errors: sf.parseDiagnostics.length };
}
