import { snapshot } from "../zip/index.js";
import { check, GateError, LIMITS, jsonArtifact } from "../limits/index.js";
import type { Redaction } from "../schemas/types.js";
import { BUILTIN_PATTERNS as patterns } from "../policy/patterns.js";
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
    return text;
  }
  error(value: unknown, field: string): string | null {
    const text = this.sanitize(value, field);
    if (text === null) return null;
    // Discard selector/expected/received/log/stack/code-frame sections in full.
    const lines = text.split("\n");
    const kept: string[] = [];
    let omitted = 0;
    for (const line of lines) {
      if (
        /^(?:Call log:|\s*at\s|\s*\d+\s*[|]|\s*>\s*\d+|Locator:|Expected:|Received:)/.test(
          line,
        )
      ) {
        omitted++;
        if (line.startsWith("Call log:")) break;
        continue;
      }
      if (kept.length < 8) kept.push(line);
      else omitted++;
    }
    this.note("error-context", field, omitted);
    return kept.join("\n").trim() || null;
  }
  assertLiterals(text: string): void {
    for (const v of this.variants)
      if (text.includes(v.value))
        throw new GateError("literal-postcondition", 1);
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
