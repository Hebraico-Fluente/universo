/**
 * Universo — plataforma de sites e organização de casamentos.
 * Cloudflare Worker + D1 + arquivos estáticos (public/).
 *
 * Páginas
 *   GET  /                      landing da plataforma
 *   GET  /c/:slug               site público do casal
 *   GET  /i/:token              convite pessoal de uma família (envelope + RSVP)
 *   GET  /painel                painel dos noivos
 *
 * API pública (sem dados pessoais)
 *   GET  /api/site/:slug                     conteúdo publicado do site
 *   GET  /api/invite/:token                  convite da família (limite por IP; token só por hash)
 *   POST /api/invite/:token/rsvp             respostas por pessoa e por evento
 *   POST /api/site/:slug/recados             recado no mural (só aparece no site depois que os noivos aprovam)
 *
 * API dos noivos (sessão + papel; o casamento vem SEMPRE da sessão)
 *   POST /api/auth/login | /api/auth/logout   GET /api/me
 *   GET  /api/admin/overview                  números do painel
 *   GET  /api/admin/guests                    famílias, pessoas e respostas
 *   POST /api/admin/households                cria família convidada (devolve o link uma única vez)
 *   POST /api/admin/households/:id/link       gera link novo (revoga o anterior)
 *   POST /api/admin/households/:id/revoke     revoga o link
 *   DELETE /api/admin/households/:id          apaga a família e as respostas
 *   GET  /api/admin/budget                    orçamento: planejado, contratado, pago, a pagar
 *   POST /api/admin/budget/items              novo lançamento
 *   PATCH /api/admin/budget/items/:id         atualiza valores pagos/contratados
 *   GET  /api/admin/budget/simulate?extra=30  simula mais convidados com base nos contratos por pessoa
 *   GET  /api/admin/recados                   recados do mural (pendentes e aprovados)
 *   POST /api/admin/recados/:id/approve       aprova um recado   ·   DELETE /api/admin/recados/:id   apaga
 *   GET  /api/admin/export                    exporta todos os dados do casamento (LGPD)
 */
import { json, err, HttpError, fail, str, int, oneOf, isoDate, body, randomToken, uid, sha256, hashPassword, safeEqual, rateLimit, clientIp, audit, parseJson } from "./lib.js";

const SESSION_DAYS = 14;
const COOKIE = "__Host-sess";
const LIMITS = { login: 10, invite: 60, rsvp: 30 };
const WRITE_ROLES = ["owner", "planner"];

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data: https://images.unsplash.com",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
};

/* ---------------- roteamento ---------------- */
export default { fetch: (req, env) => handle(req, env) };

export async function handle(req, env) {
  const url = new URL(req.url);
  const p = url.pathname;
  try {
    if (p.startsWith("/api/")) return await api(req, env, url);
    // páginas com rotas amigáveis → arquivos estáticos
    let asset = null;
    if (p === "/" || p === "/index.html") asset = "/index.html";
    else if (/^\/c\/[a-z0-9-]{3,60}\/?$/.test(p)) asset = "/casal.html";
    else if (/^\/i\/[A-Za-z0-9_-]{16,64}\/?$/.test(p)) asset = "/convite.html";
    else if (p === "/painel" || p === "/painel/") asset = "/painel/index.html";
    const res = await env.ASSETS.fetch(new Request(new URL(asset || p, url.origin), req));
    return withSecurity(res, asset === "/convite.html");
  } catch (e) {
    if (e instanceof HttpError) return err(e.status, e.message, e.code);
    console.error(e);
    return err(500, "Erro inesperado. Tente de novo.", "server_error");
  }
}

function withSecurity(res, privatePage) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  if (privatePage) { h.set("X-Robots-Tag", "noindex, nofollow"); h.set("Cache-Control", "no-store"); }
  return new Response(res.body, { status: res.status, headers: h });
}

