import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { reduce } from "../../src/report/process.js";
import { writeReport } from "../../src/report/write.js";
import { verifyFiles } from "../../src/report/verify.js";
import { hash } from "../../src/policy/index.js";
import {
  CANARY,
  rawEntries,
  mutateRecorded,
  ndjson,
} from "../helpers/archive.js";
const fixture = (name: string) => "fixtures/synthetic/" + name + ".zip";
for (const [scenario, operation, explanation] of [
  ["assertion", "Assertion", "failed"],
  ["timeout", "Click", "Timeout"],
  ["navigation", "Navigate", "net::ERR"],
] as const)
  test(
    "actual runner " +
      scenario +
      " preserves failing operation and explanation",
    async () => {
      const original = await readFile(fixture(scenario));
      const r = await reduce(fixture(scenario), [CANARY]);
      assert.equal(r.exitCode, 0);
      const failed = r.report.actions.filter((a) => a.outcome === "failed");
      assert(failed.some((a) => a.operation === operation));
      assert(r.report.errors.some((e) => e.message?.includes(explanation)));
      assert.equal(r.report.coverage.assertionScope, "runner-observations");
      assert.equal(hash(await readFile(fixture(scenario))), hash(original));
      const browserActions = r.report.actions.filter(
        (a) =>
          r.report.contexts.find((c) => c.id === a.contextId)?.origin ===
          "browser",
      );
      assert.deepEqual(
        browserActions.slice(0, 3).map((a) => a.operation),
        ["Create page", "Navigate", "Fill input"],
      );
    },
  );
test("canary exists in original action, console/error, network, DOM, screenshot and source; absent everywhere retained", async () => {
  const entries = await rawEntries(fixture("assertion"));
  const events = entries
    .filter((e) => e.name.endsWith(".trace") || e.name.endsWith(".network"))
    .flatMap((e) =>
      e.data
        .toString("utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    );
  const contains = (v: unknown): boolean =>
    typeof v === "string"
      ? v.includes(CANARY)
      : Array.isArray(v)
        ? v.some(contains)
        : v !== null && typeof v === "object"
          ? Object.values(v).some(contains)
          : false;
  assert(events.some((e) => e.type === "before" && contains(e.params)));
  assert(events.some((e) => e.type === "console" && contains(e.text)));
  assert(events.some((e) => e.type === "error" && contains(e.message)));
  assert(
    events.some(
      (e) => e.type === "frame-snapshot" && contains(e.snapshot.html),
    ),
  );
  const request = events.find(
    (e) =>
      e.type === "resource-snapshot" && e.snapshot.request.method === "POST",
  );
  assert(request);
  const body = entries.find(
    (e) => e.name === request.snapshot.request.postData._file,
  );
  assert(body && body.data.toString("utf8").includes(CANARY));
  assert(
    entries.some(
      (e) =>
        e.name.startsWith("src/") && e.data.toString("utf8").includes(CANARY),
    ),
  );
  const attachment = events
    .flatMap((e) => e.attachments ?? [])
    .find((a) => a.name === "synthetic-image");
  const image = entries.find((e) => e.name === attachment?.file);
  assert(
    image &&
      image.data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  await writeFile(
    "output/playwright/original-synthetic-canary.png",
    image.data,
  );
  const r = await reduce(fixture("assertion"), [CANARY]);
  const dir = await mkdtemp(path.join(tmpdir(), "tracesharegate-canary-"));
  const out = path.join(dir, "report");
  await writeReport(out, r.report, r.manifest, [CANARY]);
  for (const f of ["report.json", "report.html", "manifest.json"]) {
    const text = await readFile(path.join(out, f), "utf8");
    assert(!text.includes("TSG_SYNTHETIC_CANARY"));
    assert(!text.includes("Pending " + CANARY));
    assert(!text.includes(attachment.file));
    assert(!text.includes("getByTestId"));
    assert(!text.includes("Submit sample"));
    assert(!text.includes("function generatePreview"));
  }
  for (const e of r.manifest.entries.filter((e) =>
    [
      "source-and-stacks",
      "images-and-video",
      "attachments",
      "arbitrary-resources",
    ].includes(e.category),
  )) {
    assert.equal(e.contentsInspected, false);
    assert.equal(e.actualProcessedBytes, null);
    assert.equal(e.disposition, "omitted");
  }
  assert.equal(
    (
      await verifyFiles(
        path.join(out, "report.json"),
        path.join(out, "manifest.json"),
        path.join(out, "report.html"),
        [CANARY],
      )
    ).literalRecheck,
    "performed",
  );
  await writeFile(
    "docs/evidence/canary-surfaces.json",
    JSON.stringify(
      {
        synthetic: true,
        originalSHA256: hash(await readFile(fixture("assertion"))),
        surfaces: {
          actionArguments: true,
          consoleAndError: true,
          networkBody: true,
          dom: true,
          screenshot: {
            pngPresent: true,
            visibleText:
              "Manually inspected; image exclusion is not plaintext scanning.",
          },
          source: true,
        },
        retainedCanaryMatches: 0,
        originalUnchanged: true,
      },
      null,
      2,
    ) + "\n",
  );
});
test("browser-only has no invented runner assertion result", async () => {
  const r = await reduce(fixture("browser-only"));
  assert.equal(r.exitCode, 0);
  assert.equal(r.report.coverage.assertionScope, "browser-only");
  assert(
    r.report.contexts.every((c) => c.assertionObservations === "out-of-scope"),
  );
  assert(!r.report.actions.some((a) => a.operation === "Assertion"));
});
test("unknown key and event in recorded input are partial without diagnostic leaks", async () => {
  const key = "PRIVATE_UNKNOWN_KEY_" + CANARY;
  const input = await mutateRecorded(fixture("assertion"), (entries) => {
    const e = entries.find((e) => e.name === "test.trace")!;
    const events = e.data
      .toString("utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    events[1][key] = CANARY;
    events.push({ type: key, [key]: CANARY });
    e.data = ndjson(events);
    entries.push({
      name: "PRIVATE_ENTRY_" + CANARY,
      data: Buffer.from(CANARY),
    });
  });
  const r = await reduce(input, [CANARY]);
  assert.equal(r.exitCode, 3);
  const text = JSON.stringify(r);
  assert(!text.includes(key));
  assert(!text.includes("PRIVATE_ENTRY"));
  assert(!text.includes(CANARY));
  assert(
    r.report.coverage.issues.some((x) => x.code === "unknown-schema-field"),
  );
  assert(r.report.coverage.issues.some((x) => x.code === "unknown-event-kind"));
  assert(
    r.report.coverage.issues.some((x) => x.code === "unknown-entry-category"),
  );
});
test("repeated references and duplicate resource bytes count entries and links separately", async () => {
  const input = await mutateRecorded(fixture("assertion"), (entries) => {
    const network = entries.find((e) => e.name === "1-trace.network")!;
    const lines = network.data
      .toString("utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    network.data = ndjson([...lines, ...lines]);
    const resource = entries.find((e) => e.name.startsWith("resources/"))!;
    entries.push({
      name: "resources/duplicate-content.txt",
      data: resource.data,
    });
  });
  const r = await reduce(input);
  assert.equal(r.exitCode, 0);
  assert(r.manifest.resources.some((l) => l.references >= 2));
  const physical = r.manifest.entries.filter(
    (e) => e.category === "arbitrary-resources",
  );
  assert.equal(physical.length, 4);
  assert(physical.every((e) => e.contentsInspected === false));
});
