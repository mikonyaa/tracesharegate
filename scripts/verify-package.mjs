import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const source = process.cwd();
const consumer = await mkdtemp(path.join(tmpdir(), "tracesharegate-consumer-"));
const packageDir = path.join(source, ".work/packages");
await mkdir(packageDir, { recursive: true });
const run = (bin, args, cwd, env = process.env) => {
  const r = spawnSync(bin, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
    timeout: 120000,
  });
  assert.equal(
    r.status,
    0,
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
const command = (args) =>
  JSON.parse(
    run(
      process.execPath,
      ["--import", guard, cli, ...args, "--json"],
      consumer,
      env,
    ),
  );
const doctor = command(["doctor"]);
assert.equal(doctor.version, "0.1.0");
assert.equal(doctor.browserRequired, false);
assert.equal(doctor.networkRequired, false);
const demo = command(["demo", "--out", "demo-output"]);
assert.equal(demo.processingStatus, "complete");
assert(demo.actions > 10);
const fixture = "node_modules/tracesharegate/fixtures/synthetic/assertion.zip";
const before = await readFile(path.join(consumer, fixture));
const report = command(["report", fixture, "--out", "actual-output"]);
assert.equal(report.processingStatus, "complete");
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
const bytes = await readFile(tgz);
const evidence = {
  version: doctor.version,
  consumerOutsideCheckout: true,
  devDependenciesInstalled: false,
  browserInstalled: false,
  runtimeNetworkAndChildrenBlocked: true,
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
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/package-consumer.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
await writeFile(".work/final-package-path.txt", tgz + "\n");
console.log(JSON.stringify(evidence, null, 2));
