import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Redactor } from "../../src/redaction/index.js";
import { reduce } from "../../src/report/process.js";
import { writeReport } from "../../src/report/write.js";
import { verifyFiles } from "../../src/report/verify.js";
import { parseBounded, LIMITS } from "../../src/limits/index.js";
import {
  archive,
  before,
  after,
  metadata,
  ndjson,
} from "../helpers/archive.js";
test("known literal longest first; quotes, Unicode, HTML-sensitive and overlaps", () => {
  const r = new Redactor(["alpha", "alpha-beta", '"<&Ж🙂']);
  assert.equal(
    r.sanitize('alpha-beta alpha "<&Ж🙂', "errors[].message"),
    "[LITERAL OMITTED] [LITERAL OMITTED] [LITERAL OMITTED]",
  );
  assert.equal(r.summary[0]?.count, 3);
});
test("JSON, URI and NFC variants are checked explicitly", () => {
  const r = new Redactor(['"<x&ж', "e\u0301"]);
  for (const s of ['\\"<x&ж', encodeURIComponent('"<x&ж'), "é"])
    assert.equal(r.sanitize(s, "errors[].message"), "[LITERAL OMITTED]");
});
test("URLs, auth, home paths and email omitted as units", () => {
  const r = new Redactor();
  const text = r.sanitize(
    "Navigate https://tenant:password@example.test/customer/path?token=q#f /Users/name/work/file a@b.test Bearer abcdef",
    "errors[].message",
  )!;
  assert(!text.includes("tenant"));
  assert(!text.includes("customer"));
  assert(!text.includes("name"));
  assert(!text.includes("abcdef"));
  r.assertBuiltin(text);
});
test("oversize retained strings omitted whole", () => {
  const r = new Redactor();
  assert.equal(
    r.sanitize("x".repeat(LIMITS.retainedString + 1), "errors[].message"),
    null,
  );
  assert.equal(r.summary[0]?.ruleId, "oversize-string");
});
test("postcondition raises exit 1 without value", () => {
  const r = new Redactor(["hidden"]);
  assert.throws(
    () => r.assertLiterals("hidden"),
    (e) =>
      e instanceof Error &&
      e.message === "literal-postcondition" &&
      !e.message.includes("hidden") &&
      (e as { exitCode?: number }).exitCode === 1,
  );
});
test("incomplete before, orphan after and duplicate preserve uncertainty", async () => {
  const file = await archive([
    before("a"),
    after("orphan"),
    before("dup"),
    before("dup"),
    after("dup"),
  ]);
  const r = await reduce(file);
  assert.equal(r.exitCode, 3);
  assert.equal(r.report.actions[0]?.outcome, "incomplete");
  assert.equal(r.report.actions[1]?.outcome, "unknown");
  assert(r.report.coverage.issues.some((x) => x.code === "orphan-after"));
});
test("duplicate after cannot overwrite outcome", async () => {
  const r = await reduce(await archive([before(), after(), after()]));
  assert.equal(r.report.actions[0]?.outcome, "unknown");
  assert.equal(r.exitCode, 3);
});
test("impossible durations remain unknown", async () => {
  const r = await reduce(await archive([before("a", 20), after("a", 10)]));
  assert.equal(r.report.actions[0]?.outcome, "unknown");
  assert.equal(r.report.actions[0]?.durationMs, null);
});
test("nested parents verified by containment; broken parent unknown", async () => {
  const r = await reduce(
    await archive([
      before("p", 1),
      before("c", 2, "p"),
      after("c", 3),
      after("p", 4),
      before("bad", 5, "absent"),
      after("bad", 6),
    ]),
  );
  assert.equal(r.report.actions[1]?.parentId, "action-1");
  assert.equal(r.report.actions[2]?.parentId, null);
  assert.equal(r.report.actions[2]?.outcome, "unknown");
});
test("same call ID in separate streams stays separate", async () => {
  const r = await reduce(
    await archive(
      [before(), after()],
      [
        {
          name: "1-trace.trace",
          data: ndjson([
            metadata,
            before(),
            after("call", 21, { name: "Error", message: "Failed" }),
          ]),
        },
      ],
    ),
  );
  assert.equal(r.report.actions.length, 2);
  assert.equal(r.report.actions[0]?.outcome, "passed");
  assert.equal(r.report.actions[1]?.outcome, "failed");
  assert.notEqual(
    r.report.actions[0]?.contextId,
    r.report.actions[1]?.contextId,
  );
});
test("complete action is supported by schema 9", async () => {
  const r = await reduce(
    await archive([{ ...before(), endTime: 22, type: "action" }]),
  );
  assert.equal(r.report.actions[0]?.durationMs, 12);
  assert.equal(r.exitCode, 0);
});
test("prototype keys stay inert", () => {
  const v = parseBounded('{"__proto__":{"polluted":true},"constructor":{}}');
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.equal(typeof v, "object");
});
test("verify checks bytes, literals, policy and renderer without execution", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tracesharegate-verify-"));
  const out = path.join(dir, "report");
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, {
        name: "Error",
        message: "secret-value invalid https://user:pass@tenant.test/path?q=s",
      }),
    ]),
    ["secret-value"],
  );
  await writeReport(out, r.report, r.manifest, ["secret-value"]);
  const files = [
    path.join(out, "report.json"),
    path.join(out, "manifest.json"),
    path.join(out, "report.html"),
  ] as const;
  const verified = await verifyFiles(...files);
  assert.equal(verified.literalRecheck, "not-performed");
  assert.equal(
    (await verifyFiles(...files, ["secret-value"])).literalRecheck,
    "performed",
  );
  const original = await readFile(files[0]);
  await writeFile(files[0], Buffer.concat([original, Buffer.from(" ")]));
  await assert.rejects(verifyFiles(...files), /artifact-hash-mismatch/);
  await writeFile(files[0], original);
  const report = JSON.parse(original.toString());
  report.policy.version = 99;
  const manifest = JSON.parse(await readFile(files[1], "utf8"));
  manifest.policy.version = 99;
  await writeFile(files[0], JSON.stringify(report));
  await writeFile(files[1], JSON.stringify(manifest));
  await assert.rejects(verifyFiles(...files), /unsupported-policy/);
});
test("output cannot overwrite input or existing files", async () => {
  const input = await archive([before(), after()]);
  const bytes = await readFile(input);
  const r = await reduce(input);
  await assert.rejects(
    writeReport(input, r.report, r.manifest, []),
    /output-exists-or-io/,
  );
  assert.deepEqual(await readFile(input), bytes);
});

test("invalid first after still makes a subsequent after a duplicate", async () => {
  const r = await reduce(
    await archive([before(), { ...after(), endTime: null }, after()]),
  );
  assert.equal(r.report.actions[0]?.outcome, "unknown");
  assert(r.report.coverage.issues.some((x) => x.code === "duplicate-after"));
});

test("renderer slots inside retained data stay inert text", async () => {
  const { render } = await import("../../src/report/render.js");
  const message = "Failure __JS__ __CSS__ __DATA__ __CSP__";
  const r = await reduce(
    await archive([before(), after("call", 20, { name: "Error", message })]),
  );
  const html = await render(r.report, r.manifest);
  const data = html.match(
    /<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  assert(data);
  assert.equal(JSON.parse(data).report.errors[0].message, message);
});

test("opaque URLs such as data and mailto are omitted whole", () => {
  const r = new Redactor();
  const text = r.sanitize(
    "Failed mailto:customer@tenant.test?subject=private data:text/plain;base64,cHJpdmF0ZQ==",
    "errors[].message",
  )!;
  assert.equal(text, "Failed [URL OMITTED] [URL OMITTED]");
});
