/**
 * Módulo "van" (contrato em src/mods/README.md): quem quer ir de van para o casamento.
 * Desligado por padrão (o casal liga no painel › Van); a plataforma pode bloquear pela funcionalidade "van".
 *
 * A pergunta mora DENTRO do RSVP (convite pessoal e "confirmar pelo nome" no site): quem confirma presença vê
 * "Quer ir de van para o casamento?" (Sim/Não). Com Sim: quantas pessoas (até o número de confirmados) e WhatsApp
 * (obrigatório quando `exige_celular`). Vai no MESMO envio do RSVP (POST /api/invite/:token/rsvp, campo `van`);
 * o worker chama o gancho rsvp() deste módulo: valida antes de gravar e grava depois. Uma linha por família.
 *   van.quer = true  → cria/atualiza a linha da família   ·  false → apaga  ·  ausente → não mexe
 *   ninguém da família confirmou ("não" em tudo) → a linha da família é apagada
 * invite(): texto, se o WhatsApp é obrigatório, a resposta desta família e (só para quem está na lista) o link do grupo.
 * Nada da lista vai para o site público.
 * Painel (sessão + papel; casamento SEMPRE da sessão; escrita = noivos e assessoria)
 *   GET  /api/admin/van               ajustes, lista e totais        ·  PATCH /api/admin/van  ajustes
 *   PATCH|DELETE /api/admin/van/:id   edita / apaga um interessado   ·  GET /api/admin/van/csv  planilha
 *
 * Vagas: com `vagas` preenchido, quem passa do limite entra na lista de espera (espera = 1).
 * LGPD: nome, celular e observação são dados de convidado: entram na exportação e saem na limpeza (purgeGuests).
 */
import { json, fail, str, int, body, uid, audit } from "../lib.js";
import { featureOn } from "./plataforma.js";

const MAX_PESSOAS = 30;
export const DEFAULT_TEXT = "Estamos organizando uma van para o casamento. Se você tem interesse em ir de van, deixe seu nome aqui que a gente te avisa os detalhes.";

const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();

/* ---------------- ajustes ---------------- */
async function settingsOf(env, W) {
  const s = await first(env, "SELECT * FROM van_settings WHERE wedding_id = ?", W);
  return { on: !!s?.on_, texto: s?.texto || "", ponto: s?.ponto || "", saida: s?.saida || "", volta: s?.volta || "",
    vagas: s?.vagas ?? null, valor_cents: s?.valor_cents ?? null, exige_celular: !!s?.exige_celular, grupo_url: s?.grupo_url || "" };
}
const seatsUsed = async (env, W, exceptId = "") =>
  (await first(env, "SELECT COALESCE(SUM(pessoas), 0) AS n FROM van_interessados WHERE wedding_id = ? AND espera = 0 AND id <> ?", W, exceptId)).n;
const live = (w, s) => featureOn(w, "van") && s.on;
/** O que o convite mostra (nada da lista). */
async function publicView(env, w, s) {
  const used = s.vagas ? await seatsUsed(env, w.id) : 0;
  return { texto: s.texto || DEFAULT_TEXT, ponto: s.ponto, saida: s.saida, volta: s.volta, valor_cents: s.valor_cents, exige_celular: s.exige_celular, esgotado: !!s.vagas && used >= s.vagas };
}

/* ---------------- validação ---------------- */
/** Celular brasileiro (WhatsApp): guarda só os dígitos (DDD + 9 + 8 dígitos; aceita +55). Vazio só se não for obrigatório. */
export function phone(v, required = false) {
  const raw = str(v, { max: 25, field: "WhatsApp" });
  if (!raw) { if (required) fail(400, "WhatsApp: obrigatório para entrar no grupo da van", "required"); return ""; }
  let d = raw.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (!/^[1-9][1-9]9\d{8}$/.test(d)) fail(400, "WhatsApp: use DDD + celular, ex.: (41) 99999-9999", "invalid");
  return d;
}
export const GROUP_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;
function entryInput(b, required = false) {
  const nome = str(b.nome, { min: 2, max: 80, field: "Nome" });
  if (/[\u0000-\u001f\u007f<>]/.test(nome)) fail(400, "Nome: use letras", "invalid");
  return { nome, pessoas: int(b.pessoas ?? 1, { min: 1, max: MAX_PESSOAS, field: "Quantas pessoas" }), celular: phone(b.celular, required), obs: str(b.obs, { max: 200, field: "Observação" }) };
}

