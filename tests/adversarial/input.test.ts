import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { reduce, inspectArchive } from "../../src/report/process.js";
import { parseBounded, LIMITS } from "../../src/limits/index.js";
import {
  archive,
  before,
  after,
  metadata,
  ndjson,
  zipBytes,
  CANARY,
} from "../helpers/archive.js";
async function file(bytes: Buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "tracesharegate-hostile-"));
  const f = path.join(dir, "input.zip");
  await writeFile(f, bytes);
  return f;
}
const reject = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (e) => e instanceof Error && e.message === code);
test("invalid ZIP gives bounded generic error", async () =>
  reject(
    reduce(await file(Buffer.from("untrusted " + CANARY))),
    "invalid-zip",
  ));
test("malformed NDJSON aborts", async () =>
  reject(
    reduce(
      await file(
        await zipBytes([
          {
            name: "test.trace",
            data: Buffer.from(JSON.stringify(metadata) + "\n{broken " + CANARY),
          },
        ]),
      ),
    ),
    "invalid-json",
  ));
test("unsupported version only generic metadata, never nearest parser", async () => {
  const r = await reduce(
    await file(
      await zipBytes([
        {
          name: "test.trace",
          data: ndjson([{ ...metadata, version: 999 }, before(), after()]),
        },
      ]),
    ),
  );
  assert.equal(r.exitCode, 3);
  assert.equal(r.report.processingStatus, "unsupported");
  assert.equal(r.report.actions.length, 0);
});
test("inconsistent metadata becomes incomplete", async () => {
  const r = await reduce(
    await archive([
      before(),
      after(),
      { ...metadata, version: 999 },
      before("second"),
    ]),
  );
  assert.equal(r.exitCode, 3);
  assert(
    r.report.coverage.issues.some(
      (x) => x.code === "duplicate-context-metadata",
    ),
  );
});
test("unknown class and method labels stay generic", async () => {
  const r = await reduce(
    await archive([{ ...before(), class: CANARY, method: CANARY }, after()]),
  );
  assert.equal(r.exitCode, 3);
  assert.equal(r.report.actions[0]?.operation, "Unknown operation");
  assert.equal(r.report.actions[0]?.outcome, "unknown");
  assert(!JSON.stringify(r).includes(CANARY));
});
test("opaque excluded keys do not pollute or leak", async () => {
  const r = await reduce(
    await archive([
      {
        ...before(),
        params: JSON.parse(
          '{"__proto__":{"polluted":true},"' +
            "unknown_key" +
            '":"' +
            "opaque" +
            '"}',
        ),
      },
      after("call", 20),
      {
        type: "event",
        time: 30,
        class: "BrowserContext",
        method: "custom",
        params: { [CANARY]: CANARY },
      },
    ]),
  );
  assert.equal(r.exitCode, 0);
  assert(!JSON.stringify(r).includes(CANARY));
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});
test("unknown retained schema error key reduces coverage without copying key", async () => {
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, { message: "Failed", name: "Error", [CANARY]: CANARY }),
    ]),
  );
  assert.equal(r.exitCode, 3);
  assert(!JSON.stringify(r).includes(CANARY));
});
test("unsupported known field shape decreases coverage", async () => {
  const r = await reduce(
    await archive([{ ...before(), title: { value: CANARY } }, after()]),
  );
  assert.equal(r.exitCode, 3);
  assert(
    r.report.coverage.issues.some(
      (x) => x.code === "unsupported-event-structure",
    ),
  );
});
test("depth, arrays, keys and nodes are bounded iteratively", () => {
  assert.throws(
    () => parseBounded("[".repeat(34) + "0" + "]".repeat(34)),
    /json-depth-limit/,
  );
  assert.throws(
    () => parseBounded(JSON.stringify(Array(20001).fill(0))),
    /json-array-limit/,
  );
  assert.throws(
    () =>
      parseBounded(
        JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 2049 }, (_, i) => ["k" + i, i]),
          ),
        ),
      ),
    /json-key-limit/,
  );
  assert.throws(
    () =>
      parseBounded(
        JSON.stringify(Array.from({ length: 10000 }, () => [1, 2, 3, 4])),
      ),
    /json-node-limit/,
  );
});
test("NDJSON huge line omitted neither silently nor as complete", async () =>
  reject(
    reduce(
      await archive([{ type: "console", text: "x".repeat(LIMITS.lineBytes) }]),
    ),
    "ndjson-line-limit",
  ));
