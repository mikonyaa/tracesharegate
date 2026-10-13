import { snapshot } from "../zip/index.js";
import { check, GateError, LIMITS, jsonArtifact } from "../limits/index.js";
import type { Redaction } from "../schemas/types.js";
import { BUILTIN_PATTERNS as patterns } from "../policy/patterns.js";
import {
  errorContext,
  type ErrorContext,
} from "../adapters/playwright-supported/error-context.js";
export async function readLiterals(
  file: string | undefined,
): Promise<string[]> {
  if (!file) return [];
  try {
    const { bytes } = await snapshot(file, {
      ...LIMITS,
      inputBytes: LIMITS.literalBytes,
    });
    const v = jsonArtifact(bytes.toString("utf8"));
    check(
      Array.isArray(v) && v.length > 0 && v.length <= LIMITS.literals,
      "invalid-literal-file",
    );
    check(
      v.every(
        (x) =>
          typeof x === "string" && x.length > 0 && Buffer.byteLength(x) <= 4096,
      ),
      "invalid-literal-file",
    );
    return v as string[];
  } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError("literal-file-io");
  }
}
export class Redactor {
  readonly summary: Redaction[] = [];
  private variants: { value: string; rule: string }[] = [];
  constructor(readonly literals: string[] = []) {
    check(literals.length <= LIMITS.literals, "literal-count-limit");
    const seen = new Set<string>();
    for (const value of literals) {
      check(
        value.length > 0 && Buffer.byteLength(value) <= 4096,
        "literal-size-limit",
      );
      for (const [variant, rule] of [
        [value, "known-literal"],
        [encodeURIComponent(value), "literal-uri"],
        [JSON.stringify(value).slice(1, -1), "literal-json"],
        [value.normalize("NFC"), "literal-nfc"],
      ] as const) {
        if (!seen.has(variant)) {
          seen.add(variant);
          this.variants.push({ value: variant, rule });
        }
      }
    }
    this.variants.sort(
      (a, b) => b.value.length - a.value.length || (a.value < b.value ? -1 : 1),
    );
  }
  note(ruleId: string, field: string, count = 1): void {
    if (!count) return;
    const old = this.summary.find(
      (x) => x.ruleId === ruleId && x.field === field,
    );
    if (old) old.count += count;
    else this.summary.push({ ruleId, field, count });
  }
  sanitize(value: unknown, field: string): string | null {
    if (typeof value !== "string") return null;
    if (Buffer.byteLength(value) > LIMITS.retainedString) {
      this.note("oversize-string", field);
      return null;
    }
    let text = value;
    // Mask whole URL/path spans before literal replacements can introduce whitespace inside them.
    const wholeSpan = new Set(["ansi", "url", "home-path", "absolute-path"]);
    for (const rule of patterns.filter((p) => wholeSpan.has(p.id))) {
      let count = 0;
      text = text.replace(rule.pattern, () => {
        count++;
        return rule.replacement;
      });
      this.note(rule.id, field, count);
    }
    // One pass over original text: replacements are never treated as new literals.
    if (this.variants.length) {
      let out = "";
      let i = 0;
      while (i < text.length) {
        const hit = this.variants.find((x) => text.startsWith(x.value, i));
        if (hit) {
          out += "[LITERAL OMITTED]";
          i += hit.value.length;
          this.note(hit.rule, field);
        } else {
          out += text[i];
          i++;
        }
      }
      text = out;
    }
    for (const rule of patterns.filter((p) => !wholeSpan.has(p.id))) {
      let count = 0;
      text = text.replace(rule.pattern, () => {
        count++;
        return rule.replacement;
      });
      this.note(rule.id, field, count);
    }
    if (Buffer.byteLength(text) > LIMITS.retainedString) {
      this.note("oversize-string", field);
      return null;
    }
    return text;
  }
  error(
    value: unknown,
    field: string,
    onIssue?: (code: NonNullable<ErrorContext["issue"]>) => void,
  ): string | null {
    if (typeof value !== "string") {
      onIssue?.("unknown-error-context");
      return null;
    }
    if (Buffer.byteLength(value) > LIMITS.retainedString) {
      this.note("oversize-string", field);
      onIssue?.("error-context-limit");
      return null;
    }
    // Parse envelopes before URL/path/literal replacement can alter their grammar.
    let text = value;
    for (const rule of patterns.filter((p) =>
      ["ansi", "bidi", "control"].includes(p.id),
    )) {
      let count = 0;
      text = text.replace(rule.pattern, () => {
        count++;
        return rule.replacement;
      });
      this.note(rule.id, field, count);
    }
    const context = errorContext(text);
    let total = 0;
    for (const [rule, count] of Object.entries(context.omitted)) {
      this.note(rule, field, count);
      total += count;
    }
    this.note("error-context", field, total);
    if (context.issue) onIssue?.(context.issue);
    const retained =
      context.text === null
        ? null
        : (this.sanitize(context.text, field)?.trim() ?? null);
    if (context.text !== null && retained === null) {
      onIssue?.("error-context-limit");
      return null;
    }
    if (retained !== null) {
      const finalContext = errorContext(retained);
      if (finalContext.issue || finalContext.text !== retained) {
        this.note("error-unknown-context", field);
        this.note("error-context", field);
        onIssue?.("unknown-error-context");
        return null;
      }
    }
    return retained;
  }
  assertLiterals(text: string): void {
    for (const v of this.variants)
      if (text.includes(v.value))
        throw new GateError("literal-postcondition", 1);
  }
  assertErrorContext(text: string | null): void {
    if (text === null) return;
    let unknown = false;
    const checked = this.error(text, "errors[].message", () => {
      unknown = true;
    });
    if (unknown || checked !== text)
      throw new GateError("error-context-postcondition", 1);
  }
  assertBuiltin(text: string): void {
    for (const p of patterns.filter(
      (x) => !["ansi", "control", "absolute-path"].includes(x.id),
    )) {
      p.pattern.lastIndex = 0;
      if (p.pattern.test(text)) throw new GateError("builtin-postcondition", 1);
    }
  }
}
