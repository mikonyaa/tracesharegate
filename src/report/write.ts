import { mkdir, writeFile, rename, lstat, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { GateError, check, LIMITS } from "../limits/index.js";
import { hash } from "../policy/index.js";
import { Redactor } from "../redaction/index.js";
import { validateReport, validateManifest } from "../schemas/index.js";
import { render } from "./render.js";
import type { Report, Manifest } from "../schemas/types.js";
export async function writeReport(
  out: string,
  report: Report,
  manifest: Manifest,
  literals: string[],
): Promise<void> {
  validateReport(report);
  const json = JSON.stringify(report, null, 2) + "\n";
  const html = await render(report, manifest);
  manifest.outputArtifacts = [
    { name: "report.json", sha256: hash(json), bytes: Buffer.byteLength(json) },
    { name: "report.html", sha256: hash(html), bytes: Buffer.byteLength(html) },
  ];
  validateManifest(manifest);
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const redactor = new Redactor(literals);
  for (const text of [json, html, manifestText]) {
    check(Buffer.byteLength(text) <= LIMITS.outputBytes, "output-byte-limit");
    redactor.assertLiterals(text);
  }
  for (const error of report.errors)
    for (const text of [error.message, error.name])
      if (text !== null) redactor.assertBuiltin(text);
  const target = path.resolve(out);
  let reserved = false,
    staged = false;
  const temp = path.join(
    path.dirname(target),
    ".tracesharegate-" + randomBytes(12).toString("hex"),
  );
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await mkdir(target, { mode: 0o700 });
    reserved = true;
    const own = await lstat(target);
    await mkdir(temp, { mode: 0o700 });
    staged = true;
    await writeFile(path.join(temp, "report.json"), json, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(path.join(temp, "report.html"), html, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(path.join(temp, "manifest.json"), manifestText, {
      flag: "wx",
      mode: 0o600,
    });
    const current = await lstat(target);
    check(current.ino === own.ino && current.dev === own.dev, "output-changed");
    await rename(temp, target);
    staged = false;
    reserved = false;
  } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError("output-exists-or-io");
  } finally {
    if (staged) await rm(temp, { recursive: true, force: true });
    if (reserved) await rmdir(target).catch(() => {});
  }
}
