/**
 * Módulo "quiz" (ver src/mods/README.md): ranking de amigos do quiz "Quanto você conhece o casal?".
 *
 * Público (sem login)
 *   POST /api/site/:slug/quiz            { name, answers: [índices], seconds, device? } → pontuação calculada AQUI a partir de quiz_json;
 *                                        UMA jogada por pessoa: 409 ja_jogou se o nome (normalizado) ou o aparelho já jogou
 *   POST /api/site/:slug/quiz/inicio     { name?, device? } → { played: false } ou o resultado de quem já jogou (posição + top 10).
 *                                        Sem nome: só confere o aparelho (abrir a página). Dá ao aparelho um id (cookie + JSON).
 *   GET  /api/site/:slug/quiz/ranking    top 10 (nome, acertos, total)
 * Painel (sessão + papel; casamento SEMPRE da sessão)
 *   GET    /api/admin/quiz               ranking completo
 *   DELETE /api/admin/quiz/:id           "Liberar nova tentativa": apaga a jogada (nome e aparelho) do ranking (audit)
 *
 * Uma vez por pessoa (convidado não tem conta; é o melhor que dá sem login): nome normalizado (sem acento, minúsculo)
 * OU o mesmo aparelho. O aparelho é um id aleatório num cookie próprio (HttpOnly, 400 dias) com cópia no localStorage
 * (para quando o cookie some); o banco guarda só o sha256. Outro navegador com outro nome passa: limite honesto, não prova.
 *
 * Desempate: mais acertos, depois menor tempo (o tempo vem do navegador; fica limitado a 5 s – 1 h), depois quem chegou antes.
 */
import { json, fail, str, int, body, uid, randomToken, sha256, rateLimit, clientIp, audit, parseJson } from "../lib.js";
import { featureOn } from "./plataforma.js";

export const TOP = 10;
export const SECONDS = [5, 3600];
const LIMIT_POST = 20, LIMIT_GET = 300; // por IP, por hora

/** "  Zé  da SILVA " → "ze da silva" (sem acentos, minúsculo, espaços simples). */
export const normName = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const ORDER = "score DESC, seconds ASC, created_at ASC, id ASC";

