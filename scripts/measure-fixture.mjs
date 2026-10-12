import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const root = await mkdtemp(path.join(tmpdir(), "tracesharegate-measure-"));
const started = performance.now();
const args = [
  process.platform === "darwin" ? "-l" : "-v",
  process.execPath,
  "dist/cli.js",
  "report",
  "fixtures/synthetic/assertion.zip",
  "--out",
  path.join(root, "report"),
  "--json",
];
const result = spawnSync("/usr/bin/time", args, {
  encoding: "utf8",
  timeout: 35000,
});
assert.equal(result.status, 0);
const match =
  process.platform === "darwin"
    ? result.stderr.match(/(\d+)\s+maximum resident set size/)
    : result.stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
assert(match);
await writeFile(
  "docs/evidence/measurement.json",
  JSON.stringify(
    {
      scenario: "own actual assertion trace",
      os: process.platform,
      arch: process.arch,
      node: process.versions.node,
      wallMs: Math.round(performance.now() - started),
      maxRssBytes:
        Number(match[1]) * (process.platform === "darwin" ? 1 : 1024),
      workerHeapBudgetMiB: 256,
      meaning:
        "One observed synthetic fixture run, not a general performance benchmark or strict RSS cap.",
    },
    null,
    2,
  ) + "\n",
);
console.log("Measured one fixture run against the heap/time budgets.");
