import { chromium } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { reduce, writeReport } from "../dist/index.js";
import {
  archive,
  before,
  after,
  mutateRecorded,
  ndjson,
  CANARY,
} from "../tests/helpers/archive.ts";
const root = await mkdtemp(path.join(tmpdir(), "tracesharegate-ui-"));
await mkdir("output/playwright", { recursive: true });
await mkdir("docs/evidence", { recursive: true });
const make = async (name, input) => {
  const r = await reduce(input, [CANARY]);
  const out = path.join(root, name);
  await writeReport(out, r.report, r.manifest, [CANARY]);
  return out;
};
const regular = await make("actual", "fixtures/synthetic/assertion.zip");
await writeFile(".work/ui-debug-root.txt", regular);
const browser = await chromium.launch();
const evidence = [];
try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      acceptDownloads: true,
    });
    await context.setOffline(true);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const network = [];
    const errors = [];
    page.on("request", (r) => {
      if (/^https?:/i.test(r.url())) network.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(regular, "report.html")).href);
    await page
      .getByRole("heading", { name: "Assertion", exact: true })
      .waitFor();
    assert.equal(
      (await page.locator(".selected .status").innerText()).toLowerCase(),
      "failed",
    );
    assert((await page.locator("#details").innerText()).includes("failed"));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `output/playwright/report-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Copy sanitized text", exact: true })
      .click();
    await page.getByText("Sanitized text copied.", { exact: true }).waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert(copied.includes("Assertion"));
    assert(!copied.includes("TSG_SYNTHETIC_CANARY"));
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download omission manifest" })
      .click();
    const downloaded = await download;
    assert.equal(downloaded.suggestedFilename(), "omission-manifest.json");
    const downloadedBytes = await readFile(await downloaded.path());
    const finalManifest = JSON.parse(
      await readFile(path.join(regular, "manifest.json"), "utf8"),
    );
    finalManifest.outputArtifacts = finalManifest.outputArtifacts.filter(
      (a) => a.name === "report.json",
    );
    assert.deepEqual(JSON.parse(downloadedBytes.toString()), finalManifest);
    await page.getByLabel("Search retained text").fill("navigate");
    assert.equal(await page.locator(".action").count(), 1);
    await page.getByLabel("Search retained text").fill("nothing matches this");
    assert.equal(await page.locator(".action").count(), 0);
    await page
      .getByText("No matching retained events.", { exact: true })
      .waitFor();
    await page.getByLabel("Search retained text").fill("");
    await page.getByLabel("Status", { exact: true }).selectOption("failed");
    assert((await page.locator(".action").count()) >= 1);
    await page.getByLabel("Status", { exact: true }).selectOption("all");
    await page.getByLabel("Type", { exact: true }).selectOption("errors");
    assert((await page.locator(".action").count()) >= 2);
    await page.getByLabel("Type", { exact: true }).selectOption("all");
    await page.locator("#timeline").focus();
    await page.keyboard.press("Home");
    const id = await page.locator("#details").innerText();
    await page.keyboard.press("ArrowDown");
    assert.notEqual(await page.locator("#details").innerText(), id);
    console.log("Viewport " + width + " controls passed.");
    assert.equal(network.length, 0);
    assert.deepEqual(errors, []);
    evidence.push({
      width,
      offlineFile: true,
      networkRequests: 0,
      search: true,
      statusAndErrorFilters: true,
      keyboard: true,
      copy: true,
      omissionSnapshotDownload: true,
      overflow: false,
    });
    await context.close();
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  const unknown = await make(
    "unknown",
    await archive([{ type: "unknown-structure", value: CANARY }]),
  );
  await page.goto(pathToFileURL(path.join(unknown, "report.html")).href);
  assert(
    (await page.locator("#banner").innerText()).includes("INCOMPLETE COVERAGE"),
  );
  assert(
    (await page.locator("#banner").innerText()).includes("unknown-event-kind"),
  );
  await page.screenshot({
    path: "output/playwright/unknown-390.png",
    fullPage: true,
  });
  const empty = await make("empty", await archive([]));
  await page.goto(pathToFileURL(path.join(empty, "report.html")).href);
  await page
    .getByText("No matching retained events.", { exact: true })
    .waitFor();
  const longInput = await mutateRecorded(
    "fixtures/synthetic/assertion.zip",
    (entries) => {
      const entry = entries.find((e) => e.name === "test.trace");
      const events = entry.data
        .toString("utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      const error = events.find((e) => e.type === "after" && e.error);
      error.error.message =
        "Assertion failed " +
        "long diagnostic context ".repeat(180) +
        ' </script><script>globalThis.TSG_EXECUTED=true</script><img src="x" onerror="globalThis.TSG_EXECUTED=true">';
      entry.data = ndjson(events);
    },
  );
  const long = await make("long", longInput);
  await page.goto(pathToFileURL(path.join(long, "report.html")).href);
  await page.getByRole("heading", { name: "Assertion", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => globalThis.TSG_EXECUTED), undefined);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert((await page.locator("#details").innerText()).includes("<script>"));
  assert.equal(await page.locator("#details img").count(), 0);
  await page.screenshot({
    path: "output/playwright/long-error-390.png",
    fullPage: true,
  });
  const events = Array.from({ length: 5000 }, (_, i) => [
    before("a" + i, 10 + i * 2),
    after("a" + i, 11 + i * 2),
  ]).flat();
  const large = await make("large", await archive(events));
  await page.goto(pathToFileURL(path.join(large, "report.html")).href);
  assert.equal(await page.locator(".action").count(), 100);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert(
    (await page.locator("#timeline").innerText()).includes("page 2 of 50"),
  );
  await page.getByLabel("Search retained text").fill("action-5000");
  assert.equal(await page.locator(".action").count(), 1);
  await context.close();
  await mkdir("docs/demo", { recursive: true });
  for (const width of [1440, 1024, 390])
    await copyFile(
      `output/playwright/report-${width}.png`,
      `docs/demo/report-${width}.png`,
    );
  await writeFile(
    "docs/evidence/ui.json",
    JSON.stringify(
      {
        browser: browser.version(),
        actualReport: true,
        viewports: evidence,
        unknownBanner: true,
        emptyState: true,
        longErrors: true,
        importedMarkupExecuted: false,
        largeActions: 5000,
        pagination: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Browser QA passed: 1440/1024/390, offline file, controls, unknown, empty, long error, injection and 5,000 actions.",
  );
} finally {
  await browser.close();
}
