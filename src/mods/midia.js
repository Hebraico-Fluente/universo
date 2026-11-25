/**
 * Módulo "midia" (contrato em src/mods/README.md): arquivos, galeria colaborativa, telão ao vivo,
 * cápsula do tempo, memórias pós-casamento, legado e modo aniversário.
 *
 * Arquivos (src/mods/midia/store.js — putFile/getFile; R2 se houver binding MEDIA, senão D1 em pedaços)
 *   GET  /m/:id                         serve o arquivo (rota fora de /api: precisa do gancho raw() no worker — ver README do relatório)
 *   GET  /api/media/:id                 o mesmo, por /api (funciona sem mudar o worker)
 *   POST /api/admin/media               corpo = arquivo; Content-Type do arquivo; X-File-Name (URI-encoded); ?public=1&kind=site|gallery|memory|legacy|file
 *   DELETE /api/admin/media/:id
 *
 * Site (públicas: mesma origem + limite por IP/aparelho + validação)
 *   POST /api/site/:slug/fotos          multipart: file, author?, consent=1   → foto pendente
 *   POST /api/site/:slug/capsula        multipart: author, message, months (6|12), consent=1, file? (foto/áudio)
 *                                       (years=1 de páginas antigas em cache vira months=12; 5 e 10 anos não são mais aceitos)
 *   GET  /api/telao/:token              fotos e recados aprovados para o telão (token só por hash)
 *
 * Painel
 *   GET  /api/admin/fotos   · POST /api/admin/fotos {media_id, moment, caption} · PATCH|DELETE /api/admin/fotos/:id
 *   POST /api/admin/fotos/lote {ids, action: approve|delete|moment, moment}
 *   GET|PATCH /api/admin/midia/ajustes
 *   POST /api/admin/telao (link novo, mostrado uma vez; revoga o anterior) · DELETE /api/admin/telao (revoga)
 *   GET  /api/admin/capsulas (contagem por data; conteúdo só das abertas e só para o casal) · DELETE /api/admin/capsulas/:id (só abertas)
 *   GET  /api/admin/lembrancas?area=memory|legacy · POST · PATCH|DELETE /api/admin/lembrancas/:id
 *   GET  /api/admin/midia/export        lista de arquivos (URL + metadados) e textos, para o .zip montado no navegador
 *
 * Pasta do Google Drive (guia em docs/drive-fotos/LEIA-ME.md)
 *   GET|PATCH /api/admin/midia/drive    {pasta_url} — só os noivos (owner) editam. Preenchida, o site troca o
 *                                       formulário de envio de fotos por um botão que abre a pasta (nova aba).
 */
import { json, err, fail, str, int, oneOf, body, randomToken, uid, sha256, rateLimit, clientIp, audit, parseJson } from "../lib.js";
import { featureOn } from "./plataforma.js";
import { putFile, getFile, deleteFile, fileMeta, respond, mode, mediaUrl, TYPES, QUOTA, KINDS } from "./midia/store.js";

export { putFile, getFile, deleteFile };

const MB = 1024 * 1024;
export const MOMENTS = [
  ["preparativos", "Preparativos e making of"], ["cerimonia", "Cerimônia"], ["recepcao", "Recepção"],
  ["festa", "Festa"], ["ensaio", "Ensaio do casal"], ["outros", "Outros momentos"],
];
const MOMENT_KEYS = MOMENTS.map(m => m[0]);
/** Quando a cápsula abre, em meses depois do casamento. Cápsulas antigas de 5 e 10 anos (60/120) continuam valendo. */
export const MONTHS = [6, 12];
/** "6 meses", "1 ano", "5 anos"… */
export const periodLabel = m => m % 12 ? `${m} ${m === 1 ? "mês" : "meses"}` : `${m / 12} ${m === 12 ? "ano" : "anos"}`;
/** Meses de uma cápsula (linhas anteriores à migração 0078 só têm `years`). */
export const monthsOf = c => Number(c.months) || Number(c.years) * 12;
const MEMORY_KINDS = ["vow", "speech", "other"], LEGACY_KINDS = ["letter", "vow", "audio", "tradition", "other"];
const LIMITS = { photoIp: 40, photoDevice: 15, capsuleIp: 10, wallIp: 600 };

