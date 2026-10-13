import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { reduce } from "../../src/report/process.js";
import { writeReport } from "../../src/report/write.js";
import { verifyFiles } from "../../src/report/verify.js";
import { hash } from "../../src/policy/index.js";
import { render } from "../../src/report/render.js";
import { archive, before, after } from "../helpers/archive.js";

for (const attack of [
  "report-bytes",
  "manifest-reference",
  "html-bytes",
  "html-refreshed-hash",
  "policy-fingerprint",
  "manifest-policy-version",
] as const)
  test("independent bundle tamper rejected: " + attack, async () => {
    const r = await reduce(await archive([before(), after()]));
    const output = path.join(
      await mkdtemp(path.join(tmpdir(), "tracesharegate-tamper-")),
      "bundle",
    );
    await writeReport(output, r.report, r.manifest, []);
    const files = ["report.json", "manifest.json", "report.html"].map((f) =>
      path.join(output, f),
    );
    const original = await Promise.all(files.map((f) => readFile(f)));
    const report = JSON.parse(original[0]!.toString());
    const manifest = JSON.parse(original[1]!.toString());
    let expected: RegExp;
    if (attack === "report-bytes") {
      await writeFile(
        files[0]!,
        Buffer.concat([original[0]!, Buffer.from(" ")]),
      );
      expected = /artifact-hash-mismatch/;
    } else if (attack === "html-bytes" || attack === "html-refreshed-hash") {
      const html = original[2]!.toString() + "<!-- edited -->";
      await writeFile(files[2]!, html);
      if (attack === "html-refreshed-hash") {
        const ref = manifest.outputArtifacts.find(
          (a: { name: string }) => a.name === "report.html",
        );
        ref.sha256 = hash(html);
        ref.bytes = Buffer.byteLength(html);
        await writeFile(files[1]!, JSON.stringify(manifest));
      }
      expected =
        attack === "html-bytes"
          ? /artifact-hash-mismatch/
          : /html-renderer-mismatch/;
    } else if (attack === "manifest-reference") {
      manifest.resources.push({
        entryId: "entry-999",
        category: "network",
        references: 1,
      });
      // Coherent byte hashes and trusted HTML do not make an invalid reference valid.
      const html = await render(report, manifest);
      const ref = manifest.outputArtifacts.find(
        (a: { name: string }) => a.name === "report.html",
      );
      ref.sha256 = hash(html);
      ref.bytes = Buffer.byteLength(html);
      await writeFile(files[2]!, html);
      await writeFile(files[1]!, JSON.stringify(manifest));
      expected = /resource-consistency/;
    } else {
      if (attack === "policy-fingerprint")
        report.policy.fingerprint = manifest.policy.fingerprint = "f".repeat(
          64,
        );
      else manifest.policy.version = 99;
      await writeFile(files[0]!, JSON.stringify(report));
      await writeFile(files[1]!, JSON.stringify(manifest));
      expected = /unsupported-policy/;
    }
    await assert.rejects(
      verifyFiles(files[0]!, files[1]!, files[2]!),
      expected,
    );
  });
