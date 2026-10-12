import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { rawEntries, CANARY } from "../tests/helpers/archive.ts";
import { reduce, writeReport } from "../dist/index.js";
import { execFileSync } from "node:child_process";
import path from "node:path";
const require = createRequire(import.meta.url);
const baseline = require("../.work/research/pw-sanitizer/dist/index.js");
await mkdir(".work/baseline-output", { recursive: true });
const input = "fixtures/synthetic/assertion.zip";
const original = await rawEntries(input);
const result = await baseline.redactTrace(input, {
  redact: {
    patterns: [
      { id: "synthetic-canary", valuePattern: /TSG_SYNTHETIC_CANARY_/ },
    ],
  },
  output: {
    mode: "copy",
    dir: path.resolve(".work/baseline-output"),
    redactScreenshots: false,
  },
  reporting: { logLevel: "silent" },
});
const baselineEntries = await rawEntries(".work/baseline-output/assertion.zip");
const reduced = await reduce(input, [CANARY]);
const out = ".work/comparison-report-" + Date.now();
await writeReport(out, reduced.report, reduced.manifest, [CANARY]);
const rows = (entries) => ({
  physicalEntries: entries.length,
  sourceEntries: entries.filter((e) => e.name.startsWith("src/")).length,
  imageEntries: entries.filter(
    (e) =>
      e.name.startsWith("screencast/") || e.name.startsWith("attachments/"),
  ).length,
  networkStreams: entries.filter((e) => e.name.endsWith(".network")).length,
  domEvents: entries
    .filter((e) => e.name.endsWith(".trace"))
    .flatMap((e) =>
      e.data
        .toString("utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    )
    .filter((e) => e.type === "frame-snapshot").length,
});
const evidence = {
  date: "2026-10-13",
  input: "own synthetic assertion trace",
  baseline: {
    name: "pw-sanitizer",
    version: "0.5.0",
    commit: execFileSync(
      "git",
      ["-C", ".work/research/pw-sanitizer", "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim(),
    declaredLicense:
      "MIT in package.json; no standalone license file found at examined commit",
    configuration:
      "Explicit synthetic-canary valuePattern; copy mode; screenshot redaction off",
    redactions: result.redactionsApplied,
    bytes: (await stat(".work/baseline-output/assertion.zip")).size,
    inventory: rows(baselineEntries),
  },
  original: {
    sha256: createHash("sha256")
      .update(await readFile(input))
      .digest("hex"),
    bytes: (await stat(input)).size,
    inventory: rows(original),
  },
  tracesharegate: {
    actions: reduced.report.actions.length,
    errors: reduced.report.errors.length,
    bytes: Object.fromEntries(
      await Promise.all(
        ["report.json", "report.html", "manifest.json"].map(async (f) => [
          f,
          (await stat(path.join(out, f))).size,
        ]),
      ),
    ),
    embeddedSourceOrImages: 0,
    resourcePayloads: 0,
    processingStatus: reduced.report.processingStatus,
  },
  usefulDifference:
    "A derived allowlist report with per-entry disposition, declared versus actual bytes, resource-reference counts and explicit unknown coverage.",
  lostContext:
    "Selectors, expected/received values, DOM replay, images, network/source context, original titles and globally aligned timing. Use the original privately for full analysis.",
  interpretation:
    "One synthetic sample and this explicit configuration; not a universal security or performance comparison.",
};
await writeFile(
  "docs/evidence/baseline-comparison.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  "Compared identical synthetic input with pw-sanitizer and recorded measured inventories.",
);
