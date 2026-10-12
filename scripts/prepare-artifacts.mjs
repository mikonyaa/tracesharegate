import { mkdir, readFile, copyFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ZipFile } from "yazl";
import { execFileSync } from "node:child_process";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const tgz = (await readFile(".work/final-package-path.txt", "utf8")).trim();
const dir = ".work/release-upload";
await mkdir(dir, { recursive: true });
const packageName = `tracesharegate-${pkg.version}.tgz`;
await copyFile(tgz, path.join(dir, packageName));
const bundleName = `tracesharegate-example-${pkg.version}.zip`;
const zip = new ZipFile();
for (const name of ["report.json", "report.html", "manifest.json"])
  zip.addBuffer(await readFile("site/" + name), name);
zip.addBuffer(
  Buffer.from(
    "Own synthetic Playwright 1.63.0 runner assertion report. Open report.html locally. Review retained text. The canonical manifest hashes report.json/report.html, not itself.\n",
  ),
  "README.txt",
);
zip.end();
const chunks = [];
for await (const c of zip.outputStream) chunks.push(c);
await writeFile(path.join(dir, bundleName), Buffer.concat(chunks));
const assets = [];
for (const name of [packageName, bundleName]) {
  const b = await readFile(path.join(dir, name));
  assets.push({
    name,
    bytes: (await stat(path.join(dir, name))).size,
    sha256: createHash("sha256").update(b).digest("hex"),
  });
}
const recording = JSON.parse(
  await readFile("fixtures/provenance/recording.json", "utf8"),
);
const report = JSON.parse(await readFile("site/report.json", "utf8"));
let sourceCommit = process.env.GITHUB_SHA ?? null;
if (!sourceCommit) {
  try {
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* Pre-publication local gate has no commit yet. */
  }
}
const ci = process.env.GITHUB_RUN_ID
  ? {
      runId: process.env.GITHUB_RUN_ID,
      url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      event: process.env.GITHUB_EVENT_NAME,
      workflow: process.env.GITHUB_WORKFLOW,
      headSha: process.env.GITHUB_SHA,
      ref: process.env.GITHUB_REF,
    }
  : null;
const manifest = {
  schemaVersion: 1,
  tool: "tracesharegate",
  version: pkg.version,
  sourceCommit,
  adapter: report.adapter,
  policy: report.policy,
  testedPlaywright: recording.playwright,
  testedBrowser: recording.browser,
  node: process.versions.node,
  os: process.platform,
  arch: process.arch,
  buildOrigin: ci ? "github-actions" : "local-prepublication",
  ci,
  assets,
  meaning:
    "Build provenance and consistency metadata; not a cryptographic attestation or privacy certificate.",
};
const manifestName = "release-manifest.json";
await writeFile(
  path.join(dir, manifestName),
  JSON.stringify(manifest, null, 2) + "\n",
);
const m = await readFile(path.join(dir, manifestName));
const sums =
  [
    ...assets.map((a) => a.sha256 + "  " + a.name),
    createHash("sha256").update(m).digest("hex") + "  " + manifestName,
  ].join("\n") + "\n";
await writeFile(path.join(dir, "SHA256SUMS"), sums);
console.log("Prepared four allowlisted assets from the tested final tarball.");