/* ---------------- RSVP (gancho chamado pelo worker em POST /api/invite/:token/rsvp) ---------------- */
/** Valida b.van ANTES de gravar o RSVP e devolve a função que grava DEPOIS (ou null se não há nada a fazer). */
export async function rsvpHook(env, h, b, responses) {
  const w = await first(env, "SELECT id, features_json FROM weddings WHERE id = ?", h.wedding_id);
  const s = await settingsOf(env, w.id);
  // quantas pessoas da família confirmaram algum evento
  const confirmed = new Set(responses.filter(r => r.status === "yes").map(r => r.guest_id)).size;
  const v = b.van && typeof b.van === "object" ? b.van : null;
  if (!confirmed) return async () => { await run(env, "DELETE FROM van_interessados WHERE wedding_id = ? AND household_id = ?", w.id, h.id); return {}; };
  if (!live(w, s) || !v || v.quer === undefined || v.quer === null) return null;
  if (v.quer === false) return async () => { await run(env, "DELETE FROM van_interessados WHERE wedding_id = ? AND household_id = ?", w.id, h.id); return { van: { quer: false } }; };
  if (v.quer !== true) fail(400, "Van: resposta inválida", "invalid");
  const pessoas = int(v.pessoas ?? confirmed, { min: 1, max: Math.min(confirmed, MAX_PESSOAS), field: "Van · quantas pessoas" });
  const celular = phone(v.celular, s.exige_celular);
  return async () => {
    const prev = await first(env, "SELECT id, obs FROM van_interessados WHERE wedding_id = ? AND household_id = ?", w.id, h.id);
    const used = s.vagas ? await seatsUsed(env, w.id, prev?.id || "") : 0;
    const espera = s.vagas && used + pessoas > s.vagas ? 1 : 0;
    const nome = String(h.greeting || h.name).slice(0, 80);
    if (prev) await run(env, "UPDATE van_interessados SET nome = ?, pessoas = ?, celular = ?, espera = ?, updated_at = datetime('now') WHERE id = ? AND wedding_id = ?", nome, pessoas, celular, espera, prev.id, w.id);
    else await run(env, "INSERT INTO van_interessados (id, wedding_id, household_id, nome, pessoas, celular, espera) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("van_"), w.id, h.id, nome, pessoas, celular, espera);
    return { van: { quer: true, espera: !!espera, grupo: espera ? "" : s.grupo_url || "" } };
  };
}

/* ---------------- painel ---------------- */
const listOf = (env, W) => all(env, "SELECT id, household_id, nome, pessoas, celular, obs, espera, created_at, updated_at FROM van_interessados WHERE wedding_id = ? ORDER BY espera, created_at", W);
async function adminView(env, W) {
  const s = await settingsOf(env, W), items = await listOf(env, W);
  const lista = items.filter(x => !x.espera), espera = items.filter(x => x.espera);
  const w = await first(env, "SELECT features_json FROM weddings WHERE id = ?", W);
  return { feature: featureOn(w, "van"), settings: { ...s, texto: s.texto || DEFAULT_TEXT }, default_text: DEFAULT_TEXT,
    items: items.map(x => ({ ...x, espera: !!x.espera, via_convite: !!x.household_id, household_id: undefined })),
    totals: { pessoas: lista.reduce((n, x) => n + x.pessoas, 0), espera: espera.reduce((n, x) => n + x.pessoas, 0), respostas: items.length, vagas: s.vagas } };
}
const optText = (v, max, field) => str(v ?? "", { max, field });
async function patchSettings(ctx) {
  const { req, env, W } = ctx;
  const b = await body(req, 6000), cur = await settingsOf(env, W);
  const v = {
    on_: b.on === undefined ? (cur.on ? 1 : 0) : (b.on === true ? 1 : b.on === false ? 0 : fail(400, "Liga/desliga: valor inválido", "invalid")),
    texto: b.texto === undefined ? cur.texto : str(b.texto, { max: 400, field: "Texto" }),
    ponto: b.ponto === undefined ? cur.ponto : optText(b.ponto, 120, "Ponto de saída"),
    saida: b.saida === undefined ? cur.saida : optText(b.saida, 40, "Horário de saída"),
    volta: b.volta === undefined ? cur.volta : optText(b.volta, 40, "Horário de volta"),
    vagas: b.vagas === undefined ? cur.vagas : (b.vagas === null || b.vagas === "" ? null : int(b.vagas, { min: 1, max: 500, field: "Vagas" })),
    valor_cents: b.valor_cents === undefined ? cur.valor_cents : (b.valor_cents === null || b.valor_cents === "" ? null : int(b.valor_cents, { min: 0, max: 1_000_000, field: "Valor por pessoa" })),
    exige_celular: b.exige_celular === undefined ? (cur.exige_celular ? 1 : 0) : (b.exige_celular ? 1 : 0),
    grupo_url: b.grupo_url === undefined ? cur.grupo_url : str(b.grupo_url, { max: 120, field: "Link do grupo" }),
  };
  if (v.grupo_url && !GROUP_RE.test(v.grupo_url)) fail(400, "Link do grupo: use o convite do WhatsApp (https://chat.whatsapp.com/…)", "invalid");
  if (v.texto === DEFAULT_TEXT) v.texto = "";
  await run(env, `INSERT INTO van_settings (wedding_id, on_, texto, ponto, saida, volta, vagas, valor_cents, exige_celular, grupo_url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(wedding_id) DO UPDATE SET on_ = excluded.on_, texto = excluded.texto, ponto = excluded.ponto, saida = excluded.saida, volta = excluded.volta,
    vagas = excluded.vagas, valor_cents = excluded.valor_cents, exige_celular = excluded.exige_celular, grupo_url = excluded.grupo_url, updated_at = excluded.updated_at`,
    W, v.on_, v.texto, v.ponto, v.saida, v.volta, v.vagas, v.valor_cents, v.exige_celular, v.grupo_url);
  return json(await adminView(env, W));
}
async function patchEntry(ctx, id) {
  const { req, env, W } = ctx;
  const cur = await first(env, "SELECT * FROM van_interessados WHERE id = ? AND wedding_id = ?", id, W);
  if (!cur) fail(404, "Interessado não encontrado", "not_found");
  const b = await body(req, 4000);
  const input = entryInput({ nome: b.nome ?? cur.nome, pessoas: b.pessoas ?? cur.pessoas, celular: b.celular ?? cur.celular, obs: b.obs ?? cur.obs });
  const espera = b.espera === undefined ? cur.espera : (b.espera ? 1 : 0);
  await run(env, "UPDATE van_interessados SET nome = ?, pessoas = ?, celular = ?, obs = ?, espera = ?, updated_at = datetime('now') WHERE id = ? AND wedding_id = ?",
    input.nome, input.pessoas, input.celular, input.obs, espera, id, W);
  return json(await adminView(env, W));
}
const csvCell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function csv(env, W) {
  const rows = await listOf(env, W);
  const lines = [["Nome", "Pessoas", "Celular", "Observação", "Situação", "Pelo convite", "Anotado em"],
    ...rows.map(x => [x.nome, x.pessoas, x.celular, x.obs, x.espera ? "lista de espera" : "na lista", x.household_id ? "sim" : "não", x.created_at])];
  return new Response("﻿" + lines.map(l => l.map(csvCell).join(";")).join("\r\n"), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="van-interessados.csv"', "Cache-Control": "no-store" } });
}

export default {
  name: "van",
  rsvp: rsvpHook,
  async admin(ctx) {
    const { p, m, env, W } = ctx; let r;
    if (p === "/api/admin/van") {
      if (m === "GET") return json(await adminView(env, W));
      if (m === "PATCH") return patchSettings(ctx);
    }
    if (p === "/api/admin/van/csv" && m === "GET") { await audit(env, W, ctx.actor, "van.export"); return csv(env, W); }
    if ((r = p.match(/^\/api\/admin\/van\/(van_[\w-]{4,40})$/))) {
      if (m === "PATCH") return patchEntry(ctx, r[1]);
      if (m === "DELETE") {
        const own = await first(env, "SELECT id FROM van_interessados WHERE id = ? AND wedding_id = ?", r[1], W);
        if (!own) fail(404, "Interessado não encontrado", "not_found");
        await run(env, "DELETE FROM van_interessados WHERE id = ? AND wedding_id = ?", r[1], W);
        await audit(env, W, ctx.actor, "van.delete", r[1]);
        return json(await adminView(env, W));
      }
    }
    return null;
  },
  /** Convite (e "confirmar pelo nome"): a pergunta do RSVP + a resposta desta família; o grupo só para quem está na lista. */
  async invite(env, w, h) {
    const s = await settingsOf(env, w.id);
    if (!live(w, s)) return null;
    const mine = await first(env, "SELECT pessoas, celular, espera FROM van_interessados WHERE wedding_id = ? AND household_id = ?", w.id, h.id);
    return { ...(await publicView(env, w, s)), mine: mine ? { ...mine, espera: !!mine.espera } : null, grupo: mine && !mine.espera ? s.grupo_url || "" : "" };
  },
  async overview(env, W) {
    const s = await settingsOf(env, W);
    if (!s.on) return null;
    const n = (await first(env, "SELECT COALESCE(SUM(pessoas), 0) AS n FROM van_interessados WHERE wedding_id = ? AND espera = 0", W)).n;
    return { pessoas: n, vagas: s.vagas };
  },
  async exportData(env, W) {
    return { settings: await settingsOf(env, W), interessados: await listOf(env, W) }; // vira data.van na exportação
  },
  /** Limpeza LGPD: a lista da van é dado de convidado (nome, celular, observação). */
  async purgeGuests(env, W) {
    const n = (await first(env, "SELECT COUNT(*) AS n FROM van_interessados WHERE wedding_id = ?", W)).n;
    await run(env, "DELETE FROM van_interessados WHERE wedding_id = ?", W);
    return { van_deleted: n };
  },
};
