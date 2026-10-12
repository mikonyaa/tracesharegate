import { readFile, writeFile, mkdir, mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { rawEntries } from "../tests/helpers/archive.ts";
const repo = "mikonyaa/tracesharegate",
  version = "0.1.0",
  tag = "v" + version;
const source = "9c88a2be964a772c9cf8666b0ac4ac4d44476fd3";
const expectedPackageHash =
  "56ed585522d9092faf12d81007a9f9dabfa738a719bd7648ab874071f9be2d1e";
const root = await mkdtemp(path.join(tmpdir(), "tracesharegate-public-qa-"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const get = async (url) => {
  const r = await fetch(url, {
    headers: { "User-Agent": "TraceShareGate-anonymous-QA" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(r.status, 200, "Anonymous HTTP failed");
  const chunks = [];
  let size = 0;
  for await (const b of r.body) {
    size += b.length;
    assert(size <= 16 * 1024 * 1024);
    chunks.push(Buffer.from(b));
  }
  return Buffer.concat(chunks);
};
const repository = JSON.parse(
  (await get("https://api.github.com/repos/" + repo)).toString(),
);
assert.equal(repository.id, 1416146616);
assert.equal(repository.private, false);
assert(
  (await get("https://github.com/" + repo))
    .toString()
    .includes("TraceShareGate"),
);
const readme = (
  await get(`https://raw.githubusercontent.com/${repo}/${source}/README.md`)
).toString();
assert(readme.includes("needsReview"));
assert(readme.includes("1.63.0"));
assert(
  (await get(`https://raw.githubusercontent.com/${repo}/${source}/LICENSE`))
    .toString()
    .startsWith("MIT License"),
);
assert(
  (
    await get(
      `https://raw.githubusercontent.com/${repo}/${source}/src/report/process.ts`,
    )
  )
    .toString()
    .includes("Timeline"),
);
let ref = JSON.parse(
  (
    await get(`https://api.github.com/repos/${repo}/git/ref/tags/${tag}`)
  ).toString(),
).object;
if (ref.type === "tag")
  ref = JSON.parse(
    (
      await get(`https://api.github.com/repos/${repo}/git/tags/${ref.sha}`)
    ).toString(),
  ).object;
assert.equal(ref.sha, source);
const release = JSON.parse(
  (
    await get(`https://api.github.com/repos/${repo}/releases/tags/${tag}`)
  ).toString(),
);
assert.equal(release.draft, false);
assert.equal(release.tag_name, tag);
const names = [
  `tracesharegate-${version}.tgz`,
  `tracesharegate-example-${version}.zip`,
  "release-manifest.json",
  "SHA256SUMS",
];
assert.deepEqual(release.assets.map((a) => a.name).sort(), names.sort());
for (const asset of release.assets) {
  const bytes = await get(asset.browser_download_url);
  assert.equal(bytes.length, asset.size);
  await writeFile(path.join(root, asset.name), bytes);
}
const manifest = JSON.parse(
  await readFile(path.join(root, "release-manifest.json"), "utf8"),
);
assert.equal(manifest.sourceCommit, source);
assert.equal(manifest.buildOrigin, "github-actions");
assert.equal(manifest.ci.runId, "38310948028");
for (const a of manifest.assets) {
  const bytes = await readFile(path.join(root, a.name));
  assert.equal(sha(bytes), a.sha256);
  assert.equal(bytes.length, a.bytes);
}
for (const line of (await readFile(path.join(root, "SHA256SUMS"), "utf8"))
  .trim()
  .split("\n")) {
  const [hash, name] = line.split("  ");
  assert(names.includes(name));
  assert.equal(sha(await readFile(path.join(root, name))), hash);
}
const tgz = path.join(root, `tracesharegate-${version}.tgz`);
const bytes = await readFile(tgz);
assert.equal(bytes[0], 31);
assert.equal(bytes[1], 139);
assert.equal(sha(bytes), expectedPackageHash);
const consumer = path.join(root, "consumer");
await mkdir(consumer);
await writeFile(path.join(consumer, "package.json"), '{"private":true}\n');
await writeFile(
  path.join(root, "empty.npmrc"),
  "registry=https://registry.npmjs.org/\n",
);
await writeFile(path.join(root, "global.npmrc"), "");
const env = {
  ...process.env,
  npm_config_userconfig: path.join(root, "empty.npmrc"),
  npm_config_globalconfig: path.join(root, "global.npmrc"),
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, "absent-browsers"),
};
delete env.NODE_PATH;
delete env.NODE_OPTIONS;
const run = (bin, args) => {
  const r = spawnSync(bin, args, {
    cwd: consumer,
    env,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 5 * 1024 * 1024,
  });
  assert.equal(
    r.status,
    0,
    "Public consumer command failed: " + (r.stderr ?? "").slice(0, 300),
  );
  return r.stdout;
};
run("npm", [
  "install",
  "--ignore-scripts",
  "--omit=dev",
  "--no-audit",
  "--no-fund",
  tgz,
]);
for (const dev of ["playwright", "playwright-core", "@playwright/test", "tsx"])
  await assert.rejects(access(path.join(consumer, "node_modules", dev)));
const cli = path.join(consumer, "node_modules/tracesharegate/dist/cli.js");
const guard = path.resolve("scripts/runtime-guard.mjs");
const command = (args) =>
  JSON.parse(
    run(process.execPath, ["--import", guard, cli, ...args, "--json"]),
  );
assert.equal(command(["doctor"]).version, version);
command(["demo", "--out", "demo"]);
const fixture = "node_modules/tracesharegate/fixtures/synthetic/assertion.zip";
const original = await readFile(path.join(consumer, fixture));
const result = command(["report", fixture, "--out", "actual"]);
assert.equal(result.processingStatus, "complete");
assert.equal(result.actions, 33);
assert.equal(sha(original), sha(await readFile(path.join(consumer, fixture))));
const verify = [
  "verify",
  "--report",
  "actual/report.json",
  "--manifest",
  "actual/manifest.json",
  "--html",
  "actual/report.html",
];
assert.equal(command(verify).literalRecheck, "not-performed");
await writeFile(
  path.join(consumer, "known.json"),
  JSON.stringify(['TSG_SYNTHETIC_CANARY_09_"<&Ж🙂']),
);
assert.equal(
  command([...verify, "--secrets-file", "known.json"]).literalRecheck,
  "performed",
);
const bundle = await rawEntries(
  path.join(root, `tracesharegate-example-${version}.zip`),
);
assert.deepEqual(
  bundle.map((e) => e.name).sort(),
  ["report.json", "report.html", "manifest.json", "README.txt"].sort(),
);
const example = path.join(consumer, "example");
await mkdir(example);
for (const e of bundle) {
  assert(!e.data.toString().includes("TSG_SYNTHETIC_CANARY"));
  await writeFile(path.join(example, e.name), e.data);
}
command([
  "verify",
  "--report",
  "example/report.json",
  "--manifest",
  "example/manifest.json",
  "--html",
  "example/report.html",
]);
const report = JSON.parse(
  await readFile(path.join(example, "report.json"), "utf8"),
);
assert.equal(report.input.sha256, sha(original));
const pageUrl = "https://mikonyaa.github.io/tracesharegate/";
for (const e of bundle.filter((e) => e.name !== "README.txt"))
  assert.deepEqual(await get(pageUrl + e.name), e.data);
const browser = await chromium.launch();
const controls = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      acceptDownloads: true,
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const requests = [];
    const errors = [];
    page.on("request", (r) => requests.push(r.url()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pageUrl);
    await page
      .getByRole("heading", { name: "Assertion", exact: true })
      .waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: "Assertion", exact: true })
      .waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(!(await page.content()).includes("TSG_SYNTHETIC_CANARY"));
    await page.getByLabel("Search retained text").fill("navigate");
    assert.equal(await page.locator(".action").count(), 1);
    await page.getByLabel("Search retained text").fill("");
    await page.getByLabel("Status", { exact: true }).selectOption("failed");
    assert.equal(await page.locator(".action").count(), 2);
    await page
      .getByRole("button", { name: "Copy sanitized text", exact: true })
      .click();
    await page.getByText("Sanitized text copied.", { exact: true }).waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert(!copied.includes("TSG_SYNTHETIC_CANARY"));
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download omission manifest" })
      .click();
    const d = await download;
    assert.equal(d.suggestedFilename(), "omission-manifest.json");
    assert(
      !(await readFile(await d.path(), "utf8")).includes(
        "TSG_SYNTHETIC_CANARY",
      ),
    );
    assert.deepEqual(errors, []);
    assert(
      requests.every((u) => u.startsWith(pageUrl) || u.startsWith("blob:")),
    );
    await page.screenshot({
      path: `output/playwright/public-${width}.png`,
      fullPage: true,
    });
    controls.push({
      width,
      hardRefresh: true,
      search: true,
      filter: true,
      copy: true,
      download: true,
      overflow: false,
      externalRequests: 0,
      sourceLeakage: false,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
const evidence = {
  repositoryId: repository.id,
  version,
  releaseURL: release.html_url,
  releaseCommit: source,
  CI: manifest.ci,
  pageURL: pageUrl,
  anonymousSourceRead: true,
  anonymousDownloads: true,
  assetHashesMatched: true,
  packageSHA256: expectedPackageHash,
  packageBytes: bytes.length,
  consumerOutsideCheckout: true,
  devDependencies: false,
  browserRequired: false,
  runtimeNetworkAndChildrenBlocked: true,
  actions: result.actions,
  errors: result.errors,
  canaryMatches: 0,
  inputUnchanged: true,
  literalWithoutFile: "not-performed",
  literalWithFile: "performed",
  publishedExampleVerified: true,
  pagesBytesMatchRelease: true,
  liveControls: controls,
  node: process.versions.node,
  os: process.platform,
  arch: process.arch,
};
await writeFile(
  "docs/evidence/public-results.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