/* ---------------- datas (fuso de Brasília, sem horário de verão) ---------------- */
export const todaySP = (now = new Date()) => new Date(now.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const dayOf = w => String(w.date_iso || "").slice(0, 10);
/**
 * Mesmo dia N meses depois. Se o mês de destino é mais curto, vale o último dia dele
 * (31/08 + 6 meses → 28/02, ou 29/02 em ano bissexto; 29/02 + 12 meses → 28/02).
 */
export function addMonths(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const t = y * 12 + (m - 1) + n, ty = Math.floor(t / 12), tm = t % 12 + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
/** Mesma data N anos depois (29/02 vira 28/02 em ano não bissexto). */
export const addYears = (day, n) => addMonths(day, 12 * n);
/** Depois do casamento? Hoje é aniversário (e de quantos anos)? */
export { dayOf };
export function phase(w, today = todaySP()) {
  const day = dayOf(w);
  const years = Number(today.slice(0, 4)) - Number(day.slice(0, 4));
  return { after: today > day, anniversary: years >= 1 && addYears(day, years) === today ? years : 0 };
}

/* ---------------- ajustes ---------------- */
const DEFAULTS = { gallery_on: 0, uploads_on: 0, capsule_on: 0, memories_on: 0, anniversary_on: 1, playlist_url: "", timeline_json: "[]", renewal_text: "" };
async function settings(env, W) {
  const s = await env.DB.prepare("SELECT * FROM media_settings WHERE wedding_id = ?").bind(W).first();
  const r = { ...DEFAULTS, ...(s || {}) };
  return { gallery_on: !!r.gallery_on, uploads_on: !!r.uploads_on, capsule_on: !!r.capsule_on, memories_on: !!r.memories_on, anniversary_on: !!r.anniversary_on,
    playlist_url: r.playlist_url, timeline: parseJson(r.timeline_json, []), renewal_text: r.renewal_text };
}
async function memoriesLive(env, W) {
  const w = await env.DB.prepare("SELECT date_iso FROM weddings WHERE id = ?").bind(W).first();
  return !!w && phase(w).after && (await settings(env, W)).memories_on;
}

/* ---------------- utilidades ---------------- */
const bool = v => v === true || v === 1 || v === "1";
/** Texto longo com quebras de linha (cartas, recados da cápsula). */
function longText(v, { min = 0, max = 2000, field = "Texto" } = {}) {
  if (v == null) v = "";
  if (typeof v !== "string") fail(400, `${field}: texto inválido`, "invalid");
  v = v.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (v.length < min) fail(400, `${field}: obrigatório`, "required");
  if (v.length > max) fail(400, `${field}: no máximo ${max} caracteres`, "too_long");
  return v;
}
async function readForm(req, maxBytes) {
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > maxBytes) fail(413, `Arquivo grande demais: o limite é ${Math.round(maxBytes / MB) - 1} MB.`, "too_large");
  try { return await req.formData(); } catch { fail(400, "Envio inválido. Tente de novo.", "invalid_form"); }
}
const isFile = f => f && typeof f === "object" && typeof f.arrayBuffer === "function" && f.size > 0;
const ids = (v, max = 200) => {
  if (!Array.isArray(v) || !v.length || v.length > max || v.some(x => typeof x !== "string" || !/^[\w-]{2,40}$/.test(x))) fail(400, "Seleção inválida", "invalid");
  return [...new Set(v)];
};
const inList = n => Array(n).fill("?").join(", ");
const ownerOnly = s => { if (s.role !== "owner") fail(403, "Só os noivos têm acesso a esta área", "forbidden"); };

/* ---------------- servir arquivos ---------------- */
async function serve(ctx, id) {
  const { req, env } = ctx;
  const nf = () => err(404, "Arquivo não encontrado", "not_found");
  const meta = await fileMeta(env, id);
  if (!meta) return nf();
  if (meta.public) return respond(req, env, meta, "public");
  if (meta.kind === "memory" && await memoriesLive(env, meta.wedding_id)) return respond(req, env, meta, "short");
  let s = null; try { s = await ctx.session(); } catch { /* sem sessão */ }
  // privado: só o casal dono (mesma resposta para "não existe" e "não é seu")
  if (!s || s.wedding_id !== meta.wedding_id) return nf();
  if (meta.kind === "legacy" && s.role !== "owner") return nf();
  if (meta.kind === "capsule") {
    const c = await env.DB.prepare("SELECT opened_at FROM capsules WHERE media_id = ? AND wedding_id = ?").bind(id, meta.wedding_id).first();
    if (!c || !c.opened_at || s.role !== "owner") return nf(); // lacrada: ninguém vê antes da data
  }
  return respond(req, env, meta, "private");
}

/* ---------------- site: convidados ---------------- */
async function weddingBySlug(env, slug) {
  return env.DB.prepare("SELECT id, slug, names, date_iso, features_json, guestbook FROM weddings WHERE slug = ?").bind(slug).first();
}
async function guestPhoto(ctx, slug) {
  const { req, env } = ctx;
  const w = await weddingBySlug(env, slug);
  if (!w || !featureOn(w, "galeria")) fail(404, "Galeria não encontrada", "not_found");
  if (!(await settings(env, w.id)).uploads_on) fail(403, "O envio de fotos está fechado no momento.", "closed");
  await rateLimit(env, "foto:" + clientIp(req), LIMITS.photoIp);
  const dev = req.headers.get("X-Device") || "";
  if (/^[A-Za-z0-9_-]{8,40}$/.test(dev)) await rateLimit(env, "foto-dev:" + dev, LIMITS.photoDevice);
  const f = await readForm(req, 9 * MB);
  if (f.get("consent") !== "1") fail(400, "Confirme que concorda com a publicação depois da aprovação.", "consent");
  const author = str(f.get("author") ?? "", { max: 60, field: "Seu nome" });
  const moment = f.get("moment") ? oneOf(f.get("moment"), MOMENT_KEYS, "Momento") : "festa";
  const file = f.get("file");
  if (!isFile(file)) fail(400, "Escolha uma foto", "required");
  if (!String(file.type).startsWith("image/")) fail(415, "Envie uma foto (JPG, PNG ou WebP).", "bad_type");
  const m = await putFile(env, w.id, { bytes: await file.arrayBuffer(), type: file.type, name: file.name, kind: "gallery", maxBytes: 8 * MB });
  await env.DB.prepare("INSERT INTO gallery_photos (id, wedding_id, media_id, moment, author, source, status) VALUES (?, ?, ?, ?, ?, 'guest', 'pending')")
    .bind(uid("gp_"), w.id, m.id, moment, author).run();
  return json({ ok: true, status: "pending" }, 201);
}
async function guestCapsule(ctx, slug) {
  const { req, env } = ctx;
  const w = await weddingBySlug(env, slug);
  if (!w || !featureOn(w, "capsula") || !(await settings(env, w.id)).capsule_on) fail(404, "Cápsula do tempo não encontrada", "not_found");
  await rateLimit(env, "capsula:" + clientIp(req), LIMITS.capsuleIp);
  const f = await readForm(req, 9 * MB);
  if (f.get("consent") !== "1") fail(400, "Confirme que entendeu como a cápsula funciona.", "consent");
  const author = str(f.get("author"), { min: 2, max: 60, field: "Seu nome" });
  const message = longText(f.get("message"), { min: 2, max: 3000, field: "Mensagem" });
  // novo: months (6|12); páginas antigas ainda em cache mandam years=1 (= 12 meses). 5 e 10 anos não são mais oferecidos.
  const months = f.get("months") != null && f.get("months") !== "" ? int(f.get("months"), { min: 1, max: 120, field: "Quando abrir" })
    : f.get("years") === "1" ? 12 : 0;
  if (!MONTHS.includes(months)) fail(400, "Quando abrir: escolha daqui a 6 meses ou daqui a 1 ano", "invalid");
  const opens = addMonths(dayOf(w), months);
  if (opens <= todaySP()) fail(400, "Essa data já passou. Escolha um aniversário mais adiante.", "past");
  const file = f.get("file");
  let media = null;
  if (isFile(file)) {
    const t = String(file.type);
    if (!t.startsWith("image/") && !t.startsWith("audio/")) fail(415, "Junte uma foto ou um áudio.", "bad_type");
    media = await putFile(env, w.id, { bytes: await file.arrayBuffer(), type: t, name: file.name || (t.startsWith("audio/") ? "audio" : "foto"), kind: "capsule", maxBytes: t.startsWith("audio/") ? 6 * MB : 8 * MB });
  }
  // `years` = 1 só para o CHECK antigo da coluna; quem manda é `months` (migração 0078)
  await env.DB.prepare("INSERT INTO capsules (id, wedding_id, author, message, media_id, years, months) VALUES (?, ?, ?, ?, ?, 1, ?)").bind(uid("cp_"), w.id, author, message, media?.id || null, months).run();
  return json({ ok: true, opens }, 201);
}

/* ---------------- telão ---------------- */
async function wall(ctx, token) {
  const { req, env } = ctx;
  await rateLimit(env, "telao:" + clientIp(req), LIMITS.wallIp);
  const w = await env.DB.prepare("SELECT w.id, w.slug, w.names, w.theme, w.universe, w.date_iso, w.features_json, w.guestbook FROM media_walls mw JOIN weddings w ON w.id = mw.wedding_id WHERE mw.token_hash = ?").bind(await sha256(token)).first();
  if (!w || !featureOn(w, "galeria")) fail(404, "Este link do telão não vale mais. Peça um novo aos noivos.", "not_found");
  const photos = (await env.DB.prepare("SELECT g.id, g.media_id, g.moment, g.caption FROM gallery_photos g WHERE g.wedding_id = ? AND g.status = 'approved' ORDER BY g.created_at DESC LIMIT 120").bind(w.id).all()).results;
  const msgs = w.guestbook ? (await env.DB.prepare("SELECT id, author, message FROM guestbook WHERE wedding_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 60").bind(w.id).all()).results : [];
  return json({
    wedding: { names: w.names, slug: w.slug, theme: w.theme || "", universe: w.universe, date: w.date_iso },
    photos: photos.map(p => ({ id: p.id, url: mediaUrl(p.media_id), moment: p.moment, caption: p.caption })),
    messages: msgs, refresh: 20, moments: Object.fromEntries(MOMENTS),
  }, 200, { "X-Robots-Tag": "noindex" });
}

/* ---------------- cápsulas: abertura ---------------- */
/** Abre as cápsulas cuja data chegou (de um casamento ou de todos). Devolve quantas abriu. */
export async function openDue(env, today, W = null) {
  const rows = (await env.DB.prepare(`SELECT c.id, c.years, c.months, w.date_iso FROM capsules c JOIN weddings w ON w.id = c.wedding_id WHERE c.opened_at IS NULL${W ? " AND c.wedding_id = ?" : ""}`)
    .bind(...(W ? [W] : [])).all()).results;
  const due = rows.filter(r => addMonths(dayOf(r), monthsOf(r)) <= today).map(r => r.id);
  for (let i = 0; i < due.length; i += 50) {
    const part = due.slice(i, i + 50);
    await env.DB.prepare(`UPDATE capsules SET opened_at = datetime('now') WHERE opened_at IS NULL AND id IN (${inList(part.length)})`).bind(...part).run();
  }
  return due.length;
}

/* ---------------- painel ---------------- */
async function uploadAdmin(ctx) {
  const { req, env, W, url } = ctx;
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > 26 * MB) fail(413, "Arquivo grande demais", "too_large");
  const kind = url.searchParams.get("kind") || "file";
  if (!KINDS.includes(kind) || kind === "capsule") fail(400, "Tipo de mídia inválido", "invalid");
  if (kind === "legacy") ownerOnly(ctx.s);
  let name = req.headers.get("X-File-Name") || "";
  try { name = decodeURIComponent(name); } catch { /* nome cru */ }
  const pub = url.searchParams.get("public") === "1" && (kind === "site" || kind === "gallery" || kind === "file");
  const bytes = new Uint8Array(await req.arrayBuffer());
  const f = await putFile(env, W, { bytes, type: req.headers.get("Content-Type"), name, public: pub, kind });
  await audit(env, W, ctx.actor, "media.upload", f.id);
  return json(f, 201);
}
async function deleteMedia(ctx, id) {
  const { env, W } = ctx;
  const meta = await env.DB.prepare("SELECT id, kind FROM media WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!meta) fail(404, "Arquivo não encontrado", "not_found");
  if (meta.kind === "capsule") {
    const c = await env.DB.prepare("SELECT opened_at FROM capsules WHERE media_id = ? AND wedding_id = ?").bind(id, W).first();
    if (c && !c.opened_at) fail(409, "Este arquivo está numa cápsula ainda lacrada.", "sealed");
  }
  if (meta.kind === "legacy") ownerOnly(ctx.s);
  await deleteFile(env, W, id);
  await audit(env, W, ctx.actor, "media.delete", id);
  return json({ ok: true });
}

async function photosAdmin(env, W) {
  const w = await env.DB.prepare("SELECT date_iso, features_json, slug FROM weddings WHERE id = ?").bind(W).first();
  const list = (await env.DB.prepare(`SELECT g.id, g.media_id, g.moment, g.caption, g.author, g.source, g.status, g.created_at, m.size
    FROM gallery_photos g JOIN media m ON m.id = g.media_id WHERE g.wedding_id = ? ORDER BY g.status = 'pending' DESC, g.created_at DESC`).bind(W).all()).results;
  const wallRow = await env.DB.prepare("SELECT token_hash IS NOT NULL AS active, created_at FROM media_walls WHERE wedding_id = ?").bind(W).first();
  const used = (await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS s FROM media WHERE wedding_id = ?").bind(W).first()).s;
  const ph = phase(w);
  return json({
    settings: await settings(env, W),
    features: { galeria: featureOn(w, "galeria"), capsula: featureOn(w, "capsula") },
    moments: MOMENTS.map(([key, label]) => ({ key, label })),
    photos: list.map(p => ({ ...p, url: mediaUrl(p.media_id) })),
    wall: { active: !!wallRow?.active, created_at: wallRow?.created_at || null },
    storage: { mode: mode(env), used, quota: QUOTA[mode(env)] },
    wedding: { date: w.date_iso, slug: w.slug, after: ph.after, anniversary: ph.anniversary },
  });
}
async function addPhoto(ctx) {
  const { env, W, req } = ctx;
  const b = await body(req);
  const m = await env.DB.prepare("SELECT id, type FROM media WHERE id = ? AND wedding_id = ?").bind(String(b.media_id || ""), W).first();
  if (!m || !m.type.startsWith("image/")) fail(400, "Foto inválida", "invalid");
  const id = uid("gp_");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO gallery_photos (id, wedding_id, media_id, moment, caption, source, status) VALUES (?, ?, ?, ?, ?, 'couple', 'approved')")
      .bind(id, W, m.id, oneOf(b.moment || "festa", MOMENT_KEYS, "Momento"), str(b.caption, { max: 140, field: "Legenda" })),
    env.DB.prepare("UPDATE media SET public = 1, kind = 'gallery' WHERE id = ? AND wedding_id = ?").bind(m.id, W),
  ]);
  return json({ id }, 201);
}
async function editPhoto(ctx, id) {
  const { env, W, req } = ctx;
  const g = await env.DB.prepare("SELECT * FROM gallery_photos WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!g) fail(404, "Foto não encontrada", "not_found");
  const b = await body(req);
  const moment = b.moment !== undefined ? oneOf(b.moment, MOMENT_KEYS, "Momento") : g.moment;
  const caption = b.caption !== undefined ? str(b.caption, { max: 140, field: "Legenda" }) : g.caption;
  await env.DB.prepare("UPDATE gallery_photos SET moment = ?, caption = ? WHERE id = ? AND wedding_id = ?").bind(moment, caption, id, W).run();
  return json({ ok: true });
}
async function removePhotos(ctx, list) {
  const { env, W } = ctx;
  const rows = (await env.DB.prepare(`SELECT id, media_id FROM gallery_photos WHERE wedding_id = ? AND id IN (${inList(list.length)})`).bind(W, ...list).all()).results;
  for (const r of rows) {
    await env.DB.prepare("DELETE FROM gallery_photos WHERE id = ? AND wedding_id = ?").bind(r.id, W).run();
    await deleteFile(env, W, r.media_id);
  }
  await audit(env, W, ctx.actor, "gallery.delete", String(rows.length));
  return rows.length;
}
async function batchPhotos(ctx) {
  const { env, W, req } = ctx;
  const b = await body(req, 16_000);
  const list = ids(b.ids);
  const action = oneOf(b.action, ["approve", "delete", "moment"], "Ação");
  if (action === "delete") return json({ ok: true, deleted: await removePhotos(ctx, list) });
  if (action === "moment") {
    const moment = oneOf(b.moment, MOMENT_KEYS, "Momento");
    const r = await env.DB.prepare(`UPDATE gallery_photos SET moment = ? WHERE wedding_id = ? AND id IN (${inList(list.length)})`).bind(moment, W, ...list).run();
    return json({ ok: true, changed: r.meta?.changes || 0 });
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE media SET public = 1 WHERE wedding_id = ? AND id IN (SELECT media_id FROM gallery_photos WHERE wedding_id = ? AND id IN (${inList(list.length)}))`).bind(W, W, ...list),
    env.DB.prepare(`UPDATE gallery_photos SET status = 'approved' WHERE wedding_id = ? AND id IN (${inList(list.length)})`).bind(W, ...list),
  ]);
  await audit(env, W, ctx.actor, "gallery.approve", String(list.length));
  return json({ ok: true });
}

async function saveSettings(ctx) {
  const { env, W, req } = ctx;
  const b = await body(req, 24_000);
  const cur = await settings(env, W);
  const flag = k => (b[k] === undefined ? cur[k] : bool(b[k])) ? 1 : 0;
  let playlist = cur.playlist_url;
  if (b.playlist_url !== undefined) {
    playlist = str(b.playlist_url, { max: 300, field: "Link da playlist" });
    if (playlist && !/^https:\/\/[^\s"'<>]+$/.test(playlist)) fail(400, "Link da playlist: use um endereço https://", "invalid");
  }
  let timeline = cur.timeline;
  if (b.timeline !== undefined) {
    if (!Array.isArray(b.timeline) || b.timeline.length > 30) fail(400, "Linha do tempo: até 30 momentos", "invalid");
    timeline = b.timeline.map(t => ({ time: str(t?.time, { max: 12, field: "Horário" }), title: str(t?.title, { min: 2, max: 80, field: "Momento" }), text: str(t?.text, { max: 300, field: "Descrição" }) }));
  }
  const renewal = b.renewal_text !== undefined ? longText(b.renewal_text, { max: 800, field: "Convite de renovação" }) : cur.renewal_text;
  await env.DB.prepare(`INSERT INTO media_settings (wedding_id, gallery_on, uploads_on, capsule_on, memories_on, anniversary_on, playlist_url, timeline_json, renewal_text, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(wedding_id) DO UPDATE SET gallery_on = excluded.gallery_on, uploads_on = excluded.uploads_on,
    capsule_on = excluded.capsule_on, memories_on = excluded.memories_on, anniversary_on = excluded.anniversary_on, playlist_url = excluded.playlist_url,
    timeline_json = excluded.timeline_json, renewal_text = excluded.renewal_text, updated_at = excluded.updated_at`)
    .bind(W, flag("gallery_on"), flag("uploads_on"), flag("capsule_on"), flag("memories_on"), flag("anniversary_on"), playlist, JSON.stringify(timeline), renewal).run();
  return json({ ok: true, settings: await settings(env, W) });
}

async function newWall(ctx) {
  const { env, W, url } = ctx;
  const token = randomToken(24);
  await env.DB.prepare("INSERT INTO media_walls (wedding_id, token_hash, created_at) VALUES (?, ?, datetime('now')) ON CONFLICT(wedding_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at")
    .bind(W, await sha256(token)).run();
  await audit(env, W, ctx.actor, "wall.link");
  return json({ link: url.origin + "/telao/" + token }, 201);
}

/* ---------------- pasta do Google Drive ---------------- */
/** Link de compartilhamento de pasta: https://drive.google.com/drive/folders/<id> (opcionalmente /u/N/ e ?usp=…). */
export const DRIVE_FOLDER_RE = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d\/)?folders\/[A-Za-z0-9_-]{10,200}(?:\?usp=[A-Za-z0-9_]{1,40})?$/;
const driveFolder = async (env, W) => (await env.DB.prepare("SELECT drive_pasta_url FROM media_settings WHERE wedding_id = ?").bind(W).first())?.drive_pasta_url || "";
async function driveAdmin(ctx) {
  const { env, W, s, p, m, req } = ctx;
  if (p !== "/api/admin/midia/drive") return null;
  if (m === "GET") return json({ pasta_url: await driveFolder(env, W), can_edit: s.role === "owner" });
  if (m === "PATCH") {
    ownerOnly(s);
    const u = str((await body(req, 4000)).pasta_url, { max: 300, field: "Link da pasta" });
    if (u && !DRIVE_FOLDER_RE.test(u)) fail(400, "Link da pasta: use o link de compartilhamento da pasta (https://drive.google.com/drive/folders/…)", "invalid");
    await env.DB.prepare("INSERT INTO media_settings (wedding_id, drive_pasta_url) VALUES (?, ?) ON CONFLICT(wedding_id) DO UPDATE SET drive_pasta_url = excluded.drive_pasta_url, updated_at = datetime('now')").bind(W, u).run();
    await audit(env, W, ctx.actor, u ? "drive.folder.set" : "drive.folder.clear");
    return json({ pasta_url: u, can_edit: true });
  }
  return null;
}

async function capsulesAdmin(ctx) {
  const { env, W, s } = ctx;
  await openDue(env, todaySP(), W); // se a rotina diária ainda não passou hoje
  const w = await env.DB.prepare("SELECT date_iso, features_json FROM weddings WHERE id = ?").bind(W).first();
  const counts = (await env.DB.prepare("SELECT COALESCE(months, years * 12) AS months, COUNT(*) AS n, COALESCE(SUM(opened_at IS NOT NULL), 0) AS opened FROM capsules WHERE wedding_id = ? GROUP BY 1").bind(W).all()).results;
  // sempre 6 meses e 1 ano; 5 e 10 anos só aparecem se houver cápsulas antigas guardadas para essas datas
  const all = [...new Set([...MONTHS, ...counts.map(c => c.months)])].sort((a, b) => a - b);
  const periods = all.map(mo => { const c = counts.find(x => x.months === mo) || { n: 0, opened: 0 }; return { months: mo, label: periodLabel(mo), opens: addMonths(dayOf(w), mo), total: c.n, opened: c.opened, sealed: c.n - c.opened }; });
  const canRead = s.role === "owner";
  const opened = canRead ? (await env.DB.prepare(`SELECT c.id, c.author, c.message, COALESCE(c.months, c.years * 12) AS months, c.opened_at, c.created_at, c.media_id, m.type AS media_type
    FROM capsules c LEFT JOIN media m ON m.id = c.media_id WHERE c.wedding_id = ? AND c.opened_at IS NOT NULL ORDER BY 4, c.created_at`).bind(W).all()).results
    .map(({ media_type, ...c }) => ({ ...c, label: periodLabel(c.months), media: c.media_id ? { url: mediaUrl(c.media_id), type: media_type } : null })) : [];
  return json({ feature: featureOn(w, "capsula"), periods, opened, can_read: canRead });
}
async function deleteCapsule(ctx, id) {
  const { env, W } = ctx;
  ownerOnly(ctx.s);
  const c = await env.DB.prepare("SELECT id, media_id, opened_at FROM capsules WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!c) fail(404, "Cápsula não encontrada", "not_found");
  if (!c.opened_at) fail(409, "Cápsulas lacradas não podem ser abertas nem apagadas antes da data.", "sealed");
  await env.DB.prepare("DELETE FROM capsules WHERE id = ? AND wedding_id = ?").bind(id, W).run();
  if (c.media_id) await deleteFile(env, W, c.media_id);
  await audit(env, W, ctx.actor, "capsule.delete", id);
  return json({ ok: true });
}

async function keepsakesList(env, W, area) {
  return (await env.DB.prepare(`SELECT k.id, k.area, k.kind, k.title, k.author, k.body, k.media_id, k.sort, k.created_at, m.type AS media_type, m.name AS media_name
    FROM keepsakes k LEFT JOIN media m ON m.id = k.media_id WHERE k.wedding_id = ? AND k.area = ? ORDER BY k.sort, k.created_at`).bind(W, area).all()).results
    .map(k => ({ ...k, media: k.media_id ? { url: mediaUrl(k.media_id), type: k.media_type, name: k.media_name } : null }));
}
async function keepsakeSave(ctx, id) {
  const { env, W, req } = ctx;
  const b = await body(req, 40_000);
  const cur = id ? await env.DB.prepare("SELECT * FROM keepsakes WHERE id = ? AND wedding_id = ?").bind(id, W).first() : null;
  if (id && !cur) fail(404, "Item não encontrado", "not_found");
  const area = cur ? cur.area : oneOf(b.area, ["memory", "legacy"], "Área");
  if (area === "legacy") ownerOnly(ctx.s);
  const kind = b.kind !== undefined ? oneOf(b.kind, area === "memory" ? MEMORY_KINDS : LEGACY_KINDS, "Tipo") : cur?.kind || "other";
  const title = b.title !== undefined ? str(b.title, { min: 2, max: 120, field: "Título" }) : cur.title;
  const author = b.author !== undefined ? str(b.author, { max: 80, field: "De quem" }) : cur?.author || "";
  const text = b.body !== undefined ? longText(b.body, { max: 20000, field: "Texto" }) : cur?.body || "";
  let media = cur?.media_id || null;
  if (b.media_id !== undefined) {
    media = b.media_id || null;
    if (media) {
      const m = await env.DB.prepare("SELECT id, kind FROM media WHERE id = ? AND wedding_id = ?").bind(String(media), W).first();
      if (!m || m.kind !== area) fail(400, "Arquivo inválido para esta área", "invalid");
    }
  }
  if (cur) {
    await env.DB.prepare("UPDATE keepsakes SET kind = ?, title = ?, author = ?, body = ?, media_id = ? WHERE id = ? AND wedding_id = ?").bind(kind, title, author, text, media, id, W).run();
    if (cur.media_id && cur.media_id !== media) await deleteFile(env, W, cur.media_id);
    return json({ ok: true });
  }
  const nid = uid("k_");
  const sort = (await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM keepsakes WHERE wedding_id = ? AND area = ?").bind(W, area).first()).s;
  await env.DB.prepare("INSERT INTO keepsakes (id, wedding_id, area, kind, title, author, body, media_id, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(nid, W, area, kind, title, author, text, media, sort).run();
  return json({ id: nid }, 201);
}
async function keepsakeDelete(ctx, id) {
  const { env, W } = ctx;
  const k = await env.DB.prepare("SELECT id, area, media_id FROM keepsakes WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!k) fail(404, "Item não encontrado", "not_found");
  if (k.area === "legacy") ownerOnly(ctx.s);
  await env.DB.prepare("DELETE FROM keepsakes WHERE id = ? AND wedding_id = ?").bind(id, W).run();
  if (k.media_id) await deleteFile(env, W, k.media_id);
  await audit(env, W, ctx.actor, "keepsake.delete", id);
  return json({ ok: true });
}

/** Tudo o que o casal pode baixar (arquivos com URL + metadados + textos). Lacradas e legado conforme o papel. */
async function exportManifest(env, W, role) {
  const owner = role === "owner";
  await openDue(env, todaySP(), W);
  const w = await env.DB.prepare("SELECT names, slug, date_iso FROM weddings WHERE id = ?").bind(W).first();
  const sealed = (await env.DB.prepare("SELECT c.media_id FROM capsules c WHERE c.wedding_id = ? AND c.opened_at IS NULL AND c.media_id IS NOT NULL").bind(W).all()).results.map(r => r.media_id);
  const files = (await env.DB.prepare("SELECT id, kind, type, name, size, public, storage, created_at FROM media WHERE wedding_id = ? ORDER BY created_at").bind(W).all()).results
    .filter(f => !sealed.includes(f.id) && (owner || (f.kind !== "legacy" && f.kind !== "capsule")))
    .map(f => ({ ...f, public: !!f.public, url: mediaUrl(f.id) }));
  const gallery = (await env.DB.prepare("SELECT id, media_id, moment, caption, author, source, status, created_at FROM gallery_photos WHERE wedding_id = ? ORDER BY created_at").bind(W).all()).results;
  const caps = (await env.DB.prepare("SELECT id, author, message, media_id, COALESCE(months, years * 12) AS months, opened_at, created_at FROM capsules WHERE wedding_id = ?").bind(W).all()).results;
  return {
    exported_at: new Date().toISOString(), wedding: w, storage: mode(env),
    files, gallery,
    capsules: {
      sealed: [...new Set(caps.filter(c => !c.opened_at).map(c => c.months))].sort((a, b) => a - b)
        .map(mo => ({ months: mo, label: periodLabel(mo), opens: addMonths(dayOf(w), mo), count: caps.filter(c => c.months === mo && !c.opened_at).length })),
      opened: owner ? caps.filter(c => c.opened_at) : [],
      note: "Cápsulas lacradas não entram na exportação até a data de abertura.",
    },
    memories: await keepsakesList(env, W, "memory"),
    legacy: owner ? await keepsakesList(env, W, "legacy") : [],
    settings: await settings(env, W),
  };
}

/* ---------------- módulo ---------------- */
export default {
  name: "midia",
  pages: [[/^\/telao\/[A-Za-z0-9_-]{20,64}\/?$/, "/telao.html", true]],

  /** Rotas fora de /api (precisa do gancho no worker): GET /m/:id */
  async raw(ctx) {
    const r = ctx.p.match(/^\/m\/(f_[A-Za-z0-9_-]{8,20})$/);
    if (r && (ctx.m === "GET" || ctx.m === "HEAD")) return serve(ctx, r[1]);
    return null;
  },

  async public(ctx) {
    const { p, m } = ctx;
    let r;
    if ((m === "GET" || m === "HEAD") && (r = p.match(/^\/api\/media\/(f_[A-Za-z0-9_-]{8,20})$/))) return serve(ctx, r[1]);
    if (m === "POST" && (r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/fotos$/))) { ctx.sameOrigin(); return guestPhoto(ctx, r[1]); }
    if (m === "POST" && (r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/capsula$/))) { ctx.sameOrigin(); return guestCapsule(ctx, r[1]); }
    if (m === "GET" && (r = p.match(/^\/api\/telao\/([A-Za-z0-9_-]{20,64})$/))) return wall(ctx, r[1]);
    return null;
  },

  async admin(ctx) {
    const { p, m, env, W, s, url } = ctx;
    let r;
    if (p === "/api/admin/media" && m === "POST") return uploadAdmin(ctx);
    if ((r = p.match(/^\/api\/admin\/media\/(f_[A-Za-z0-9_-]{8,20})$/)) && m === "DELETE") return deleteMedia(ctx, r[1]);

    if (p === "/api/admin/fotos" && m === "GET") return photosAdmin(env, W);
    if (p === "/api/admin/fotos" && m === "POST") return addPhoto(ctx);
    if (p === "/api/admin/fotos/lote" && m === "POST") return batchPhotos(ctx);
    if ((r = p.match(/^\/api\/admin\/fotos\/([\w-]{2,40})$/))) {
      if (m === "PATCH") return editPhoto(ctx, r[1]);
      if (m === "DELETE") { const n = await removePhotos(ctx, [r[1]]); if (!n) fail(404, "Foto não encontrada", "not_found"); return json({ ok: true }); }
    }
    if (p === "/api/admin/midia/ajustes") {
      if (m === "GET") return json({ settings: await settings(env, W) });
      if (m === "PATCH") return saveSettings(ctx);
    }
    if (p === "/api/admin/telao") {
      if (m === "POST") return newWall(ctx);
      if (m === "DELETE") { await env.DB.prepare("UPDATE media_walls SET token_hash = NULL WHERE wedding_id = ?").bind(W).run(); await audit(env, W, ctx.actor, "wall.revoke"); return json({ ok: true }); }
    }
    if (p.startsWith("/api/admin/midia/drive")) return driveAdmin(ctx);
    if (p === "/api/admin/capsulas" && m === "GET") return capsulesAdmin(ctx);
    if ((r = p.match(/^\/api\/admin\/capsulas\/([\w-]{2,40})$/)) && m === "DELETE") return deleteCapsule(ctx, r[1]);
    if (p === "/api/admin/lembrancas") {
      if (m === "GET") { const area = oneOf(url.searchParams.get("area") || "memory", ["memory", "legacy"], "Área"); if (area === "legacy") ownerOnly(s); return json({ items: await keepsakesList(env, W, area) }); }
      if (m === "POST") return keepsakeSave(ctx, null);
    }
    if ((r = p.match(/^\/api\/admin\/lembrancas\/([\w-]{2,40})$/))) {
      if (m === "PATCH") return keepsakeSave(ctx, r[1]);
      if (m === "DELETE") return keepsakeDelete(ctx, r[1]);
    }
    if (p === "/api/admin/midia/export" && m === "GET") { await audit(env, W, ctx.actor, "media.export"); return json(await exportManifest(env, W, s.role)); }
    return null;
  },

  /** Dados públicos do site: só fotos aprovadas, sem nomes de quem enviou. */
  async site(env, w) {
    const s = await settings(env, w.id);
    const gal = featureOn(w, "galeria"), cap = featureOn(w, "capsula");
    const ph = phase(w);
    const out = {};
    const approved = gal && (s.gallery_on || s.uploads_on || (ph.after && s.memories_on) || (ph.anniversary && s.anniversary_on))
      ? (await env.DB.prepare("SELECT media_id, moment, caption FROM gallery_photos WHERE wedding_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 150").bind(w.id).all()).results
        .map(p => ({ url: mediaUrl(p.media_id), moment: p.moment, caption: p.caption }))
      : [];
    if (gal && (s.gallery_on || s.uploads_on || (ph.after && s.memories_on)))
      out.gallery = { show: s.gallery_on || (ph.after && s.memories_on), uploads: s.uploads_on, moments: MOMENTS.map(([key, label]) => ({ key, label })), photos: approved,
        drive_folder: s.uploads_on ? await driveFolder(env, w.id) : "" }; // preenchida: o site mostra o botão da pasta no lugar do formulário
    if (cap && s.capsule_on) out.capsule = { options: MONTHS.map(mo => ({ months: mo, label: periodLabel(mo), opens: addMonths(dayOf(w), mo) })), today: todaySP() };
    if (ph.after && s.memories_on) {
      const items = (await keepsakesList(env, w.id, "memory")).map(k => ({ kind: k.kind, title: k.title, body: k.body, media: k.media ? { url: k.media.url, type: k.media.type } : null }));
      out.memories = { playlist_url: s.playlist_url, timeline: s.timeline, items };
    }
    if (ph.anniversary && s.anniversary_on) out.anniversary = { years: ph.anniversary, renewal_text: s.renewal_text, photos: approved.slice(0, 12) };
    return Object.keys(out).length ? out : null;
  },

  async overview(env, W) {
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM gallery_photos WHERE wedding_id = ? AND status = 'pending'").bind(W).first()).n;
    const alerts = [];
    if (n) alerts.push({ text: `${n} ${n > 1 ? "fotos de convidados esperando aprovação" : "foto de convidado esperando aprovação"}`, href: "#fotos" });
    return { pending_photos: n, alerts };
  },

  /** Exportação completa (LGPD): metadados e URLs dos arquivos. Lacradas não entram; legado só pela aba (só os noivos). */
  async exportData(env, W) {
    const m = await exportManifest(env, W, "planner");
    const legacy = (await env.DB.prepare("SELECT COUNT(*) AS n FROM keepsakes WHERE wedding_id = ? AND area = 'legacy'").bind(W).first()).n;
    return { ...m, legacy_count: legacy, legacy_note: "O legado (só dos noivos) é exportado pela aba Fotos e memórias.",
      drive_note: "Fotos enviadas pela pasta do Google Drive do casal ficam no Drive deles (fora deste serviço), sob controle do próprio casal." };
  },

  async cron(env, now) { await openDue(env, todaySP(now)); },

  /**
   * Limpeza LGPD dos convidados (chamada pelo módulo convidados). Decisão:
   *  • fotos PENDENTES (não aprovadas) de convidados: apagadas, com os arquivos;
   *  • fotos APROVADAS: ficam (são memória do casal), mas o nome de quem enviou é apagado (nunca foi público);
   *  • cápsulas do tempo: ficam inteiras, com o nome de quem escreveu — é uma carta assinada que a pessoa mandou
   *    sabendo que seria guardada e entregue na data (consentimento explícito no envio).
   */
  async purgeGuests(env, W) {
    const pend = (await env.DB.prepare("SELECT id, media_id FROM gallery_photos WHERE wedding_id = ? AND source = 'guest' AND status = 'pending'").bind(W).all()).results;
    for (const r of pend) {
      await env.DB.prepare("DELETE FROM gallery_photos WHERE id = ? AND wedding_id = ?").bind(r.id, W).run();
      await deleteFile(env, W, r.media_id);
    }
    await env.DB.prepare("UPDATE gallery_photos SET author = '' WHERE wedding_id = ? AND source = 'guest'").bind(W).run();
    return { pending_photos_deleted: pend.length };
  },
};
