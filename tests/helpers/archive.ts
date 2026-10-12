import { ZipFile } from "yazl";
import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import yauzl from "yauzl";
export const CANARY = 'TSG_SYNTHETIC_CANARY_09_"<&Ж🙂';
export const metadata = {
  type: "context-options",
  version: 9,
  origin: "testRunner",
  browserName: "",
  playwrightVersion: "1.63.0",
  platform: "synthetic",
  options: {},
  wallTime: 1000,
  monotonicTime: 1,
};
export const before = (id = "call", start = 10, parentId?: string) => ({
  type: "before",
  callId: id,
  startTime: start,
  class: "Frame",
  method: "click",
  params: {},
  ...(parentId === undefined ? {} : { parentId }),
});
export const after = (id = "call", end = 20, error?: unknown) => ({
  type: "after",
  callId: id,
  endTime: end,
  ...(error === undefined ? {} : { error }),
});
export const ndjson = (events: unknown[]) =>
  Buffer.from(events.map((e) => JSON.stringify(e)).join("\n") + "\n");
export async function zipBytes(
  entries: { name: string; data: Buffer }[],
): Promise<Buffer> {
  const zip = new ZipFile();
  for (const e of entries) zip.addBuffer(e.data, e.name);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
export async function archive(
  events: unknown[],
  extra: { name: string; data: Buffer }[] = [],
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "tracesharegate-test-"));
  const file = path.join(dir, "input.zip");
  await writeFile(
    file,
    await zipBytes([
      { name: "test.trace", data: ndjson([metadata, ...events]) },
      ...extra,
    ]),
  );
  return file;
}
export async function rawEntries(
  file: string,
): Promise<{ name: string; data: Buffer }[]> {
  const bytes = await readFile(file);
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (e, z) =>
      e || !z ? reject(e) : resolve(z),
    ),
  );
  const result: { name: string; data: Buffer }[] = [];
  await new Promise<void>((resolve, reject) => {
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (e) => {
      zip.openReadStream(e, async (error, stream) => {
        if (error || !stream) {
          reject(error);
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const b of stream) chunks.push(b as Buffer);
          result.push({ name: e.fileName, data: Buffer.concat(chunks) });
          zip.readEntry();
        } catch (error) {
          reject(error);
        }
      });
    });
    zip.readEntry();
  });
  return result;
}
export async function mutateRecorded(
  file: string,
  mutate: (entries: { name: string; data: Buffer }[]) => void,
): Promise<string> {
  const entries = await rawEntries(file);
  mutate(entries);
  const dir = await mkdtemp(path.join(tmpdir(), "tracesharegate-mutated-"));
  const out = path.join(dir, "input.zip");
  await writeFile(out, await zipBytes(entries));
  return out;
}
