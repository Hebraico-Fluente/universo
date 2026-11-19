/**
 * Armazenamento de arquivos do Universo (base para todos os módulos).
 *
 *   putFile(env, W, { bytes, type, name, public, kind })  → { id, url, type, size, name }
 *   getFile(env, id)                                       → { meta, body(range?) } | null
 *   deleteFile(env, W, id)
 *
 * Onde fica o conteúdo:
 *   • R2 (binding `MEDIA`) quando existir — recomendado em produção. Para ligar, em wrangler.jsonc:
 *       "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "universo-media" }]
 *     e crie o bucket: npx wrangler r2 bucket create universo-media
 *     Arquivos antigos continuam no D1 (a coluna `storage` diz onde cada um está).
 *   • Sem R2: no próprio D1, em pedaços de até 900 KB (tabela media_chunks). Funciona, mas o D1 tem limite de
 *     tamanho total do banco; por isso o modo D1 tem limites menores (8 MB por arquivo, sem vídeo grande).
 *
 * Segurança: tipo conferido pelos primeiros bytes (não só pelo Content-Type), nome higienizado,
 * id aleatório, isolamento por wedding_id. Quem decide se um arquivo privado pode ser lido é o módulo (canRead).
 */
import { fail, uid } from "../../lib.js";

export const CHUNK = 900 * 1024;
const MB = 1024 * 1024;
/** Tipos aceitos e limites (bytes) por armazenamento. */
export const TYPES = {
  "image/jpeg": { ext: "jpg", d1: 8 * MB, r2: 15 * MB },
  "image/png": { ext: "png", d1: 8 * MB, r2: 15 * MB },
  "image/webp": { ext: "webp", d1: 8 * MB, r2: 15 * MB },
  "video/mp4": { ext: "mp4", d1: 8 * MB, r2: 25 * MB },
  "audio/mpeg": { ext: "mp3", d1: 8 * MB, r2: 15 * MB },
  "audio/mp4": { ext: "m4a", d1: 8 * MB, r2: 15 * MB },
  "audio/webm": { ext: "webm", d1: 8 * MB, r2: 15 * MB },
  "application/pdf": { ext: "pdf", d1: 8 * MB, r2: 15 * MB },
};
/** Espaço total por casamento. */
export const QUOTA = { d1: 250 * MB, r2: 10 * 1024 * MB };
export const KINDS = ["site", "gallery", "capsule", "memory", "legacy", "file"];

export const mode = env => (env.MEDIA ? "r2" : "d1");
export const mediaUrl = id => "/m/" + id;
const key = (W, id) => `w/${W}/${id}`;

/** "image/jpeg; charset=x" → "image/jpeg"; aceita "audio/x-m4a" e "audio/mp3" como sinônimos. */
export function baseType(t) {
  t = String(t || "").split(";")[0].trim().toLowerCase();
  return { "image/jpg": "image/jpeg", "audio/mp3": "audio/mpeg", "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4", "video/webm": "audio/webm" }[t] || t;
}

/** Tipo real pelos primeiros bytes (magic numbers). Devolve a família ou null. */
export function sniff(b) {
  const at = (i, ...xs) => xs.every((x, k) => b[i + k] === x);
  const ascii = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length < 12) return null;
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp")) return "mp4";                       // video/mp4 ou audio/mp4 (mesmo contêiner)
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "audio/webm";   // EBML (webm/matroska)
  if (ascii(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(0, "%PDF-")) return "application/pdf";
  return null;
}

/** Nome seguro: sem caminho, sem caracteres de controle/aspas, até 80 caracteres, extensão do tipo real. */
export function safeName(name, type) {
  let n = String(name || "").split(/[\\/]/).pop().normalize("NFC");
  n = n.replace(/[^\p{L}\p{N} ._()-]/gu, "").replace(/\s+/g, " ").replace(/^[.\s]+/, "").trim();
  n = n.replace(/\.[A-Za-z0-9]{1,5}$/, "").slice(0, 70).trim() || "arquivo";
  return `${n}.${TYPES[type].ext}`;
}

/** Valida tipo, tamanho e assinatura. Devolve o tipo final. */
export function check(env, bytes, declared, { maxBytes } = {}) {
  const type = baseType(declared);
  const spec = TYPES[type];
  if (!spec) fail(415, "Tipo de arquivo não aceito. Envie foto (JPG, PNG, WebP), áudio (MP3, M4A, WebM), vídeo MP4 ou PDF.", "bad_type");
  if (!bytes.length) fail(400, "Arquivo vazio", "empty");
  const m = mode(env);
  if (type === "video/mp4" && m === "d1" && bytes.length > spec.d1)
    fail(413, "Vídeos com mais de 8 MB ainda não são aceitos neste servidor (armazenamento de vídeo não configurado). Envie um trecho menor ou um link.", "video_too_large");
  const limit = Math.min(spec[m], maxBytes || Infinity);
  if (bytes.length > limit) fail(413, `Arquivo grande demais: o limite é ${Math.round(limit / MB)} MB.`, "too_large");
  const real = sniff(bytes);
  const ok = real === type || (real === "mp4" && (type === "video/mp4" || type === "audio/mp4"));
  if (!ok) fail(415, "O conteúdo do arquivo não corresponde ao tipo informado.", "bad_signature");
  return type;
}