async function api(req, env, url) {
  const p = url.pathname, m = req.method;
  let r;
  // públicas
  if (m === "GET" && (r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})$/))) return siteData(env, r[1]);
  if (m === "POST" && (r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/recados$/))) { sameOrigin(req, url); return postMessage(req, env, r[1]); }
  if ((r = p.match(/^\/api\/invite\/([A-Za-z0-9_-]{16,64})(\/rsvp)?$/))) {
    if (m === "GET" && !r[2]) return inviteData(req, env, r[1]);
    if (m === "POST" && r[2]) { sameOrigin(req, url); return inviteRsvp(req, env, r[1]); }
  }
  // autenticação
  if (p === "/api/auth/login" && m === "POST") { sameOrigin(req, url); return login(req, env, url); }
  if (p === "/api/auth/logout" && m === "POST") { sameOrigin(req, url); return logout(req, env); }
  if (p === "/api/me" && m === "GET") { const s = await session(req, env); return json({ user: { name: s.user_name, email: s.email }, wedding: { id: s.wedding_id, names: s.names, slug: s.slug, is_demo: !!s.is_demo }, role: s.role }); }

  // área dos noivos
  if (p.startsWith("/api/admin/")) {
    const s = await session(req, env);
    if (m !== "GET") { sameOrigin(req, url); if (!WRITE_ROLES.includes(s.role)) fail(403, "Seu acesso é só de leitura", "forbidden"); }
    const W = s.wedding_id, actor = "user:" + s.user_id;
    if (p === "/api/admin/overview" && m === "GET") return overview(env, W);
    if (p === "/api/admin/guests" && m === "GET") return guestList(env, W);
    if (p === "/api/admin/households" && m === "POST") return createHousehold(req, env, W, actor, url);
    if ((r = p.match(/^\/api\/admin\/households\/([\w-]{4,40})(\/link|\/revoke)?$/))) {
      if (m === "POST" && r[2] === "/link") return newLink(env, W, r[1], actor, url);
      if (m === "POST" && r[2] === "/revoke") return revoke(env, W, r[1], actor);
      if (m === "DELETE" && !r[2]) return deleteHousehold(env, W, r[1], actor);
    }
    if (p === "/api/admin/budget" && m === "GET") return budget(env, W);
    if (p === "/api/admin/budget/items" && m === "POST") return createItem(req, env, W);
    if ((r = p.match(/^\/api\/admin\/budget\/items\/([\w-]{2,40})$/)) && m === "PATCH") return updateItem(req, env, W, r[1]);
    if (p === "/api/admin/budget/simulate" && m === "GET") return simulate(env, W, url);
    if (p === "/api/admin/export" && m === "GET") return exportData(env, W, actor);
    if (p === "/api/admin/recados" && m === "GET") return json({ messages: (await env.DB.prepare("SELECT id, author, message, status, created_at FROM guestbook WHERE wedding_id = ? ORDER BY status = 'pending' DESC, created_at DESC").bind(W).all()).results });
    if ((r = p.match(/^\/api\/admin\/recados\/([\w-]{2,40})(\/approve)?$/))) {
      const own = await env.DB.prepare("SELECT id FROM guestbook WHERE id = ? AND wedding_id = ?").bind(r[1], W).first();
      if (!own) fail(404, "Recado não encontrado", "not_found");
      if (m === "POST" && r[2]) { await env.DB.prepare("UPDATE guestbook SET status = 'approved' WHERE id = ? AND wedding_id = ?").bind(r[1], W).run(); return json({ ok: true }); }
      if (m === "DELETE" && !r[2]) { await env.DB.prepare("DELETE FROM guestbook WHERE id = ? AND wedding_id = ?").bind(r[1], W).run(); await audit(env, W, actor, "guestbook.delete", r[1]); return json({ ok: true }); }
    }
  }
  return err(404, "Não encontrado", "not_found");
}

/** Proteção CSRF: escrita só a partir do próprio site. */
function sameOrigin(req, url) {
  const o = req.headers.get("Origin");
  if (!o || o !== url.origin) fail(403, "Origem não permitida", "bad_origin");
}

