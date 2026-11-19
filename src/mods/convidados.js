/**
 * Módulo "convidados" (ver src/mods/README.md): RSVP completo, lista de espera, lembretes, mapa de mesas e privacidade.
 *
 * Público (convite pessoal; token só por hash)
 *   POST   /api/invite/:token/acompanhantes          o convidado adiciona um acompanhante (até households.max_guests)
 *   DELETE /api/invite/:token/acompanhantes/:gid     remove um acompanhante que a própria família adicionou
 *
 * Painel (sessão + papel; casamento SEMPRE da sessão)
 *   GET    /api/admin/convidados                     cardápio, sugestão da lista de espera e data da limpeza
 *   POST   /api/admin/convidados/menus               nova opção de menu num evento   ·   DELETE /api/admin/convidados/menus/:id
 *   PATCH  /api/admin/convidados/households/:id      vagas (max_guests) e lista de espera
 *   POST   /api/admin/convidados/households/:id/promote   tira da lista de espera e gera o link (devolvido uma única vez)
 *   POST   /api/admin/convidados/households/:id/reminded  registra que o casal enviou um lembrete
 *   DELETE /api/admin/convidados/guests/:id          remove um acompanhante
 *   GET    /api/admin/mesas                          planta, mesas, elementos e convidados confirmados do evento
 *   PATCH  /api/admin/mesas                          evento das mesas e "mostrar mesas aos convidados"
 *   POST   /api/admin/mesas/tables | /items          nova mesa | novo elemento   ·   PATCH|DELETE /api/admin/mesas/(tables|items)/:id
 *   POST   /api/admin/mesas/seats                    distribui pessoas nas mesas [{ guest_id, table_id|null }]
 *   GET    /api/admin/privacidade                    prazo e data da limpeza, o que está guardado
 *   PATCH  /api/admin/privacidade                    muda o prazo (30 a 365 dias) — só o dono
 *   POST   /api/admin/privacidade/apagar             apaga os dados dos convidados agora — só o dono, com o nome do casal
 */
import { json, fail, str, int, oneOf, body, randomToken, uid, sha256, rateLimit, clientIp, audit } from "../lib.js";

const KINDS = { pista: "Pista de dança", palco: "Palco", buffet: "Buffet", entrada: "Entrada", bar: "Bar" };
const SIZES = { pista: [26, 24], palco: [26, 10], buffet: [24, 9], entrada: [14, 7], bar: [16, 9] };
const MAX_TABLES = 120, MAX_ITEMS = 20;

/* ---------------- utilidades ---------------- */
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
async function batch(env, stmts) { if (env.DB.batch) return env.DB.batch(stmts); for (const s of stmts) await s.run(); }

export const addDays = (ymd, n) => { const t = new Date(ymd + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
/** Data da limpeza automática: dia do casamento + prazo (AAAA-MM-DD). */
export const purgeDate = w => addDays(String(w.date_iso).slice(0, 10), Number(w.retention_days) || 60);
const pct = (v, field) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) fail(400, `${field}: valor inválido`, "invalid"); return Math.round(n * 10) / 10; };
const deadlinePassed = d => new Date().toISOString().slice(0, 10) > d;

/**
 * Família de um token de convite: o link pessoal (households.token_hash) ou o acesso temporário
 * emitido por "confirmar pelo nome" no site (rsvp_name_tokens, ~30 min, só com a opção ligada).
 * Lista de espera e link revogado não abrem. Token inexistente e vencido têm a mesma resposta.
 */
export async function householdByToken(env, token) {
  const hash = await sha256(token);
  let h = await first(env, "SELECT * FROM households WHERE token_hash = ? AND revoked = 0 AND waitlist = 0", hash);
  if (!h) h = await first(env, `SELECT h.* FROM rsvp_name_tokens t JOIN households h ON h.id = t.household_id JOIN weddings w ON w.id = t.wedding_id
    WHERE t.token_hash = ? AND t.expires_at > ? AND h.wedding_id = t.wedding_id AND h.revoked = 0 AND h.waitlist = 0 AND w.rsvp_by_name = 1`, hash, new Date().toISOString());
  if (!h) fail(404, "Convite não encontrado. Peça um link novo aos noivos.", "invite_not_found");
  return h;
}

