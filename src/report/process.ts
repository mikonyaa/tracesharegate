import { snapshot, inventory, Reader } from "../zip/index.js";
import {
  check,
  object,
  parseBounded,
  LIMITS,
  type Budget,
} from "../limits/index.js";
import { ADAPTER, VERSION, POLICY, POLICY_HASH } from "../policy/index.js";
import { Timeline } from "../timeline/index.js";
import { Redactor } from "../redaction/index.js";
import {
  schemaUnknown,
  eventCategory,
  references,
} from "../adapters/playwright-supported/index.js";
import type {
  Report,
  Manifest,
  Issue,
  Omission,
  ResourceLink,
} from "../schemas/types.js";
export async function inspectArchive(input: string, budget: Budget = LIMITS) {
  const snap = await snapshot(input, budget);
  const inv = await inventory(snap.bytes, budget);
  try {
    return {
      schemaVersion: 1,
      input: { sha256: snap.sha256, bytes: snap.bytes.length },
      inventoryComplete: true,
      meaning: "Inventory is not permission to share.",
      entries: inv.entries.map((e) => e.public),
    };
  } finally {
    inv.zip.close();
  }
}
export async function reduce(
  input: string,
  literals: string[] = [],
  budget: Budget = LIMITS,
): Promise<{ report: Report; manifest: Manifest; exitCode: number }> {
  const snap = await snapshot(input, budget);
  const inv = await inventory(snap.bytes, budget);
  const redactor = new Redactor(literals);
  const issues: Issue[] = [];
  const issue = (value: Omit<Issue, "count">) => {
    const prior = issues.find(
      (x) =>
        x.code === value.code &&
        x.entryId === value.entryId &&
        x.schemaPath === value.schemaPath,
    );
    if (prior) prior.count++;
    else {
      check(issues.length < 20000, "issue-limit");
      issues.push({ ...value, count: 1 });
    }
  };
  const omissions: Omission[] = POLICY.omitted.map((category) => ({
    category,
    eventCount: 0,
    entryCount: 0,
    resourceReferenceCount: 0,
    reason: "excluded-by-minimal-v1",
  }));
  const omit = (
    category: string,
    kind: "eventCount" | "entryCount" | "resourceReferenceCount",
  ) => {
    const row = omissions.find((x) => x.category === category);
    if (row) row[kind]++;
  };
  const timeline = new Timeline(redactor, issue, budget);
  const reader = new Reader(inv.zip, budget);
  let supported = 0,
    unsupported = 0;
  const streamSupport = new Map<string, boolean>();
  const links = new Map<string, ResourceLink>();
  let referenceCount = 0;
  const lookup = new Map(
    inv.entries.flatMap(
      (e) =>
        [
          [e.name, e],
          [e.name.replace(/^resources\//, ""), e],
        ] as const,
    ),
  );
  try {
    for (const entry of inv.entries) {
      if (entry.public.category === "unknown")
        issue({
          code: "unknown-entry-category",
          entryId: entry.public.id,
          eventIndex: null,
          schemaPath: "archive.entries[]",
        });
      else
        omit(
          entry.public.category === "network-stream"
            ? "network"
            : entry.public.category,
          "entryCount",
        );
    }
    for (const entry of inv.entries.filter(
      (e) => e.public.category === "trace-stream",
    )) {
      let lane: ReturnType<Timeline["stream"]> | null = null;
      let recognized = false;
      let metadata = false;
      await reader.lines(entry, (line, index) => {
        if (metadata && !recognized) return;
        const value = parseBounded(line, budget);
        if (!object(value)) {
          issue({
            code: "invalid-event-structure",
            entryId: entry.public.id,
            eventIndex: index,
            schemaPath: "events[]",
          });
          return;
        }
        const e = value;
        if (!metadata) {
          metadata = true;
          if (
            e.type !== "context-options" ||
            e.version !== 9 ||
            e.playwrightVersion !== "1.63.0"
          ) {
            unsupported++;
            issue({
              code: "unsupported-trace-metadata",
              entryId: entry.public.id,
              eventIndex: index,
              schemaPath: "events[].context-options",
            });
            return;
          }
          recognized = true;
          supported++;
          entry.public.disposition = "retained-derived";
          entry.public.reason = "allowlisted-derived-fields";
          entry.public.retainedFieldPaths = [
            "contexts[]",
            "actions[]",
            "errors[]",
          ];
          const origin =
            e.origin === "testRunner"
              ? "runner"
              : e.origin === "library"
                ? "browser"
                : "unknown";
          if (origin === "unknown")
            issue({
              code: "unknown-origin",
              entryId: entry.public.id,
              eventIndex: index,
              schemaPath: "events[].origin",
            });
          lane = timeline.stream(entry.public.id, origin);
        } else if (e.type === "context-options") {
          issue({
            code: "duplicate-context-metadata",
            entryId: entry.public.id,
            eventIndex: index,
            schemaPath: "events[].context-options",
          });
          if (e.version !== 9 || e.playwrightVersion !== "1.63.0") {
            recognized = false;
            unsupported++;
          }
          return;
        }
        for (const code of schemaUnknown(e))
          issue({
            code,
            entryId: entry.public.id,
            eventIndex: index,
            schemaPath: "events[]",
          });
        const category = eventCategory(e.type);
        if (category) omit(category, "eventCount");
        if (e.type === "before" || e.type === "action") {
          omit("test-and-step-titles", "eventCount");
          omit("source-and-stacks", "eventCount");
        }
        if (e.type === "after" || e.type === "action") {
          if (e.attachments) omit("attachments", "eventCount");
          if (object(e.error) && e.error.stack)
            omit("source-and-stacks", "eventCount");
        }
        lane?.consume(e, index);
        recordReferences(e, entry.public.id, index);
      });
      if (!metadata) {
        unsupported++;
        issue({
          code: "missing-context-metadata",
          entryId: entry.public.id,
          eventIndex: null,
          schemaPath: "events[].context-options",
        });
      }
      if (!recognized) {
        entry.public.disposition = "unknown";
        entry.public.reason = "unsupported-stream";
      }
      (lane as ReturnType<Timeline["stream"]> | null)?.complete();
      streamSupport.set(entry.name.slice(0, -6), recognized);
    }
    for (const entry of inv.entries.filter(
      (e) => e.public.category === "network-stream",
    )) {
      if (!streamSupport.get(entry.name.slice(0, -8))) {
        issue({
          code: "unverified-network-scope",
          entryId: entry.public.id,
          eventIndex: null,
          schemaPath: "archive.entries[]",
        });
        continue;
      }
      await reader.lines(entry, (line, index) => {
        const e = parseBounded(line, budget);
        if (!object(e)) {
          issue({
            code: "invalid-event-structure",
            entryId: entry.public.id,
            eventIndex: index,
            schemaPath: "events[]",
          });
          return;
        }
        for (const code of schemaUnknown(e))
          issue({
            code,
            entryId: entry.public.id,
            eventIndex: index,
            schemaPath: "events[]",
          });
        if (e.type !== "resource-snapshot")
          issue({
            code: "unknown-network-event",
            entryId: entry.public.id,
            eventIndex: index,
            schemaPath: "events[]",
          });
        else omit("network", "eventCount");
        recordReferences(e, entry.public.id, index);
      });
    }
    if (!supported && !unsupported) {
      unsupported = 1;
      issue({
        code: "missing-trace-stream",
        entryId: null,
        eventIndex: null,
        schemaPath: "archive.entries[]",
      });
    }
    const status =
      supported === 0
        ? "unsupported"
        : issues.length || unsupported
          ? "incomplete"
          : "complete";
    const coverage: Report["coverage"] = {
      archiveInventory: "complete",
      recognizedSchema: status,
      processedRetainedFields:
        status === "complete" ? "complete" : "incomplete",
      patternMatching: "bounded-built-ins",
      literalCheck: literals.length ? "performed" : "not-performed",
      events: reader.events,
      streams: timeline.contexts.length,
      assertionScope: timeline.contexts.some((c) => c.origin === "runner")
        ? "runner-observations"
        : timeline.contexts.some((c) => c.origin === "browser")
          ? "browser-only"
          : "unknown",
      issues,
    };
    const report: Report = {
      schemaVersion: 1,
      tool: { name: "tracesharegate", version: VERSION },
      adapter: ADAPTER,
      input: { sha256: snap.sha256, bytes: snap.bytes.length },
      policy: {
        id: POLICY.id,
        version: POLICY.version,
        fingerprint: POLICY_HASH,
      },
      processingStatus: status,
      needsReview: true,
      coverage,
      contexts: timeline.contexts,
      actions: timeline.actions,
      errors: timeline.errors,
      redactionSummary: redactor.summary,
      omissionSummary: omissions,
      limitations: [
        "Review every retained error before sharing. Unknown sensitive text may remain.",
        "This is a derived report, not a replay trace or a privacy certificate.",
        "Omitted images are excluded without OCR or content inspection.",
        "Clocks are local to each stream; lanes are not globally synchronized.",
        "Browser-only traces do not establish assertion outcomes.",
        "Literal variants checked: exact, JSON escaping, URI encoding and NFC. Other encodings are outside scope.",
        "Opaque excluded containers are bounded but their arbitrary payload keys are not interpreted.",
        "Archive entry sizes are declared; actual bytes are measured only for processed streams.",
      ],
    };
    const retained = [
      "contexts[].id",
      "contexts[].lane",
      "contexts[].origin",
      "actions[].id",
      "actions[].contextId",
      "actions[].operation",
      "actions[].startMs",
      "actions[].endMs",
      "actions[].durationMs",
      "actions[].outcome",
      "actions[].parentId",
      "actions[].errorIds",
      "errors[].message",
      "errors[].name",
      "errors[].eventIndex",
      "coverage",
      "counts",
    ];
    const manifest: Manifest = {
      schemaVersion: 1,
      tool: report.tool,
      parser: report.adapter,
      input: report.input,
      policy: report.policy,
      processingStatus: status,
      needsReview: true,
      coverage,
      entries: inv.entries.map((e) => e.public),
      resources: [...links.values()],
      retainedFieldPaths: retained,
      redactionSummary: redactor.summary,
      omissionSummary: omissions,
      unsupportedStructures: issues,
      outputArtifacts: [],
    };
    redactor.assertLiterals(JSON.stringify(report));
    redactor.assertLiterals(JSON.stringify(manifest));
    return { report, manifest, exitCode: status === "complete" ? 0 : 3 };
  } finally {
    inv.zip.close();
  }
  function recordReferences(
    e: Record<string, unknown>,
    entryId: string,
    index: number,
  ) {
    for (const ref of references(e)) {
      check(++referenceCount <= budget.references, "reference-limit");
      omit(ref.category, "resourceReferenceCount");
      const resource = lookup.get(ref.name);
      if (!resource) {
        issue({
          code: "unresolved-resource-reference",
          entryId,
          eventIndex: index,
          schemaPath: "events[].resourceReference",
        });
        continue;
      }
      const key = resource.public.id + ":" + ref.category;
      const link = links.get(key);
      if (link) link.references++;
      else
        links.set(key, {
          entryId: resource.public.id,
          category: ref.category,
          references: 1,
        });
    }
  }
}
