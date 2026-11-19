/**
 * Módulo "editor" (ver src/mods/README.md): o casal edita o próprio site pelo painel, sem depender do estúdio.
 *
 * Painel (sessão + papel; casamento SEMPRE da sessão; escrita só owner/planner — checado pelo worker)
 *   GET   /api/admin/site            todos os campos editáveis, seções escondidas, histórico recente
 *   PATCH /api/admin/site            alteração parcial (uma seção por vez, ou várias): só os campos enviados mudam
 *   POST  /api/admin/site/undo       desfaz a última alteração ({ section } opcional: a última daquela seção)
 *
 * Esconder uma seção (história, cronograma, traje, dúvidas, presentes, quiz) guarda o conteúdo em editor_state
 * e esvazia a coluna em weddings — o site público (worker.publicWedding) só mostra o que está lá.
 * O endereço (slug) e o tema próprio NÃO são editáveis aqui.
 */
import { json, fail, str, int, oneOf, isoDate, body, audit, parseJson } from "../lib.js";
import { featureOn } from "./plataforma.js";

/** Mesma lista de public/assets/icons.js (o teste confere). */
export const ICONS = ["rings", "music", "pizza", "glass", "sweet", "snack", "moon", "shirt", "shoe", "palette", "pin", "clock", "heart"];
const UNIVERSES = ["timeless", "editorial", "dreamscape"];
export const HIDEABLE = ["story", "schedule", "dress", "faq", "gifts", "quiz"];
const MAX = { story: 12, schedule: 16, dress: 8, faq: 20, gifts: 30, quiz: 12 };
const KEEP_VERSIONS = 60;

/** campo do editor → seção e coluna(s) de weddings */
const FIELDS = {
  names: ["main", "names"], date: ["main", "date_iso"], city: ["main", "city"], venue_name: ["main", "venue_name"],
  rsvp_deadline: ["main", "rsvp_deadline"], welcome: ["main", "welcome"], rsvp_note: ["main", "rsvp_note"],
  universe: ["look", "universe"],
  hero_image: ["images", "hero_image"], map_image: ["images", "map_image"],
  story: ["story", "story_json"], schedule: ["schedule", "schedule_json"], dress: ["dress", "dress_json"], faq: ["faq", "faq_json"],
  gifts: ["gifts", "gifts_json"], pix_key: ["gifts", "pix_key"], pix_name: ["gifts", "pix_name"], pix_city: ["gifts", "pix_city"], gift_url: ["gifts", "gift_url"],
  quiz: ["quiz", "quiz_json"],
  guestbook: ["visibility", "guestbook"], hidden: ["visibility", null],
};
const LISTS = new Set(["story", "schedule", "dress", "faq", "gifts", "quiz"]);
/** colunas que somem do site quando a seção está escondida (e o valor "vazio" de cada uma) */
const HIDE_COLS = { story: ["story"], schedule: ["schedule"], dress: ["dress"], faq: ["faq"], quiz: ["quiz"], gifts: ["gifts", "pix_key", "gift_url"] };
const EMPTY = k => (LISTS.has(k) ? [] : "");
const COLS = Object.entries(FIELDS).filter(([, [, c]]) => c).map(([k, [, c]]) => [k, c]);

