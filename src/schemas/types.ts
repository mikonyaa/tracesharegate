export type Outcome = "passed" | "failed" | "incomplete" | "unknown";
export interface Issue {
  code: string;
  entryId: string | null;
  eventIndex: number | null;
  schemaPath: string;
  count: number;
}
export interface Redaction {
  ruleId: string;
  field: string;
  count: number;
}
export interface Context {
  id: string;
  lane: string;
  origin: "runner" | "browser" | "unknown";
  clock: "stream-relative";
  assertionObservations: "recorded" | "not-observed" | "out-of-scope";
}
export interface Action {
  id: string;
  contextId: string;
  lane: string;
  operation: string;
  operationKnown: boolean;
  startMs: number | null;
  endMs: number | null;
  durationMs: number | null;
  outcome: Outcome;
  parentId: string | null;
  errorIds: string[];
  eventIndex: number;
}
export interface ReportError {
  id: string;
  contextId: string;
  actionId: string | null;
  name: string | null;
  message: string | null;
  timeMs: number | null;
  eventIndex: number;
}
export interface Omission {
  category: string;
  eventCount: number;
  entryCount: number;
  resourceReferenceCount: number;
  reason: string;
}
export interface Entry {
  id: string;
  category: string;
  disposition: "retained-derived" | "omitted" | "unknown";
  reason: string;
  declaredCompressedBytes: number;
  declaredUncompressedBytes: number;
  actualProcessedBytes: number | null;
  contentsInspected: boolean;
  retainedFieldPaths: string[];
}
export interface ResourceLink {
  entryId: string;
  category: string;
  references: number;
}
export interface Coverage {
  archiveInventory: "complete";
  recognizedSchema: "complete" | "incomplete" | "unsupported";
  processedRetainedFields: "complete" | "incomplete";
  patternMatching: "bounded-built-ins";
  literalCheck: "performed" | "not-performed";
  events: number;
  streams: number;
  assertionScope: "runner-observations" | "browser-only" | "unknown";
  issues: Issue[];
}
export interface Report {
  schemaVersion: 1;
  tool: { name: "tracesharegate"; version: string };
  adapter: {
    id: string;
    version: string;
    playwright: string;
    traceVersion: number;
    sourceCommit: string;
  };
  input: { sha256: string; bytes: number };
  policy: { id: string; version: number; fingerprint: string };
  processingStatus: "complete" | "incomplete" | "unsupported";
  needsReview: true;
  coverage: Coverage;
  contexts: Context[];
  actions: Action[];
  errors: ReportError[];
  redactionSummary: Redaction[];
  omissionSummary: Omission[];
  limitations: string[];
}
export interface Manifest {
  schemaVersion: 1;
  tool: Report["tool"];
  parser: Report["adapter"];
  input: Report["input"];
  policy: Report["policy"];
  processingStatus: Report["processingStatus"];
  needsReview: true;
  coverage: Coverage;
  entries: Entry[];
  resources: ResourceLink[];
  retainedFieldPaths: string[];
  redactionSummary: Redaction[];
  omissionSummary: Omission[];
  unsupportedStructures: Issue[];
  outputArtifacts: {
    name: "report.json" | "report.html";
    sha256: string;
    bytes: number;
  }[];
}
