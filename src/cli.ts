#!/usr/bin/env node
import { Worker } from "node:worker_threads";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, GateError } from "./limits/index.js";
import { VERSION, ADAPTER, POLICY } from "./policy/index.js";
const help = `TraceShareGate ${VERSION}
Export minimal debugging reports from Playwright traces with an explicit omission manifest.

Usage:
  tracesharegate doctor [--json]
  tracesharegate inspect trace.zip [--json]
  tracesharegate report trace.zip --out report [--secrets-file local-secrets.json] [--json] [--open|--no-open]
  tracesharegate verify --report report/report.json --manifest report/manifest.json --html report/report.html [--secrets-file local-secrets.json] [--json]
  tracesharegate demo --out demo-output [--json] [--open|--no-open]
  tracesharegate --help
  tracesharegate --version

Known-literal files: a local JSON array of nonempty strings. Never pass secret values as CLI arguments.
Output directories must be new. Processing is local, without a browser or network.
Report exits: 0 complete (review required), 1 policy postcondition, 2 malformed/I/O/limits, 3 incomplete/unsupported, 130 interrupt.
Verification is not a privacy certificate.
`;
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help")) {
    console.log(help);
    return;
  }
  if (argv.length === 1 && argv[0] === "--version") {
    console.log(VERSION);
    return;
  }
  const command = argv.shift();
  const options = new Map<string, string | true>();
  const positional: string[] = [];
  const flags = new Set(["--json", "--open", "--no-open"]);
  const values = new Set([
    "--out",
    "--secrets-file",
    "--report",
    "--manifest",
    "--html",
  ]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (flags.has(a)) {
      if (options.has(a)) throw new GateError("duplicate-option");
      options.set(a, true);
    } else if (values.has(a)) {
      const value = argv[++i];
      if (!value || value.startsWith("--") || options.has(a))
        throw new GateError("invalid-option");
      options.set(a, value);
    } else if (a.startsWith("-")) throw new GateError("unknown-option");
    else positional.push(a);
  }
  const required = (key: string) => {
    const v = options.get(key);
    if (typeof v !== "string") throw new GateError("missing-option");
    return v;
  };
  const optional = (key: string) => {
    const v = options.get(key);
    return typeof v === "string" ? v : undefined;
  };
  if (options.has("--open") && options.has("--no-open"))
    throw new GateError("conflicting-options");
  if (
    !["doctor", "inspect", "report", "verify", "demo"].includes(command ?? "")
  )
    throw new GateError("unknown-command");
  const allowed: Record<string, string[]> = {
    doctor: ["--json"],
    inspect: ["--json"],
    report: ["--json", "--out", "--secrets-file", "--open", "--no-open"],
    verify: ["--json", "--report", "--manifest", "--html", "--secrets-file"],
    demo: ["--json", "--out", "--open", "--no-open"],
  };
  for (const key of options.keys())
    if (!allowed[command!]!.includes(key))
      throw new GateError("option-not-applicable");
  if (command === "doctor") {
    if (positional.length) throw new GateError("unexpected-argument");
    const result = {
      tool: "tracesharegate",
      version: VERSION,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      adapter: ADAPTER.id,
      policy: POLICY.id,
      networkRequired: false,
      browserRequired: false,
      limits: LIMITS,
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (
    ["verify", "demo"].includes(command!)
      ? positional.length !== 0
      : positional.length !== 1
  )
    throw new GateError("invalid-input-count");
  let input = positional[0];
  if (command === "demo") {
    input = fileURLToPath(
      new URL("../fixtures/synthetic/assertion.zip", import.meta.url),
    );
    await access(input);
  }
  const task = {
    command: command === "demo" ? "report" : command,
    input,
    out:
      command === "report" || command === "demo"
        ? required("--out")
        : undefined,
    secretsFile: optional("--secrets-file"),
    report: command === "verify" ? required("--report") : undefined,
    manifest: command === "verify" ? required("--manifest") : undefined,
    html: command === "verify" ? required("--html") : undefined,
  };
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    workerData: task,
    resourceLimits: {
      maxOldGenerationSizeMb: LIMITS.heapMb,
      maxYoungGenerationSizeMb: 32,
      stackSizeMb: 4,
    },
  });
  const response = await new Promise<{
    ok: boolean;
    exitCode: number;
    result?: unknown;
    error?: string;
  }>((resolve, reject) => {
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new GateError("processing-timeout"));
    }, LIMITS.timeoutMs);
    const interrupt = () => {
      void worker.terminate();
      clearTimeout(timer);
      reject(new GateError("interrupted", 130));
    };
    process.once("SIGINT", interrupt);
    const done = () => {
      clearTimeout(timer);
      process.off("SIGINT", interrupt);
    };
    worker.once("message", (r) => {
      done();
      resolve(r);
    });
    worker.once("error", () => {
      done();
      reject(new GateError("worker-budget-or-runtime"));
    });
    worker.once("exit", (code) => {
      done();
      if (code !== 0) reject(new GateError("worker-exit"));
    });
  });
  await worker.terminate();
  if (!response.ok)
    throw new GateError(response.error ?? "runtime-error", response.exitCode);
  console.log(JSON.stringify(response.result, null, 2));
  process.exitCode = response.exitCode;
  if (options.has("--open") && task.out) {
    if (!["darwin", "linux"].includes(process.platform))
      throw new GateError("open-unavailable");
    const file = path.resolve(task.out, "report.html");
    const executable =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", file] : [file];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, { stdio: "ignore", shell: false });
      child.once("error", () => reject(new GateError("open-unavailable")));
      child.once("close", (code) =>
        code === 0 ? resolve() : reject(new GateError("open-unavailable")),
      );
    });
  }
}
main().catch((e) => {
  const error = e instanceof GateError ? e : new GateError("runtime-error");
  const stream = process.argv.includes("--json")
    ? process.stdout
    : process.stderr;
  stream.write(
    JSON.stringify({
      error: error.code,
      exitCode: error.exitCode,
      needsReview: true,
    }) + "\n",
  );
  process.exitCode = error.exitCode;
});