/* ---------- aparelho: id aleatório (cookie próprio + cópia no localStorage), só o hash vai para o banco ---------- */
const DEV_RE = /^[A-Za-z0-9_-]{16,64}$/;
const devCookie = url => (url.protocol === "https:" ? "__Host-quizdev" : "quizdev");
function readCookie(req, name) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name.replace(/[-_]/g, "\\$&") + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
/** Id do aparelho: cookie, senão o que o navegador guardou; senão um novo. Devolve { id, hash, cookie (Set-Cookie ou null) }. */
async function device(req, url, fromBody) {
  let id = readCookie(req, "__Host-quizdev") || readCookie(req, "quizdev");
  const had = !!(id && DEV_RE.test(id));
  if (!had) id = typeof fromBody === "string" && DEV_RE.test(fromBody) ? fromBody : randomToken(18);
  const secure = url.protocol === "https:";
  const cookie = had ? null : `${devCookie(url)}=${id}; HttpOnly${secure ? "; Secure" : ""}; SameSite=Lax; Path=/; Max-Age=${400 * 86400}`;
  return { id, hash: await sha256("quizdev:" + id), cookie };
}
/** A jogada que já existe para esse nome ou aparelho (ou null). */
async function playedBy(env, W, norm, devHash) {
  return env.DB.prepare(`SELECT id, name, score, total, seconds, created_at FROM quiz_scores WHERE wedding_id = ? AND (name_norm = ? OR device_hash = ?)
    ORDER BY (name_norm = ?) DESC LIMIT 1`).bind(W, norm || "", devHash, norm || "").first();
}
async function placeOf(env, W, row) {
  const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM quiz_scores WHERE wedding_id = ?1 AND (score > ?2 OR (score = ?2 AND seconds < ?3)
      OR (score = ?2 AND seconds = ?3 AND (created_at < ?4 OR (created_at = ?4 AND id < ?5))))`)
    .bind(W, row.score, row.seconds, row.created_at, row.id).first();
  return ahead.n + 1;
}
/** Resultado de quem já jogou: a própria marca, posição e top 10 (o próprio nome marcado). */
async function resultOf(env, W, row) {
  return { name: row.name, score: row.score, total: row.total, position: await placeOf(env, W, row), count: await countOf(env, W),
    top: (await topOf(env, W)).map(({ id, ...x }) => ({ ...x, me: id === row.id })) };
}
const withCookie = (res, cookie) => { if (cookie) res.headers.append("Set-Cookie", cookie); return res; };
const ALREADY = "Você já respondeu o quiz! Cada pessoa joga uma vez.";
function nameOf(b) {
  const name = str(b.name, { min: 2, max: 40, field: "Seu nome" });
  if (/[\u0000-\u001f\u007f<>]/.test(name) || !/[\p{L}\p{N}]/u.test(name)) fail(400, "Seu nome: use letras", "invalid");
  const norm = normName(name);
  if (norm.length < 2) fail(400, "Seu nome: obrigatório", "required");
  return { name, norm };
}

/** Antes de começar (e ao abrir a página): esse nome ou esse aparelho já jogou? */
async function check(ctx, slug) {
  const { req, env, url } = ctx;
  const { W } = await quizOf(env, slug);
  await rateLimit(env, "quizc:" + clientIp(req), LIMIT_GET);
  const b = await body(req, 2000);
  const dev = await device(req, url, b.device);
  const norm = b.name ? nameOf(b).norm : "";
  const row = await playedBy(env, W, norm, dev.hash);
  return withCookie(json(row ? { played: true, device: dev.id, ...(await resultOf(env, W, row)) } : { played: false, device: dev.id }), dev.cookie);
}

async function quizOf(env, slug) {
  const w = await env.DB.prepare("SELECT id, quiz_json, features_json FROM weddings WHERE slug = ?").bind(slug).first();
  const quiz = w ? parseJson(w.quiz_json, []) : [];
  if (!w || !Array.isArray(quiz) || !quiz.length || !featureOn(w, "quiz")) fail(404, "Quiz não encontrado", "not_found");
  return { W: w.id, quiz };
}
const topOf = async (env, W) => (await env.DB.prepare(`SELECT id, name, score, total FROM quiz_scores WHERE wedding_id = ? ORDER BY ${ORDER} LIMIT ?`).bind(W, TOP).all()).results;
const countOf = async (env, W) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM quiz_scores WHERE wedding_id = ?").bind(W).first()).n;

async function play(ctx, slug) {
  const { req, env, url } = ctx;
  const { W, quiz } = await quizOf(env, slug);
  await rateLimit(env, "quiz:" + clientIp(req), LIMIT_POST);
  const b = await body(req, 4000);
  const { name, norm } = nameOf(b);
  const dev = await device(req, url, b.device);
  const prev = await playedBy(env, W, norm, dev.hash);
  if (prev) return withCookie(json({ error: ALREADY, code: "ja_jogou", played: true, device: dev.id, ...(await resultOf(env, W, prev)) }, 409), dev.cookie);
  if (!Array.isArray(b.answers)) fail(400, "Respostas: inválidas", "invalid");
  if (b.answers.length !== quiz.length) fail(409, "O quiz foi atualizado pelos noivos. Recarregue a página e jogue de novo.", "quiz_changed");
  const answers = b.answers.map((a, i) => int(a, { min: 0, max: 3, field: `Resposta ${i + 1}` }));
  const secs = Number(b.seconds);
  if (!Number.isFinite(secs)) fail(400, "Tempo: inválido", "invalid");
  const seconds = Math.min(SECONDS[1], Math.max(SECONDS[0], Math.round(secs)));
  // a pontuação vem SEMPRE do gabarito guardado no servidor
  const score = answers.reduce((n, a, i) => n + (a === quiz[i].answer ? 1 : 0), 0), total = quiz.length;

  // uma vez só: o UNIQUE (wedding_id, name_norm) segura duas jogadas simultâneas com o mesmo nome
  const r = await env.DB.prepare(`INSERT INTO quiz_scores (id, wedding_id, name, name_norm, score, total, seconds, device_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wedding_id, name_norm) DO NOTHING`).bind(uid("qz_"), W, name, norm, score, total, seconds, dev.hash).run();
  const row = await playedBy(env, W, norm, dev.hash);
  if (!r.meta?.changes) return withCookie(json({ error: ALREADY, code: "ja_jogou", played: true, device: dev.id, ...(await resultOf(env, W, row)) }, 409), dev.cookie);
  const res = await resultOf(env, W, row);
  return withCookie(json({ ok: true, score, total, seconds, device: dev.id, position: res.position, count: res.count, top: res.top }, 201), dev.cookie);
}

async function ranking(ctx, slug) {
  const { req, env } = ctx;
  const { W } = await quizOf(env, slug);
  await rateLimit(env, "quizr:" + clientIp(req), LIMIT_GET);
  return json({ top: (await topOf(env, W)).map(({ id, ...x }) => x), count: await countOf(env, W) });
}

export default {
  name: "quiz",
  async public(ctx) {
    const { p, m } = ctx; let r;
    if ((r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/quiz$/)) && m === "POST") { ctx.sameOrigin(); return play(ctx, r[1]); }
    if ((r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/quiz\/ranking$/)) && m === "GET") return ranking(ctx, r[1]);
    if ((r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/quiz\/inicio$/)) && m === "POST") { ctx.sameOrigin(); return check(ctx, r[1]); }
    return null;
  },
  async admin({ p, m, env, W, actor }) {
    if (p === "/api/admin/quiz" && m === "GET") {
      const items = (await env.DB.prepare(`SELECT id, name, score, total, seconds, created_at FROM quiz_scores WHERE wedding_id = ? ORDER BY ${ORDER}`).bind(W).all()).results;
      return json({ items: items.map((x, i) => ({ ...x, position: i + 1 })) });
    }
    let r;
    if ((r = p.match(/^\/api\/admin\/quiz\/([\w-]{4,40})$/)) && m === "DELETE") {
      const own = await env.DB.prepare("SELECT id, name FROM quiz_scores WHERE id = ? AND wedding_id = ?").bind(r[1], W).first();
      if (!own) fail(404, "Nome não encontrado no ranking", "not_found");
      await env.DB.prepare("DELETE FROM quiz_scores WHERE id = ? AND wedding_id = ?").bind(r[1], W).run();
      await audit(env, W, actor, "quiz.retry", r[1]); // libera nova tentativa (nome e aparelho)
      return json({ ok: true });
    }
    return null;
  },
  async exportData(env, W) {
    return { quiz_scores: (await env.DB.prepare(`SELECT id, name, score, total, seconds, created_at FROM quiz_scores WHERE wedding_id = ? ORDER BY ${ORDER}`).bind(W).all()).results };
  },
  async purgeGuests(env, W) {
    await env.DB.prepare("DELETE FROM quiz_scores WHERE wedding_id = ?").bind(W).run();
  },
};
