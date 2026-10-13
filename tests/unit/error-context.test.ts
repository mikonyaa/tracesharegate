import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Redactor } from "../../src/redaction/index.js";
import { reduce } from "../../src/report/process.js";
import { writeReport } from "../../src/report/write.js";
import { verifyFiles } from "../../src/report/verify.js";
import { archive, before, after } from "../helpers/archive.js";
import { render } from "../../src/report/render.js";
import { hash } from "../../src/policy/index.js";

const marker = "CUSTOMER_DIAGNOSTIC_4827";
const heading = "Error: expect(received).toEqual(expected) // deep equality";
for (const [label, body] of [
  ["labels", `Expected substring: "${marker}"\nReceived string: "${marker}"`],
  [
    "diff",
    `- Expected  - 1\n+ Received  + 1\n\n  Object {\n-   "user": "${marker}",\n+   "user": "${marker}",\n  }`,
  ],
  [
    "multiline-values",
    `Expected: "first\n${marker}\nlast"\nReceived: "first\n${marker}\nlast"`,
  ],
  [
    "codeframe",
    `Expected: 1\nReceived: 2\n\n  14 | expect("${marker}")\n> 15 | throw new Error("${marker}")\n     | ^\n    at ${marker}:15:1`,
  ],
  [
    "ansi-bidi-labels",
    `\u001b[32mEx\u202epected pattern: /${marker}/\u001b[0m\nReceived string: "${marker}"`,
  ],
] as const)
  test("matcher context omits complete " + label + " blocks", () => {
    const r = new Redactor();
    const result = r.error(heading + "\n\n" + body, "errors[].message");
    assert(!result?.includes(marker));
    assert(result?.includes("toEqual"));
    assert(r.summary.some((x) => x.ruleId === "error-context" && x.count > 0));
  });

test("unknown matcher continuation is omitted and makes reduction incomplete", async () => {
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, {
        message:
          heading +
          `\n\nExpected: 1\nReceived: 2\nUnrecognized diagnostic: ${marker}`,
      }),
    ]),
  );
  assert.equal(r.exitCode, 3);
  assert.equal(r.report.processingStatus, "incomplete");
  assert(
    r.report.coverage.issues.some((i) => i.code === "unknown-error-context"),
  );
  assert(!JSON.stringify(r).includes(marker));
  assert(r.report.errors[0]?.message?.includes("toEqual"));
});

test("unknown matcher header cannot retain interpolated argument or custom preface", async () => {
  for (const message of [
    `Error: expect(${marker}).toEqual(expected)\nExpected: 1`,
    `${marker}\n\n${heading}\nExpected: 1`,
    `Error: expect(received).toFutureMatcher(expected)\nExtra: ${marker}`,
  ]) {
    const r = await reduce(
      await archive([before(), after("call", 20, { message })]),
    );
    assert.equal(r.exitCode, 3);
    assert(!JSON.stringify(r).includes(marker));
    assert(
      r.report.coverage.issues.some((i) => i.code === "unknown-error-context"),
    );
  }
});

test("error context limits cannot silently produce complete processing", async () => {
  for (const message of ["x".repeat(8193), heading + "\n".repeat(130)]) {
    const r = await reduce(
      await archive([before(), after("call", 20, { message })]),
    );
    assert.equal(r.exitCode, 3);
    assert(
      r.report.coverage.issues.some((i) => i.code === "error-context-limit"),
    );
    assert.equal(r.report.errors[0]?.message, null);
  }
});

