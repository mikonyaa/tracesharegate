import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
  symlink,
  mkdtemp,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

const output = path.resolve(".work/matcher-fixtures");
await mkdir(output, { recursive: true });
const capture = await mkdtemp(path.join(tmpdir(), "tracesharegate-matchers-"));
await symlink(path.resolve("node_modules"), path.join(capture, "node_modules"));
await copyFile(
  "tests/recorded-traces/matcher.spec.ts",
  path.join(capture, "matcher.spec.ts"),
);
await writeFile(
  path.join(capture, "playwright.config.ts"),
  `import {defineConfig} from '@playwright/test'; export default defineConfig({testDir:'.',testMatch:'matcher.spec.ts',workers:1,retries:0,timeout:10000,outputDir:'recorded',reporter:[['json',{outputFile:'runner.json'}]],use:{headless:true,trace:'retain-on-failure'}});`,
);
const run = spawnSync(
  process.execPath,
  [
    path.resolve("node_modules/@playwright/test/cli.js"),
    "test",
    "--config",
    path.join(capture, "playwright.config.ts"),
  ],
  { cwd: capture, env: process.env, encoding: "utf8", timeout: 120000 },
);
assert.equal(
  run.status,
  1,
  "intentional matcher failures must produce runner exit 1",
);
const result = JSON.parse(
  await readFile(path.join(capture, "runner.json"), "utf8"),
);
const cases = [];
function visit(suite) {
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests)
      for (const r of t.results) {
        assert.equal(r.status, "failed");
        assert(
          !r.error?.message?.includes("Executable doesn't exist"),
          "browser launch failures are not assertion fixtures",
        );
        const trace = r.attachments.find((a) => a.name === "trace");
        assert(trace, "trace retention required");
        cases.push({
          id: spec.title,
          trace: trace.path,
          message: r.error?.message,
        });
      }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of result.suites) visit(suite);
assert.equal(cases.length, 20);
for (const c of cases) {
  assert(
    c.message?.includes(
      c.id === "safe-diagnostic"
        ? "Local validation failed"
        : c.id.includes("invalid-receiver")
          ? "was called with"
          : "expect(",
    ),
    "must fail for intended diagnostic",
  );
  await copyFile(c.trace, path.join(output, c.id + ".zip"));
  const bytes = await readFile(path.join(output, c.id + ".zip"));
  c.sha256 = createHash("sha256").update(bytes).digest("hex");
  c.bytes = bytes.length;
  c.expectedProcessingStatus =
    c.id.startsWith("opaque-") || c.id.startsWith("have-text")
      ? "incomplete"
      : "complete";
  delete c.trace;
}
const browser = await chromium.launch();
const browserVersion = browser.version();
await browser.close();
await writeFile(
  path.join(output, "provenance.json"),
  JSON.stringify(
    {
      playwright: "1.63.0",
      traceSchema: 9,
      browser: browserVersion,
      lane: "default chromium",
      runnerExit: run.status,
      trace: "retain-on-failure",
      secretsFile: false,
      statusExpectations: "per-case",
      cases,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Recorded ${cases.length} intentional failures on Chromium ${browserVersion}; runner exit 1 is expected.`,
);
