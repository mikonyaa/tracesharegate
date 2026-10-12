import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { hash } from "../policy/index.js";
import { check, LIMITS } from "../limits/index.js";
import type { Report, Manifest } from "../schemas/types.js";
const scriptHash = (v: string) =>
  createHash("sha256").update(v).digest("base64");
export async function render(
  report: Report,
  manifest: Manifest,
): Promise<string> {
  const root = new URL("../../dist/viewer/", import.meta.url);
  const [template, css, js] = await Promise.all(
    ["index.html", "viewer.css", "viewer.js"].map((f) =>
      readFile(new URL(f, root), "utf8"),
    ),
  );
  const json = JSON.stringify(report, null, 2) + "\n";
  const snapshot = {
    ...manifest,
    outputArtifacts: [
      {
        name: "report.json",
        sha256: hash(json),
        bytes: Buffer.byteLength(json),
      },
    ],
  };
  const data = JSON.stringify({
    report,
    entries: manifest.entries,
    omissionManifest: snapshot,
  })
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const styleBody = template!.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  const scriptBody = template!.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  check(
    styleBody !== undefined && scriptBody !== undefined,
    "renderer-template",
  );
  const styleHash = scriptHash(styleBody.replace("__CSS__", () => css!));
  const jsHash = scriptHash(scriptBody.replace("__JS__", () => js!));
  const csp = `default-src 'none'; script-src 'sha256-${jsHash}'; style-src 'sha256-${styleHash}'; img-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const slots: Record<string, string> = {
    __CSP__: csp,
    __CSS__: css!,
    __DATA__: data,
    __JS__: js!,
  };
  // Insert each trusted slot once. Imported text resembling a slot stays data.
  const html = template!.replace(
    /__(?:CSP|CSS|DATA|JS)__/g,
    (slot) => slots[slot]!,
  );
  check(Buffer.byteLength(html) <= LIMITS.outputBytes, "output-byte-limit");
  return html;
}
