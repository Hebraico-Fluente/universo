/** Ambiente local: D1 simulado com node:sqlite e ASSETS servindo public/. Usado pelos testes e pelo servidor de desenvolvimento. */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedSql } from "../scripts/seed.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export async function localEnv({ seed = true } = {}) {
  const db = new DatabaseSync(":memory:");
  // aplica as migrações em ordem, como o deploy faz (cada módulo traz as suas)
  const dir = path.join(ROOT, "migrations");
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  if (seed) db.exec(await seedSql());
  const stmt = (sql) => {
    let args = [];
    const st = db.prepare(sql);
    return {
      bind(...a) { args = a.map(v => (v === undefined ? null : v)); return this; },
      async all() { return { results: st.all(...args) }; },
      async first() { return st.get(...args) ?? null; },
      async run() { const r = st.run(...args); return { meta: { changes: r.changes } }; },
      _run() { return st.run(...args); },
    };
  };
  const DB = {
    prepare: stmt,
    async batch(list) { db.exec("BEGIN"); try { for (const s of list) s._run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return []; },
  };
  const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json" };
  const ASSETS = {
    async fetch(req) {
      const u = new URL(req.url);
      const f = path.join(ROOT, "public", decodeURIComponent(u.pathname));
      if (!f.startsWith(path.join(ROOT, "public")) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        const nf = path.join(ROOT, "public", "404.html");
        return new Response(fs.existsSync(nf) ? fs.readFileSync(nf) : "Não encontrado", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const type = TYPES[path.extname(f)] || "application/octet-stream", size = fs.statSync(f).size;
      // como os arquivos estáticos da Cloudflare: aceita Range (o Safari só toca vídeo com 206)
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") || "");
      if (m && (m[1] !== "" || m[2] !== "")) {
        let start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
        let end = m[1] === "" || m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
        if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
        const buf = fs.readFileSync(f).subarray(start, end + 1);
        return new Response(buf, { status: 206, headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(buf.length) } });
      }
      return new Response(fs.readFileSync(f), { headers: { "Content-Type": type, "Accept-Ranges": "bytes" } });
    },
  };
  return { DB, ASSETS, _db: db };
}
