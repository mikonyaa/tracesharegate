export const LIMITS = Object.freeze({
  inputBytes: 100 * 1024 * 1024,
  processedBytes: 256 * 1024 * 1024,
  entries: 20000,
  events: 200000,
  lineBytes: 512 * 1024,
  depth: 32,
  nodes: 40000,
  keys: 2048,
  array: 20000,
  string: 512 * 1024,
  retainedString: 8192,
  actions: 50000,
  errors: 10000,
  streams: 128,
  references: 200000,
  outputBytes: 64 * 1024 * 1024,
  timeoutMs: 30000,
  heapMb: 256,
  literals: 128,
  literalBytes: 65536,
});
export type Budget = { [K in keyof typeof LIMITS]: number };
export class GateError extends Error {
  constructor(
    public readonly code: string,
    public readonly exitCode = 2,
  ) {
    super(code);
    this.name = "GateError";
  }
}
export function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new GateError(code);
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// Iterative validation also bounds opaque containers, without interpreting their keys.
export function parseBounded(text: string, budget: Budget = LIMITS): unknown {
  check(Buffer.byteLength(text) <= budget.lineBytes, "json-line-limit");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GateError("invalid-json");
  }
  const work: { v: unknown; d: number }[] = [{ v: value, d: 0 }];
  let nodes = 0;
  while (work.length) {
    const { v, d } = work.pop()!;
    check(++nodes <= budget.nodes, "json-node-limit");
    check(d <= budget.depth, "json-depth-limit");
    if (typeof v === "string") {
      check(Buffer.byteLength(v) <= budget.string, "json-string-limit");
      continue;
    }
    if (Array.isArray(v)) {
      check(v.length <= budget.array, "json-array-limit");
      for (const x of v) work.push({ v: x, d: d + 1 });
    } else if (object(v)) {
      const keys = Object.keys(v);
      check(keys.length <= budget.keys, "json-key-limit");
      for (const k of keys) {
        check(Buffer.byteLength(k) <= budget.string, "json-key-size-limit");
        work.push({ v: v[k], d: d + 1 });
      }
    }
  }
  return value;
}
export function jsonArtifact(text: string): unknown {
  return parseBounded(text, {
    ...LIMITS,
    lineBytes: LIMITS.outputBytes,
    nodes: 2000000,
    array: 200000,
    keys: 20000,
  });
}