/* ---------------- sessão ---------------- */
function readCookie(req, name) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name.replace(/[-_]/g, "\\$&") + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
async function session(req, env) {
  const raw = readCookie(req, COOKIE) || readCookie(req, "sess");
  if (!raw || raw.length > 100) fail(401, "Entre para continuar", "unauthenticated");
  const s = await env.DB.prepare(`SELECT s.user_id, s.wedding_id, s.expires_at, u.name AS user_name, u.email, m.role, w.names, w.slug, w.is_demo
    FROM sessions s JOIN users u ON u.id = s.user_id JOIN memberships m ON m.user_id = s.user_id AND m.wedding_id = s.wedding_id
    JOIN weddings w ON w.id = s.wedding_id WHERE s.id_hash = ?`).bind(await sha256(raw)).first();
  if (!s || s.expires_at < new Date().toISOString()) fail(401, "Sessão expirada. Entre de novo.", "unauthenticated");
  return s;
}
async function login(req, env, url) {
  const b = await body(req);
  const email = str(b.email, { max: 160, min: 3, field: "E-mail" }).toLowerCase();
  const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  await rateLimit(env, "login-ip:" + clientIp(req), LIMITS.login * 3);
  await rateLimit(env, "login:" + email, LIMITS.login);
  const u = await env.DB.prepare("SELECT id, pass_hash, pass_salt FROM users WHERE email = ?").bind(email).first();
  // mesmo custo de tempo com ou sem usuário (não revela quais e-mails existem)
  const { hash } = await hashPassword(password, u ? u.pass_salt : "AAAAAAAAAAAAAAAAAAAAAA==");
  if (!u || !safeEqual(hash, u.pass_hash)) fail(401, "E-mail ou senha incorretos", "bad_credentials");
  const mem = await env.DB.prepare("SELECT wedding_id FROM memberships WHERE user_id = ? ORDER BY role = 'owner' DESC LIMIT 1").bind(u.id).first();
  if (!mem) fail(403, "Este acesso não está ligado a nenhum casamento", "no_wedding");
  const raw = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id_hash, user_id, wedding_id, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(raw), u.id, mem.wedding_id, expires).run();
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const name = secure ? COOKIE : "sess"; // __Host- exige HTTPS; em localhost usa nome simples
  return json({ ok: true }, 200, { "Set-Cookie": `${name}=${raw}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}` });
}
async function logout(req, env) {
  const raw = readCookie(req, COOKIE) || readCookie(req, "sess");
  if (raw) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(raw)).run();
  const h = new Headers({ "Content-Type": "application/json" });
  h.append("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  h.append("Set-Cookie", "sess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  return new Response('{"ok":true}', { status: 200, headers: h });
}

/* ---------------- site público ---------------- */
async function siteData(env, slug) {
  const w = await env.DB.prepare("SELECT * FROM weddings WHERE slug = ?").bind(slug).first();
  if (!w) fail(404, "Site não encontrado", "not_found");
  const ev = await env.DB.prepare("SELECT name, starts_at, venue, address, dress_code, notes FROM events WHERE wedding_id = ? AND is_public = 1 ORDER BY sort, starts_at").bind(w.id).all();
  const msgs = w.guestbook ? (await env.DB.prepare("SELECT author, message, created_at FROM guestbook WHERE wedding_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 60").bind(w.id).all()).results : [];
  return json({ wedding: publicWedding(w), events: ev.results, messages: msgs }, 200, { "Cache-Control": "public, max-age=60" });
}
async function postMessage(req, env, slug) {
  const w = await env.DB.prepare("SELECT id, guestbook FROM weddings WHERE slug = ?").bind(slug).first();
  if (!w || !w.guestbook) fail(404, "Mural não encontrado", "not_found");
  await rateLimit(env, "gb:" + clientIp(req), 6);
  const b = await body(req, 4000);
  const author = str(b.author, { min: 2, max: 60, field: "Seu nome" }), message = str(b.message, { min: 2, max: 600, field: "Mensagem" });
  await env.DB.prepare("INSERT INTO guestbook (id, wedding_id, author, message) VALUES (?, ?, ?, ?)").bind(uid("m_"), w.id, author, message).run();
  return json({ ok: true, status: "pending" }, 201);
}
function publicWedding(w) {
  return { names: w.names, date: w.date_iso, city: w.city, universe: w.universe, welcome: w.welcome, hero_image: w.hero_image,
    story: parseJson(w.story_json, []), gifts: parseJson(w.gifts_json, []), pix_key: w.pix_key, faq: parseJson(w.faq_json, []),
    rsvp_deadline: w.rsvp_deadline, is_demo: !!w.is_demo, slug: w.slug,
    theme: w.theme || "", venue_name: w.venue_name || "", schedule: parseJson(w.schedule_json, []), dress: parseJson(w.dress_json, []),
    map_image: w.map_image || "", gift_url: w.gift_url || "", rsvp_note: w.rsvp_note || "", guestbook: !!w.guestbook };
}

