import { open, stat } from "node:fs/promises";
import yauzl from "yauzl";
import { crc32 } from "node:zlib";
import type { Entry as ZipEntry, ZipFile } from "yauzl";
import { check, GateError, LIMITS, type Budget } from "../limits/index.js";
import { hash } from "../policy/index.js";
import type { Entry } from "../schemas/types.js";
export interface PhysicalEntry {
  zip: ZipEntry;
  name: string;
  public: Entry;
}
export function category(name: string): string {
  if (/^(?:test|trace|\d+-trace)\.trace$/.test(name)) return "trace-stream";
  if (/^(?:trace|\d+-trace)\.network$/.test(name)) return "network-stream";
  if (/^(?:trace|\d+-trace)\.stacks$/.test(name)) return "source-and-stacks";
  if (name.startsWith("src/")) return "source-and-stacks";
  if (/^(?:screencast|screenshots)\//.test(name)) return "images-and-video";
  if (name.startsWith("aria/")) return "dom-and-aria";
  if (name.startsWith("attachments/")) return "attachments";
  if (name.startsWith("resources/")) return "arbitrary-resources";
  return "unknown";
}
export async function snapshot(
  input: string,
  budget: Budget = LIMITS,
): Promise<{ bytes: Buffer; sha256: string }> {
  let file;
  try {
    file = await open(input, "r");
    const before = await file.stat({ bigint: true });
    check(before.isFile(), "input-not-file");
    check(
      before.size > 0 && before.size <= BigInt(budget.inputBytes),
      "input-size-limit",
    );
    const size = Number(before.size);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const r = await file.read(
        bytes,
        offset,
        Math.min(1024 * 1024, size - offset),
        offset,
      );
      check(r.bytesRead > 0, "input-changed");
      offset += r.bytesRead;
    }
    const sha256 = hash(bytes);
    const second = Buffer.alloc(1024 * 1024);
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256");
    offset = 0;
    while (offset < size) {
      const r = await file.read(
        second,
        0,
        Math.min(second.length, size - offset),
        offset,
      );
      check(r.bytesRead > 0, "input-changed");
      digest.update(second.subarray(0, r.bytesRead));
      offset += r.bytesRead;
    }
    const after = await file.stat({ bigint: true });
    const current = await stat(input, { bigint: true });
    check(
      before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs &&
        before.ino === current.ino &&
        before.dev === current.dev &&
        before.size === current.size &&
        before.mtimeNs === current.mtimeNs &&
        sha256 === digest.digest("hex"),
      "input-changed",
    );
    return { bytes, sha256 };
  } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError("input-io");
  } finally {
    await file?.close();
  }
}
export async function inventory(
  bytes: Buffer,
  budget: Budget = LIMITS,
): Promise<{ zip: ZipFile; entries: PhysicalEntry[] }> {
  const zip = await new Promise<ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      {
        lazyEntries: true,
        autoClose: false,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (e, z) => (e || !z ? reject(new GateError("invalid-zip")) : resolve(z)),
    ),
  );
  const entries: PhysicalEntry[] = [];
  const names = new Set<string>();
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (e: unknown) =>
        reject(e instanceof GateError ? e : new GateError("invalid-zip"));
      zip.on("error", fail);
      zip.once("end", resolve);
      zip.on("entry", (entry: ZipEntry) => {
        try {
          check(entries.length < budget.entries, "zip-entry-limit");
          const name = entry.fileName;
          check(
            !/[\x00-\x1f\\]/.test(name) &&
              !name.startsWith("/") &&
              !/^[a-z]:/i.test(name) &&
              !name.split("/").some((s) => s === ".." || s === "." || s === ""),
            "invalid-entry-path",
          );
          const norm = name.normalize("NFC").toLowerCase();
          check(!names.has(norm), "entry-name-collision");
          names.add(norm);
          check(!(entry.generalPurposeBitFlag & 1), "encrypted-entry");
          check(
            entry.compressionMethod === 0 || entry.compressionMethod === 8,
            "unsupported-compression",
          );
          check(
            Number.isSafeInteger(entry.uncompressedSize) &&
              entry.uncompressedSize >= 0 &&
              Number.isSafeInteger(entry.compressedSize) &&
              entry.compressedSize >= 0,
            "invalid-entry-size",
          );
          const kind = category(name);
          entries.push({
            zip: entry,
            name,
            public: {
              id: "entry-" + (entries.length + 1),
              category: kind,
              disposition: kind === "unknown" ? "unknown" : "omitted",
              reason:
                kind === "unknown"
                  ? "unrecognized-entry-category"
                  : "excluded-by-policy",
              declaredCompressedBytes: entry.compressedSize,
              declaredUncompressedBytes: entry.uncompressedSize,
              actualProcessedBytes: null,
              contentsInspected: false,
              retainedFieldPaths: [],
            },
          });
          zip.readEntry();
        } catch (e) {
          fail(e);
        }
      });
      zip.readEntry();
    });
    return { zip, entries };
  } catch (e) {
    zip.close();
    throw e;
  }
}
export class Reader {
  processed = 0;
  events = 0;
  readonly started = performance.now();
  constructor(
    readonly zip: ZipFile,
    readonly budget: Budget = LIMITS,
  ) {}
  tick(): void {
    check(
      performance.now() - this.started <= this.budget.timeoutMs,
      "processing-timeout",
    );
  }
  async lines(
    entry: PhysicalEntry,
    consume: (text: string, index: number) => void,
  ): Promise<void> {
    this.tick();
    check(
      entry.zip.uncompressedSize <= this.budget.processedBytes - this.processed,
      "processed-byte-limit",
    );
    const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
      this.zip.openReadStream(entry.zip, (e, s) =>
        e || !s ? reject(new GateError("entry-read-error")) : resolve(s),
      ),
    );
    let pending = Buffer.alloc(0),
      actual = 0,
      index = 0,
      crc = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parse = (bytes: Buffer) => {
      if (bytes.length === 0) return;
      check(bytes.length <= this.budget.lineBytes, "ndjson-line-limit");
      check(++this.events <= this.budget.events, "event-limit");
      let line: string;
      try {
        line = decoder.decode(bytes);
      } catch {
        throw new GateError("invalid-utf8");
      }
      consume(line, ++index);
      this.tick();
    };
    try {
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        this.tick();
        actual += chunk.length;
        this.processed += chunk.length;
        check(
          this.processed <= this.budget.processedBytes,
          "processed-byte-limit",
        );
        crc = crc32(chunk, crc);
        pending = Buffer.concat([pending, chunk]);
        let at: number;
        while ((at = pending.indexOf(10)) >= 0) {
          parse(pending.subarray(0, at));
          pending = pending.subarray(at + 1);
        }
        check(pending.length <= this.budget.lineBytes, "ndjson-line-limit");
      }
      if (pending.length) parse(pending);
      check(actual === entry.zip.uncompressedSize, "entry-size-mismatch");
      check(crc === entry.zip.crc32, "entry-crc-mismatch");
      entry.public.actualProcessedBytes = actual;
      entry.public.contentsInspected = true;
    } catch (e) {
      (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
      if (e instanceof GateError) throw e;
      throw new GateError("entry-read-error");
    }
  }
}
