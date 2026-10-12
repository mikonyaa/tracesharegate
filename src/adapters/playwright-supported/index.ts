import { object } from "../../limits/index.js";
const fields: Record<string, readonly string[]> = {
  "context-options": [
    "version",
    "type",
    "origin",
    "browserName",
    "channel",
    "platform",
    "playwrightVersion",
    "wallTime",
    "monotonicTime",
    "title",
    "options",
    "sdkLanguage",
    "testIdAttributeName",
    "testTimeout",
    "annotations",
  ],
  before: [
    "type",
    "callId",
    "startTime",
    "title",
    "subtitle",
    "class",
    "method",
    "params",
    "stepId",
    "stack",
    "parentId",
    "group",
  ],
  after: [
    "type",
    "callId",
    "endTime",
    "error",
    "attachments",
    "annotations",
    "result",
    "point",
  ],
  input: ["type", "callId", "point", "box"],
  log: ["type", "callId", "time", "message"],
  event: ["type", "time", "class", "method", "params", "pageId"],
  console: [
    "type",
    "time",
    "pageId",
    "messageType",
    "text",
    "args",
    "location",
  ],
  "resource-snapshot": ["type", "snapshot"],
  "frame-snapshot": ["type", "snapshot"],
  "screencast-frame": [
    "type",
    "pageId",
    "file",
    "width",
    "height",
    "timestamp",
    "frameSwapWallTime",
  ],
  video: ["type", "pageId", "file", "width", "height", "timestamp"],
  screenshot: ["type", "callId", "phase", "pageId", "timestamp", "file"],
  "aria-snapshot": ["type", "callId", "phase", "pageId", "timestamp", "file"],
  stdout: ["type", "timestamp", "text", "base64"],
  stderr: ["type", "timestamp", "text", "base64"],
  error: ["type", "message", "stack"],
};
fields.action = [
  ...new Set([...fields.before!, ...fields.after!, ...fields.input!]),
];
export const EVENT_KINDS = Object.keys(fields);
export function schemaUnknown(e: Record<string, unknown>): string[] {
  const kind = typeof e.type === "string" ? e.type : "";
  const allowed = Object.hasOwn(fields, kind) ? fields[kind] : undefined;
  if (!allowed) return ["unknown-event-kind"];
  const issues: string[] = [];
  const required: Record<string, string[]> = {
    "context-options": [
      "version",
      "origin",
      "options",
      "wallTime",
      "monotonicTime",
    ],
    before: ["callId", "startTime", "class", "method", "params"],
    after: ["callId", "endTime"],
    action: ["callId", "startTime", "endTime", "class", "method", "params"],
    error: ["message"],
    "frame-snapshot": ["snapshot"],
    "resource-snapshot": ["snapshot"],
  };
  if ((required[kind] ?? []).some((k) => !Object.hasOwn(e, k)))
    issues.push("unsupported-event-structure");
  for (const k of [
    "class",
    "method",
    "title",
    "subtitle",
    "parentId",
    "stepId",
    "callId",
  ])
    if (e[k] !== undefined && typeof e[k] !== "string")
      issues.push("unsupported-event-structure");
  for (const k of [
    "wallTime",
    "monotonicTime",
    "time",
    "timestamp",
    "width",
    "height",
    "testTimeout",
  ])
    if (
      e[k] !== undefined &&
      (typeof e[k] !== "number" || !Number.isFinite(e[k]))
    )
      issues.push("unsupported-event-structure");
  if (kind === "context-options" && !object(e.options))
    issues.push("unsupported-event-structure");
  if (e.params !== undefined && !object(e.params))
    issues.push("unsupported-event-structure");
  if (e.snapshot !== undefined && !object(e.snapshot))
    issues.push("unsupported-event-structure");
  if (e.attachments !== undefined && !Array.isArray(e.attachments))
    issues.push("unsupported-event-structure");
  if (kind === "error" && typeof e.message !== "string")
    issues.push("unsupported-event-structure");
  if (
    e.error !== undefined &&
    (!object(e.error) ||
      typeof e.error.message !== "string" ||
      (e.error.name !== undefined && typeof e.error.name !== "string"))
  )
    issues.push("unsupported-event-structure");
  if (Object.keys(e).some((k) => !allowed.includes(k)))
    issues.push("unknown-schema-field");
  if (
    object(e.error) &&
    Object.keys(e.error).some((k) => !["name", "message", "stack"].includes(k))
  )
    issues.push("unknown-error-field");
  // Known opaque containers are omitted as units. Their arbitrary keys never become schema-level positives.
  return issues;
}
export function eventCategory(kind: unknown): string | null {
  switch (kind) {
    case "before":
    case "action":
      return "arguments-and-results";
    case "after":
      return "arguments-and-results";
    case "log":
    case "console":
    case "stdout":
    case "stderr":
      return "console-and-stdio";
    case "frame-snapshot":
    case "aria-snapshot":
      return "dom-and-aria";
    case "screencast-frame":
    case "video":
    case "screenshot":
      return "images-and-video";
    case "resource-snapshot":
      return "network";
    case "event":
    case "input":
      return "arguments-and-results";
    default:
      return null;
  }
}
// Only proven resource pointer fields are inspected; payload and names remain internal.
export function references(
  e: Record<string, unknown>,
): { name: string; category: string }[] {
  const out: { name: string; category: string }[] = [];
  const add = (v: unknown, category: string) => {
    if (typeof v === "string") out.push({ name: v, category });
  };
  if (
    typeof e.type === "string" &&
    ["screencast-frame", "screenshot", "video"].includes(e.type)
  )
    add(e.file, "images-and-video");
  if (e.type === "aria-snapshot") add(e.file, "dom-and-aria");
  if (e.type === "resource-snapshot" && object(e.snapshot))
    for (const part of ["request", "response"]) {
      const p = e.snapshot[part];
      if (object(p))
        for (const c of ["postData", "content"]) {
          const content = p[c];
          if (object(content)) add(content._file, "network");
        }
    }
  if (
    e.type === "frame-snapshot" &&
    object(e.snapshot) &&
    Array.isArray(e.snapshot.resourceOverrides)
  )
    for (const r of e.snapshot.resourceOverrides)
      if (object(r)) add(r.file, "dom-and-aria");
  if (Array.isArray(e.attachments))
    for (const a of e.attachments)
      if (object(a)) {
        add(a.file, "attachments");
        add(a.path, "attachments");
      }
  return out;
}
