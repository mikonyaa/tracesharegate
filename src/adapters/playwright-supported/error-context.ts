// Pinned diagnostic envelopes from Playwright 1.63.0's bundled matcher helpers.
// Values inside these envelopes are opaque and are never returned to the policy.
const matchers = [
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toContain",
  "toContainEqual",
  "toMatch",
  "toMatchObject",
  "toBeTruthy",
  "toBeFalsy",
  "toBeNull",
  "toBeUndefined",
  "toBeDefined",
  "toBeNaN",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual",
  "toBeCloseTo",
  "toBeInstanceOf",
  "toHaveLength",
  "toHaveProperty",
  "toThrow",
  "toThrowError",
  "toHaveText",
  "toContainText",
  "toHaveValue",
  "toHaveValues",
  "toHaveClass",
  "toContainClass",
  "toHaveAttribute",
  "toHaveCSS",
  "toHaveId",
  "toHaveRole",
  "toHaveTitle",
  "toHaveURL",
  "toHaveAccessibleName",
  "toHaveAccessibleDescription",
  "toHaveAccessibleErrorMessage",
  "toBeAttached",
  "toBeChecked",
  "toBeDisabled",
  "toBeEditable",
  "toBeEmpty",
  "toBeEnabled",
  "toBeFocused",
  "toBeHidden",
  "toBeInViewport",
  "toBeVisible",
  "toHaveCount",
  "toBeOK",
] as const;
const header =
  /^(?:(?:Error|TypeError|AssertionError): )?expect\((?:received|locator|page|string|buffer|response)\)(?:\.(?:resolves|rejects))?(?:\.not)?\.(to[A-Za-z]+)\((?:expected(?:, options)?|)\)(?: failed| \/\/ (?:indexOf|deep equality|Object\.is equality))?$/;
const payload =
  /^(?:Expected|Received)(?: (?:substring|pattern|string|value|array|object|set|map|number|boolean|function|symbol|has type|has value))?:\s*(.*)$/;
const source = /^(?:\s+at\s|\s*(?:>\s*)?\d+\s*\||\s*\|\s*\^)/;
const timeout = /^Timeout:\s*([0-9]{1,9})ms$/;
const diffHeader =
  /^(?:- Expected\s+- [0-9]{1,6}|\+ Received\s+\+ [0-9]{1,6})$/;