test("decompression bomb blocked on actual processed stream budget", async () => {
  const f = await file(
    await zipBytes([
      {
        name: "test.trace",
        data: Buffer.concat([
          ndjson([metadata]),
          Buffer.from(" ".repeat(2000000)),
        ]),
      },
    ]),
  );
  await reject(
    reduce(f, [], { ...LIMITS, processedBytes: 1000000 }),
    "processed-byte-limit",
  );
});
test("actual entry CRC mismatch is detected", async () => {
  const bytes = await zipBytes([
    { name: "test.trace", data: ndjson([metadata, before(), after()]) },
  ]);
  const at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(0, at + 16);
  await reject(reduce(await file(bytes)), "entry-crc-mismatch");
});
test("declared size mismatch is detected during decompression", async () => {
  const bytes = await zipBytes([
    { name: "test.trace", data: ndjson([metadata, before(), after()]) },
  ]);
  const at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(1, at + 24);
  await assert.rejects(
    reduce(await file(bytes)),
    /entry-read-error|entry-size-mismatch|ndjson-line-limit/,
  );
});
test("encrypted entry rejected without decryption", async () => {
  const bytes = await zipBytes([
    { name: "test.trace", data: ndjson([metadata]) },
  ]);
  const at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt16LE(bytes.readUInt16LE(at + 8) | 1, at + 8);
  await reject(inspectArchive(await file(bytes)), "encrypted-entry");
});
test("unsupported compression rejected", async () => {
  const bytes = await zipBytes([
    { name: "test.trace", data: ndjson([metadata]) },
  ]);
  const at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt16LE(99, at + 10);
  await reject(inspectArchive(await file(bytes)), "unsupported-compression");
});
for (const [from, to] of [
  ["xx/file", "../file"],
  ["xfile", "/file"],
  ["xxfile", "C:file"],
  ["x/file", "x\\file"],
  ["xfile", "\0file"],
] as const)
  test("reject hostile path " + JSON.stringify(to), async () => {
    const bytes = await zipBytes([{ name: from, data: Buffer.from("x") }]);
    let at = 0;
    while ((at = bytes.indexOf(Buffer.from(from), at)) >= 0) {
      bytes.write(to, at, "utf8");
      at += from.length;
    }
    await assert.rejects(
      inspectArchive(await file(bytes)),
      /invalid-zip|invalid-entry-path/,
    );
  });
test("case normalization collision rejected", async () =>
  reject(
    inspectArchive(
      await file(
        await zipBytes([
          { name: "test.trace", data: ndjson([metadata]) },
          { name: "TEST.TRACE", data: ndjson([metadata]) },
        ]),
      ),
    ),
    "entry-name-collision",
  ));
test("event and entry counters are bounded", async () => {
  await reject(
    reduce(await archive([before(), after()]), [], { ...LIMITS, events: 2 }),
    "event-limit",
  );
  await reject(
    inspectArchive(
      await archive([], [{ name: "src/x.ts", data: Buffer.from("x") }]),
      { ...LIMITS, entries: 1 },
    ),
    "zip-entry-limit",
  );
});
test("bounded actions cannot grow indefinitely", async () =>
  reject(
    reduce(
      await archive([before("a"), after("a"), before("b"), after("b")]),
      [],
      { ...LIMITS, actions: 1 },
    ),
    "action-limit",
  ));
test("timeout never yields completed output", async () =>
  reject(
    reduce(await archive([before(), after()]), [], {
      ...LIMITS,
      timeoutMs: -1,
    }),
    "processing-timeout",
  ));
test("invalid UTF-8 is not silently replaced", async () =>
  reject(
    reduce(
      await file(
        await zipBytes([{ name: "test.trace", data: Buffer.from([255, 10]) }]),
      ),
    ),
    "invalid-utf8",
  ));
test("literal in URL or home path cannot split whole-span omission", async () => {
  const r = await reduce(
    await archive([
      before(),
      after("call", 20, {
        name: "Error",
        message:
          "Failure https://tenant.test/hidden/customer?x=secret /Users/name/hidden/private",
      }),
    ]),
    ["hidden"],
  );
  const text = JSON.stringify(r);
  assert(!text.includes("tenant"));
  assert(!text.includes("customer"));
  assert(!text.includes("/private"));
});
test("non-string event type cannot invoke an imported toString property", async () => {
  const r = await reduce(
    await archive([
      { type: { toString: CANARY }, params: { [CANARY]: CANARY } },
    ]),
  );
  assert.equal(r.exitCode, 3);
  assert(!JSON.stringify(r).includes(CANARY));
});
