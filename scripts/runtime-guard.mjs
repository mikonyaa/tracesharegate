import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import http2 from "node:http2";
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { threadId } from "node:worker_threads";
import path from "node:path";
const directory = process.env.TSG_RUNTIME_GUARD_DIR;
let evidence;
if (directory) {
  mkdirSync(directory, { recursive: true });
  evidence = path.join(directory, `${process.pid}-${threadId}.jsonl`);
  writeFileSync(
    evidence,
    JSON.stringify({ event: "instrumented", threadId }) + "\n",
  );
}
const deny = (api) => () => {
  if (evidence)
    appendFileSync(evidence, JSON.stringify({ event: "denied", api }) + "\n");
  throw new Error("Runtime attempted network or child-process access: " + api);
};
for (const [name, module, methods] of [
  ["http", http, ["request", "get"]],
  ["https", https, ["request", "get"]],
  ["net", net, ["connect", "createConnection"]],
  ["tls", tls, ["connect"]],
  ["http2", http2, ["connect"]],
  ["dgram", dgram, ["createSocket"]],
  [
    "child",
    child,
    [
      "spawn",
      "spawnSync",
      "exec",
      "execSync",
      "execFile",
      "execFileSync",
      "fork",
    ],
  ],
])
  for (const method of methods) module[method] = deny(name + "." + method);
net.Socket.prototype.connect = deny("net.Socket.connect");
for (const name of Object.keys(dns).filter((n) =>
  /^(?:lookup|resolve)/.test(n),
)) {
  if (typeof dns[name] === "function") dns[name] = deny("dns." + name);
  if (typeof dns.promises[name] === "function")
    dns.promises[name] = deny("dns.promises." + name);
}
globalThis.fetch = deny("fetch");
globalThis.WebSocket = deny("WebSocket");
syncBuiltinESMExports();