const diffRow = /^(?: {2}|[-+] |@@ )/;
const quotedValue = /^"(?:[^"\\]|\\[\s\S])*"$/;
const scalarValue =
  /^(?:undefined|null|true|false|NaN|-?Infinity|-?(?:[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?n?)|(?:[<>]=?\s*)?-?[0-9]+(?:\.[0-9]+)?)$/i;
const regexValue = /^\/(?:\\[^\r\n]|[^/\\\r\n])*\/[dgimsuvy]*$/;
const receiverError =
  /^(?:Error: )?(to[A-Za-z]+) can be only used with (Locator|Page|APIResponse) object, was called with [\s\S]*$/;
const unknownReceiverError = /^(?:Error: )?to[A-Za-z]+ can be only used with /;
export const ERROR_CONTEXT_GRAMMAR = {
  revision: "playwright-1.63.0-diagnostic-envelopes-2",
  maxLines: 128,
  maxRetainedLines: 8,
  matchers,
  header: header.source,
  payload: payload.source,
  source: source.source,
  timeout: timeout.source,
  diffHeader: diffHeader.source,
  diffRow: diffRow.source,
  continuation:
    "closed quoted string or strict JSON container only; opaque diff rows; unknown tail excluded",
  quotedValue: quotedValue.source,
  scalarValue: scalarValue.source,
  regexValue: regexValue.source,
  maxValueDepth: 32,
  receiverError: receiverError.source,
  unknownReceiverError: unknownReceiverError.source,
  locatorBody:
    "opaque description boundary; entire remaining body excluded; incomplete",
  timeoutReceivers: ["locator", "page", "response"],
  retainedEnvelopeRecheck:
    "same grammar after bounded final sanitization; otherwise excluded/incomplete",
  customMessage:
    "Error: single-line message, blank, known matcher header; prefix omitted",
} as const;
export interface ErrorContext {
  text: string | null;
  issue: "unknown-error-context" | "error-context-limit" | null;
  omitted: Record<string, number>;
}
// Track only the boundary of a multiline pretty value. No payload is interpreted
// or classified as safe. Quotes/containers may span lines; regexes are single-line.
class ValueBoundary {
  private quote = "";
  private escaped = false;
  private brackets: string[] = [];
  private buffer = "";
  private kind: "quoted" | "json" | null = null;
  private valid = true;
  get open(): boolean {
    return !!this.quote || this.brackets.length > 0;
  }
  get unknown(): boolean {
    return !this.valid;
  }
  start(text: string): void {
    const value = text.replace(/^not\s+/, "").trim();
    this.kind = value.startsWith('"')
      ? "quoted"
      : /^[\[{]/.test(value)
        ? "json"
        : null;
    if (this.kind) this.consume(value);
    else this.valid = scalarValue.test(value) || regexValue.test(value);
  }
  consume(text: string): void {
    this.buffer += (this.buffer ? "\n" : "") + text;
    for (const c of text) {
      if (this.quote) {
        if (this.escaped) this.escaped = false;
        else if (c === "\\") this.escaped = true;
        else if (c === this.quote) this.quote = "";
      } else if (c === '"' || c === "'") this.quote = c;
      else if (c === "{" || c === "[") {
        this.brackets.push(c === "{" ? "}" : "]");
        if (this.brackets.length > ERROR_CONTEXT_GRAMMAR.maxValueDepth)
          this.valid = false;
      } else if (c === "}" || c === "]") {
        if (this.brackets.at(-1) === c) this.brackets.pop();
      }
    }
    // A line break consumes a trailing escape in the formatted value.
    this.escaped = false;
    if (!this.open && this.valid) {
      if (this.kind === "quoted")
        this.valid = quotedValue.test(this.buffer.trim());
      else {
        try {
          JSON.parse(this.buffer);
        } catch {
          this.valid = false;
        }
      }
    }
  }
}
export function errorContext(text: string): ErrorContext {
  const lines = text.replace(/\r\n?|\u2028|\u2029/g, "\n").split("\n");
  const omitted: Record<string, number> = {};
  const omit = (rule: string, count = 1) => {
    omitted[rule] = (omitted[rule] ?? 0) + count;
  };
  if (lines.length > ERROR_CONTEXT_GRAMMAR.maxLines)
    return {
      text: null,
      issue: "error-context-limit",
      omitted: { "error-context-limit": 1 },
    };
  const receiver = receiverError.exec(text);
  if (receiver && matchers.some((m) => m === receiver[1]))
    return {
      text: receiver[1] + ": invalid receiver type",
      issue: null,
      omitted: { "error-assertion-values": lines.length },
    };
  if (unknownReceiverError.test(text))
    return {
      text: null,
      issue: "unknown-error-context",
      omitted: { "error-unknown-context": lines.length },
    };
  let start = 0;
  const wrapped = lines[2] ? header.exec(lines[2].trim()) : null;
  if (
    /^Error: /.test(lines[0]!) &&
    lines[1] === "" &&
    wrapped &&
    matchers.some((m) => m === wrapped[1])
  ) {
    start = 2;
    omit("error-custom-message", 2);
  }
  const first = lines[start]!.trim();
  const match = header.exec(first);
  const matcher = !!match && matchers.some((m) => m === match[1]);
  // A custom preface or interpolated matcher hint is not a trusted diagnostic.
  if (!matcher && /\bexpect\s*\(/.test(text))
    return {
      text: null,
      issue: "unknown-error-context",
      omitted: { "error-unknown-context": lines.length },
    };
  if (
    !matcher &&
    (payload.test(first) ||
      first.startsWith("Locator:") ||
      diffHeader.test(first))
  )
    return {
      text: null,
      issue: "unknown-error-context",
      omitted: { "error-unknown-context": lines.length },
    };
  const kept = first
    ? [
        matcher
          ? first.replace(
              / \/\/ (?:indexOf|deep equality|Object\.is equality)$/,
              "",
            )
          : first,
      ]
    : [];
  let issue: ErrorContext["issue"] = null;
  let value = new ValueBoundary();
  let diff = false;
  let diffExpected = false,
    diffReceived = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (value.open) {
      value.consume(line);
      omit("error-assertion-values");
      if (value.unknown) {
        issue = "unknown-error-context";
        omit("error-unknown-context", lines.length - i - 1);
        break;
      }
      continue;
    }
    if (!line.trim()) continue;
    if (line === "Call log:") {
      omit("error-call-log", lines.length - i);
      break;
    }
    if (source.test(line)) {
      omit("error-source-context", lines.length - i);
      break;
    }
    if (matcher && line.startsWith("Locator:")) {
      // Locator.describe() can contain raw line breaks and imitate any following
      // diagnostic. The message carries no trusted boundary metadata. Retain only
      // the known heading and report this lost context honestly.
      omit("error-locator-context", lines.length - i);
      issue = "unknown-error-context";
      break;
    }
    const timed =
      matcher && /expect\((?:locator|page|response)\)/.test(first)
        ? timeout.exec(line)
        : null;
    if (timed) {
      if (kept.length < ERROR_CONTEXT_GRAMMAR.maxRetainedLines)
        kept.push("Timeout: " + timed[1] + "ms");
      continue;
    }
    const part = matcher ? payload.exec(line) : null;
    if (part) {
      value = new ValueBoundary();
      value.start(part[1]!);
      omit("error-assertion-values");
      if (value.unknown) {
        issue = "unknown-error-context";
        omit("error-unknown-context", lines.length - i - 1);
        break;
      }
      continue;
    }
    if (matcher && diffHeader.test(line)) {
      diff = true;
      if (line.startsWith("-")) diffExpected = true;
      else diffReceived = true;
      omit("error-diff");
      continue;
    }
    if (diff && diffRow.test(line)) {
      omit("error-diff");
      continue;
    }
    // Discard the complete unknown tail; never retain a guessed safe continuation.
    issue = "unknown-error-context";
    omit("error-unknown-context", lines.length - i);
    break;
  }
  if (value.open || (diff && !(diffExpected && diffReceived)))
    issue = "unknown-error-context";
  return { text: kept.join("\n") || null, issue, omitted };
}
