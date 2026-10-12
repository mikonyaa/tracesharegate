import { parentPort, workerData } from "node:worker_threads";
import { reduce, inspectArchive } from "./report/process.js";
import { readLiterals } from "./redaction/index.js";
import { writeReport } from "./report/write.js";
import { verifyFiles } from "./report/verify.js";
import { GateError } from "./limits/index.js";
interface Task {
  command: "inspect" | "report" | "verify";
  input?: string;
  out?: string;
  secretsFile?: string;
  report?: string;
  manifest?: string;
  html?: string;
}
const task = workerData as Task;
try {
  const literals = await readLiterals(task.secretsFile);
  let result: unknown;
  let exitCode = 0;
  if (task.command === "inspect") result = await inspectArchive(task.input!);
  else if (task.command === "verify")
    result = await verifyFiles(
      task.report!,
      task.manifest!,
      task.html!,
      literals,
    );
  else {
    const reduced = await reduce(task.input!, literals);
    await writeReport(task.out!, reduced.report, reduced.manifest, literals);
    exitCode = reduced.exitCode;
    result = {
      processingStatus: reduced.report.processingStatus,
      needsReview: true,
      actions: reduced.report.actions.length,
      errors: reduced.report.errors.length,
      coverage: reduced.report.coverage,
      artifacts: ["report.json", "report.html", "manifest.json"],
      meaning: "Review retained text before sharing.",
    };
  }
  parentPort!.postMessage({ ok: true, exitCode, result });
} catch (e) {
  parentPort!.postMessage({
    ok: false,
    exitCode: e instanceof GateError ? e.exitCode : 2,
    error: e instanceof GateError ? e.code : "runtime-error",
  });
}