/** Guarda um arquivo. bytes: Uint8Array | ArrayBuffer. */
export async function putFile(env, W, { bytes, type, name = "", public: pub = false, kind = "file", maxBytes } = {}) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!KINDS.includes(kind)) fail(400, "Tipo de mídia inválido", "invalid");
  type = check(env, bytes, type, { maxBytes });
  const m = mode(env);
  const used = (await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS s FROM media WHERE wedding_id = ?").bind(W).first()).s;
  if (used + bytes.length > QUOTA[m]) fail(413, "O espaço de arquivos deste casamento acabou. Apague arquivos antigos ou fale com o Gueta Studio.", "quota");
  const id = uid("f_");
  const fname = safeName(name, type);
  const chunks = m === "d1" ? Math.ceil(bytes.length / CHUNK) : 0;
  if (m === "r2") await env.MEDIA.put(key(W, id), bytes, { httpMetadata: { contentType: type }, customMetadata: { wedding: W } });
  await env.DB.prepare("INSERT INTO media (id, wedding_id, kind, type, name, size, public, storage, chunks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, W, kind, type, fname, bytes.length, pub ? 1 : 0, m, chunks).run();
  if (m === "d1") {
    try {
      for (let n = 0; n < chunks; n++)
        await env.DB.prepare("INSERT INTO media_chunks (media_id, n, data) VALUES (?, ?, ?)").bind(id, n, bytes.slice(n * CHUNK, (n + 1) * CHUNK)).run();
    } catch (e) { await deleteFile(env, W, id); throw e; }
  }
  return { id, url: mediaUrl(id), type, size: bytes.length, name: fname };
}

export async function fileMeta(env, id) {
  if (typeof id !== "string" || !/^f_[A-Za-z0-9_-]{8,20}$/.test(id)) return null;
  return env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(id).first();
}

/** Lê o arquivo (ou um intervalo de bytes). Devolve { meta, bytes } ou null. */
export async function getFile(env, id, range) {
  const meta = await fileMeta(env, id);
  if (!meta) return null;
  const start = range ? range.start : 0, end = range ? range.end : meta.size - 1; // inclusivo
  if (meta.storage === "r2") {
    if (!env.MEDIA) return null;
    const o = await env.MEDIA.get(key(meta.wedding_id, id), range ? { range: { offset: start, length: end - start + 1 } } : undefined);
    if (!o) return null;
    return { meta, bytes: new Uint8Array(await o.arrayBuffer()) };
  }
  const first = Math.floor(start / CHUNK), last = Math.floor(end / CHUNK);
  const rows = (await env.DB.prepare("SELECT n, data FROM media_chunks WHERE media_id = ? AND n BETWEEN ? AND ? ORDER BY n").bind(id, first, last).all()).results;
  if (rows.length !== last - first + 1) return null;
  const out = new Uint8Array(end - start + 1);
  let pos = 0;
  for (const r of rows) {
    const d = r.data instanceof Uint8Array ? r.data : new Uint8Array(r.data); // D1 devolve BLOB como array de números
    const from = r.n === first ? start - first * CHUNK : 0;
    const to = r.n === last ? end - last * CHUNK + 1 : d.length;
    out.set(d.subarray(from, to), pos); pos += to - from;
  }
  return { meta, bytes: out };
}

export async function deleteFile(env, W, id) {
  const meta = await env.DB.prepare("SELECT id, storage FROM media WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!meta) return false;
  if (meta.storage === "r2" && env.MEDIA) await env.MEDIA.delete(key(W, id));
  await env.DB.prepare("DELETE FROM media_chunks WHERE media_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM media WHERE id = ? AND wedding_id = ?").bind(id, W).run();
  return true;
}

/** "bytes=0-99" → { start, end } (inclusivo) | null | "bad" */
function parseRange(h, size) {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "bad";
  let start, end;
  if (m[1] === "") { const n = +m[2]; start = Math.max(0, size - n); end = size - 1; }
  else { start = +m[1]; end = m[2] === "" ? size - 1 : Math.min(+m[2], size - 1); }
  if (start > end || start >= size) return "bad";
  return { start, end };
}

/**
 * Resposta HTTP do arquivo. `cache`: "public" (imutável, 1 ano), "short" (público por 5 min) ou "private".
 * Suporta Range (áudio e vídeo no Safari exigem).
 */
export async function respond(req, env, meta, cache) {
  const range = parseRange(req.headers.get("Range"), meta.size);
  const base = {
    "Content-Type": meta.type,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${meta.type === "application/pdf" ? "attachment" : "inline"}; filename="${meta.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Accept-Ranges": "bytes",
    "Cache-Control": cache === "public" ? "public, max-age=31536000, immutable" : cache === "short" ? "public, max-age=300" : "private, no-store",
  };
  if (cache === "private") base["X-Robots-Tag"] = "noindex";
  if (range === "bad") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${meta.size}` } });
  if (req.method === "HEAD") return new Response(null, { status: 200, headers: { ...base, "Content-Length": String(meta.size) } });
  const f = await getFile(env, meta.id, range || undefined);
  if (!f) return new Response("Arquivo indisponível", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (range) return new Response(f.bytes, { status: 206, headers: { ...base, "Content-Range": `bytes ${range.start}-${range.end}/${meta.size}`, "Content-Length": String(f.bytes.length) } });
  return new Response(f.bytes, { status: 200, headers: { ...base, "Content-Length": String(f.bytes.length) } });
}
