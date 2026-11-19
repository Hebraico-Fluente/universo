/** Utilidades do módulo "experiências": interruptores, datas no fuso do casamento, consultas tolerantes. */
import { parseJson, fail, sha256, rateLimit, clientIp } from "../../lib.js";
import { featureOn } from "../plataforma.js";

/**
 * Itens do módulo. `platform` = chave de funcionalidade do Gueta Studio (src/mods/plataforma.js);
 * quando o estúdio desliga, o item fica desligado mesmo que o casal ligue.
 * `on` = padrão quando o casal ainda não mexeu. Itens que mudam o site público começam desligados.
 */
export const ITEMS = [
  { key: "concierge", label: "Concierge do convidado", platform: "concierge", on: false, where: "Site e convite",
    text: "Caixa “Pergunte aos noivos”: responde só com o que vocês publicaram (eventos, cronograma, traje, dúvidas e as respostas que vocês escreverem)." },
  { key: "copilot", label: "Copiloto dos noivos", platform: "copilot", on: true, where: "Painel",
    text: "Perguntas sobre os dados de vocês (confirmações, pagamentos, fornecedores, tarefas), sempre citando os registros usados." },
  { key: "padrinhos", label: "Portal dos padrinhos", platform: "padrinhos", on: true, where: "Link individual",
    text: "Instruções, roteiro do dia, traje, contatos, tarefas e um mural só entre padrinhos." },
  { key: "mensagens", label: "Mensagens secretas", on: true, where: "Convite pessoal",
    text: "Um envelope “Uma mensagem só para vocês” no convite da família escolhida. Ninguém mais vê." },
  { key: "surpresas", label: "Surpresas com sigilo", on: true, where: "Portal dos padrinhos",
    text: "Alguém organiza uma homenagem, vídeo, presente ou discurso. Quem é homenageado não vê, nem vocês (se for para o casal) até a data de revelação." },
  { key: "quest", label: "Caça ao tesouro (Quest)", platform: "quest", on: false, where: "Convite pessoal",
    text: "Desafios leves que o convidado marca como feitos. Sem ranking e sem pontos expostos." },
  { key: "passaporte", label: "Passaporte multi-evento", on: true, where: "Convite pessoal",
    text: "Para quem foi chamado para mais de um evento: a programação da família e o check-in “cheguei” no dia." },
  { key: "jornal", label: "Jornal do casamento", on: true, where: "Página para imprimir",
    text: "Um jornal A4 com a história, curiosidades do quiz, programação, recados aprovados e palavras-cruzadas." },
  { key: "lugares", label: "Nossos lugares", on: true, where: "Site",
    text: "Os lugares marcantes de vocês, com link para abrir no mapa. Aparece quando houver pelo menos um lugar." },
  { key: "documentario", label: "História em modo documentário", on: false, where: "Site",
    text: "A história de vocês em tela cheia, um capítulo por vez, com trilha sonora opcional (arquivo próprio)." },
];
export const KEYS = ITEMS.map(i => i.key);

export const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
export const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
export const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();

/** Consulta a uma tabela de outro módulo: se a tabela (ainda) não existir, devolve null em vez de quebrar. */
export async function tryAll(env, sql, ...a) {
  try { return await all(env, sql, ...a); } catch (e) { if (/no such (table|column)/i.test(String(e?.message))) return null; throw e; }
}
export async function tryFirst(env, sql, ...a) {
  try { return await first(env, sql, ...a); } catch (e) { if (/no such (table|column)/i.test(String(e?.message))) return undefined; throw e; }
}

export async function settingsRow(env, W) {
  return (await first(env, "SELECT * FROM exp_settings WHERE wedding_id = ?", W)) || { wedding_id: W, flags_json: "{}", padrinhos_json: "{}", soundtrack_json: "{}", jornal_json: "{}" };
}
export async function saveSettings(env, W, patch) {
  const cur = await settingsRow(env, W);
  const row = { ...cur, ...patch };
  await run(env, `INSERT INTO exp_settings (wedding_id, flags_json, padrinhos_json, soundtrack_json, jornal_json, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(wedding_id) DO UPDATE SET flags_json = excluded.flags_json, padrinhos_json = excluded.padrinhos_json, soundtrack_json = excluded.soundtrack_json, jornal_json = excluded.jornal_json, updated_at = excluded.updated_at`,
    W, row.flags_json, row.padrinhos_json, row.soundtrack_json, row.jornal_json);
}

/** Estado efetivo de cada item: interruptor do casal (ou padrão) E funcionalidade liberada pela plataforma. */
export function flagsFrom(w, settings) {
  const mine = parseJson(settings?.flags_json || "{}", {}) || {};
  const out = {};
  for (const it of ITEMS) {
    const couple = typeof mine[it.key] === "boolean" ? mine[it.key] : it.on;
    out[it.key] = couple && (!it.platform || featureOn(w, it.platform));
  }
  return out;
}
export async function flagsOf(env, W, w) {
  w = w || await first(env, "SELECT id, features_json FROM weddings WHERE id = ?", W);
  return flagsFrom(w, await settingsRow(env, W));
}
export function needOn(flags, key) { if (!flags[key]) fail(404, "Esta experiência está desligada", "exp_off"); }

/* ---------- datas: o casamento é no Brasil (America/Sao_Paulo) ---------- */
const TZ = "America/Sao_Paulo";
export const todaySP = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export const dateSP = iso => todaySP(new Date(iso));
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
export const longDateBR = iso => cap(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)));
export const shortDateBR = d => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00Z"));
export const timeBR = iso => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(":", "h");
export const moneyBR = c => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: c % 100 ? 2 : 0 });
export const mapsLink = q => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

/** Texto sem acentos, minúsculo, só letras/números (para comparar palavras). */
export const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9+$ ]+/g, " ").replace(/\s+/g, " ").trim();

/** Link privado por token (padrinho ou colaborador): token só como hash; limite por IP. */
export async function byToken(env, req, table, token, bucket, max = 120) {
  await rateLimit(env, bucket + ":" + clientIp(req), max);
  const row = await first(env, `SELECT * FROM ${table} WHERE token_hash = ? AND revoked = 0`, await sha256(token));
  if (!row) fail(404, "Link não encontrado. Peça um novo aos noivos.", "not_found");
  return row;
}

/** Endereço de mídia aceito: só caminhos do próprio site (a CSP bloqueia mídia de fora). */
export function localUrl(v, field = "Arquivo") {
  if (v == null || v === "") return "";
  if (typeof v !== "string" || v.length > 300 || !/^\/[A-Za-z0-9/_\-.%=&?]+$/.test(v) || v.startsWith("//")) fail(400, `${field}: endereço inválido`, "invalid");
  return v;
}
/** Link externo (vídeo coletivo etc.): só https. */
export function httpsUrl(v, field = "Link") {
  if (v == null || v === "") return "";
  if (typeof v !== "string" || v.length > 400 || !/^https:\/\/[^\s<>"']+$/.test(v)) fail(400, `${field}: use um link que comece com https://`, "invalid");
  return v;
}
