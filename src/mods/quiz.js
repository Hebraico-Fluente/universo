/**
 * Módulo "quiz" (ver src/mods/README.md): ranking de amigos do quiz "Quanto você conhece o casal?".
 *
 * Público (sem login)
 *   POST /api/site/:slug/quiz            { name, answers: [índices], seconds } → pontuação calculada AQUI a partir de quiz_json,
 *                                        guarda só a melhor tentativa por nome (normalizado) e devolve a posição + top 10
 *   GET  /api/site/:slug/quiz/ranking    top 10 (nome, acertos, total)
 * Painel (sessão + papel; casamento SEMPRE da sessão)
 *   GET    /api/admin/quiz               ranking completo
 *   DELETE /api/admin/quiz/:id           apaga um nome do ranking (audit)
 *
 * Desempate: mais acertos, depois menor tempo (o tempo vem do navegador; fica limitado a 5 s – 1 h), depois quem chegou antes.
 */
import { json, fail, str, int, body, uid, rateLimit, clientIp, audit, parseJson } from "../lib.js";
import { featureOn } from "./plataforma.js";

export const TOP = 10;
export const SECONDS = [5, 3600];
const LIMIT_POST = 20, LIMIT_GET = 300; // por IP, por hora

/** "  Zé  da SILVA " → "ze da silva" (sem acentos, minúsculo, espaços simples). */
export const normName = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const ORDER = "score DESC, seconds ASC, created_at ASC, id ASC";

async function quizOf(env, slug) {
  const w = await env.DB.prepare("SELECT id, quiz_json, features_json FROM weddings WHERE slug = ?").bind(slug).first();
  const quiz = w ? parseJson(w.quiz_json, []) : [];
  if (!w || !Array.isArray(quiz) || !quiz.length || !featureOn(w, "quiz")) fail(404, "Quiz não encontrado", "not_found");
  return { W: w.id, quiz };
}
const topOf = async (env, W) => (await env.DB.prepare(`SELECT id, name, score, total FROM quiz_scores WHERE wedding_id = ? ORDER BY ${ORDER} LIMIT ?`).bind(W, TOP).all()).results;
const countOf = async (env, W) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM quiz_scores WHERE wedding_id = ?").bind(W).first()).n;

async function play(ctx, slug) {
  const { req, env } = ctx;
  const { W, quiz } = await quizOf(env, slug);
  await rateLimit(env, "quiz:" + clientIp(req), LIMIT_POST);
  const b = await body(req, 4000);
  const name = str(b.name, { min: 2, max: 40, field: "Seu nome" });
  if (/[\u0000-\u001f\u007f<>]/.test(name) || !/[\p{L}\p{N}]/u.test(name)) fail(400, "Seu nome: use letras", "invalid");
  const norm = normName(name);
  if (norm.length < 2) fail(400, "Seu nome: obrigatório", "required");
  if (!Array.isArray(b.answers)) fail(400, "Respostas: inválidas", "invalid");
  if (b.answers.length !== quiz.length) fail(409, "O quiz foi atualizado pelos noivos. Recarregue a página e jogue de novo.", "quiz_changed");
  const answers = b.answers.map((a, i) => int(a, { min: 0, max: 3, field: `Resposta ${i + 1}` }));
  const secs = Number(b.seconds);
  if (!Number.isFinite(secs)) fail(400, "Tempo: inválido", "invalid");
  const seconds = Math.min(SECONDS[1], Math.max(SECONDS[0], Math.round(secs)));
  // a pontuação vem SEMPRE do gabarito guardado no servidor
  const score = answers.reduce((n, a, i) => n + (a === quiz[i].answer ? 1 : 0), 0), total = quiz.length;

  const r = await env.DB.prepare(`INSERT INTO quiz_scores (id, wedding_id, name, name_norm, score, total, seconds) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wedding_id, name_norm) DO UPDATE SET name = excluded.name, score = excluded.score, total = excluded.total, seconds = excluded.seconds, created_at = datetime('now')
    WHERE excluded.score > quiz_scores.score OR (excluded.score = quiz_scores.score AND excluded.seconds < quiz_scores.seconds)`)
    .bind(uid("qz_"), W, name, norm, score, total, seconds).run();
  const best = await env.DB.prepare("SELECT id, score, total, seconds, created_at FROM quiz_scores WHERE wedding_id = ? AND name_norm = ?").bind(W, norm).first();
  const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM quiz_scores WHERE wedding_id = ?1 AND (score > ?2 OR (score = ?2 AND seconds < ?3)
      OR (score = ?2 AND seconds = ?3 AND (created_at < ?4 OR (created_at = ?4 AND id < ?5))))`)
    .bind(W, best.score, best.seconds, best.created_at, best.id).first();
  const top = (await topOf(env, W)).map(({ id, ...x }) => ({ ...x, me: id === best.id }));
  return json({
    ok: true, score, total, seconds, improved: !!r.meta?.changes,
    best: { score: best.score, total: best.total, seconds: best.seconds },
    position: ahead.n + 1, count: await countOf(env, W), top,
  }, 201);
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
      await audit(env, W, actor, "quiz.delete", r[1]);
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
