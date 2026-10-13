import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, open } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { LIMITS } from "../../src/limits/index.js";
import { reduce } from "../../src/report/process.js";
import { render } from "../../src/report/render.js";
import { verifyFiles } from "../../src/report/verify.js";
import { validateReport } from "../../src/schemas/index.js";
import { archive, before, after } from "../helpers/archive.js";

test("oversize retained output cannot render a finished bundle", async () => {
  const r = await reduce(await archive([before(), after()]));
  r.report.errors = Array.from({ length: 8500 }, (_, i) => ({
    id: "error-" + (i + 1),
    contextId: "context-1",
    actionId: null,
    name: null,
    message: "a".repeat(8192),
    timeMs: null,
    eventIndex: i,
  }));
  validateReport(r.report);
  await assert.rejects(render(r.report, r.manifest), /output-byte-limit/);
});

test("verifier rejects oversize artifact before parsing its bytes", async () => {
  const dir = await mkdtemp(
    path.join(tmpdir(), "tracesharegate-huge-artifact-"),
  );
  const file = path.join(dir, "report.json");
  const handle = await open(file, "w");
  try {
    await handle.truncate(LIMITS.outputBytes + 1);
  } finally {
    await handle.close();
  }
  await assert.rejects(
    verifyFiles(
      file,
      path.join(dir, "absent-manifest"),
      path.join(dir, "absent-html"),
    ),
    /input-size-limit/,
  );
});
