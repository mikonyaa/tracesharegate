import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { check } from "../limits/index.js";
import type { Report, Manifest } from "./types.js";
const ajv = new Ajv({ strict: true, allErrors: false });
const validator = (name: string) =>
  ajv.compile(
    JSON.parse(
      readFileSync(
        new URL(`../../schemas/${name}.schema.json`, import.meta.url),
        "utf8",
      ),
    ),
  );
const reportValidator = validator("report");
const manifestValidator = validator("manifest");
export function validateReport(v: unknown): asserts v is Report {
  check(reportValidator(v), "invalid-report-schema");
}
export function validateManifest(v: unknown): asserts v is Manifest {
  check(manifestValidator(v), "invalid-manifest-schema");
}
