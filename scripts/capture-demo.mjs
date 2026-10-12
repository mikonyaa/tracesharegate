import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const root = await mkdtemp(path.join(tmpdir(), "tracesharegate-demo-"));
const run = spawnSync(
  process.execPath,
  [
    "dist/cli.js",
    "report",
    "fixtures/synthetic/assertion.zip",
    "--out",
    path.join(root, "report"),
    "--json",
  ],
  { encoding: "utf8", timeout: 35000 },
);
assert.equal(run.status, 0);
const result = JSON.parse(run.stdout);
const text =
  "$ tracesharegate report assertion.zip --out report\n\n" +
  JSON.stringify(
    {
      processingStatus: result.processingStatus,
      needsReview: result.needsReview,
      actions: result.actions,
      errors: result.errors,
      artifacts: result.artifacts,
      meaning: result.meaning,
    },
    null,
    2,
  );
const escape = (x) =>
  x.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const html =
  '<!doctype html><html><meta charset="utf-8"><style>body{margin:0;background:#242b2d;color:#f5f3ed;padding:48px;font:20px/1.65 monospace}h1{font:14px monospace;color:#cba67b}pre{white-space:pre-wrap}</style><h1>OWN SYNTHETIC TRACE / CAPTURED CLI STDOUT</h1><pre>' +
  escape(text) +
  "</pre></html>";
await writeFile(path.join(root, "command.html"), html);
await mkdir("docs/demo", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
  });
  await page.goto(pathToFileURL(path.join(root, "command.html")).href);
  await page.screenshot({ path: "docs/demo/command.png" });
} finally {
  await browser.close();
}
await copyFile(
  "output/playwright/original-synthetic-canary.png",
  "docs/demo/original-synthetic-canary.png",
);
console.log(
  "Captured actual CLI stdout and own original synthetic page for the screenshot demo.",
);