/* ---------------- convite pessoal ---------------- */
async function householdByToken(env, token) {
  const h = await env.DB.prepare("SELECT * FROM households WHERE token_hash = ? AND revoked = 0").bind(await sha256(token)).first();
  // token inexistente e revogado têm a mesma resposta (sem enumeração)
  if (!h) fail(404, "Convite não encontrado. Peça um link novo aos noivos.", "invite_not_found");
  return h;
}
async function inviteData(req, env, token) {
  await rateLimit(env, "invite:" + clientIp(req), LIMITS.invite);
  const h = await householdByToken(env, token);
  const w = await env.DB.prepare("SELECT * FROM weddings WHERE id = ?").bind(h.wedding_id).first();
  const events = (await env.DB.prepare(`SELECT e.id, e.name, e.starts_at, e.venue, e.address, e.dress_code, e.notes FROM invitations i
    JOIN events e ON e.id = i.event_id WHERE i.household_id = ? ORDER BY e.sort, e.starts_at`).bind(h.id).all()).results;
  const guests = (await env.DB.prepare("SELECT id, name, is_child, diet, accessibility FROM guests WHERE household_id = ? ORDER BY sort").bind(h.id).all()).results;
  const rs = (await env.DB.prepare("SELECT r.guest_id, r.event_id, r.status FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE g.household_id = ?").bind(h.id).all()).results;
  return json({
    wedding: publicWedding(w),
    household: { name: h.name, greeting: h.greeting || h.name, message: h.message, max_guests: h.max_guests, note: h.note_to_couple, responded_at: h.responded_at },
    events, guests: guests.map(g => ({ ...g, is_child: !!g.is_child })),
    responses: rs, open: !deadlinePassed(w.rsvp_deadline),
  });
}
const deadlinePassed = d => new Date().toISOString().slice(0, 10) > d;

async function inviteRsvp(req, env, token) {
  await rateLimit(env, "rsvp:" + clientIp(req), LIMITS.rsvp);
  const h = await householdByToken(env, token);
  const w = await env.DB.prepare("SELECT rsvp_deadline FROM weddings WHERE id = ?").bind(h.wedding_id).first();
  if (deadlinePassed(w.rsvp_deadline)) fail(409, "O prazo de confirmação terminou. Fale direto com os noivos.", "deadline");
  const b = await body(req);
  const guests = (await env.DB.prepare("SELECT id FROM guests WHERE household_id = ?").bind(h.id).all()).results.map(g => g.id);
  const events = (await env.DB.prepare("SELECT event_id FROM invitations WHERE household_id = ?").bind(h.id).all()).results.map(e => e.event_id);
  const responses = Array.isArray(b.responses) ? b.responses : fail(400, "Respostas ausentes", "invalid");
  if (responses.length === 0 || responses.length > guests.length * events.length) fail(400, "Respostas inválidas", "invalid");
  const stmts = [];
  for (const r of responses) {
    if (!guests.includes(r.guest_id) || !events.includes(r.event_id)) fail(400, "Pessoa ou evento fora deste convite", "invalid_target");
    oneOf(r.status, ["yes", "no"], "resposta");
    stmts.push(env.DB.prepare("INSERT INTO rsvps (guest_id, event_id, status, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(guest_id, event_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at").bind(r.guest_id, r.event_id, r.status));
  }
  for (const g of Array.isArray(b.details) ? b.details : []) {
    if (!guests.includes(g.guest_id)) fail(400, "Pessoa fora deste convite", "invalid_target");
    stmts.push(env.DB.prepare("UPDATE guests SET diet = ?, accessibility = ? WHERE id = ? AND household_id = ?")
      .bind(str(g.diet, { max: 160, field: "Restrição alimentar" }), str(g.accessibility, { max: 160, field: "Acessibilidade" }), g.guest_id, h.id));
  }
  stmts.push(env.DB.prepare("UPDATE households SET note_to_couple = ?, responded_at = datetime('now') WHERE id = ?").bind(str(b.note, { max: 600, field: "Recado" }), h.id));
  await batch(env, stmts);
  await audit(env, h.wedding_id, "guest:" + h.id, "rsvp", String(responses.length));
  return json({ ok: true });
}
async function batch(env, stmts) { if (env.DB.batch) return env.DB.batch(stmts); for (const s of stmts) await s.run(); }

