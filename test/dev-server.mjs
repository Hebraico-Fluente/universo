/** Servidor local: o mesmo Worker com banco em memória e dados de demonstração.  Uso: npm run dev  →  http://localhost:8787 */
import http from "node:http";
import { handle } from "../src/worker.js";
import { localEnv } from "./local-env.mjs";

const PORT = Number(process.env.PORT || 8787);
const env = await localEnv();
// link de acesso de teste (só local): DEV_ACCESS_TOKEN=... npm run dev  →  /painel?acesso=...
if (process.env.DEV_ACCESS_TOKEN) {
  const { sha256 } = await import("../src/lib.js");
  env._db.prepare("INSERT INTO access_invites (token_hash, wedding_id, role, expires_at) VALUES (?, 'w_petalucas', 'owner', ?)").run(await sha256(process.env.DEV_ACCESS_TOKEN), new Date(Date.now() + 864e5).toISOString());
}
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  headers.set("CF-Connecting-IP", req.socket.remoteAddress || "local");
  const r = await handle(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
  const out = {}; r.headers.forEach((v, k) => { out[k] = k === "set-cookie" ? r.headers.getSetCookie() : v; });
  res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`Universo em http://localhost:${PORT}  ·  painel: demo@universo.app / casamento-demo-2027`));