test("safe ordinary error and locator matcher heading remain useful", async () => {
  const message = "Error: Local validation failed\n    at private-source:10:1";
  assert.equal(
    new Redactor().error(message, "errors[].message"),
    "Error: Local validation failed",
  );
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, {
        message:
          "Error: expect(locator).toHaveText(expected) failed\n\nLocator: secret\nExpected: 1\nReceived: 2\nTimeout: 150ms\nCall log:\n" +
          marker,
      }),
    ]),
  );
  assert.equal(r.exitCode, 3);
  assert(r.report.errors[0]?.message?.includes("toHaveText"));
  assert(!r.report.errors[0]?.message?.includes("Timeout: 150ms"));
  assert(!JSON.stringify(r).includes(marker));
});
test("pinned Error custom-message wrapper is excluded while matcher diagnosis stays complete", async () => {
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, {
        message: `Error: ${marker}\n\n${heading}\n\nExpected: 1\nReceived: 2`,
      }),
    ]),
  );
  assert.equal(r.exitCode, 0);
  assert(!JSON.stringify(r).includes(marker));
  assert(r.report.errors[0]?.message?.includes("toEqual"));
});
test("locator descriptions cannot forge retained timeout lines", async () => {
  const message = `Error: expect(locator).toHaveText(expected) failed\n\nLocator: locator('p')\nTimeout: 7654321ms\nCall log:\n${marker}\nExpected: 1\nReceived: 2\nTimeout: 150ms`;
  const r = await reduce(
    await archive([before(), after("call", 20, { message })]),
  );
  assert.equal(r.exitCode, 3);
  assert(!JSON.stringify(r).includes("7654321ms"));
  assert(!JSON.stringify(r).includes(marker));
  assert(
    r.report.coverage.issues.some((i) => i.code === "unknown-error-context"),
  );
});
test("pinned matcher receiver validation never retains the invalid argument", async () => {
  for (const [matcher, type] of [
    ["toHaveText", "Locator"],
    ["toBeVisible", "Locator"],
    ["toHaveTitle", "Page"],
    ["toBeOK", "APIResponse"],
  ]) {
    const message = `Error: ${matcher} can be only used with ${type} object, was called with ${marker}`;
    const r = await reduce(
      await archive([before(), after("call", 20, { message })]),
    );
    assert.equal(r.exitCode, 0);
    assert(!JSON.stringify(r).includes(marker));
    assert(r.report.errors[0]?.message?.includes("invalid receiver type"));
  }
});
test("unknown/plural matcher receiver envelopes are omitted and incomplete", async () => {
  for (const matcher of ["toMatchAriaSnapshot", "toFutureMatcher"]) {
    const r = await reduce(
      await archive([
        before(),
        after("call", 20, {
          message: `Error: ${matcher} can be only used with Page or Locator objects, was called with ${marker}`,
        }),
      ]),
    );
    assert.equal(r.exitCode, 3);
    assert.equal(r.report.errors[0]?.message, null);
    assert(!JSON.stringify(r).includes(marker));
  }
});
test("literal changes to a matcher heading cannot produce an unrecheckable report", () => {
  for (const literal of ["received", "expected", "toEqual"]) {
    const issues: string[] = [];
    const result = new Redactor([literal]).error(
      heading + "\nExpected: 1\nReceived: 2",
      "errors[].message",
      (code) => issues.push(code),
    );
    assert.equal(result, null);
    assert(issues.includes("unknown-error-context"));
  }
});

test("orphan value/diff header is not retained as an ordinary error", async () => {
  for (const message of [
    `Expected pattern: /${marker}/`,
    `Received string: ${marker}`,
    `Locator: ${marker}`,
    `- Expected  - 1\n+ Received  + 1\n  ${marker}`,
  ]) {
    const r = await reduce(
      await archive([before(), after("call", 20, { message })]),
    );
    assert.equal(r.exitCode, 3);
    assert.equal(r.report.errors[0]?.message, null);
    assert(!JSON.stringify(r).includes(marker));
  }
});

test("opaque values cannot forge timeout/call-log/source boundaries", async () => {
  for (const value of [
    `Symbol(${marker}`,
    `[/]/, Symbol(${marker}`,
    `[/]"/, "${marker}`,
  ]) {
    const r = await reduce(
      await archive([
        before(),
        after("call", 20, {
          message:
            heading +
            `\n\nExpected: 1\nReceived: ${value}\nTimeout: 7654321ms\nCall log:\n${marker}`,
        }),
      ]),
    );
    assert.equal(r.exitCode, 3);
    assert(
      r.report.coverage.issues.some((i) => i.code === "unknown-error-context"),
    );
    assert(!JSON.stringify(r).includes(marker));
    assert(!JSON.stringify(r).includes("7654321ms"));
  }
});

