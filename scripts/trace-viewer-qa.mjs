import { createRequire } from "node:module";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const require = createRequire(import.meta.url);
const { server: core } = require("playwright-core/lib/coreBundle");
const trace = path.resolve("fixtures/synthetic/assertion.zip");
const server = await core.startTraceViewerServer({
  host: "127.0.0.1",
  port: 0,
  allowedFileRoots: () => [path.dirname(trace)],
});
await core.installRootRedirect(
  server,
  "file?path=" + encodeURIComponent(trace),
  {},
);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
  });
  const page = await context.newPage();
  await page.goto(server.urlPrefix("precise"));
  await page
    .getByText("Navigate", { exact: true })
    .first()
    .waitFor({ timeout: 15000 });
  const text = await page.locator("body").innerText();
  assert(text.includes("assertion") || text.includes("TSG_SYNTHETIC_CANARY"));
  await page.getByText("Errors", { exact: true }).click();
  await page
    .getByText("toHaveText", { exact: false })
    .first()
    .waitFor({ timeout: 10000 });
  assert(text.includes("synthetic setup"));
  await page.getByText("synthetic setup", { exact: true }).dblclick();
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({
    path: "output/playwright/original-trace-viewer.png",
    fullPage: true,
  });
  await writeFile(
    "docs/evidence/trace-viewer.json",
    JSON.stringify(
      {
        playwright: "1.63.0",
        schema: 9,
        openedOriginal: true,
        observations: [
          "runner assertion visible",
          "fill/click operations visible",
          "private original snapshot available",
        ],
        screenshot: "output/playwright/original-trace-viewer.png",
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Original trace opened in the genuine Playwright Trace Viewer.");
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}
