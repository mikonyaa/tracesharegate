import {
  mkdir,
  mkdtemp,
  copyFile,
  writeFile,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { reduce, writeReport, verifyFiles } from "../dist/index.js";
const root = await mkdtemp(path.join(tmpdir(), "tracesharegate-site-"));
const r = await reduce("fixtures/synthetic/assertion.zip", [
  'TSG_SYNTHETIC_CANARY_09_"<&Ж🙂',
]);
const report = path.join(root, "demo");
await writeReport(report, r.report, r.manifest, [
  'TSG_SYNTHETIC_CANARY_09_"<&Ж🙂',
]);
await verifyFiles(
  path.join(report, "report.json"),
  path.join(report, "manifest.json"),
  path.join(report, "report.html"),
);
await mkdir("site", { recursive: true });
for (const f of ["report.html", "report.json", "manifest.json"])
  await copyFile(path.join(report, f), path.join("site", f));
// Redirect to the exact report bytes, preserving manifest output hashes.
await writeFile(
  "site/index.html",
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=report.html"><title>TraceShareGate synthetic demo</title><p><a href="report.html">Open the synthetic reduced report</a></p></html>\n',
);
await writeFile("site/.nojekyll", "");
for (const f of ["report.html", "report.json", "manifest.json"])
  if ((await readFile("site/" + f, "utf8")).includes("TSG_SYNTHETIC_CANARY"))
    throw new Error("Site canary retention");
console.log(
  "Built allowlisted static site from a genuine synthetic runner trace.",
);
