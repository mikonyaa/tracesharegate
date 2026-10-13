import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  copyFile,
  writeFile,
  mkdtemp,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
const fixtureRoot = path.resolve(".work/recorded-fixtures");
const canary = 'TSG_SYNTHETIC_CANARY_09_"<&Ж🙂';
const app = `<!doctype html><html><body style="font:20px monospace;padding:36px"><h1>Synthetic fixture</h1><p>Visible synthetic canary</p><pre id="canary"></pre><label>Sample value <input aria-label="Sample value"></label><button>Submit sample</button><p data-testid="status">Pending</p><script>const c=${JSON.stringify(canary).replaceAll("<", "\\u003c")};document.getElementById('canary').textContent=c;document.querySelector('button').onclick=async()=>{console.error(c);await fetch('/sample',{method:'POST',body:c});document.querySelector('[data-testid=status]').textContent='Pending '+c;setTimeout(()=>{throw new Error(c)},0);};</script></body></html>`;
const server = createServer((req, res) => {
  if (req.url === "/navigation-failure") {
    req.socket.destroy();
    return;
  }
  if (req.url === "/sample") {
    req.resume();
    req.on("end", () => {
      res.setHeader("content-type", "text/plain");
      res.end(canary);
    });
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(app);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(".work", { recursive: true });
const captureDir = await mkdtemp(
  path.join(tmpdir(), "tracesharegate-fixtures-"),
);
await symlink(
  path.resolve("node_modules"),
  path.join(captureDir, "node_modules"),
);
await copyFile(
  "tests/recorded-traces/fixture.spec.ts",
  path.join(captureDir, "fixture.spec.ts"),
);
await writeFile(
  path.join(captureDir, "playwright.config.ts"),
  `import {defineConfig} from '@playwright/test';export default defineConfig({testDir:'.',testMatch:'fixture.spec.ts',workers:1,retries:0,timeout:15000,outputDir:'recorded',reporter:[['json',{outputFile:'runner-results.json'}]],use:{headless:true,viewport:{width:960,height:600},trace:{mode:'on',screenshots:true,snapshots:true,sources:true,attachments:true}}});`,
);
try {
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.resolve("node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        path.join(captureDir, "playwright.config.ts"),
      ],
      {
        cwd: captureDir,
        env: { ...process.env, TSG_FIXTURE_URL: base },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (b) => {
      stderr += b;
      if (stderr.length > 20000) child.kill();
    });
    child.stdout.resume();
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exit !== 1) throw new Error("Expected runner failure exit 1");
  // JSON reporter resolves its output path relative to cwd.
  let result;
  for (const f of [path.join(captureDir, "runner-results.json")]) {
    try {
      result = JSON.parse(await readFile(f, "utf8"));
      break;
    } catch {
      /* Try documented reporter resolution. */
    }
  }
  if (!result) throw new Error("Runner JSON missing");
  const cases = [];
  const visit = (s) => {
    for (const spec of s.specs ?? [])
      for (const t of spec.tests)
        for (const r of t.results)
          cases.push({
            title: spec.title,
            status: r.status,
            error: r.error?.message ?? "",
            attachments: r.attachments,
          });
    for (const child of s.suites ?? []) visit(child);
  };
  for (const s of result.suites) visit(s);
  const expected = [
    ["assertion", "toHaveText"],
    ["timeout", "Timeout"],
    ["navigation", "net::ERR"],
  ];
  await mkdir(fixtureRoot, { recursive: true });
  const recorded = [];
  for (const [index, c] of cases.entries()) {
    if (c.status !== "failed" || !c.error.includes(expected[index][1]))
      throw new Error("Unexpected fixture failure cause");
    const trace = c.attachments.find((a) => a.name === "trace");
    if (!trace) throw new Error("Trace missing");
    const name = expected[index][0] + ".zip";
    await copyFile(trace.path, path.join(fixtureRoot, name));
    const bytes = await readFile(path.join(fixtureRoot, name));
    recorded.push({
      id: expected[index][0],
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      expectedFailure: expected[index][1],
    });
  }
  if (recorded.length !== 3) throw new Error("Three runner fixtures required");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 960, height: 600 },
    });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    const page = await context.newPage();
    await page.goto(base);
    await page.getByLabel("Sample value").fill("Browser only");
    await page.getByRole("button").click();
    await context.tracing.stop({
      path: path.join(fixtureRoot, "browser-only.zip"),
    });
    await context.close();
    await writeFile(
      path.join(fixtureRoot, "provenance.json"),
      JSON.stringify(
        {
          playwright: "1.63.0",
          schema: 9,
          browser: browser.version(),
          runnerAssertions: true,
          capture: {
            screenshots: true,
            snapshots: true,
            sources: true,
            attachments: true,
          },
          synthetic: true,
          fixtures: recorded,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await browser.close();
  }
  console.log(
    "Recorded three verified runner failures and one browser-only trace.",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
