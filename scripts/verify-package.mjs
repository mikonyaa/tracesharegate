import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  access,
  copyFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ZipFile } from "yazl";
const source = process.cwd();
const consumer = await mkdtemp(path.join(tmpdir(), "tracesharegate-consumer-"));
const packageDir = path.join(source, ".work/packages");
await mkdir(packageDir, { recursive: true });
const run = (bin, args, cwd, env = process.env, expectedExit = 0) => {
  const r = spawnSync(bin, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
    timeout: 120000,
  });
  assert.equal(
    r.status,
    expectedExit,
    "Consumer command failed: " + (r.stderr ?? "").slice(0, 500),
  );
  return r.stdout;
};
let tgz = process.argv[2];
if (!tgz) {
  const raw = run(
    "npm",
    ["pack", "--json", "--pack-destination", packageDir],
    source,
  );
  const pack = JSON.parse(raw);
  tgz = path.join(packageDir, pack[0].filename);
  const forbidden = pack[0].files.filter((f) =>
    /(?:^|\/)(?:node_modules|\.work|local-policy|output|site)(?:\/|$)|\.map$|\.env/.test(
      f.path,
    ),
  );
  assert.deepEqual(forbidden, []);
  await writeFile(".work/pack.json", JSON.stringify(pack, null, 2) + "\n");
}
tgz = path.resolve(tgz);
await writeFile(
  path.join(consumer, "package.json"),
  '{"name":"tracesharegate-clean-consumer","private":true}\n',
);
const env = { ...process.env };
delete env.NODE_PATH;
delete env.NODE_OPTIONS;
env.PLAYWRIGHT_BROWSERS_PATH = path.join(consumer, "absent-browser-cache");
run(
  "npm",
  ["install", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", tgz],
  consumer,
  env,
);
for (const dev of [
  "playwright",
  "playwright-core",
  "@playwright/test",
  "typescript",
  "tsx",
])
  await assert.rejects(access(path.join(consumer, "node_modules", dev)));
const cli = path.join(consumer, "node_modules/tracesharegate/dist/cli.js");
const guard = path.join(source, "scripts/runtime-guard.mjs");
const controls = [];
for (const [id, code] of [
  [
    "spawnSync",
    "import {spawnSync} from 'node:child_process'; spawnSync(process.execPath,['--version']);",
  ],
  ["fetch", "await fetch('http://127.0.0.1:9');"],
]) {
  const checked = spawnSync(
    process.execPath,
    ["--import", guard, "--input-type=module", "-e", code],
    {
      cwd: consumer,
      env: {
        ...env,
        TSG_RUNTIME_GUARD_DIR: path.join(consumer, "guard-control", id),
      },
      encoding: "utf8",
    },
  );
  assert.equal(checked.status, 1);
  assert(
    checked.stderr.includes(
      "Runtime attempted network or child-process access",
    ),
  );
  controls.push({ api: id, exitCode: checked.status, denied: true });
}
env.TSG_RUNTIME_GUARD_DIR = path.join(consumer, "guard-runtime");
const command = (args, expectedExit = 0) =>
  JSON.parse(
    run(
      process.execPath,
      ["--import", guard, cli, ...args, "--json"],
      consumer,
      env,
      expectedExit,
    ),
  );
const doctor = command(["doctor"]);
assert.equal(doctor.version, "0.1.1");
assert.equal(doctor.browserRequired, false);
assert.equal(doctor.networkRequired, false);
const demo = command(["demo", "--out", "demo-output"], 3);
assert.equal(demo.processingStatus, "incomplete");
assert(demo.coverage.issues.every((i) => i.code === "unknown-error-context"));
assert(demo.actions > 10);
const fixture = "node_modules/tracesharegate/fixtures/synthetic/assertion.zip";
const before = await readFile(path.join(consumer, fixture));
const report = command(["report", fixture, "--out", "actual-output"], 3);
assert.equal(report.processingStatus, "incomplete");
assert(report.coverage.issues.every((i) => i.code === "unknown-error-context"));
assert(report.errors > 0);
assert.deepEqual(before, await readFile(path.join(consumer, fixture)));
const args = [
  "verify",
  "--report",
  "actual-output/report.json",
  "--manifest",
  "actual-output/manifest.json",
  "--html",
  "actual-output/report.html",
];
const plain = command(args);
assert.equal(plain.policyVersion, 2);
assert.equal(plain.assertionContextRecheck, "performed");
assert.equal(plain.literalRecheck, "not-performed");
await mkdir(path.join(consumer, "local-policy"));
await writeFile(
  path.join(consumer, "local-policy/known.json"),
  JSON.stringify(['TSG_SYNTHETIC_CANARY_09_"<&Ж🙂']),
);
const literals = command([
  ...args,
  "--secrets-file",
  "local-policy/known.json",
]);
assert.equal(literals.literalRecheck, "performed");
for (const out of ["actual-output", "demo-output"])
  for (const file of ["report.json", "report.html", "manifest.json"])
    assert(
      !(await readFile(path.join(consumer, out, file), "utf8")).includes(
        "TSG_SYNTHETIC_CANARY",
      ),
    );
const matcherProvenance = JSON.parse(
  await readFile(
    path.join(source, ".work/matcher-fixtures/provenance.json"),
    "utf8",
  ),
);
await mkdir(path.join(consumer, "matcher-inputs"));
const matcherResults = [];
for (const c of matcherProvenance.cases) {
  const fixture = path.join(consumer, "matcher-inputs", c.id + ".zip");
  await copyFile(
    path.join(source, ".work/matcher-fixtures", c.id + ".zip"),
    fixture,
  );
  const inputHash = createHash("sha256")
    .update(await readFile(fixture))
    .digest("hex");
  const out = path.join("matcher-output", c.id);
  const reduced = command(
    ["report", fixture, "--out", out],
    c.expectedProcessingStatus === "incomplete" ? 3 : 0,
  );
  assert.equal(reduced.processingStatus, c.expectedProcessingStatus);
  assert.equal(reduced.coverage.literalCheck, "not-performed");
  const verified = command([
    "verify",
    "--report",
    path.join(out, "report.json"),
    "--manifest",
    path.join(out, "manifest.json"),
    "--html",
    path.join(out, "report.html"),
  ]);
  assert.equal(verified.policyVersion, 2);
  assert.equal(verified.literalRecheck, "not-performed");
  for (const f of ["report.json", "report.html", "manifest.json"]) {
    const text = await readFile(path.join(consumer, out, f), "utf8");
    for (const marker of [
      "PERSON_ACTUAL_OTTO_8391",
      "PERSON_EXPECTED_NORAH_1642",
      "PROJECT_PRIVATE_PREFACE_9823",
      "PERSON_OPAQUE_TAIL_9827",
      "7654321ms",
    ])
      assert(!text.includes(marker), c.id + " leaked in " + f);
  }
  assert.equal(
    createHash("sha256")
      .update(await readFile(fixture))
      .digest("hex"),
    inputHash,
  );
  matcherResults.push({
    id: c.id,
    processingStatus: reduced.processingStatus,
    literalCheck: verified.literalRecheck,
    markerMatches: 0,
    inputUnchanged: true,
  });
}
// Own synthetic UI state controls, processed by the installed tgz CLI. These are
// UX/bounds controls; privacy evidence above uses genuinely recorded traces.
const uiControls = [];
const beforeControl = (i, kind = "Frame", method = "click") => ({
  type: "before",
  callId: "c" + i,
  startTime: i * 2 + 1,
  class: kind,
  method,
  params: {},
});
const afterControl = (i, error) => ({
  type: "after",
  callId: "c" + i,
  endTime: i * 2 + 2,
  ...(error ? { error: { name: "Error", message: error } } : {}),
});
const longError =
  "Assertion failed " +
  "long diagnostic context ".repeat(180) +
  ' </script><script>globalThis.TSG_EXECUTED=true</script><img src="x" onerror="globalThis.TSG_EXECUTED=true">';
for (const [id, events, status, expectedActions] of [
  ["empty", [], "complete", 0],
  [
    "unknown",
    [{ type: "unknown-structure", value: "OWN_UNKNOWN_CONTROL_7231" }],
    "incomplete",
    0,
  ],
  [
    "long",
    [beforeControl(0, "Test", "expect"), afterControl(0, longError)],
    "complete",
    1,
  ],
  [
    "large",
    Array.from({ length: 5000 }, (_, i) => [
      beforeControl(i),
      afterControl(i),
    ]).flat(),
    "complete",
    5000,
  ],
]) {
  const metadata = {
    type: "context-options",
    version: 9,
    origin: "testRunner",
    playwrightVersion: "1.63.0",
    options: {},
    wallTime: 1000,
    monotonicTime: 1,
  };
  const zip = new ZipFile();
  zip.addBuffer(
    Buffer.from(
      [metadata, ...events].map((e) => JSON.stringify(e)).join("\n") + "\n",
    ),
    "test.trace",
  );
  zip.end();
  const chunks = [];
  for await (const c of zip.outputStream) chunks.push(c);
  const bytes = Buffer.concat(chunks);
  const input = path.join(consumer, "matcher-inputs", "ui-" + id + ".zip");
  await writeFile(input, bytes);
  const output = path.join("ui-output", id);
  const reduced = command(
    ["report", input, "--out", output],
    status === "incomplete" ? 3 : 0,
  );
  assert.equal(reduced.processingStatus, status);
  assert.equal(reduced.actions, expectedActions);
  command([
    "verify",
    "--report",
    path.join(output, "report.json"),
    "--manifest",
    path.join(output, "manifest.json"),
    "--html",
    path.join(output, "report.html"),
  ]);
  assert.deepEqual(await readFile(input), bytes);
  uiControls.push({
    id,
    syntheticControl: true,
    processingStatus: status,
    actions: reduced.actions,
    inputUnchanged: true,
  });
}
const guardRows = (
  await Promise.all(
    (await readdir(env.TSG_RUNTIME_GUARD_DIR)).map(async (f) =>
      (await readFile(path.join(env.TSG_RUNTIME_GUARD_DIR, f), "utf8"))
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l)),
    ),
  )
).flat();
assert(guardRows.some((r) => r.threadId === 0));
assert(
  guardRows.some((r) => r.threadId > 0),
  "worker must also import guard",
);
assert(
  guardRows.every((r) => r.event === "instrumented"),
  "runtime attempted prohibited access",
);
const bytes = await readFile(tgz);
const evidence = {
  version: doctor.version,
  consumerOutsideCheckout: true,
  devDependenciesInstalled: false,
  browserInstalled: false,
  runtimeNetworkAndChildrenBlocked: true,
  runtimeNetworkAttempts: 0,
  runtimeChildAttempts: 0,
  workerGuardLoaded: true,
  guardNegativeControls: controls,
  matcherResults,
  uiControls,
  commands: [
    "doctor",
    "demo",
    "report actual packaged synthetic trace",
    "verify without literals",
    "verify with literals",
  ],
  actions: report.actions,
  errors: report.errors,
  literalRecheckWithout: "not-performed",
  literalRecheckWith: "performed",
  inputUnchanged: true,
  tgz: {
    name: path.basename(tgz),
    bytes: (await stat(tgz)).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  },
  node: process.versions.node,
  os: process.platform,
  arch: process.arch,
};
await mkdir(".work/evidence", { recursive: true });
await writeFile(
  ".work/evidence/package-consumer.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
await writeFile(".work/final-package-path.txt", tgz + "\n");
await writeFile(".work/consumer-path.txt", consumer + "\n");
console.log(JSON.stringify(evidence, null, 2));
