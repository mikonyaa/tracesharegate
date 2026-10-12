import { BUILTIN_PATTERNS } from "./patterns.js";
import { createHash } from "node:crypto";
export const VERSION = "0.1.0";
export const ADAPTER = {
  id: "playwright-1.63.0-v9",
  version: "1",
  playwright: "1.63.0",
  traceVersion: 9,
  sourceCommit: "1b025d7e20a026371cd5f98ba0cdce48892737c8",
} as const;
export const POLICY = {
  id: "minimal-v1",
  version: 1,
  retained: [
    "local IDs",
    "known operation labels",
    "relative stream times",
    "outcomes",
    "verified parents",
    "bounded redacted errors",
    "counts and coverage",
  ],
  omitted: [
    "arguments-and-results",
    "test-and-step-titles",
    "console-and-stdio",
    "dom-and-aria",
    "images-and-video",
    "network",
    "cookies-and-storage",
    "source-and-stacks",
    "attachments",
    "arbitrary-resources",
  ],
  rules: [
    "known-literal",
    "literal-uri",
    "literal-json",
    "literal-nfc",
    "url",
    "home-path",
    "absolute-path",
    "email",
    "bearer",
    "jwt",
    "credential-assignment",
    "synthetic-canary",
    "ansi",
    "control",
    "error-context",
    "oversize-string",
  ],
} as const;
export const hash = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
// Labels belong to this tool, never to imported trace titles or selectors.
const operations: Record<string, string> = {
  "BrowserContext.newPage": "Create page",
  "BrowserContext.close": "Close context",
  "BrowserContext.newContext": "Create context",
  "Browser.newContext": "Create context",
  "Browser.newPage": "Create page",
  "Browser.close": "Close browser",
  "Frame.goto": "Navigate",
  "Page.goto": "Navigate",
  "Frame.fill": "Fill input",
  "Frame.click": "Click",
  "Frame.dblclick": "Double click",
  "Frame.press": "Press key",
  "Frame.check": "Check control",
  "Frame.uncheck": "Uncheck control",
  "Frame.hover": "Hover",
  "Frame.selectOption": "Select option",
  "Frame.waitForSelector": "Wait for element",
  "Frame.waitForTimeout": "Wait",
  "Frame.expect": "Locator assertion",
  "Frame.evaluateExpression": "Evaluate",
  "Frame.evaluateExpressionHandle": "Evaluate",
  "Page.screenshot": "Capture screenshot",
  "Page.close": "Close page",
  "Page.reload": "Reload",
  "Page.waitForEvent": "Wait for event",
  "Test.hook": "Test hook",
  "Test.fixture": "Test fixture",
  "Test.pw:api": "Browser API step",
  "Test.test.step": "Test step",
  "Test.test.attach": "Attach data",
  "Test.expect": "Assertion",
  "Test.test.step.skip": "Skipped step",
  "Tracing.tracingGroup": "Trace group",
  "APIRequestContext.get": "HTTP request",
  "APIRequestContext.fetch": "HTTP request",
};
export const OPERATION_LABELS = [
  ...new Set(Object.values(operations)),
  "Unknown operation",
];
export function operation(
  c: unknown,
  m: unknown,
): { label: string; known: boolean } {
  if (typeof c !== "string" || typeof m !== "string")
    return { label: "Unknown operation", known: false };
  const label = Object.hasOwn(operations, c + "." + m)
    ? operations[c + "." + m]
    : undefined;
  return { label: label ?? "Unknown operation", known: !!label };
}

export const POLICY_HASH = hash(
  JSON.stringify({
    policy: POLICY,
    operations,
    builtins: BUILTIN_PATTERNS.map((p) => ({
      id: p.id,
      source: p.pattern.source,
      flags: p.pattern.flags,
      replacement: p.replacement,
    })),
    retainedStringBytes: 8192,
    literalVariants: ["exact", "json", "uri", "nfc"],
  }),
);
