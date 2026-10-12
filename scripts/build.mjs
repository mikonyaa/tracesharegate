import { spawnSync } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import { build } from "esbuild";
const result = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc"],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 2);
await mkdir("dist/viewer", { recursive: true });
await build({
  entryPoints: ["src/viewer/viewer.ts"],
  outfile: "dist/viewer/viewer.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  sourcemap: false,
});
for (const f of ["index.html", "viewer.css"])
  await copyFile("src/viewer/" + f, "dist/viewer/" + f);
await mkdir("dist/schemas", { recursive: true });
for (const f of ["report", "manifest", "policy"])
  await copyFile(
    "schemas/" + f + ".schema.json",
    "dist/schemas/" + f + ".schema.json",
  );
console.error("Built CLI, schemas and standalone viewer.");