/* ---------------- confirmar presença pelo nome (site público) ---------------- */
const NAME_TTL_MIN = 30;
export const normName = v => String(v ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const NOT_FOUND = "Não encontramos seu nome na lista. Confira como está no convite ou fale com os noivos.";
async function rsvpByName(ctx, slug) {
  const { req, env } = ctx;
  const w = await first(env, "SELECT id, rsvp_by_name, rsvp_deadline, guests_purged_at FROM weddings WHERE slug = ?", slug);
  if (!w || !w.rsvp_by_name || w.guests_purged_at) fail(404, "Não encontrado", "not_found");
  await rateLimit(env, "byname:" + clientIp(req), 10);
  if (deadlinePassed(w.rsvp_deadline)) fail(409, "O prazo de confirmação terminou. Fale direto com os noivos.", "deadline");
  const b = await body(req, 1000);
  const name = normName(str(b.name, { min: 2, max: 80, field: "Nome completo" }));
  // nome completo exato (sem acento, maiúsculas ou espaços extras): nada de busca parcial nem sugestões
  const people = await all(env, `SELECT g.name, g.household_id FROM guests g JOIN households h ON h.id = g.household_id
    WHERE g.wedding_id = ? AND h.wedding_id = ? AND h.revoked = 0 AND h.waitlist = 0`, w.id, w.id);
  const hits = people.filter(g => normName(g.name) === name);
  // nenhum ou mais de um: mesma resposta (não revela se o nome existe)
  if (hits.length !== 1) fail(404, NOT_FOUND, "name_not_found");
  const token = randomToken(24);
  await run(env, "INSERT INTO rsvp_name_tokens (token_hash, wedding_id, household_id, expires_at) VALUES (?, ?, ?, ?)",
    await sha256(token), w.id, hits[0].household_id, new Date(Date.now() + NAME_TTL_MIN * 6e4).toISOString());
  await audit(env, w.id, "guest:" + hits[0].household_id, "rsvp.by_name");
  return json({ token, expires_in: NAME_TTL_MIN * 60 }, 201);
}

async function ownHousehold(env, W, id) {
  const h = await first(env, "SELECT * FROM households WHERE id = ? AND wedding_id = ?", id, W);
  if (!h) fail(404, "Convite não encontrado", "not_found");
  return h;
}
async function issueToken(env, W, hid, origin) {
  const token = randomToken(16);
  await run(env, "UPDATE households SET token_hash = ?, token_at = datetime('now'), revoked = 0 WHERE id = ? AND wedding_id = ?", await sha256(token), hid, W);
  return origin + "/i/" + token;
}
/** Evento das mesas: o escolhido pelo casal ou o último (normalmente a festa). */
async function seatingEvent(env, W) {
  const w = await first(env, "SELECT seating_event_id FROM weddings WHERE id = ?", W);
  const evs = await all(env, "SELECT id, name FROM events WHERE wedding_id = ? ORDER BY sort, starts_at", W);
  const ev = evs.find(e => e.id === w?.seating_event_id) || evs[evs.length - 1] || null;
  return { events: evs, event: ev };
}

/* ---------------- lista de espera ---------------- */
/** Lugares liberados por recusas no evento principal, menos os já ocupados por quem saiu da lista de espera. */
export async function waitlistSuggestion(env, W) {
  const { event } = await seatingEvent(env, W);
  if (!event) return { event: null, freed: 0, used: 0, available: 0, households: [] };
  const freed = (await first(env, `SELECT COUNT(*) AS n FROM rsvps r JOIN guests g ON g.id = r.guest_id JOIN households h ON h.id = g.household_id
    WHERE g.wedding_id = ? AND h.waitlist = 0 AND r.event_id = ? AND r.status = 'no'`, W, event.id)).n;
  const used = (await first(env, `SELECT COUNT(*) AS n FROM guests g JOIN households h ON h.id = g.household_id
    WHERE g.wedding_id = ? AND h.waitlist = 0 AND h.promoted_at IS NOT NULL`, W)).n;
  const wl = await all(env, `SELECT h.id, h.name, (SELECT COUNT(*) FROM guests g WHERE g.household_id = h.id) AS people
    FROM households h WHERE h.wedding_id = ? AND h.waitlist = 1 ORDER BY h.created_at, h.rowid`, W);
  const available = Math.max(0, freed - used);
  let left = available; const pick = [];
  for (const h of wl) if (h.people > 0 && h.people <= left) { pick.push(h.id); left -= h.people; }
  return { event: event.name, freed, used, available, households: pick, waiting: wl.length };
}

/* ---------------- limpeza (LGPD) ---------------- */
/** Apaga os dados pessoais dos convidados de um casamento e marca guests_purged_at. */
export async function purgeGuests(env, W, actor) {
  const counts = await first(env, `SELECT (SELECT COUNT(*) FROM households WHERE wedding_id = ?1) AS households, (SELECT COUNT(*) FROM guests WHERE wedding_id = ?1) AS guests,
    (SELECT COUNT(*) FROM gift_notices WHERE wedding_id = ?1) AS gift_notices`, W);
  const P = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  await batch(env, [
    P("DELETE FROM rsvp_name_tokens WHERE wedding_id = ?", W),
    P("DELETE FROM seat_assignments WHERE wedding_id = ?", W),
    P("DELETE FROM rsvps WHERE guest_id IN (SELECT id FROM guests WHERE wedding_id = ?)", W),
    P("DELETE FROM guests WHERE wedding_id = ?", W),
    P("DELETE FROM invitations WHERE household_id IN (SELECT id FROM households WHERE wedding_id = ?)", W),
    P("DELETE FROM households WHERE wedding_id = ?", W),
    P("DELETE FROM gift_notices WHERE wedding_id = ?", W),
    P("UPDATE weddings SET guests_purged_at = datetime('now'), show_tables = 0 WHERE id = ?", W),
  ]);
  // outros módulos que guardem dados de convidados podem exportar purgeGuests(env, W)
  try {
    const { MODS } = await import("./index.js");
    for (const m of MODS) if (m.purgeGuests && m.name !== "convidados") await m.purgeGuests(env, W);
  } catch (e) { console.error("purge mods", e); }
  await audit(env, W, actor, "guests.purge", `${counts.households} convites · ${counts.guests} pessoas · ${counts.gift_notices} avisos`);
  return counts;
}

/* ---------------- rotas públicas: acompanhantes ---------------- */
async function addCompanion(ctx, token) {
  const { req, env } = ctx;
  await rateLimit(env, "comp:" + clientIp(req), 30);
  const h = await householdByToken(env, token);
  const w = await first(env, "SELECT rsvp_deadline FROM weddings WHERE id = ?", h.wedding_id);
  if (deadlinePassed(w.rsvp_deadline)) fail(409, "O prazo de confirmação terminou. Fale direto com os noivos.", "deadline");
  const b = await body(req, 2000);
  const name = str(b.name, { min: 2, max: 80, field: "Nome do acompanhante" });
  const id = uid("g_");
  // insere só se ainda houver vaga (a contagem e a inserção são uma única instrução)
  const r = await run(env, `INSERT INTO guests (id, wedding_id, household_id, name, is_child, sort, is_plus_one)
    SELECT ?, ?, ?, ?, 0, (SELECT COUNT(*) FROM guests WHERE household_id = ?), 1 WHERE (SELECT COUNT(*) FROM guests WHERE household_id = ?) < ?`,
    id, h.wedding_id, h.id, name, h.id, h.id, h.max_guests);
  if (!r.meta?.changes) fail(409, "Este convite não tem mais vagas para acompanhantes.", "no_slots");
  await audit(env, h.wedding_id, "guest:" + h.id, "plus_one.add", id);
  return json({ ok: true, id }, 201);
}
async function removeCompanion(ctx, token, gid) {
  const { req, env } = ctx;
  await rateLimit(env, "comp:" + clientIp(req), 30);
  const h = await householdByToken(env, token);
  const w = await first(env, "SELECT rsvp_deadline FROM weddings WHERE id = ?", h.wedding_id);
  if (deadlinePassed(w.rsvp_deadline)) fail(409, "O prazo de confirmação terminou. Fale direto com os noivos.", "deadline");
  const g = await first(env, "SELECT id FROM guests WHERE id = ? AND household_id = ? AND is_plus_one = 1", gid, h.id);
  if (!g) fail(404, "Acompanhante não encontrado", "not_found");
  await deleteGuest(env, h.wedding_id, gid);
  await audit(env, h.wedding_id, "guest:" + h.id, "plus_one.remove", gid);
  return json({ ok: true });
}
async function deleteGuest(env, W, gid) {
  await batch(env, [
    env.DB.prepare("DELETE FROM seat_assignments WHERE guest_id = ? AND wedding_id = ?").bind(gid, W),
    env.DB.prepare("DELETE FROM rsvps WHERE guest_id = ?").bind(gid),
    env.DB.prepare("DELETE FROM guests WHERE id = ? AND wedding_id = ?").bind(gid, W),
  ]);
}

/* ---------------- painel: convidados ---------------- */
async function guestExtras(env, W) {
  const w = await first(env, "SELECT date_iso, retention_days, guests_purged_at, rsvp_by_name FROM weddings WHERE id = ?", W);
  return json({ rsvp_by_name: !!w.rsvp_by_name,
    menus: await all(env, "SELECT id, event_id, name, description FROM menu_options WHERE wedding_id = ? ORDER BY event_id, sort, rowid", W),
    waitlist: await waitlistSuggestion(env, W),
    purge_on: purgeDate(w), purged_at: w.guests_purged_at,
  });
}
async function createMenu(ctx) {
  const { env, W } = ctx;
  const b = await body(ctx.req, 4000);
  const ev = await first(env, "SELECT id FROM events WHERE id = ? AND wedding_id = ?", String(b.event_id || ""), W);
  if (!ev) fail(400, "Evento inválido", "invalid");
  const n = (await first(env, "SELECT COUNT(*) AS n FROM menu_options WHERE event_id = ? AND wedding_id = ?", ev.id, W)).n;
  if (n >= 12) fail(409, "No máximo 12 opções por evento", "too_many");
  const id = uid("mo_");
  await run(env, "INSERT INTO menu_options (id, wedding_id, event_id, name, description, sort) VALUES (?, ?, ?, ?, ?, ?)",
    id, W, ev.id, str(b.name, { min: 2, max: 60, field: "Opção de menu" }), str(b.description, { max: 160, field: "Descrição" }), n);
  return json({ id }, 201);
}
async function deleteMenu(ctx, id) {
  const { env, W, actor } = ctx;
  const m = await first(env, "SELECT id FROM menu_options WHERE id = ? AND wedding_id = ?", id, W);
  if (!m) fail(404, "Opção não encontrada", "not_found");
  await batch(env, [
    env.DB.prepare("UPDATE rsvps SET menu_option_id = NULL WHERE menu_option_id = ?").bind(id),
    env.DB.prepare("DELETE FROM menu_options WHERE id = ? AND wedding_id = ?").bind(id, W),
  ]);
  await audit(env, W, actor, "menu.delete", id);
  return json({ ok: true });
}
async function patchHousehold(ctx, id) {
  const { env, W, actor } = ctx;
  const h = await ownHousehold(env, W, id);
  const b = await body(ctx.req, 2000);
  if (b.max_guests !== undefined) {
    const n = (await first(env, "SELECT COUNT(*) AS n FROM guests WHERE household_id = ?", id)).n;
    const max = int(b.max_guests, { min: Math.max(1, n), max: 20, field: "Total de lugares no convite" });
    await run(env, "UPDATE households SET max_guests = ? WHERE id = ? AND wedding_id = ?", max, id, W);
  }
  if (b.waitlist !== undefined) {
    if (b.waitlist === true) {
      if (h.responded_at) fail(409, "Esta família já respondeu: não dá para voltar para a lista de espera.", "responded");
      // o link deixa de existir: quem estiver na lista de espera não abre convite
      await run(env, "UPDATE households SET waitlist = 1, token_hash = NULL, token_at = NULL, revoked = 0, promoted_at = NULL WHERE id = ? AND wedding_id = ?", id, W);
      await audit(env, W, actor, "household.waitlist", id);
    } else if (b.waitlist !== false) fail(400, "Lista de espera: valor inválido", "invalid");
  }
  return json({ ok: true });
}
async function promote(ctx, id) {
  const { env, W, actor, url } = ctx;
  const h = await ownHousehold(env, W, id);
  if (!h.waitlist) fail(409, "Esta família não está na lista de espera", "not_waitlist");
  await run(env, "UPDATE households SET waitlist = 0, promoted_at = datetime('now') WHERE id = ? AND wedding_id = ?", id, W);
  const link = await issueToken(env, W, id, url.origin);
  await audit(env, W, actor, "household.promote", id);
  return json({ link });
}

/* ---------------- painel: mesas ---------------- */
async function seating(env, W) {
  const { events, event } = await seatingEvent(env, W);
  const w = await first(env, "SELECT show_tables FROM weddings WHERE id = ?", W);
  const tables = await all(env, "SELECT id, name, shape, seats, x, y FROM seating_tables WHERE wedding_id = ? ORDER BY sort, rowid", W);
  const items = await all(env, "SELECT id, kind, label, x, y, w, h FROM floor_items WHERE wedding_id = ? ORDER BY rowid", W);
  // confirmados para o evento das mesas + quem já tem mesa (mesmo que depois tenha recusado: aparece com aviso)
  const guests = event ? await all(env, `SELECT g.id, g.name, g.is_child, g.is_plus_one, g.household_id, h.name AS household, s.table_id,
      (SELECT r.status FROM rsvps r WHERE r.guest_id = g.id AND r.event_id = ?) AS status
    FROM guests g JOIN households h ON h.id = g.household_id LEFT JOIN seat_assignments s ON s.guest_id = g.id
    WHERE g.wedding_id = ? AND (s.table_id IS NOT NULL OR EXISTS (SELECT 1 FROM rsvps r WHERE r.guest_id = g.id AND r.event_id = ? AND r.status = 'yes'))
    ORDER BY h.created_at, h.rowid, g.sort`, event.id, W, event.id) : [];
  return json({ events, event_id: event?.id || null, show_tables: !!w.show_tables, tables, items,
    guests: guests.map(g => ({ ...g, is_child: !!g.is_child, is_plus_one: !!g.is_plus_one, confirmed: g.status === "yes" })) });
}
async function patchSeating(ctx) {
  const { env, W, actor } = ctx;
  const b = await body(ctx.req, 2000);
  if (b.event_id !== undefined) {
    const ev = await first(env, "SELECT id FROM events WHERE id = ? AND wedding_id = ?", String(b.event_id || ""), W);
    if (!ev) fail(400, "Evento inválido", "invalid");
    await run(env, "UPDATE weddings SET seating_event_id = ? WHERE id = ?", ev.id, W);
  }
  if (b.show_tables !== undefined) {
    if (typeof b.show_tables !== "boolean") fail(400, "Mostrar mesas: valor inválido", "invalid");
    await run(env, "UPDATE weddings SET show_tables = ? WHERE id = ?", b.show_tables ? 1 : 0, W);
    await audit(env, W, actor, "tables.show", b.show_tables ? "on" : "off");
  }
  return json({ ok: true });
}
function tableFields(b, cur = {}) {
  return {
    name: b.name !== undefined ? str(b.name, { min: 1, max: 40, field: "Nome da mesa" }) : cur.name,
    shape: b.shape !== undefined ? oneOf(b.shape, ["round", "rect"], "Formato") : cur.shape ?? "round",
    seats: b.seats !== undefined ? int(b.seats, { min: 1, max: 40, field: "Lugares" }) : cur.seats ?? 8,
    x: b.x !== undefined ? pct(b.x, "Posição") : cur.x ?? 50,
    y: b.y !== undefined ? pct(b.y, "Posição") : cur.y ?? 50,
  };
}
async function createTable(ctx) {
  const { env, W } = ctx;
  const n = (await first(env, "SELECT COUNT(*) AS n, COALESCE(MAX(sort), -1) + 1 AS s FROM seating_tables WHERE wedding_id = ?", W));
  if (n.n >= MAX_TABLES) fail(409, `No máximo ${MAX_TABLES} mesas`, "too_many");
  const b = await body(ctx.req, 2000);
  const f = tableFields({ name: `Mesa ${n.n + 1}`, ...b });
  const id = uid("t_");
  await run(env, "INSERT INTO seating_tables (id, wedding_id, name, shape, seats, x, y, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, W, f.name, f.shape, f.seats, f.x, f.y, n.s);
  return json({ id, ...f }, 201);
}
async function updateTable(ctx, id) {
  const { env, W } = ctx;
  const t = await first(env, "SELECT * FROM seating_tables WHERE id = ? AND wedding_id = ?", id, W);
  if (!t) fail(404, "Mesa não encontrada", "not_found");
  const f = tableFields(await body(ctx.req, 2000), t);
  await run(env, "UPDATE seating_tables SET name = ?, shape = ?, seats = ?, x = ?, y = ? WHERE id = ? AND wedding_id = ?", f.name, f.shape, f.seats, f.x, f.y, id, W);
  return json({ ok: true, ...f });
}
async function deleteTable(ctx, id) {
  const { env, W, actor } = ctx;
  const t = await first(env, "SELECT id FROM seating_tables WHERE id = ? AND wedding_id = ?", id, W);
  if (!t) fail(404, "Mesa não encontrada", "not_found");
  await batch(env, [
    env.DB.prepare("DELETE FROM seat_assignments WHERE table_id = ? AND wedding_id = ?").bind(id, W),
    env.DB.prepare("DELETE FROM seating_tables WHERE id = ? AND wedding_id = ?").bind(id, W),
  ]);
  await audit(env, W, actor, "table.delete", id);
  return json({ ok: true });
}
async function createItem(ctx) {
  const { env, W } = ctx;
  if ((await first(env, "SELECT COUNT(*) AS n FROM floor_items WHERE wedding_id = ?", W)).n >= MAX_ITEMS) fail(409, `No máximo ${MAX_ITEMS} elementos`, "too_many");
  const b = await body(ctx.req, 2000);
  const kind = oneOf(b.kind, Object.keys(KINDS), "Elemento");
  const [w, h] = SIZES[kind];
  const id = uid("f_");
  const f = { kind, label: str(b.label ?? KINDS[kind], { max: 40, field: "Nome" }) || KINDS[kind], x: b.x !== undefined ? pct(b.x, "Posição") : 50, y: b.y !== undefined ? pct(b.y, "Posição") : 12,
    w: b.w !== undefined ? int(b.w, { min: 4, max: 80, field: "Largura" }) : w, h: b.h !== undefined ? int(b.h, { min: 4, max: 80, field: "Altura" }) : h };
  await run(env, "INSERT INTO floor_items (id, wedding_id, kind, label, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, W, f.kind, f.label, f.x, f.y, f.w, f.h);
  return json({ id, ...f }, 201);
}
async function updateItem(ctx, id) {
  const { env, W } = ctx;
  const it = await first(env, "SELECT * FROM floor_items WHERE id = ? AND wedding_id = ?", id, W);
  if (!it) fail(404, "Elemento não encontrado", "not_found");
  const b = await body(ctx.req, 2000);
  const f = { label: b.label !== undefined ? str(b.label, { min: 1, max: 40, field: "Nome" }) : it.label,
    x: b.x !== undefined ? pct(b.x, "Posição") : it.x, y: b.y !== undefined ? pct(b.y, "Posição") : it.y,
    w: b.w !== undefined ? int(b.w, { min: 4, max: 80, field: "Largura" }) : it.w, h: b.h !== undefined ? int(b.h, { min: 4, max: 80, field: "Altura" }) : it.h };
  await run(env, "UPDATE floor_items SET label = ?, x = ?, y = ?, w = ?, h = ? WHERE id = ? AND wedding_id = ?", f.label, f.x, f.y, f.w, f.h, id, W);
  return json({ ok: true, ...f });
}
async function deleteItem(ctx, id) {
  const { env, W } = ctx;
  const it = await first(env, "SELECT id FROM floor_items WHERE id = ? AND wedding_id = ?", id, W);
  if (!it) fail(404, "Elemento não encontrado", "not_found");
  await run(env, "DELETE FROM floor_items WHERE id = ? AND wedding_id = ?", id, W);
  return json({ ok: true });
}
async function assignSeats(ctx) {
  const { env, W } = ctx;
  const b = await body(ctx.req, 64_000);
  const list = Array.isArray(b.assignments) ? b.assignments : fail(400, "Distribuição ausente", "invalid");
  if (list.length < 1 || list.length > 1000) fail(400, "Distribuição inválida", "invalid");
  const guests = new Set((await all(env, "SELECT id FROM guests WHERE wedding_id = ?", W)).map(g => g.id));
  const tables = new Set((await all(env, "SELECT id FROM seating_tables WHERE wedding_id = ?", W)).map(t => t.id));
  const stmts = [];
  for (const a of list) {
    if (!a || !guests.has(a.guest_id)) fail(400, "Pessoa fora deste casamento", "invalid_target");
    if (a.table_id == null) stmts.push(env.DB.prepare("DELETE FROM seat_assignments WHERE guest_id = ? AND wedding_id = ?").bind(a.guest_id, W));
    else if (!tables.has(a.table_id)) fail(400, "Mesa fora deste casamento", "invalid_target");
    else stmts.push(env.DB.prepare("INSERT INTO seat_assignments (guest_id, table_id, wedding_id) VALUES (?, ?, ?) ON CONFLICT(guest_id) DO UPDATE SET table_id = excluded.table_id")
      .bind(a.guest_id, a.table_id, W));
  }
  await batch(env, stmts);
  return json({ ok: true, changed: stmts.length });
}

/* ---------------- painel: privacidade ---------------- */
async function privacy(env, W, role) {
  const w = await first(env, "SELECT names, date_iso, retention_days, guests_purged_at FROM weddings WHERE id = ?", W);
  const c = await first(env, `SELECT (SELECT COUNT(*) FROM households WHERE wedding_id = ?1) AS households, (SELECT COUNT(*) FROM guests WHERE wedding_id = ?1) AS guests,
    (SELECT COUNT(*) FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE g.wedding_id = ?1) AS rsvps,
    (SELECT COUNT(*) FROM guests WHERE wedding_id = ?1 AND (diet <> '' OR accessibility <> '')) AS sensitive,
    (SELECT COUNT(*) FROM gift_notices WHERE wedding_id = ?1) AS gift_notices`, W);
  return json({ names: w.names, date: w.date_iso, retention_days: w.retention_days, purge_on: purgeDate(w), purged_at: w.guests_purged_at,
    counts: c, can_edit: role === "owner" });
}
const ownerOnly = s => { if (s.role !== "owner") fail(403, "Só quem é dono do casamento pode mudar isso", "forbidden"); };
async function setRetention(ctx) {
  const { env, W, actor, s } = ctx;
  ownerOnly(s);
  const b = await body(ctx.req, 1000);
  const days = int(b.retention_days, { min: 30, max: 365, field: "Prazo" });
  await run(env, "UPDATE weddings SET retention_days = ? WHERE id = ?", days, W);
  await audit(env, W, actor, "privacy.retention", String(days));
  return privacy(env, W, s.role);
}
const norm = v => String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
async function purgeNow(ctx) {
  const { env, W, actor, s } = ctx;
  ownerOnly(s);
  const b = await body(ctx.req, 1000);
  const w = await first(env, "SELECT names FROM weddings WHERE id = ?", W);
  if (!b.confirm || norm(b.confirm) !== norm(w.names)) fail(400, `Para confirmar, digite exatamente “${w.names}”.`, "confirm");
  const counts = await purgeGuests(env, W, actor);
  return json({ ok: true, deleted: counts });
}

/* ---------------- módulo ---------------- */
export default {
  name: "convidados",

  async public(ctx) {
    const { p, m } = ctx; let r;
    if (m === "POST" && (r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/presenca$/))) { ctx.sameOrigin(); return rsvpByName(ctx, r[1]); }
    if ((r = p.match(/^\/api\/invite\/([A-Za-z0-9_-]{16,64})\/acompanhantes(?:\/([\w-]{4,40}))?$/))) {
      if (m === "POST" && !r[2]) { ctx.sameOrigin(); return addCompanion(ctx, r[1]); }
      if (m === "DELETE" && r[2]) { ctx.sameOrigin(); return removeCompanion(ctx, r[1], r[2]); }
    }
    return null;
  },

  async admin(ctx) {
    const { p, m, env, W, actor } = ctx; let r;
    if (p === "/api/admin/convidados" && m === "GET") return guestExtras(env, W);
    if (p === "/api/admin/convidados/menus" && m === "POST") return createMenu(ctx);
    if (p === "/api/admin/convidados/settings" && m === "PATCH") {
      const b = await body(ctx.req, 1000);
      if (typeof b.rsvp_by_name !== "boolean") fail(400, "Confirmar pelo site: valor inválido", "invalid");
      await run(env, "UPDATE weddings SET rsvp_by_name = ? WHERE id = ?", b.rsvp_by_name ? 1 : 0, W);
      if (!b.rsvp_by_name) await run(env, "DELETE FROM rsvp_name_tokens WHERE wedding_id = ?", W);
      await audit(env, W, actor, "rsvp_by_name", b.rsvp_by_name ? "on" : "off");
      return json({ ok: true, rsvp_by_name: b.rsvp_by_name });
    }
    if ((r = p.match(/^\/api\/admin\/convidados\/menus\/([\w-]{4,40})$/)) && m === "DELETE") return deleteMenu(ctx, r[1]);
    if ((r = p.match(/^\/api\/admin\/convidados\/households\/([\w-]{4,40})(\/promote|\/reminded)?$/))) {
      if (m === "PATCH" && !r[2]) return patchHousehold(ctx, r[1]);
      if (m === "POST" && r[2] === "/promote") return promote(ctx, r[1]);
      if (m === "POST" && r[2] === "/reminded") {
        await ownHousehold(env, W, r[1]);
        await run(env, "UPDATE households SET reminded_at = datetime('now') WHERE id = ? AND wedding_id = ?", r[1], W);
        return json({ ok: true });
      }
    }
    if ((r = p.match(/^\/api\/admin\/convidados\/guests\/([\w-]{4,40})$/)) && m === "DELETE") {
      const g = await first(env, "SELECT id FROM guests WHERE id = ? AND wedding_id = ? AND is_plus_one = 1", r[1], W);
      if (!g) fail(404, "Acompanhante não encontrado", "not_found");
      await deleteGuest(env, W, r[1]);
      await audit(env, W, actor, "plus_one.remove", r[1]);
      return json({ ok: true });
    }

    if (p === "/api/admin/mesas") { if (m === "GET") return seating(env, W); if (m === "PATCH") return patchSeating(ctx); }
    if (p === "/api/admin/mesas/tables" && m === "POST") return createTable(ctx);
    if ((r = p.match(/^\/api\/admin\/mesas\/tables\/([\w-]{4,40})$/))) { if (m === "PATCH") return updateTable(ctx, r[1]); if (m === "DELETE") return deleteTable(ctx, r[1]); }
    if (p === "/api/admin/mesas/items" && m === "POST") return createItem(ctx);
    if ((r = p.match(/^\/api\/admin\/mesas\/items\/([\w-]{4,40})$/))) { if (m === "PATCH") return updateItem(ctx, r[1]); if (m === "DELETE") return deleteItem(ctx, r[1]); }
    if (p === "/api/admin/mesas/seats" && m === "POST") return assignSeats(ctx);

    if (p === "/api/admin/privacidade") { if (m === "GET") return privacy(env, W, ctx.s.role); if (m === "PATCH") return setRetention(ctx); }
    if (p === "/api/admin/privacidade/apagar" && m === "POST") return purgeNow(ctx);
    return null;
  },

  /** Site público: só se dá para confirmar pelo nome (nenhum dado pessoal). */
  async site(env, w) {
    return { rsvp_by_name: !!w.rsvp_by_name && !w.guests_purged_at && !deadlinePassed(w.rsvp_deadline) };
  },

  /** Só dados da própria família: cardápio dos eventos dela, vagas, mesa (se o casal liberou) e a data da limpeza. */
  async invite(env, w, h) {
    const menus = await all(env, `SELECT m.id, m.event_id, m.name, m.description FROM menu_options m JOIN invitations i ON i.event_id = m.event_id
      WHERE i.household_id = ? AND m.wedding_id = ? ORDER BY m.sort, m.rowid`, h.id, w.id);
    let tables = null;
    if (w.show_tables) {
      tables = await all(env, `SELECT s.guest_id, t.name AS table_name FROM seat_assignments s JOIN seating_tables t ON t.id = s.table_id JOIN guests g ON g.id = s.guest_id
        WHERE g.household_id = ? AND s.wedding_id = ?`, h.id, w.id);
    }
    return { menus, tables, purge_on: purgeDate(w) };
  },

  async overview(env, W) {
    const alerts = [];
    const pend = await first(env, "SELECT COUNT(*) AS n FROM households WHERE wedding_id = ? AND waitlist = 0 AND responded_at IS NULL AND token_hash IS NOT NULL AND revoked = 0", W);
    if (pend.n) alerts.push({ text: `${pend.n} ${pend.n > 1 ? "famílias com link ativo ainda não responderam" : "família com link ativo ainda não respondeu"}. Dá para mandar um lembrete pelo WhatsApp.`, href: "#convidados" });
    const s = await waitlistSuggestion(env, W);
    if (s.households.length) alerts.push({ text: `${s.available} ${s.available > 1 ? "lugares liberados" : "lugar liberado"} por recusas: há quem chamar da lista de espera.`, href: "#convidados" });
    const w = await first(env, "SELECT date_iso, retention_days, guests_purged_at FROM weddings WHERE id = ?", W);
    if (!w.guests_purged_at) {
      const d = purgeDate(w), days = Math.round((Date.parse(d) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5);
      if (days <= 30) alerts.push({ text: `Os dados dos convidados serão apagados em ${days <= 0 ? "breve" : days + (days > 1 ? " dias" : " dia")}. Exportem antes, se quiserem guardar.`, href: "#privacidade" });
    }
    // lugares nas mesas (para o radar "mais confirmados do que lugares"); só quando o casal já montou mesas
    const tb = await first(env, "SELECT COUNT(*) AS n, COALESCE(SUM(seats), 0) AS seats FROM seating_tables WHERE wedding_id = ?", W);
    return tb.n ? { alerts, seats: tb.seats } : { alerts };
  },

  async exportData(env, W) {
    const w = await first(env, "SELECT date_iso, retention_days, guests_purged_at, show_tables, seating_event_id FROM weddings WHERE id = ?", W);
    return {
      menu_options: await all(env, "SELECT * FROM menu_options WHERE wedding_id = ?", W),
      seating_tables: await all(env, "SELECT * FROM seating_tables WHERE wedding_id = ?", W),
      floor_items: await all(env, "SELECT * FROM floor_items WHERE wedding_id = ?", W),
      seat_assignments: await all(env, "SELECT * FROM seat_assignments WHERE wedding_id = ?", W),
      privacy: { retention_days: w.retention_days, purge_on: purgeDate(w), guests_purged_at: w.guests_purged_at, show_tables: !!w.show_tables, seating_event_id: w.seating_event_id },
    };
  },

  /** Rotina diária: apaga os dados dos convidados dos casamentos que passaram do prazo. */
  async cron(env, now) {
    const today = now.toISOString().slice(0, 10);
    await run(env, "DELETE FROM rsvp_name_tokens WHERE expires_at < ?", now.toISOString());
    const ws = await all(env, "SELECT id, date_iso, retention_days FROM weddings WHERE guests_purged_at IS NULL");
    for (const w of ws) if (today >= purgeDate(w)) {
      try { await purgeGuests(env, w.id, "system:cron"); } catch (e) { console.error("purge", w.id, e); }
    }
  },
};