/* ---------------- painel: convidados ---------------- */
async function overview(env, W) {
  const w = await env.DB.prepare("SELECT names, date_iso, rsvp_deadline, slug, is_demo FROM weddings WHERE id = ?").bind(W).first();
  const events = (await env.DB.prepare(`SELECT e.id, e.name, e.starts_at,
      (SELECT COUNT(*) FROM invitations i JOIN guests g ON g.household_id = i.household_id WHERE i.event_id = e.id) AS invited,
      (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'yes') AS yes,
      (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'no') AS no
    FROM events e WHERE e.wedding_id = ? ORDER BY e.sort, e.starts_at`).bind(W).all()).results;
  const hh = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(responded_at IS NOT NULL) AS responded FROM households WHERE wedding_id = ?").bind(W).first();
  const diets = (await env.DB.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = ? AND diet <> ''").bind(W).first()).n;
  const b = await budgetTotals(env, W);
  return json({ wedding: { ...w, is_demo: !!w.is_demo }, events: events.map(e => ({ ...e, pending: e.invited - e.yes - e.no })),
    households: { total: hh.total || 0, responded: hh.responded || 0 }, diets, budget: b });
}
async function guestList(env, W) {
  const hs = (await env.DB.prepare("SELECT id, name, greeting, max_guests, revoked, token_hash IS NOT NULL AS has_link, token_at, responded_at, note_to_couple FROM households WHERE wedding_id = ? ORDER BY created_at").bind(W).all()).results;
  const gs = (await env.DB.prepare("SELECT id, household_id, name, is_child, diet, accessibility FROM guests WHERE wedding_id = ? ORDER BY sort").bind(W).all()).results;
  const inv = (await env.DB.prepare("SELECT i.household_id, i.event_id FROM invitations i JOIN households h ON h.id = i.household_id WHERE h.wedding_id = ?").bind(W).all()).results;
  const rs = (await env.DB.prepare("SELECT r.guest_id, r.event_id, r.status FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE g.wedding_id = ?").bind(W).all()).results;
  const events = (await env.DB.prepare("SELECT id, name FROM events WHERE wedding_id = ? ORDER BY sort, starts_at").bind(W).all()).results;
  return json({ events, households: hs.map(h => ({
    ...h, revoked: !!h.revoked, has_link: !!h.has_link,
    events: inv.filter(i => i.household_id === h.id).map(i => i.event_id),
    guests: gs.filter(g => g.household_id === h.id).map(g => ({ ...g, is_child: !!g.is_child, responses: Object.fromEntries(rs.filter(r => r.guest_id === g.id).map(r => [r.event_id, r.status])) })),
  })) });
}
async function issueToken(env, W, hid, url) {
  const token = randomToken(16);
  await env.DB.prepare("UPDATE households SET token_hash = ?, token_at = datetime('now'), revoked = 0 WHERE id = ? AND wedding_id = ?").bind(await sha256(token), hid, W).run();
  return url.origin + "/i/" + token;
}
async function createHousehold(req, env, W, actor, url) {
  const b = await body(req);
  const name = str(b.name, { min: 2, max: 80, field: "Nome do convite" });
  const people = Array.isArray(b.guests) ? b.guests : [];
  if (people.length < 1 || people.length > 20) fail(400, "Informe de 1 a 20 pessoas", "invalid");
  const evIds = Array.isArray(b.events) ? b.events : [];
  const valid = (await env.DB.prepare("SELECT id FROM events WHERE wedding_id = ?").bind(W).all()).results.map(e => e.id);
  if (evIds.length < 1 || evIds.some(e => !valid.includes(e))) fail(400, "Escolha ao menos um evento deste casamento", "invalid");
  const id = uid("h_");
  const stmts = [env.DB.prepare("INSERT INTO households (id, wedding_id, name, greeting, message, max_guests) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, W, name, str(b.greeting, { max: 80, field: "Como chamar" }), str(b.message, { max: 500, field: "Mensagem" }), people.length)];
  people.forEach((g, i) => stmts.push(env.DB.prepare("INSERT INTO guests (id, wedding_id, household_id, name, is_child, sort) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid("g_"), W, id, str(g.name, { min: 2, max: 80, field: "Nome do convidado" }), g.is_child ? 1 : 0, i)));
  for (const e of evIds) stmts.push(env.DB.prepare("INSERT INTO invitations (household_id, event_id) VALUES (?, ?)").bind(id, e));
  await batch(env, stmts);
  const link = await issueToken(env, W, id, url);
  await audit(env, W, actor, "household.create", id);
  return json({ id, link }, 201);
}
async function ownHousehold(env, W, hid) {
  const h = await env.DB.prepare("SELECT id FROM households WHERE id = ? AND wedding_id = ?").bind(hid, W).first();
  if (!h) fail(404, "Convite não encontrado", "not_found");
}
async function newLink(env, W, hid, actor, url) {
  await ownHousehold(env, W, hid);
  const link = await issueToken(env, W, hid, url);
  await audit(env, W, actor, "household.link", hid);
  return json({ link });
}
async function revoke(env, W, hid, actor) {
  await ownHousehold(env, W, hid);
  await env.DB.prepare("UPDATE households SET revoked = 1 WHERE id = ? AND wedding_id = ?").bind(hid, W).run();
  await audit(env, W, actor, "household.revoke", hid);
  return json({ ok: true });
}
async function deleteHousehold(env, W, hid, actor) {
  await ownHousehold(env, W, hid);
  await env.DB.prepare("DELETE FROM households WHERE id = ? AND wedding_id = ?").bind(hid, W).run();
  await audit(env, W, actor, "household.delete", hid);
  return json({ ok: true });
}

/* ---------------- painel: orçamento ---------------- */
async function budgetTotals(env, W) {
  const r = await env.DB.prepare(`SELECT (SELECT COALESCE(SUM(planned_cents),0) FROM budget_categories WHERE wedding_id = ?) AS planned,
    COALESCE(SUM(amount_cents),0) AS committed, COALESCE(SUM(paid_cents),0) AS paid FROM budget_items WHERE wedding_id = ?`).bind(W, W).first();
  return { planned: r.planned, committed: r.committed, paid: r.paid, to_pay: r.committed - r.paid };
}
async function budget(env, W) {
  const cats = (await env.DB.prepare("SELECT id, name, planned_cents FROM budget_categories WHERE wedding_id = ? ORDER BY sort").bind(W).all()).results;
  const items = (await env.DB.prepare("SELECT id, category_id, description, vendor, amount_cents, paid_cents, due_date, per_guest_cents FROM budget_items WHERE wedding_id = ? ORDER BY due_date IS NULL, due_date").bind(W).all()).results;
  const today = new Date().toISOString().slice(0, 10);
  return json({
    totals: await budgetTotals(env, W),
    categories: cats.map(c => { const its = items.filter(i => i.category_id === c.id); return { ...c, committed: its.reduce((s, i) => s + i.amount_cents, 0), paid: its.reduce((s, i) => s + i.paid_cents, 0) }; }),
    items,
    upcoming: items.filter(i => i.due_date && i.amount_cents > i.paid_cents).map(i => ({ ...i, overdue: i.due_date < today })).slice(0, 8),
  });
}
async function createItem(req, env, W) {
  const b = await body(req);
  const cat = await env.DB.prepare("SELECT id FROM budget_categories WHERE id = ? AND wedding_id = ?").bind(String(b.category_id || ""), W).first();
  if (!cat) fail(400, "Categoria inválida", "invalid");
  const id = uid("b_");
  const amount = int(b.amount_cents, { field: "Valor" }), paid = int(b.paid_cents ?? 0, { field: "Pago" });
  if (paid > amount) fail(400, "O valor pago não pode passar do contratado", "invalid");
  await env.DB.prepare("INSERT INTO budget_items (id, wedding_id, category_id, description, vendor, amount_cents, paid_cents, due_date, per_guest_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, W, cat.id, str(b.description, { min: 2, max: 120, field: "Descrição" }), str(b.vendor, { max: 80, field: "Fornecedor" }), amount, paid,
      isoDate(b.due_date, "Vencimento"), b.per_guest_cents == null || b.per_guest_cents === "" ? null : int(b.per_guest_cents, { field: "Valor por convidado" })).run();
  return json({ id }, 201);
}
async function updateItem(req, env, W, id) {
  const it = await env.DB.prepare("SELECT * FROM budget_items WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!it) fail(404, "Lançamento não encontrado", "not_found");
  const b = await body(req);
  const amount = b.amount_cents != null ? int(b.amount_cents, { field: "Valor" }) : it.amount_cents;
  const paid = b.paid_cents != null ? int(b.paid_cents, { field: "Pago" }) : it.paid_cents;
  if (paid > amount) fail(400, "O valor pago não pode passar do contratado", "invalid");
  const due = b.due_date !== undefined ? isoDate(b.due_date, "Vencimento") : it.due_date;
  await env.DB.prepare("UPDATE budget_items SET amount_cents = ?, paid_cents = ?, due_date = ? WHERE id = ? AND wedding_id = ?").bind(amount, paid, due, id, W).run();
  return json({ ok: true });
}
/** Simulação honesta: só usa contratos marcados com valor por pessoa. Não inventa preços. */
async function simulate(env, W, url) {
  const extra = int(url.searchParams.get("extra") ?? 0, { min: 1, max: 1000, field: "Convidados a mais" });
  const items = (await env.DB.prepare("SELECT description, vendor, per_guest_cents FROM budget_items WHERE wedding_id = ? AND per_guest_cents IS NOT NULL").bind(W).all()).results;
  const fixed = (await env.DB.prepare("SELECT COUNT(*) AS n FROM budget_items WHERE wedding_id = ? AND per_guest_cents IS NULL").bind(W).first()).n;
  const lines = items.map(i => ({ source: i.description + (i.vendor ? " · " + i.vendor : ""), per_guest_cents: i.per_guest_cents, total_cents: i.per_guest_cents * extra }));
  return json({
    extra, total_cents: lines.reduce((s, l) => s + l.total_cents, 0), lines,
    assumptions: [
      "Usa apenas os lançamentos em que vocês informaram o valor por convidado.",
      `${fixed} lançamento(s) com valor fechado não mudam com o número de convidados nesta simulação.`,
      "Não inclui papelaria, lembranças ou mesas extras que não tenham valor por pessoa cadastrado.",
    ],
    can_estimate: lines.length > 0,
  });
}

/* ---------------- exportação (LGPD) ---------------- */
async function exportData(env, W, actor) {
  const q = async (sql) => (await env.DB.prepare(sql).bind(W).all()).results;
  const data = {
    exported_at: new Date().toISOString(),
    wedding: await env.DB.prepare("SELECT * FROM weddings WHERE id = ?").bind(W).first(),
    events: await q("SELECT * FROM events WHERE wedding_id = ?"),
    households: (await q("SELECT id, name, greeting, message, max_guests, revoked, responded_at, note_to_couple, created_at FROM households WHERE wedding_id = ?")),
    guests: await q("SELECT * FROM guests WHERE wedding_id = ?"),
    invitations: await q("SELECT i.* FROM invitations i JOIN households h ON h.id = i.household_id WHERE h.wedding_id = ?"),
    rsvps: await q("SELECT r.* FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE g.wedding_id = ?"),
    budget_categories: await q("SELECT * FROM budget_categories WHERE wedding_id = ?"),
    budget_items: await q("SELECT * FROM budget_items WHERE wedding_id = ?"),
    guestbook: await q("SELECT * FROM guestbook WHERE wedding_id = ?"),
  };
  await audit(env, W, actor, "export");
  return json(data, 200, { "Content-Disposition": `attachment; filename="casamento-${data.wedding.slug}.json"` });
}