/* ---------------- validação ---------------- */
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
/** Imagem: https (sem aspas/parênteses/espaços, vai para CSS url()) ou arquivo do próprio site (/m/... ou /assets/...). */
export function imageUrl(v, field) {
  v = str(v, { max: 500, field });
  if (!v) return "";
  if (/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s"'()<>\\]*)?$/i.test(v)) return v;
  if (/^\/(m|assets)\/[A-Za-z0-9._~\/-]+$/.test(v) && !v.includes("..") && !v.includes("//")) return v;
  fail(400, `${field}: use um endereço https:// ou uma foto enviada pelo painel`, "invalid_url");
}
function httpsUrl(v, field) {
  v = str(v, { max: 500, field });
  if (!v) return "";
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/[^\s"'<>\\]*)?$/i.test(v)) fail(400, `${field}: use um endereço que comece com https://`, "invalid_url");
  return v;
}
function list(v, max, field, fn) {
  if (!Array.isArray(v)) fail(400, `${field}: lista inválida`, "invalid");
  if (v.length > max) fail(400, `${field}: no máximo ${max} itens`, "too_many");
  return v.map((x, i) => { if (!isObj(x)) fail(400, `${field} ${i + 1}: item inválido`, "invalid"); return fn(x, `${field} ${i + 1}`); });
}
const icon = (v, field) => { if (v == null || v === "") return ""; if (!ICONS.includes(v)) fail(400, `${field}: ícone inexistente`, "invalid_icon"); return v; };
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:00)?(Z|[+-](0\d|1[0-4]):(00|30|45))$/;

const V = {
  names(v) { v = str(v, { min: 3, max: 80, field: "Nomes" }); if (!/^[^&]+&[^&]+$/.test(v)) fail(400, "Nomes: escreva os dois nomes separados por & (ex.: Ana & Bruno)", "invalid"); return v.split("&").map(s => s.trim()).join(" & "); },
  date(v) {
    if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) fail(400, "Data e hora: inválidas", "invalid");
    const y = +v.slice(0, 4); if (y < 2000 || y > 2100) fail(400, "Data e hora: ano inválido", "invalid");
    return v;
  },
  city: v => str(v, { max: 80, field: "Cidade" }),
  venue_name: v => str(v, { max: 80, field: "Local" }),
  rsvp_deadline(v) { const d = isoDate(v, "Prazo de confirmação"); if (!d) fail(400, "Prazo de confirmação: obrigatório", "required"); return d; },
  welcome: v => str(v, { max: 600, field: "Boas-vindas" }),
  rsvp_note: v => str(v, { max: 400, field: "Recado da confirmação" }),
  universe: v => oneOf(v, UNIVERSES, "Universo visual"),
  hero_image: v => imageUrl(v, "Foto de capa"),
  map_image: v => imageUrl(v, "Mapa ilustrado"),
  story: v => list(v, MAX.story, "História", (x, f) => {
    const o = { year: str(x.year, { max: 12, field: f + " · ano" }), title: str(x.title, { min: 1, max: 80, field: f + " · título" }), text: str(x.text, { max: 700, field: f + " · texto" }) };
    const img = imageUrl(x.image, f + " · foto"); if (img) o.image = img; return o;
  }),
  schedule: v => list(v, MAX.schedule, "Cronograma", (x, f) => ({ time: str(x.time, { min: 1, max: 10, field: f + " · horário" }), title: str(x.title, { min: 1, max: 60, field: f + " · título" }), text: str(x.text, { max: 160, field: f + " · texto" }), icon: icon(x.icon, f) || "clock" })),
  dress: v => list(v, MAX.dress, "Traje", (x, f) => ({ title: str(x.title, { min: 1, max: 60, field: f + " · título" }), text: str(x.text, { max: 300, field: f + " · texto" }), icon: icon(x.icon, f) || "shirt" })),
  faq: v => list(v, MAX.faq, "Dúvidas", (x, f) => ({ q: str(x.q, { min: 2, max: 160, field: f + " · pergunta" }), a: str(x.a, { min: 1, max: 600, field: f + " · resposta" }) })),
  gifts: v => list(v, MAX.gifts, "Presentes", (x, f) => {
    const o = { title: str(x.title, { min: 2, max: 80, field: f + " · título" }), cents: int(x.cents ?? 0, { min: 0, max: 10_000_000, field: f + " · valor" }) };
    const ic = icon(x.icon, f); if (ic) o.icon = ic;
    const note = str(x.note, { max: 160, field: f + " · nota" }); if (note) o.note = note;
    return o;
  }),
  pix_key(v) { v = str(v, { max: 77, field: "Chave Pix" }); if (/\s/.test(v)) fail(400, "Chave Pix: sem espaços", "invalid"); return v; },
  // BR Code: nome do recebedor até 25 e cidade até 15 caracteres (sem acentos no QR; o site remove)
  pix_name: v => str(v, { max: 25, field: "Nome do recebedor (Pix)" }),
  pix_city: v => str(v, { max: 15, field: "Cidade (Pix)" }),
  gift_url: v => httpsUrl(v, "Lista de presentes externa"),
  quiz: v => list(v, MAX.quiz, "Quiz", (x, f) => {
    if (!Array.isArray(x.options) || x.options.length !== 4) fail(400, `${f}: use exatamente 4 opções`, "invalid");
    const options = x.options.map((o, i) => str(o, { min: 1, max: 80, field: `${f} · opção ${i + 1}` }));
    if (new Set(options.map(o => o.toLowerCase())).size !== 4) fail(400, `${f}: as 4 opções precisam ser diferentes`, "invalid");
    return { q: str(x.q, { min: 5, max: 160, field: f + " · pergunta" }), options, answer: int(x.answer, { min: 0, max: 3, field: f + " · resposta certa" }), fact: str(x.fact, { max: 300, field: f + " · curiosidade" }) };
  }),
  guestbook(v) { if (typeof v !== "boolean") fail(400, "Mural de recados: valor inválido", "invalid"); return v; },
  hidden(v) {
    if (!Array.isArray(v) || v.length > HIDEABLE.length) fail(400, "Seções escondidas: lista inválida", "invalid");
    return [...new Set(v.map(s => oneOf(s, HIDEABLE, "Seção")))].sort();
  },
};

