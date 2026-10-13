import { execFileSync } from "node:child_process";
import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const allowed = [
  "src/",
  "schemas/",
  "scripts/",
  "tests/",
  "fixtures/synthetic/",
  "fixtures/provenance/",
  "docs/",
  "licenses/",
  ".github/workflows/",
];
const rootAllowed = new Set([
  "README.md",
  "LICENSE",
  "NOTICE",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.js",
  ".gitignore",
  "fixtures/playwright.config.ts",
]);
const legacyAllowed = new Set([
  "fixtures/legacy-policy/README.md",
  "fixtures/legacy-policy/manifest.json",
  "fixtures/legacy-policy/report.html",
  "fixtures/legacy-policy/report.json",
]);
assert.equal(new Set(files).size, files.length, "Duplicate public path");
for (const f of files) {
  assert(
    rootAllowed.has(f) ||
      legacyAllowed.has(f) ||
      allowed.some((p) => f.startsWith(p)),
    "Unexpected public path",
  );
  assert(
    !/(?:^|\/)(?:local-policy|\.work|node_modules|output|site)(?:\/|$)|\.env$|\.map$|\.tgz$/.test(
      f,
    ),
    "Private/generated path staged",
  );
  const s = await lstat(f);
  assert(s.isFile(), "Public path is not a regular file");
  assert(s.size < 2 * 1024 * 1024, "Unexpected large public asset");
  if (f.endsWith(".zip"))
    assert(
      [
        "fixtures/synthetic/assertion.zip",
        "fixtures/synthetic/timeout.zip",
        "fixtures/synthetic/navigation.zip",
        "fixtures/synthetic/browser-only.zip",
      ].includes(f),
      "Trace outside explicit synthetic allowlist",
    );
}
const names = await readdir("site");
assert.deepEqual(
  names.sort(),
  [
    ".nojekyll",
    "index.html",
    "manifest.json",
    "report.html",
    "report.json",
  ].sort(),
);
for (const f of ["report.html", "report.json", "manifest.json"]) {
  const text = await readFile(path.join("site", f), "utf8");
  assert(!text.includes("TSG_SYNTHETIC_CANARY"));
  assert(!text.includes("/Users/"));
  assert(!text.includes("getByTestId"));
  assert(!text.includes("Submit sample"));
}
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert(!pkg.dependencies["playwright"]);
assert(!pkg.dependencies["@playwright/test"]);
assert(!pkg.scripts.postinstall);
const pack = JSON.parse(await readFile(".work/pack.json", "utf8"))[0];
assert.equal(pack.version, pkg.version);
assert(pack.files.some((f) => f.path === "dist/viewer/viewer.js"));
assert(pack.files.some((f) => f.path === "fixtures/synthetic/assertion.zip"));
assert(
  !pack.files.some(
    (f) =>
      f.path.startsWith("docs/evidence/") ||
      f.path.startsWith("docs/demo/") ||
      f.path.startsWith("fixtures/legacy-policy/") ||
      f.path.includes("local-policy"),
  ),
);
const releaseNames = await readdir(".work/release-upload");
assert.deepEqual(
  releaseNames.sort(),
  [
    `tracesharegate-${pkg.version}.tgz`,
    `tracesharegate-example-${pkg.version}.zip`,
    "SHA256SUMS",
    "release-manifest.json",
  ].sort(),
);
console.log(
  "Public allowlist audit passed: own synthetic fixtures, reduced site, runtime resources and four Release assets.",
);
