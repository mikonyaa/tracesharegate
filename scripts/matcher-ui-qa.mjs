import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { render } from "../dist/report/render.js";

const packaged = process.argv.includes("--consumer");
const consumer = packaged
  ? (await readFile(".work/consumer-path.txt", "utf8")).trim()
  : null;
const provenance = JSON.parse(
  await readFile(".work/matcher-fixtures/provenance.json", "utf8"),
);
const evidence = [];
await mkdir("output/playwright", { recursive: true });
await mkdir(".work/evidence", { recursive: true });
const markers = [
  "PERSON_ACTUAL_OTTO_8391",
  "PERSON_EXPECTED_NORAH_1642",
  "PROJECT_PRIVATE_PREFACE_9823",
  "PERSON_OPAQUE_TAIL_9827",
  "7654321ms",
];
const browser = await chromium.launch();
try {
  for (const c of provenance.cases) {
    const output = packaged
      ? path.join(consumer, "matcher-output", c.id)
      : JSON.parse(
          await readFile(`.work/matcher-fixtures/${c.id}-output.json`, "utf8"),
        ).output;
    const report = JSON.parse(
      await readFile(path.join(output, "report.json"), "utf8"),
    );
    assert.equal(report.coverage.literalCheck, "not-performed");
    assert.equal(report.processingStatus, c.expectedProcessingStatus);
    for (const width of c.id === "contain" ? [390, 1024, 1440] : [390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.setOffline(true);
      const page = await context.newPage();
      const requests = [],
        errors = [];
      page.on("request", (r) => {
        if (/^https?:/.test(r.url())) requests.push(r.url());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(output, "report.html")).href);
      const assertAbsent = async () => {
        const body = await page.locator("body").innerText();
        const html = await page.content();
        for (const marker of markers) {
          assert(!body.includes(marker), `${c.id}: visible leak ${marker}`);
          assert(!html.includes(marker), `${c.id}: HTML leak ${marker}`);
        }
      };
      await assertAbsent();
      await page.getByLabel("Type", { exact: true }).selectOption("errors");
      const rows = page.locator(".action");
      assert((await rows.count()) > 0);
      const diagnostics = [];
      for (let i = 0; i < (await rows.count()); i++) {
        await rows.nth(i).click();
        await assertAbsent();
        diagnostics.push(await page.locator("#details").innerText());
      }
      if (c.id === "safe-diagnostic")
        assert(diagnostics.some((d) => d.includes("Local validation failed")));
      else if (c.id === "opaque-invalid-receiver")
        assert(diagnostics.every((d) => d.includes("Error text excluded")));
      else
        assert(
          diagnostics.some((d) =>
            d.includes(
              c.id === "invalid-receiver" ? "invalid receiver type" : "expect(",
            ),
          ),
          c.id + ": safe diagnosis missing",
        );
      if (c.expectedProcessingStatus === "incomplete") {
        const banner = await page.locator("#banner").innerText();
        assert(banner.includes("INCOMPLETE COVERAGE"));
        assert(banner.includes("unknown-error-context"));
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      if (c.id === "contain" || c.id === "opaque-symbol")
        await page.screenshot({
          path: `output/playwright/matcher-${packaged ? "consumer" : "source"}-${c.id}-${width}.png`,
          fullPage: true,
        });
      evidence.push({
        id: c.id,
        width,
        processingStatus: report.processingStatus,
        literalCheck: "not-performed",
        everyErrorViewed: true,
        visibleMarkerMatches: 0,
        htmlMarkerMatches: 0,
        networkRequests: requests.length,
        pageErrors: errors.length,
        overflow: false,
      });
      await context.close();
    }
  }
  if (!packaged) {
    const files = ["report.json", "manifest.json", "report.html"].map((f) =>
      path.join("fixtures/legacy-policy", f),
    );
    const original = await Promise.all(files.map((f) => readFile(f)));
    const preview = ".work/legacy-policy-preview.html";
    await writeFile(
      preview,
      await render(
        JSON.parse(original[0].toString()),
        JSON.parse(original[1].toString()),
      ),
    );
    const context = await browser.newContext({
      viewport: { width: 390, height: 1000 },
    });
    await context.setOffline(true);
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.resolve(preview)).href);
    assert(
      (await page.locator("#banner").innerText()).includes("Legacy policy"),
    );
    assert(
      (await page.locator("#banner").innerText()).includes(
        "assertion values may remain",
      ),
    );
    await page.screenshot({
      path: "output/playwright/legacy-policy-preview-390.png",
      fullPage: true,
    });
    await page.goto(pathToFileURL(path.resolve(files[2])).href);
    for (const marker of markers.slice(0, 2))
      assert(
        (await page.locator("body").innerText()).includes(marker),
        "original legacy leak must be visible",
      );
    await page.screenshot({
      path: "output/playwright/legacy-original-unsafe-390.png",
      fullPage: true,
    });
    for (const [i, f] of files.entries())
      assert.deepEqual(await readFile(f), original[i]);
    await context.close();
  }
  await writeFile(
    `.work/evidence/matcher-ui-${packaged ? "consumer" : "source"}.json`,
    JSON.stringify(
      {
        playwright: "1.63.0",
        browser: browser.version(),
        defaultBrowserLane: true,
        packagedConsumer: packaged,
        legacyPreviewIsSeparate: !packaged,
        cases: evidence,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `All ${evidence.length} matcher views passed literal absence, every error, offline requests and mobile overflow checks (${packaged ? "tgz consumer" : "source"}).`,
  );
} finally {
  await browser.close();
}