test("expanded literal replacements respect final UTF8 byte limit", async () => {
  const message = "💡".repeat(1900) + "QZ".repeat(50);
  const r = await reduce(
    await archive([before(), after("call", 20, { message })]),
    ["QZ"],
  );
  assert.equal(r.exitCode, 3);
  assert.equal(r.report.errors[0]?.message, null);
  assert(
    r.report.coverage.issues.some((i) => i.code === "error-context-limit"),
  );
  const output = path.join(
    await mkdtemp(path.join(tmpdir(), "tracesharegate-expanded-literal-")),
    "bundle",
  );
  await writeReport(output, r.report, r.manifest, ["QZ"]);
  assert.equal(
    (
      await verifyFiles(
        path.join(output, "report.json"),
        path.join(output, "manifest.json"),
        path.join(output, "report.html"),
      )
    ).processingStatus,
    "incomplete",
  );
});

test("expanded error name also respects retained field byte bound", async () => {
  const name = "💡".repeat(1900) + "QZ".repeat(50);
  assert.equal(new Redactor(["QZ"]).sanitize(name, "errors[].name"), null);
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, { name, message: "Local validation failed" }),
    ]),
    ["QZ"],
  );
  assert.equal(r.exitCode, 3);
  assert.equal(r.report.errors[0]?.name, null);
  assert(r.report.errors[0]?.message?.includes("Local validation failed"));
});

test("verifier rejects assertion context even when attacker recomputes hashes and HTML", async () => {
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, { message: "Local validation failed" }),
    ]),
  );
  r.report.errors[0]!.message =
    heading + `\nExpected substring: "${marker}"\nReceived string: "${marker}"`;
  const output = path.join(
    await mkdtemp(path.join(tmpdir(), "tracesharegate-policy-tamper-")),
    "bundle",
  );
  // Forge directly: an attacker is not constrained by the producer's postconditions.
  await mkdir(output);
  const json = JSON.stringify(r.report, null, 2) + "\n";
  const html = await render(r.report, r.manifest);
  r.manifest.outputArtifacts = [
    { name: "report.json", sha256: hash(json), bytes: Buffer.byteLength(json) },
    { name: "report.html", sha256: hash(html), bytes: Buffer.byteLength(html) },
  ];
  await writeFile(path.join(output, "report.json"), json);
  await writeFile(path.join(output, "report.html"), html);
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(r.manifest, null, 2) + "\n",
  );
  await assert.rejects(
    verifyFiles(
      path.join(output, "report.json"),
      path.join(output, "manifest.json"),
      path.join(output, "report.html"),
    ),
    /error-context-postcondition/,
  );
});

test("exported writer cannot emit assertion values under current policy", async () => {
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, { message: "Local validation failed" }),
    ]),
  );
  r.report.errors[0]!.message = heading + `\nExpected pattern: /${marker}/`;
  const output = path.join(
    await mkdtemp(path.join(tmpdir(), "tracesharegate-writer-policy-")),
    "bundle",
  );
  await assert.rejects(
    writeReport(output, r.report, r.manifest, []),
    /error-context-postcondition/,
  );
  await assert.rejects(readFile(path.join(output, "report.json")), /ENOENT/);
});

test("known legacy policy is explicitly rejected without rewriting immutable hashes", async () => {
  const dir = "fixtures/legacy-policy";
  const files = ["report.json", "manifest.json", "report.html"].map((f) =>
    path.join(dir, f),
  );
  const bytes = await Promise.all(files.map((f) => readFile(f)));
  await assert.rejects(
    verifyFiles(files[0]!, files[1]!, files[2]!),
    /legacy-policy-reduction-required/,
  );
  for (const [i, file] of files.entries())
    assert.deepEqual(await readFile(file), bytes[i]);
});