/* ---------------- leitura e gravação ---------------- */
const SEL = "SELECT id, slug, theme, is_demo, features_json, " + COLS.map(([, c]) => c).join(", ") + " FROM weddings WHERE id = ?";

/** Estado efetivo do editor (conteúdo de seções escondidas vem do que foi guardado). */
async function load(env, W) {
  const w = await env.DB.prepare(SEL).bind(W).first();
  if (!w) fail(404, "Casamento não encontrado", "not_found");
  const st = await env.DB.prepare("SELECT hidden_json, stash_json FROM editor_state WHERE wedding_id = ?").bind(W).first();
  const hidden = parseJson(st?.hidden_json || "[]", []).filter(s => HIDEABLE.includes(s));
  const stash = parseJson(st?.stash_json || "{}", {}) || {};
  const val = {};
  for (const [k, c] of COLS) {
    let raw = w[c];
    if (k in stash && hidden.some(s => HIDE_COLS[s].includes(k))) raw = stash[k];
    val[k] = c.endsWith("_json") ? (parseJson(raw || "[]", []) || []) : k === "guestbook" ? !!raw : (raw ?? "");
  }
  val.hidden = hidden;
  return { w, val };
}

/** Grava o estado efetivo: colunas de weddings (vazias para seções escondidas) + editor_state. */
function persist(env, W, val) {
  const off = new Set(val.hidden.flatMap(s => HIDE_COLS[s]));
  const stash = {}, sets = [], args = [];
  for (const [k, c] of COLS) {
    let v = val[k];
    if (off.has(k)) { stash[k] = c.endsWith("_json") ? JSON.stringify(v) : v; v = EMPTY(k); }
    sets.push(c + " = ?");
    args.push(c.endsWith("_json") ? JSON.stringify(v) : k === "guestbook" ? (v ? 1 : 0) : v);
  }
  return [
    env.DB.prepare(`UPDATE weddings SET ${sets.join(", ")} WHERE id = ?`).bind(...args, W),
    env.DB.prepare(`INSERT INTO editor_state (wedding_id, hidden_json, stash_json, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(wedding_id) DO UPDATE SET hidden_json = excluded.hidden_json, stash_json = excluded.stash_json, updated_at = excluded.updated_at`)
      .bind(W, JSON.stringify(val.hidden), JSON.stringify(stash)),
  ];
}
async function batch(env, stmts) { if (env.DB.batch) return env.DB.batch(stmts); for (const s of stmts) await s.run(); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Regras que dependem de mais de um campo ou do casamento (tema próprio, plano). */
function crossCheck(w, cur, next, changed) {
  if (changed.includes("universe") && w.theme) fail(409, "Este site usa uma identidade própria. O universo visual fica fixo para não quebrar o tema.", "theme_locked");
  if (changed.includes("rsvp_deadline") || changed.includes("date")) {
    if (next.rsvp_deadline > String(next.date).slice(0, 10)) fail(400, "Prazo de confirmação: precisa ser até o dia do casamento", "invalid");
  }
  if (changed.includes("guestbook") && next.guestbook && !featureOn(w, "mural")) fail(403, "O mural de recados não está incluído no plano de vocês", "feature_off");
  if (!featureOn(w, "quiz") && next.quiz.length && !next.hidden.includes("quiz") && (changed.includes("quiz") || (changed.includes("hidden") && cur.hidden.includes("quiz"))))
    fail(403, "O quiz não está incluído no plano de vocês", "feature_off");
  if (changed.includes("pix_key") && next.pix_key && !featureOn(w, "presentes_pix")) fail(403, "Presentes com Pix não estão incluídos no plano de vocês", "feature_off");
}

function publicView(w, val, history) {
  return {
    slug: w.slug, theme: w.theme || "", is_demo: !!w.is_demo, values: val,
    features: { mural: featureOn(w, "mural"), quiz: featureOn(w, "quiz"), presentes_pix: featureOn(w, "presentes_pix") },
    limits: MAX, icons: ICONS, hideable: HIDEABLE, history,
  };
}
async function history(env, W) {
  const undoable = (await env.DB.prepare("SELECT DISTINCT section FROM editor_versions WHERE wedding_id = ? AND undone = 0").bind(W).all()).results.map(r => r.section);
  const items = (await env.DB.prepare(`SELECT v.id, v.section, v.keys, v.at, v.undone, u.name AS who FROM editor_versions v
    LEFT JOIN users u ON 'user:' || u.id = v.actor WHERE v.wedding_id = ? ORDER BY v.id DESC LIMIT 12`).bind(W).all()).results
    .map(h => ({ ...h, keys: h.keys ? h.keys.split(",") : [], undone: !!h.undone }));
  return { items, undoable };
}

async function patch(req, env, W, actor) {
  const b = await body(req, 96_000);
  if (!isObj(b)) fail(400, "Dados inválidos", "invalid");
  if ("slug" in b) fail(400, "O endereço do site não pode ser mudado aqui. Fale com o estúdio.", "slug_locked");
  if ("theme" in b) fail(400, "A identidade própria é instalada pelo estúdio.", "theme_locked");
  const keys = Object.keys(b);
  if (!keys.length) fail(400, "Nada para salvar", "invalid");
  for (const k of keys) if (!(k in FIELDS)) fail(400, `Campo desconhecido: ${String(k).slice(0, 40)}`, "unknown_field");
  const { w, val: cur } = await load(env, W);
  const next = { ...cur };
  for (const k of keys) next[k] = V[k](b[k]);
  const changed = keys.filter(k => !same(cur[k], next[k]));
  if (!changed.length) return json({ ok: true, changed: [], values: cur });
  crossCheck(w, cur, next, changed);
  const bySection = {};
  for (const k of changed) (bySection[FIELDS[k][0]] ||= []).push(k);
  const stmts = persist(env, W, next);
  for (const [sec, ks] of Object.entries(bySection))
    stmts.push(env.DB.prepare("INSERT INTO editor_versions (wedding_id, section, keys, before_json, actor) VALUES (?, ?, ?, ?, ?)")
      .bind(W, sec, ks.join(","), JSON.stringify(Object.fromEntries(ks.map(k => [k, cur[k]]))), actor));
  await batch(env, stmts);
  // guarda só as últimas versões de cada casamento
  await env.DB.prepare("DELETE FROM editor_versions WHERE wedding_id = ? AND id NOT IN (SELECT id FROM editor_versions WHERE wedding_id = ? ORDER BY id DESC LIMIT ?)").bind(W, W, KEEP_VERSIONS).run();
  for (const [sec, ks] of Object.entries(bySection)) await audit(env, W, actor, "site.update", `${sec}:${ks.join(",")}`);
  return json({ ok: true, changed, values: next, history: await history(env, W) });
}

async function undo(req, env, W, actor) {
  const b = await body(req, 2000);
  const section = b.section == null || b.section === "" ? null : oneOf(b.section, [...new Set(Object.values(FIELDS).map(f => f[0]))], "Seção");
  const v = await env.DB.prepare(`SELECT id, section, keys, before_json FROM editor_versions WHERE wedding_id = ? AND undone = 0 ${section ? "AND section = ?" : ""} ORDER BY id DESC LIMIT 1`)
    .bind(...(section ? [W, section] : [W])).first();
  if (!v) fail(404, "Não há alteração para desfazer", "nothing_to_undo");
  const { val: cur } = await load(env, W);
  const before = parseJson(v.before_json, {}) || {};
  const next = { ...cur };
  for (const [k, x] of Object.entries(before)) if (k in FIELDS) next[k] = x; // valores vieram do próprio banco
  await batch(env, [...persist(env, W, next), env.DB.prepare("UPDATE editor_versions SET undone = 1 WHERE id = ? AND wedding_id = ?").bind(v.id, W)]);
  await audit(env, W, actor, "site.undo", `${v.section}:${v.keys}`);
  return json({ ok: true, section: v.section, restored: Object.keys(before), values: next, history: await history(env, W) });
}

export default {
  name: "editor",
  async admin({ p, m, req, env, W, actor }) {
    if (p === "/api/admin/site") {
      if (m === "GET") { const { w, val } = await load(env, W); return json(publicView(w, val, await history(env, W))); }
      if (m === "PATCH") return patch(req, env, W, actor);
      fail(405, "Método não permitido", "method");
    }
    if (p === "/api/admin/site/undo" && m === "POST") return undo(req, env, W, actor);
    return null;
  },
  async exportData(env, W) {
    return {
      editor_state: await env.DB.prepare("SELECT * FROM editor_state WHERE wedding_id = ?").bind(W).first(),
      editor_versions: (await env.DB.prepare("SELECT id, section, keys, before_json, actor, undone, at FROM editor_versions WHERE wedding_id = ? ORDER BY id").bind(W).all()).results,
    };
  },
};
