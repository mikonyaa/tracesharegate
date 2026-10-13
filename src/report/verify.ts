import { snapshot } from "../zip/index.js";
import { isDeepStrictEqual } from "node:util";
import { GateError, check, LIMITS, jsonArtifact } from "../limits/index.js";
import {
  POLICY,
  POLICY_HASH,
  hash,
  ADAPTER,
  LEGACY_POLICY,
} from "../policy/index.js";
import { validateReport, validateManifest } from "../schemas/index.js";
import { Redactor } from "../redaction/index.js";
import { render } from "./render.js";
async function bounded(file: string): Promise<Buffer> {
  try {
    const { bytes } = await snapshot(file, {
      ...LIMITS,
      inputBytes: LIMITS.outputBytes,
    });
    return bytes;
  } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError("verify-io");
  }
}
export async function verifyFiles(
  reportPath: string,
  manifestPath: string,
  htmlPath: string,
  literals: string[] = [],
) {
  const reportBytes = await bounded(reportPath),
    manifestBytes = await bounded(manifestPath),
    htmlBytes = await bounded(htmlPath);
  const report = jsonArtifact(reportBytes.toString("utf8")),
    manifest = jsonArtifact(manifestBytes.toString("utf8"));
  validateReport(report);
  validateManifest(manifest);
  if (
    isDeepStrictEqual(report.policy, LEGACY_POLICY) &&
    isDeepStrictEqual(manifest.policy, LEGACY_POLICY)
  )
    throw new GateError("legacy-policy-reduction-required", 3);
  if (
    report.policy.id !== POLICY.id ||
    report.policy.version !== POLICY.version ||
    report.policy.fingerprint !== POLICY_HASH ||
    manifest.policy.id !== POLICY.id ||
    manifest.policy.version !== POLICY.version ||
    manifest.policy.fingerprint !== POLICY_HASH
  )
    throw new GateError("unsupported-policy", 3);
  const same = (a: unknown, b: unknown) =>
    check(isDeepStrictEqual(a, b), "artifact-consistency");
  for (const key of [
    "tool",
    "input",
    "policy",
    "processingStatus",
    "coverage",
    "needsReview",
    "redactionSummary",
    "omissionSummary",
  ] as const)
    same(report[key], manifest[key]);
  same(report.adapter, manifest.parser);
  same(report.adapter, ADAPTER);
  same(report.coverage.issues, manifest.unsupportedStructures);
  check(
    report.processingStatus === report.coverage.recognizedSchema,
    "coverage-consistency",
  );
  check(
    report.coverage.streams === report.contexts.length,
    "coverage-consistency",
  );
  if (report.processingStatus === "complete")
    check(
      report.coverage.issues.length === 0 &&
        report.coverage.processedRetainedFields === "complete",
      "coverage-consistency",
    );
  const contexts = new Map(report.contexts.map((c) => [c.id, c]));
  check(contexts.size === report.contexts.length, "duplicate-context-id");
  const actions = new Map(report.actions.map((a) => [a.id, a]));
  check(actions.size === report.actions.length, "duplicate-action-id");
  const errors = new Map(report.errors.map((e) => [e.id, e]));
  check(errors.size === report.errors.length, "duplicate-error-id");
  for (const a of report.actions) {
    check(
      contexts.has(a.contextId) && contexts.get(a.contextId)?.lane === a.lane,
      "action-context-consistency",
    );
    check(
      a.operationKnown === (a.operation !== "Unknown operation"),
      "operation-consistency",
    );
    if (a.outcome === "passed" || a.outcome === "failed")
      check(
        a.operationKnown &&
          a.startMs !== null &&
          a.endMs !== null &&
          a.durationMs !== null &&
          a.endMs >= a.startMs &&
          Math.abs(a.endMs - a.startMs - a.durationMs) < 0.003,
        "action-time-consistency",
      );
    if (a.outcome === "passed")
      check(a.errorIds.length === 0, "action-error-consistency");
    if (a.outcome === "failed")
      check(a.errorIds.length > 0, "action-error-consistency");
    for (const id of a.errorIds)
      check(
        errors.get(id)?.actionId === a.id &&
          errors.get(id)?.contextId === a.contextId,
        "action-error-consistency",
      );
    if (a.parentId) {
      const p = actions.get(a.parentId);
      check(
        p &&
          p.contextId === a.contextId &&
          p.eventIndex < a.eventIndex &&
          p.startMs !== null &&
          a.startMs !== null &&
          p.endMs !== null &&
          a.endMs !== null &&
          p.startMs <= a.startMs &&
          p.endMs >= a.endMs,
        "parent-consistency",
      );
    }
  }
  for (const e of report.errors)
    check(
      contexts.has(e.contextId) &&
        (!e.actionId || actions.get(e.actionId)?.errorIds.includes(e.id)),
      "error-consistency",
    );
  const entries = new Map(manifest.entries.map((e) => [e.id, e]));
  check(entries.size === manifest.entries.length, "entry-consistency");
  for (const e of manifest.entries) {
    check(
      e.contentsInspected === (e.actualProcessedBytes !== null),
      "entry-inspection-consistency",
    );
    if (e.actualProcessedBytes !== null)
      check(
        e.actualProcessedBytes === e.declaredUncompressedBytes,
        "entry-size-consistency",
      );
    if (e.disposition === "retained-derived")
      check(
        e.category === "trace-stream" && e.contentsInspected,
        "entry-policy-consistency",
      );
  }
  for (const r of manifest.resources)
    check(entries.has(r.entryId), "resource-consistency");
  check(
    manifest.outputArtifacts.length === 2 &&
      new Set(manifest.outputArtifacts.map((x) => x.name)).size === 2,
    "artifact-hash-contract",
  );
  for (const [name, bytes] of [
    ["report.json", reportBytes],
    ["report.html", htmlBytes],
  ] as const) {
    const a = manifest.outputArtifacts.find((x) => x.name === name);
    check(
      a?.sha256 === hash(bytes) && a.bytes === bytes.length,
      "artifact-hash-mismatch",
    );
  }
  // Reconstruct the trusted renderer. Never evaluate imported HTML or scripts.
  const expected = await render(report, manifest);
  check(htmlBytes.equals(Buffer.from(expected)), "html-renderer-mismatch");
  const redactor = new Redactor(literals);
  for (const e of report.errors) redactor.assertErrorContext(e.message);
  const work: unknown[] = [report, manifest];
  while (work.length) {
    const v = work.pop();
    if (typeof v === "string") {
      redactor.assertBuiltin(v);
      redactor.assertLiterals(v);
    } else if (Array.isArray(v)) {
      for (const x of v) work.push(x);
    } else if (v && typeof v === "object") {
      for (const x of Object.values(v)) work.push(x);
    }
  }
  for (const b of [reportBytes, manifestBytes, htmlBytes]) {
    redactor.assertLiterals(b.toString("utf8"));
    redactor.assertBuiltin(b.toString("utf8"));
  }
  return {
    schemaVerification: "passed",
    hashVerification: "passed",
    policyVerification: "passed",
    policyVersion: report.policy.version,
    assertionContextRecheck: "performed",
    htmlVerification: "trusted-renderer-match",
    builtinRecheck: "performed",
    literalRecheck: literals.length ? "performed" : "not-performed",
    processingStatus: report.processingStatus,
    needsReview: true,
    meaning:
      "Verification checks consistency and bounded rules, not absence of sensitive information.",
  };
}
