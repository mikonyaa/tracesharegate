import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { reduce } from "../../src/report/process.js";
import { writeReport } from "../../src/report/write.js";
import { verifyFiles } from "../../src/report/verify.js";
import { rawEntries } from "../helpers/archive.js";
import { hash } from "../../src/policy/index.js";

const cases = [
  "contain",
  "contain-array",
  "custom-message",
  "equal-object",
  "equal-array",
  "match-string",
  "match-regex",
  "have-text",
  "have-text-regex",
  "have-text-array",
  "multiline",
  "ansi-bidi",
  "negated",
  "safe-diagnostic",
  "opaque-symbol",
  "opaque-container",
  "opaque-regex-quote",
  "opaque-locator-description",
  "invalid-receiver",
  "opaque-invalid-receiver",
];
const incomplete = (id: string) =>
  id.startsWith("opaque-") || id.startsWith("have-text");
for (const id of cases)
  test(
    "independent actual matcher values omitted without literals: " + id,
    async () => {
      const file = `.work/matcher-fixtures/${id}.zip`;
      const original = await readFile(file);
      const traceErrors = (await rawEntries(file))
        .filter((e) => e.name.endsWith(".trace"))
        .flatMap((e) =>
          e.data
            .toString("utf8")
            .trim()
            .split("\n")
            .map((l) => JSON.parse(l)),
        )
        .flatMap((e) => [
          e.error?.message,
          e.type === "error" ? e.message : null,
        ])
        .filter((s): s is string => typeof s === "string")
        .map((s) =>
          s
            .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
            .replace(/[\u202a-\u202e\u2066-\u2069]/g, ""),
        );
      if (id !== "safe-diagnostic")
        for (const marker of id.includes("invalid-receiver")
          ? ["PERSON_ACTUAL_OTTO_8391"]
          : ["PERSON_ACTUAL_OTTO_8391", "PERSON_EXPECTED_NORAH_1642"])
          assert(
            traceErrors.some((s) => s.includes(marker)),
            "canary must be present in original error",
          );
      const result = await reduce(file);
      assert.equal(
        result.report.processingStatus,
        incomplete(id) ? "incomplete" : "complete",
        JSON.stringify(result.report.coverage.issues),
      );
      assert.equal(result.exitCode, incomplete(id) ? 3 : 0);
      if (incomplete(id)) {
        assert(
          result.report.coverage.issues.every(
            (i) => i.code === "unknown-error-context",
          ),
          "no hidden unknown operations",
        );
        assert(!JSON.stringify(result.report.errors).includes("7654321ms"));
      }
      assert.equal(result.report.coverage.literalCheck, "not-performed");
      assert(result.report.actions.some((a) => a.operation === "Navigate"));
      assert(result.report.errors.length > 0);
      const output = path.join(
        await mkdtemp(path.join(tmpdir(), "tracesharegate-matcher-report-")),
        "report",
      );
      await writeReport(output, result.report, result.manifest, []);
      for (const artifact of ["report.json", "manifest.json", "report.html"]) {
        const text = await readFile(path.join(output, artifact), "utf8");
        // Expected literals are independent of adapter/Redactor parsing and builtin patterns.
        for (const marker of [
          "PERSON_ACTUAL_OTTO_8391",
          "PERSON_EXPECTED_NORAH_1642",
          "PROJECT_PRIVATE_PREFACE_9823",
          "PERSON_OPAQUE_TAIL_9827",
          "7654321ms",
        ])
          assert(!text.includes(marker), `${id}: ${artifact} leaked ${marker}`);
      }
      if (id === "safe-diagnostic")
        assert(
          result.report.errors.some((e) =>
            e.message?.includes("Local validation failed"),
          ),
        );
      else if (id === "opaque-invalid-receiver")
        assert(result.report.errors.every((e) => e.message === null));
      else if (id === "invalid-receiver")
        assert(
          result.report.errors.some((e) =>
            e.message?.includes("invalid receiver type"),
          ),
        );
      else
        assert(
          result.report.errors.some((e) => e.message?.includes("expect(")),
          "safe matcher explanation retained",
        );
      assert.equal(
        (
          await verifyFiles(
            path.join(output, "report.json"),
            path.join(output, "manifest.json"),
            path.join(output, "report.html"),
          )
        ).policyVerification,
        "passed",
      );
      assert.equal(hash(await readFile(file)), hash(original));
      await writeFile(
        `.work/matcher-fixtures/${id}-output.json`,
        JSON.stringify({
          output,
          inputUnchanged: true,
          processingStatus: result.report.processingStatus,
          actions: result.report.actions.length,
          errors: result.report.errors.length,
          markerMatches: 0,
        }),
      );
    },
  );
