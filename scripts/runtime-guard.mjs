import http from "node:http";
import https from "node:https";
import net from "node:net";
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const deny = () => {
  throw new Error("Runtime attempted network or child-process access");
};
http.request = deny;
http.get = deny;
https.request = deny;
https.get = deny;
net.connect = deny;
net.createConnection = deny;
child.spawn = deny;
child.exec = deny;
child.execFile = deny;
globalThis.fetch = deny;
syncBuiltinESMExports();
