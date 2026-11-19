/**
 * Módulo "plataforma" — painel do administrador da plataforma (Gueta Studio) em /plataforma.
 * Contrato de módulos: src/mods/README.md.  Tabelas: migrations/0030_plataforma.sql.
 *
 * Acesso de administrador
 *   O papel vive em users.platform_role ('admin' | NULL). Ninguém vira admin por rota pública:
 *   o primeiro admin nasce de um convite de uso único cujo HASH é gravado pelo workflow
 *   .github/workflows/plataforma-admin.yml (token gerado localmente com scripts/platform-link.mjs).
 *   A sessão do admin é própria (tabela platform_sessions, cookie __Host-plat): a sessão do casal é
 *   sempre ligada a um casamento (sessions.wedding_id NOT NULL) e não serve para quem não tem casamento.
 *
 * Rotas (todas em /api/platform/*, sempre com admin; escrita com sameOrigin; tudo vai para audit_log)
 *   POST /login | /logout                     GET|POST /setup/:token (convite de admin, uso único)
 *   GET  /me
 *   GET  /weddings                            clientes com plano, status e uso
 *   POST /weddings                            cria casamento + link de dono (o token aparece uma vez)
 *   GET|PATCH /weddings/:id                   detalhe · suspender, demonstração, plano, flags, observação
 *   POST /weddings/:id/access                 novo link de acesso (owner|planner|viewer)
 *   POST /weddings/:id/access/revoke          revoga convite pendente {token_ref} ou membro {user_id}
 *   POST /weddings/:id/apply-plan             liga só as funcionalidades do plano
 *   POST /weddings/:id/charges                registra cobrança (manual)   ·  PATCH|DELETE /charges/:id
 *   POST /weddings/:id/domains                registra domínio   ·  GET /domains   ·  PATCH|DELETE /domains/:host
 *   GET|POST /plans   PATCH|DELETE /plans/:id
 *   GET  /billing   GET /usage   GET|DELETE /errors   GET /audit
 *   GET  /tickets   GET /tickets/:id   POST /tickets/:id/reply   POST /tickets/:id/status
 * Rotas do casal (painel): GET|POST /api/admin/suporte · POST /api/admin/suporte/:id
 *
 * Também exporta, para o worker e para os outros módulos:
 *   featureOn(w, key)        flag de funcionalidade (ausente = ligada)
 *   featureMap(w)            todas as flags {chave: bool}
 *   featuresOf(env, W)       flags de um casamento pelo id
 *   gate(req, env, url)      domínio próprio (Host) e casamento suspenso — chamado no início de handle()
 *   logServerError(env, req, e)  grava o erro 500 sem dados pessoais
 */
import { json, fail, str, int, oneOf, isoDate, body, randomToken, uid, sha256, hashPassword, safeEqual, rateLimit, clientIp, audit, parseJson } from "../lib.js";

/* ---------------- funcionalidades por casamento ---------------- */
export const FEATURES = [
  ["mesas", "Mapa de mesas"], ["fornecedores", "Fornecedores"], ["tarefas", "Tarefas"], ["presentes_pix", "Presentes com Pix"],
  ["mural", "Mural de recados"], ["quiz", "Quiz do casal"], ["galeria", "Galeria de fotos"], ["capsula", "Cápsula do tempo"],
  ["concierge", "Concierge"], ["copilot", "Copiloto"], ["padrinhos", "Área dos padrinhos"], ["quest", "Quest dos convidados"],
];
const KEYS = FEATURES.map(f => f[0]);
const flagsOf = w => {
  if (!w) return {};
  if (w.features && typeof w.features === "object") return w.features;
  const f = parseJson(w.features_json || "{}", {});
  return f && typeof f === "object" && !Array.isArray(f) ? f : {};
};
/** Funcionalidade ligada? Padrão: ligada quando a chave não foi definida. Aceita a linha de weddings ou {features}. */
export function featureOn(w, key) { return flagsOf(w)[key] !== false; }
export function featureMap(w) { return Object.fromEntries(KEYS.map(k => [k, featureOn(w, k)])); }
export async function featuresOf(env, W) { return featureMap(await env.DB.prepare("SELECT features_json FROM weddings WHERE id = ?").bind(W).first()); }

/* ---------------- utilidades ---------------- */
const SESSION_DAYS = 7;
const PCOOKIE = "__Host-plat";
const ROLES = ["owner", "planner", "viewer"];
const METHODS = ["pix", "cartao", "transferencia"];
const CSTATUS = ["pago", "pendente", "atrasado"];
const UNIVERSES = ["timeless", "editorial", "dreamscape"];
const today = () => new Date().toISOString().slice(0, 10);
const bool = v => v === true || v === 1 || v === "1";

function readCookie(req, name) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name.replace(/[-_]/g, "\\$&") + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
const cookieFor = (url, raw, maxAge) => {
  const secure = url.protocol === "https:";
  return `${secure ? PCOOKIE : "plat"}=${raw}; HttpOnly${secure ? "; Secure" : ""}; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
};
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/* ---------------- domínio próprio e suspensão (chamado por handle()) ---------------- */
const domainCache = new Map(); // host → { slug, at }   (60 s por isolate; limpo quando o admin muda domínios)
const isPlatformHost = (host, env) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".workers.dev")
  || String(env.PLATFORM_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).includes(host);
async function domainSlug(env, host) {
  const hit = domainCache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.slug;
  const row = await env.DB.prepare("SELECT w.slug FROM domains d JOIN weddings w ON w.id = d.wedding_id WHERE d.host = ? AND d.status = 'active'").bind(host).first();
  domainCache.set(host, { slug: row ? row.slug : null, at: Date.now() });
  return row ? row.slug : null;
}

const SUSPENDED = "Este casamento está temporariamente em pausa na plataforma. Fale com o Gueta Studio para reativar.";
const suspendedJson = (msg = SUSPENDED) => json({ error: msg, code: "suspended" }, 403);
const pausePage = () => new Response(`<!DOCTYPE html>
<html lang="pt-BR" data-universe="editorial"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site em pausa</title><meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/ds.css"><link rel="stylesheet" href="/assets/plataforma.css"></head>
<body class="pausa"><main class="pausa-box"><p class="label">Site em pausa</p><h1>Este site está temporariamente fora do ar.</h1>
<p class="muted">Os noivos já sabem e, em breve, tudo volta ao normal. Se precisar de alguma informação, fale direto com eles.</p></main></body></html>`,
  { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3600", "Cache-Control": "no-store" } });

/**
 * Antes de qualquer rota: (1) requisição por um domínio próprio ativo → "/" e /api/site/* passam a ser do casal dono
 * do domínio; (2) casamento suspenso → site, convite, /api/me e painel respondem com aviso educado.
 * Devolve Response (resposta pronta), Request (reescrita) ou null (segue normal).
 */
export async function gate(req, env, url) {
  let p = url.pathname, out = null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!isPlatformHost(host, env)) {
    const slug = await domainSlug(env, host);
    if (slug) {
      if (p === "/plataforma" || p === "/plataforma/" || p.startsWith("/api/platform/")) return json({ error: "Não encontrado", code: "not_found" }, 404);
      let np = null;
      if (p === "/" || p === "/index.html") np = "/c/" + slug;
      else if (/^\/api\/site\/[^/]+(\/.*)?$/.test(p)) np = p.replace(/^\/api\/site\/[^/]+/, "/api/site/" + slug);
      if (np && np !== p) { const u = new URL(url); u.pathname = np; out = new Request(u, req); p = np; }
    }
  }
  let r;
  if ((r = p.match(/^\/c\/([a-z0-9-]{3,60})\/?$/)) && (req.method === "GET" || req.method === "HEAD")) {
    const w = await env.DB.prepare("SELECT suspended FROM weddings WHERE slug = ?").bind(r[1]).first();
    if (w && w.suspended) return pausePage();
  } else if ((r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})(\/|$)/))) {
    const w = await env.DB.prepare("SELECT suspended FROM weddings WHERE slug = ?").bind(r[1]).first();
    if (w && w.suspended) return suspendedJson("Este site está temporariamente em pausa.");
  } else if ((r = p.match(/^\/api\/invite\/([A-Za-z0-9_-]{16,64})(\/|$)/))) {
    const w = await env.DB.prepare("SELECT w.suspended FROM households h JOIN weddings w ON w.id = h.wedding_id WHERE h.token_hash = ?").bind(await sha256(r[1])).first();
    if (w && w.suspended) return suspendedJson("Este convite está temporariamente em pausa. Fale direto com os noivos.");
  } else if (p === "/api/me" || p.startsWith("/api/admin/")) {
    const raw = readCookie(req, "__Host-sess") || readCookie(req, "sess");
    if (raw && raw.length <= 100) {
      const w = await env.DB.prepare("SELECT w.suspended FROM sessions s JOIN weddings w ON w.id = s.wedding_id WHERE s.id_hash = ?").bind(await sha256(raw)).first();
      if (w && w.suspended) return suspendedJson("O painel deste casamento está temporariamente em pausa. Fale com o Gueta Studio para reativar.");
    }
  }
  return out;
}

/* ---------------- registro de erros (sem dados pessoais) ---------------- */
const scrub = s => String(s || "")
  .replace(/[^\s@]+@[^\s@]+/g, "[email]")
  .replace(/(["'`]).*?\1/g, "[texto]")
  .replace(/https?:\/\/\S+/g, "[url]")
  .replace(/[A-Za-z0-9_-]{16,}/g, "[id]")
  .replace(/\d{4,}/g, "[n]")
  .slice(0, 300);
/** Rota sem tokens/slugs/ids: só os segmentos fixos (ex.: /api/invite/:p/rsvp). */
export const routeShape = p => String(p || "/").split("/").map(s => (s === "" || /^[a-z]{1,24}$/.test(s) ? s : ":p")).join("/").slice(0, 160);
export async function logServerError(env, req, e) {
  try {
    const frame = String(e?.stack || "").split("\n").find(l => /\.m?js:\d+/.test(l)) || "";
    const where = (frame.match(/([\w.-]+\.m?js:\d+)/) || [])[1] || "";
    await env.DB.prepare("INSERT INTO error_log (method, route, kind, message) VALUES (?, ?, ?, ?)")
      .bind(String(req.method).slice(0, 8), routeShape(new URL(req.url).pathname), String(e?.name || "Error").slice(0, 40), scrub(e?.message) + (where ? " @ " + where : "")).run();
  } catch { /* o registro de erro nunca derruba a resposta */ }
}

/* ---------------- sessão do administrador ---------------- */
async function adminSession(req, env) {
  const raw = readCookie(req, PCOOKIE) || readCookie(req, "plat");
  if (!raw || raw.length > 100) fail(401, "Entre como administrador da plataforma", "unauthenticated");
  const s = await env.DB.prepare(`SELECT ps.user_id, ps.expires_at, u.name, u.email, u.platform_role
    FROM platform_sessions ps JOIN users u ON u.id = ps.user_id WHERE ps.id_hash = ?`).bind(await sha256(raw)).first();
  if (!s || s.expires_at < new Date().toISOString()) fail(401, "Sessão expirada. Entre de novo.", "unauthenticated");
  if (s.platform_role !== "admin") fail(403, "Acesso só para administradores da plataforma", "forbidden");
  return s;
}
async function startSession(env, url, userId, status = 200) {
  const raw = randomToken(32);
  await env.DB.prepare("INSERT INTO platform_sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(raw), userId, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()).run();
  return json({ ok: true }, status, { "Set-Cookie": cookieFor(url, raw, SESSION_DAYS * 86400) });
}
async function login(ctx) {
  const { req, env, url } = ctx;
  const b = await body(req);
  const email = str(b.email, { max: 160, min: 3, field: "E-mail" }).toLowerCase();
  const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  await rateLimit(env, "plat-login-ip:" + clientIp(req), 30);
  await rateLimit(env, "plat-login:" + email, 10);
  const u = await env.DB.prepare("SELECT id, pass_hash, pass_salt, platform_role FROM users WHERE email = ?").bind(email).first();
  const { hash } = await hashPassword(password, u ? u.pass_salt : "AAAAAAAAAAAAAAAAAAAAAA==");
  if (!u || !safeEqual(hash, u.pass_hash) || u.platform_role !== "admin") fail(401, "E-mail ou senha incorretos, ou este acesso não é de administrador", "bad_credentials");
  await audit(env, "platform", "user:" + u.id, "platform.login");
  return startSession(env, url, u.id);
}
async function logout(ctx) {
  const raw = readCookie(ctx.req, PCOOKIE) || readCookie(ctx.req, "plat");
  if (raw) await ctx.env.DB.prepare("DELETE FROM platform_sessions WHERE id_hash = ?").bind(await sha256(raw)).run();
  const h = new Headers({ "Content-Type": "application/json" });
  h.append("Set-Cookie", `${PCOOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
  h.append("Set-Cookie", "plat=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  return new Response('{"ok":true}', { status: 200, headers: h });
}
async function platformInvite(ctx, token) {
  await rateLimit(ctx.env, "plat-setup:" + clientIp(ctx.req), 20);
  const inv = await ctx.env.DB.prepare("SELECT * FROM platform_invites WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!inv || inv.used_at || inv.expires_at < new Date().toISOString()) fail(404, "Este link de administrador não vale mais. Gere um novo.", "setup_invalid");
  return inv;
}
async function setup(ctx, token) {
  const { req, env, url } = ctx;
  const inv = await platformInvite(ctx, token);
  const b = await body(req);
  const name = str(b.name, { min: 2, max: 80, field: "Seu nome" });
  const email = str(b.email, { min: 5, max: 160, field: "E-mail" }).toLowerCase();
  if (!validEmail(email)) fail(400, "E-mail inválido", "invalid");
  const password = typeof b.password === "string" ? b.password : "";
  if (password.length < 10 || password.length > 200) fail(400, "A senha precisa ter pelo menos 10 caracteres", "weak_password");
  let user = await env.DB.prepare("SELECT id, pass_hash, pass_salt FROM users WHERE email = ?").bind(email).first();
  if (user) {
    const { hash } = await hashPassword(password, user.pass_salt);
    if (!safeEqual(hash, user.pass_hash)) fail(409, "Este e-mail já tem conta. Use a senha dessa conta.", "email_exists");
  } else {
    const pw = await hashPassword(password);
    user = { id: uid("u_") };
    await env.DB.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt) VALUES (?, ?, ?, ?, ?)").bind(user.id, email, name, pw.hash, pw.salt).run();
  }
  const done = await env.DB.prepare("UPDATE platform_invites SET used_at = datetime('now'), used_by = ? WHERE token_hash = ? AND used_at IS NULL").bind(user.id, inv.token_hash).run();
  if (!done.meta?.changes) fail(404, "Este link de administrador já foi usado.", "setup_invalid");
  await env.DB.prepare("UPDATE users SET platform_role = 'admin' WHERE id = ?").bind(user.id).run();
  await audit(env, "platform", "user:" + user.id, "platform.admin.setup");
  return startSession(env, url, user.id, 201);
}

/* ---------------- clientes (casamentos) ---------------- */
const DATE_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
async function ownWedding(env, id) {
  const w = await env.DB.prepare("SELECT * FROM weddings WHERE id = ?").bind(id).first();
  if (!w) fail(404, "Casamento não encontrado", "not_found");
  return w;
}
async function listWeddings(env) {
  const rows = (await env.DB.prepare(`SELECT w.id, w.slug, w.names, w.date_iso, w.city, w.universe, w.theme, w.is_demo, w.suspended, w.plan_id, p.name AS plan_name, w.created_at,
      (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id) AS guests,
      (SELECT COUNT(*) FROM households h WHERE h.wedding_id = w.id) AS households,
      (SELECT COUNT(*) FROM gift_notices n WHERE n.wedding_id = w.id) AS gift_notices,
      (SELECT MAX(s.created_at) FROM sessions s WHERE s.wedding_id = w.id) AS last_access,
      (SELECT COUNT(*) FROM memberships m WHERE m.wedding_id = w.id) AS members,
      (SELECT COALESCE(SUM(c.cents), 0) FROM charges c WHERE c.wedding_id = w.id AND c.status <> 'pago') AS open_cents,
      (SELECT d.host FROM domains d WHERE d.wedding_id = w.id AND d.status = 'active' LIMIT 1) AS domain
    FROM weddings w LEFT JOIN plans p ON p.id = w.plan_id ORDER BY w.created_at DESC, w.names`).all()).results;
  const now = new Date().toISOString();
  return rows.map(w => ({ ...w, is_demo: !!w.is_demo, suspended: !!w.suspended,
    status: w.suspended ? "suspenso" : w.date_iso < now ? "realizado" : "ativo" }));
}
async function themeExists(env, url, theme) {
  try { const r = await env.ASSETS.fetch(new Request(new URL(`/assets/themes/${theme}/theme.css`, url.origin))); return r.status === 200; } catch { return false; }
}
async function newAccessLink(env, url, W, role, days) {
  const token = randomToken(24);
  const expires = new Date(Date.now() + days * 864e5).toISOString();
  await env.DB.prepare("INSERT INTO access_invites (token_hash, wedding_id, role, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(token), W, role, expires).run();
  return { link: url.origin + "/painel?acesso=" + token, role, expires_at: expires };
}
async function createWedding(ctx, s) {
  const { req, env, url } = ctx;
  const b = await body(req);
  const names = str(b.names, { min: 3, max: 80, field: "Nomes do casal" });
  const slug = str(b.slug, { min: 3, max: 60, field: "Endereço (slug)" }).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(400, "Endereço (slug): use letras minúsculas, números e hífens", "invalid");
  const date = str(b.date_iso, { min: 16, max: 30, field: "Data" });
  if (!DATE_TZ.test(date) || Number.isNaN(Date.parse(date))) fail(400, "Data: use AAAA-MM-DDTHH:MM com fuso (ex.: 2027-10-16T16:30:00-03:00)", "invalid");
  const city = str(b.city, { max: 80, field: "Cidade" });
  const universe = oneOf(b.universe || "editorial", UNIVERSES, "Universo visual");
  const theme = str(b.theme, { max: 40, field: "Tema" }).toLowerCase();
  if (theme && (!/^[a-z0-9-]+$/.test(theme) || !(await themeExists(env, url, theme)))) fail(400, "Tema: não existe em /assets/themes/", "invalid");
  let deadline = isoDate(b.rsvp_deadline || null, "Prazo de confirmação");
  if (!deadline) deadline = new Date(Date.parse(date) - 30 * 864e5).toISOString().slice(0, 10);
  let plan = null;
  if (b.plan_id) { plan = await env.DB.prepare("SELECT id FROM plans WHERE id = ?").bind(String(b.plan_id)).first(); if (!plan) fail(400, "Plano inválido", "invalid"); }
  if (await env.DB.prepare("SELECT id FROM weddings WHERE slug = ?").bind(slug).first()) fail(409, "Este endereço já está em uso. Escolha outro.", "slug_taken");
  const id = uid("w_");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO weddings (id, slug, names, date_iso, city, universe, theme, rsvp_deadline, is_demo, plan_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, slug, names, date, city, universe, theme, deadline, bool(b.is_demo) ? 1 : 0, plan ? plan.id : null),
    env.DB.prepare("INSERT INTO events (id, wedding_id, name, starts_at, sort) VALUES (?, ?, 'Cerimônia', ?, 0)").bind(uid("e_"), id, date),
  ]);
  const access = await newAccessLink(env, url, id, "owner", 14);
  await audit(env, id, "platform:" + s.user_id, "platform.wedding.create", slug);
  await audit(env, id, "platform:" + s.user_id, "platform.access.create", "owner");
  return json({ id, slug, access }, 201);
}
async function weddingDetail(env, id) {
  const w = await ownWedding(env, id);
  const q = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
  const members = await q(`SELECT u.id AS user_id, u.name, u.email, m.role, (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id AND s.wedding_id = m.wedding_id) AS last_access
    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.wedding_id = ? ORDER BY m.role = 'owner' DESC, u.name`, id);
  const invites = (await q("SELECT token_hash, role, expires_at, used_at, created_at FROM access_invites WHERE wedding_id = ? ORDER BY created_at DESC LIMIT 30", id))
    .map(i => ({ ref: i.token_hash.slice(0, 10), role: i.role, expires_at: i.expires_at, used_at: i.used_at, created_at: i.created_at,
      state: i.used_at ? "usado" : i.expires_at < new Date().toISOString() ? "expirado" : "pendente" }));
  const charges = await q("SELECT id, description, cents, due_date, method, status, paid_at, note, created_at FROM charges WHERE wedding_id = ? ORDER BY due_date DESC, created_at DESC", id);
  const domains = await q("SELECT host, status, created_at, activated_at FROM domains WHERE wedding_id = ? ORDER BY created_at", id);
  const usage = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM guests WHERE wedding_id = ?1) AS guests, (SELECT COUNT(*) FROM households WHERE wedding_id = ?1) AS households,
    (SELECT COUNT(*) FROM gift_notices WHERE wedding_id = ?1) AS gift_notices, (SELECT COUNT(*) FROM guestbook WHERE wedding_id = ?1) AS messages,
    (SELECT COUNT(*) FROM households WHERE wedding_id = ?1 AND responded_at IS NOT NULL) AS responded`).bind(id).first();
  return json({
    wedding: { id: w.id, slug: w.slug, names: w.names, date_iso: w.date_iso, city: w.city, universe: w.universe, theme: w.theme, is_demo: !!w.is_demo,
      suspended: !!w.suspended, suspended_at: w.suspended_at, plan_id: w.plan_id, platform_note: w.platform_note, rsvp_deadline: w.rsvp_deadline, created_at: w.created_at },
    features: featureMap(w), members, invites, charges, balance: balanceOf(charges), domains, usage,
  });
}
function balanceOf(charges) {
  const t = today();
  const sum = f => charges.filter(f).reduce((s, c) => s + c.cents, 0);
  return { billed: sum(() => true), paid: sum(c => c.status === "pago"), open: sum(c => c.status !== "pago"),
    overdue: sum(c => c.status === "atrasado" || (c.status === "pendente" && c.due_date < t)) };
}
async function patchWedding(ctx, s, id) {
  const { req, env } = ctx;
  const w = await ownWedding(env, id);
  const b = await body(req);
  const sets = [], args = [], acts = [];
  if (b.suspended !== undefined) {
    const v = bool(b.suspended) ? 1 : 0;
    sets.push("suspended = ?", "suspended_at = ?"); args.push(v, v ? new Date().toISOString() : null);
    acts.push(v ? "platform.wedding.suspend" : "platform.wedding.reactivate");
  }
  if (b.is_demo !== undefined) { sets.push("is_demo = ?"); args.push(bool(b.is_demo) ? 1 : 0); acts.push("platform.wedding.demo"); }
  if (b.plan_id !== undefined) {
    let pid = null;
    if (b.plan_id) { const p = await env.DB.prepare("SELECT id FROM plans WHERE id = ?").bind(String(b.plan_id)).first(); if (!p) fail(400, "Plano inválido", "invalid"); pid = p.id; }
    sets.push("plan_id = ?"); args.push(pid); acts.push("platform.wedding.plan");
  }
  if (b.features !== undefined) {
    if (!b.features || typeof b.features !== "object" || Array.isArray(b.features)) fail(400, "Funcionalidades: valor inválido", "invalid");
    const cur = flagsOf(w);
    for (const [k, v] of Object.entries(b.features)) { oneOf(k, KEYS, "Funcionalidade"); cur[k] = !!v; }
    sets.push("features_json = ?"); args.push(JSON.stringify(cur)); acts.push("platform.wedding.features");
  }
  if (b.platform_note !== undefined) { sets.push("platform_note = ?"); args.push(str(b.platform_note, { max: 1000, field: "Observação" })); acts.push("platform.wedding.note"); }
  if (!sets.length) fail(400, "Nada para alterar", "invalid");
  await env.DB.prepare(`UPDATE weddings SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run();
  for (const a of acts) await audit(env, id, "platform:" + s.user_id, a);
  domainCache.clear();
  return json({ ok: true });
}
async function applyPlan(ctx, s, id) {
  const { env } = ctx;
  const w = await ownWedding(env, id);
  if (!w.plan_id) fail(400, "Este casamento não tem plano", "invalid");
  const p = await env.DB.prepare("SELECT features_json FROM plans WHERE id = ?").bind(w.plan_id).first();
  if (!p) fail(400, "Plano não encontrado", "invalid");
  const inc = parseJson(p.features_json, []);
  const f = Object.fromEntries(KEYS.map(k => [k, inc.includes(k)]));
  await env.DB.prepare("UPDATE weddings SET features_json = ? WHERE id = ?").bind(JSON.stringify(f), id).run();
  await audit(env, id, "platform:" + s.user_id, "platform.wedding.apply_plan", w.plan_id);
  return json({ ok: true, features: f });
}
async function accessCreate(ctx, s, id) {
  const { req, env, url } = ctx;
  await ownWedding(env, id);
  const b = await body(req);
  const role = oneOf(b.role || "owner", ROLES, "Papel");
  const days = int(b.days ?? 14, { min: 1, max: 60, field: "Validade (dias)" });
  const access = await newAccessLink(env, url, id, role, days);
  await audit(env, id, "platform:" + s.user_id, "platform.access.create", role);
  return json({ access }, 201);
}
async function accessRevoke(ctx, s, id) {
  const { req, env } = ctx;
  await ownWedding(env, id);
  const b = await body(req);
  if (b.token_ref) {
    const ref = str(b.token_ref, { min: 10, max: 10, field: "Convite" });
    const r = await env.DB.prepare("DELETE FROM access_invites WHERE wedding_id = ? AND substr(token_hash, 1, 10) = ? AND used_at IS NULL").bind(id, ref).run();
    if (!r.meta?.changes) fail(404, "Convite pendente não encontrado", "not_found");
    await audit(env, id, "platform:" + s.user_id, "platform.access.revoke_invite", ref);
    return json({ ok: true });
  }
  const userId = str(b.user_id, { min: 3, max: 40, field: "Pessoa" });
  const r = await env.DB.prepare("DELETE FROM memberships WHERE wedding_id = ? AND user_id = ?").bind(id, userId).run();
  if (!r.meta?.changes) fail(404, "Pessoa não encontrada neste casamento", "not_found");
  await env.DB.prepare("DELETE FROM sessions WHERE wedding_id = ? AND user_id = ?").bind(id, userId).run();
  await audit(env, id, "platform:" + s.user_id, "platform.access.revoke_member", userId);
  return json({ ok: true });
}

/* ---------------- planos e cobranças (registro manual) ---------------- */
function planInput(b, cur = {}) {
  const has = k => b[k] !== undefined;
  const features = has("features") ? (Array.isArray(b.features) ? [...new Set(b.features.map(k => oneOf(k, KEYS, "Funcionalidade")))] : fail(400, "Funcionalidades: lista inválida", "invalid")) : parseJson(cur.features_json || "[]", []);
  const p = {
    name: has("name") || !cur.name ? str(b.name, { min: 2, max: 60, field: "Nome do plano" }) : cur.name,
    project_cents: has("project_cents") ? int(b.project_cents, { max: 1e9, field: "Preço por projeto" }) : cur.project_cents ?? 0,
    monthly_cents: has("monthly_cents") ? int(b.monthly_cents, { max: 1e9, field: "Mensalidade" }) : cur.monthly_cents ?? 0,
    description: has("description") ? str(b.description, { max: 300, field: "Descrição" }) : cur.description ?? "",
    active: has("active") ? (bool(b.active) ? 1 : 0) : cur.active ?? 1,
    features_json: JSON.stringify(features),
  };
  if (!p.project_cents && !p.monthly_cents) fail(400, "Informe o preço por projeto e/ou a mensalidade", "invalid");
  return p;
}
async function listPlans(env) {
  const rows = (await env.DB.prepare("SELECT p.*, (SELECT COUNT(*) FROM weddings w WHERE w.plan_id = p.id) AS weddings FROM plans p ORDER BY p.active DESC, p.created_at").all()).results;
  return rows.map(p => ({ id: p.id, name: p.name, project_cents: p.project_cents, monthly_cents: p.monthly_cents, description: p.description, active: !!p.active, features: parseJson(p.features_json, []), weddings: p.weddings }));
}
function chargeInput(b, cur = {}) {
  const has = k => b[k] !== undefined || cur[k] === undefined;
  const c = {
    description: has("description") ? str(b.description, { min: 2, max: 120, field: "Descrição" }) : cur.description,
    cents: has("cents") ? int(b.cents, { min: 1, max: 1e9, field: "Valor" }) : cur.cents,
    due_date: has("due_date") ? (isoDate(b.due_date, "Data") || fail(400, "Data: obrigatória", "required")) : cur.due_date,
    method: has("method") ? oneOf(b.method, METHODS, "Método") : cur.method,
    status: has("status") ? oneOf(b.status, CSTATUS, "Situação") : cur.status,
    note: b.note !== undefined ? str(b.note, { max: 300, field: "Observação" }) : cur.note ?? "",
  };
  c.paid_at = c.status === "pago" ? (b.paid_at !== undefined && b.paid_at !== "" ? isoDate(b.paid_at, "Pago em") : cur.paid_at || today()) : null;
  return c;
}
async function ownCharge(env, id) {
  const c = await env.DB.prepare("SELECT * FROM charges WHERE id = ?").bind(id).first();
  if (!c) fail(404, "Cobrança não encontrada", "not_found");
  return c;
}
async function billing(env) {
  const t = today();
  const rows = (await env.DB.prepare(`SELECT w.id, w.names, w.slug, w.suspended, p.name AS plan_name, p.project_cents, p.monthly_cents,
      COALESCE(SUM(c.cents), 0) AS billed, COALESCE(SUM(CASE WHEN c.status = 'pago' THEN c.cents END), 0) AS paid,
      COALESCE(SUM(CASE WHEN c.status <> 'pago' THEN c.cents END), 0) AS open,
      COALESCE(SUM(CASE WHEN c.status = 'atrasado' OR (c.status = 'pendente' AND c.due_date < ?) THEN c.cents END), 0) AS overdue,
      COUNT(c.id) AS charges
    FROM weddings w LEFT JOIN plans p ON p.id = w.plan_id LEFT JOIN charges c ON c.wedding_id = w.id
    GROUP BY w.id ORDER BY open DESC, w.names`).bind(t).all()).results;
  const recent = (await env.DB.prepare("SELECT c.id, c.wedding_id, w.names, c.description, c.cents, c.due_date, c.method, c.status, c.paid_at, c.note FROM charges c JOIN weddings w ON w.id = c.wedding_id ORDER BY c.due_date DESC, c.created_at DESC LIMIT 60").all()).results;
  const tot = k => rows.reduce((s, r) => s + r[k], 0);
  return json({ clients: rows.map(r => ({ ...r, suspended: !!r.suspended })), charges: recent.map(c => ({ ...c, overdue: c.status === "atrasado" || (c.status === "pendente" && c.due_date < t) })),
    totals: { billed: tot("billed"), paid: tot("paid"), open: tot("open"), overdue: tot("overdue") } });
}

/* ---------------- domínios ---------------- */
function normHost(v) {
  let h = str(v, { min: 4, max: 253, field: "Domínio" }).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "").replace(/^www\./, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) fail(400, "Domínio inválido (ex.: petalaelucas.com.br)", "invalid");
  if (h.endsWith("workers.dev") || h === "localhost") fail(400, "Domínio inválido para casal", "invalid");
  return h;
}

/* ---------------- uso, custos e erros ---------------- */
async function usage(env) {
  const one = async (sql, ...a) => await env.DB.prepare(sql).bind(...a).first();
  const totals = await one(`SELECT (SELECT COUNT(*) FROM weddings) AS weddings, (SELECT COUNT(*) FROM weddings WHERE suspended = 1) AS suspended,
    (SELECT COUNT(*) FROM weddings WHERE is_demo = 1) AS demo, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM guests) AS guests,
    (SELECT COUNT(*) FROM households) AS households, (SELECT COUNT(*) FROM gift_notices) AS gift_notices,
    (SELECT COUNT(*) FROM tickets WHERE status <> 'closed') AS tickets_open, (SELECT COUNT(*) FROM error_log WHERE at >= datetime('now', '-7 days')) AS errors_7d`);
  const names = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).results.map(r => r.name)
    .filter(n => /^[a-z][a-z0-9_]*$/i.test(n) && !/^(sqlite_|_cf_|d1_)/i.test(n));
  const tables = [];
  for (const n of names) {
    const t = { name: n, rows: 0, bytes: null };
    try { t.rows = (await one(`SELECT COUNT(*) AS n FROM "${n}"`)).n; } catch { continue; }
    try {
      const cols = (await env.DB.prepare("SELECT name FROM pragma_table_info(?)").bind(n).all()).results.map(c => c.name).filter(c => /^[a-z_][a-z0-9_]*$/i.test(c));
      if (cols.length) t.bytes = (await one(`SELECT COALESCE(SUM(${cols.map(c => `COALESCE(LENGTH("${c}"), 0)`).join(" + ")}), 0) AS b FROM "${n}"`)).b;
    } catch { /* estimativa indisponível neste banco */ }
    tables.push(t);
  }
  let dbBytes = null;
  try { const r = await env.DB.prepare("SELECT 1").run(); dbBytes = r?.meta?.size_after ?? null; } catch {}
  const win = new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 13);
  const buckets = (await env.DB.prepare("SELECT bucket, hits FROM rate_limits WHERE win >= ?").bind(win).all()).results;
  const requests = {};
  for (const r of buckets) { const k = String(r.bucket).split(":")[0].slice(0, 30); requests[k] = (requests[k] || 0) + r.hits; }
  const activity = (await env.DB.prepare("SELECT action, COUNT(*) AS n FROM audit_log WHERE at >= datetime('now', '-7 days') GROUP BY action ORDER BY n DESC LIMIT 15").all()).results;
  const act = await one("SELECT (SELECT COUNT(*) FROM audit_log WHERE at >= datetime('now', '-1 day')) AS d1, (SELECT COUNT(*) FROM audit_log WHERE at >= datetime('now', '-7 days')) AS d7");
  return json({ totals, tables, db_bytes: dbBytes, est_bytes: tables.reduce((s, t) => s + (t.bytes || 0), 0),
    requests_24h: Object.entries(requests).map(([k, n]) => ({ kind: k, hits: n })).sort((a, b) => b.hits - a.hits), activity, audit: act });
}

/* ---------------- suporte ---------------- */
async function ticketWithMessages(env, t) {
  const msgs = (await env.DB.prepare("SELECT author, author_name, body, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at, rowid").bind(t.id).all()).results;
  return { ...t, messages: msgs };
}
async function coupleTickets(env, W) {
  const ts = (await env.DB.prepare("SELECT id, subject, status, created_at, updated_at FROM tickets WHERE wedding_id = ? ORDER BY updated_at DESC LIMIT 30").bind(W).all()).results;
  return Promise.all(ts.map(t => ticketWithMessages(env, t)));
}

/* ---------------- roteamento ---------------- */
async function rootRoutes(ctx) {
  const { req, env, url, p, m } = ctx;
  if (!p.startsWith("/api/platform/")) return null;
  let r;
  if (p === "/api/platform/login" && m === "POST") { ctx.sameOrigin(); return login(ctx); }
  if (p === "/api/platform/logout" && m === "POST") { ctx.sameOrigin(); return logout(ctx); }
  if ((r = p.match(/^\/api\/platform\/setup\/([A-Za-z0-9_-]{20,64})$/))) {
    if (m === "GET") { const inv = await platformInvite(ctx, r[1]); return json({ ok: true, expires_at: inv.expires_at }); }
    if (m === "POST") { ctx.sameOrigin(); return setup(ctx, r[1]); }
  }
  const s = await adminSession(req, env);
  if (m !== "GET") ctx.sameOrigin();
  const actor = "platform:" + s.user_id;
  const DB = env.DB;

  if (p === "/api/platform/me" && m === "GET") return json({ user: { name: s.name, email: s.email }, features: FEATURES.map(([key, label]) => ({ key, label })), methods: METHODS, statuses: CSTATUS, universes: UNIVERSES });

  if (p === "/api/platform/weddings") {
    if (m === "GET") return json({ weddings: await listWeddings(env) });
    if (m === "POST") return createWedding(ctx, s);
  }
  if ((r = p.match(/^\/api\/platform\/weddings\/([\w-]{3,40})(\/[a-z/-]+)?$/))) {
    const id = r[1], sub = r[2] || "";
    if (!sub && m === "GET") return weddingDetail(env, id);
    if (!sub && m === "PATCH") return patchWedding(ctx, s, id);
    if (sub === "/access" && m === "POST") return accessCreate(ctx, s, id);
    if (sub === "/access/revoke" && m === "POST") return accessRevoke(ctx, s, id);
    if (sub === "/apply-plan" && m === "POST") return applyPlan(ctx, s, id);
    if (sub === "/charges" && m === "POST") {
      await ownWedding(env, id);
      const c = chargeInput(await body(req)), cid = uid("ch_");
      await DB.prepare("INSERT INTO charges (id, wedding_id, description, cents, due_date, method, status, paid_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(cid, id, c.description, c.cents, c.due_date, c.method, c.status, c.paid_at, c.note).run();
      await audit(env, id, actor, "platform.charge.create", cid);
      return json({ id: cid }, 201);
    }
    if (sub === "/domains" && m === "POST") {
      await ownWedding(env, id);
      const host = normHost((await body(req)).host);
      if (await DB.prepare("SELECT host FROM domains WHERE host = ?").bind(host).first()) fail(409, "Este domínio já está registrado", "domain_taken");
      await DB.prepare("INSERT INTO domains (host, wedding_id) VALUES (?, ?)").bind(host, id).run();
      await audit(env, id, actor, "platform.domain.create", host);
      return json({ host, status: "pending" }, 201);
    }
  }
  if ((r = p.match(/^\/api\/platform\/charges\/([\w-]{3,40})$/))) {
    const cur = await ownCharge(env, r[1]);
    if (m === "PATCH") {
      const c = chargeInput(await body(req), cur);
      await DB.prepare("UPDATE charges SET description = ?, cents = ?, due_date = ?, method = ?, status = ?, paid_at = ?, note = ? WHERE id = ?")
        .bind(c.description, c.cents, c.due_date, c.method, c.status, c.paid_at, c.note, cur.id).run();
      await audit(env, cur.wedding_id, actor, "platform.charge.update", cur.id);
      return json({ ok: true });
    }
    if (m === "DELETE") { await DB.prepare("DELETE FROM charges WHERE id = ?").bind(cur.id).run(); await audit(env, cur.wedding_id, actor, "platform.charge.delete", cur.id); return json({ ok: true }); }
  }
  if (p === "/api/platform/domains" && m === "GET") {
    return json({ domains: (await DB.prepare("SELECT d.host, d.status, d.created_at, d.activated_at, d.wedding_id, w.names, w.slug FROM domains d JOIN weddings w ON w.id = d.wedding_id ORDER BY d.status, d.created_at DESC").all()).results });
  }
  if ((r = p.match(/^\/api\/platform\/domains\/([a-z0-9.-]{4,253})$/))) {
    const d = await DB.prepare("SELECT * FROM domains WHERE host = ?").bind(r[1]).first();
    if (!d) fail(404, "Domínio não encontrado", "not_found");
    if (m === "PATCH") {
      const st = oneOf((await body(req)).status, ["pending", "active"], "Situação");
      await DB.prepare("UPDATE domains SET status = ?, activated_at = ? WHERE host = ?").bind(st, st === "active" ? new Date().toISOString() : null, d.host).run();
      domainCache.clear();
      await audit(env, d.wedding_id, actor, "platform.domain." + st, d.host);
      return json({ ok: true });
    }
    if (m === "DELETE") { await DB.prepare("DELETE FROM domains WHERE host = ?").bind(d.host).run(); domainCache.clear(); await audit(env, d.wedding_id, actor, "platform.domain.delete", d.host); return json({ ok: true }); }
  }
  if (p === "/api/platform/plans") {
    if (m === "GET") return json({ plans: await listPlans(env) });
    if (m === "POST") {
      const pl = planInput(await body(req)), id = uid("pl_");
      await DB.prepare("INSERT INTO plans (id, name, project_cents, monthly_cents, features_json, description, active) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, pl.name, pl.project_cents, pl.monthly_cents, pl.features_json, pl.description, pl.active).run();
      await audit(env, "platform", actor, "platform.plan.create", id);
      return json({ id }, 201);
    }
  }
  if ((r = p.match(/^\/api\/platform\/plans\/([\w-]{3,40})$/))) {
    const cur = await DB.prepare("SELECT * FROM plans WHERE id = ?").bind(r[1]).first();
    if (!cur) fail(404, "Plano não encontrado", "not_found");
    if (m === "PATCH") {
      const pl = planInput(await body(req), cur);
      await DB.prepare("UPDATE plans SET name = ?, project_cents = ?, monthly_cents = ?, features_json = ?, description = ?, active = ? WHERE id = ?")
        .bind(pl.name, pl.project_cents, pl.monthly_cents, pl.features_json, pl.description, pl.active, cur.id).run();
      await audit(env, "platform", actor, "platform.plan.update", cur.id);
      return json({ ok: true });
    }
    if (m === "DELETE") {
      await DB.batch([DB.prepare("UPDATE weddings SET plan_id = NULL WHERE plan_id = ?").bind(cur.id), DB.prepare("DELETE FROM plans WHERE id = ?").bind(cur.id)]);
      await audit(env, "platform", actor, "platform.plan.delete", cur.id);
      return json({ ok: true });
    }
  }
  if (p === "/api/platform/billing" && m === "GET") return billing(env);
  if (p === "/api/platform/usage" && m === "GET") return usage(env);
  if (p === "/api/platform/errors") {
    if (m === "GET") return json({ errors: (await DB.prepare("SELECT id, at, method, route, kind, message FROM error_log ORDER BY id DESC LIMIT 100").all()).results });
    if (m === "DELETE") { await DB.prepare("DELETE FROM error_log").run(); await audit(env, "platform", actor, "platform.errors.clear"); return json({ ok: true }); }
  }
  if (p === "/api/platform/audit" && m === "GET") {
    return json({ entries: (await DB.prepare("SELECT a.at, a.actor, a.action, a.target, a.wedding_id, w.names FROM audit_log a LEFT JOIN weddings w ON w.id = a.wedding_id WHERE a.action LIKE 'platform.%' ORDER BY a.id DESC LIMIT 60").all()).results });
  }
  if (p === "/api/platform/tickets" && m === "GET") {
    const st = url.searchParams.get("status");
    const where = st === "closed" ? "t.status = 'closed'" : st === "all" ? "1 = 1" : "t.status <> 'closed'";
    const ts = (await DB.prepare(`SELECT t.id, t.wedding_id, w.names, w.slug, t.subject, t.status, t.created_at, t.updated_at,
        (SELECT COUNT(*) FROM ticket_messages mm WHERE mm.ticket_id = t.id) AS messages
      FROM tickets t JOIN weddings w ON w.id = t.wedding_id WHERE ${where} ORDER BY t.status = 'open' DESC, t.updated_at DESC LIMIT 100`).all()).results;
    return json({ tickets: ts });
  }
  if ((r = p.match(/^\/api\/platform\/tickets\/([\w-]{3,40})(\/reply|\/status)?$/))) {
    const t = await DB.prepare("SELECT t.id, t.wedding_id, w.names, t.subject, t.status, t.created_at, t.updated_at FROM tickets t JOIN weddings w ON w.id = t.wedding_id WHERE t.id = ?").bind(r[1]).first();
    if (!t) fail(404, "Chamado não encontrado", "not_found");
    if (!r[2] && m === "GET") return json({ ticket: await ticketWithMessages(env, t) });
    if (r[2] === "/reply" && m === "POST") {
      const b = await body(req, 8000);
      const text = str(b.body, { min: 2, max: 3000, field: "Resposta" });
      const st = bool(b.close) ? "closed" : "answered";
      await DB.batch([
        DB.prepare("INSERT INTO ticket_messages (id, ticket_id, author, author_name, body) VALUES (?, ?, 'plataforma', ?, ?)").bind(uid("tm_"), t.id, "Gueta Studio", text),
        DB.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(st, t.id),
      ]);
      await audit(env, t.wedding_id, actor, "platform.ticket.reply", t.id);
      return json({ ok: true, status: st });
    }
    if (r[2] === "/status" && m === "POST") {
      const st = oneOf((await body(req)).status, ["open", "closed"], "Situação");
      await DB.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(st, t.id).run();
      await audit(env, t.wedding_id, actor, "platform.ticket." + (st === "closed" ? "close" : "reopen"), t.id);
      return json({ ok: true });
    }
  }
  return json({ error: "Não encontrado", code: "not_found" }, 404);
}

/** Chamados do casal (painel → botão "Ajuda"). */
async function adminRoutes(ctx) {
  const { req, env, p, m, W, s } = ctx;
  if (!p.startsWith("/api/admin/suporte")) return null;
  let r;
  if (p === "/api/admin/suporte") {
    if (m === "GET") return json({ tickets: await coupleTickets(env, W) });
    if (m === "POST") {
      await rateLimit(env, "ticket:" + W, 10);
      const b = await body(req, 8000);
      const subject = str(b.subject, { min: 3, max: 120, field: "Assunto" }), text = str(b.body, { min: 5, max: 3000, field: "Mensagem" });
      const id = uid("t_");
      await env.DB.batch([
        env.DB.prepare("INSERT INTO tickets (id, wedding_id, subject) VALUES (?, ?, ?)").bind(id, W, subject),
        env.DB.prepare("INSERT INTO ticket_messages (id, ticket_id, author, author_name, body) VALUES (?, ?, 'casal', ?, ?)").bind(uid("tm_"), id, String(s.user_name || "").slice(0, 80), text),
      ]);
      await audit(env, W, ctx.actor, "ticket.create", id);
      return json({ id }, 201);
    }
  }
  if ((r = p.match(/^\/api\/admin\/suporte\/([\w-]{3,40})$/)) && m === "POST") {
    const t = await env.DB.prepare("SELECT id FROM tickets WHERE id = ? AND wedding_id = ?").bind(r[1], W).first();
    if (!t) fail(404, "Chamado não encontrado", "not_found");
    await rateLimit(env, "ticket:" + W, 30);
    const text = str((await body(req, 8000)).body, { min: 2, max: 3000, field: "Mensagem" });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ticket_messages (id, ticket_id, author, author_name, body) VALUES (?, ?, 'casal', ?, ?)").bind(uid("tm_"), t.id, String(s.user_name || "").slice(0, 80), text),
      env.DB.prepare("UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND wedding_id = ?").bind(t.id, W),
    ]);
    return json({ ok: true });
  }
  return null;
}

export default {
  name: "plataforma",
  pages: [[/^\/plataforma\/?$/, "/plataforma.html", true]],
  root: rootRoutes,
  admin: adminRoutes,
  /** Só as flags de funcionalidade (nada pessoal). */
  async site(env, w) { return { features: featureMap(w) }; },
  async exportData(env, W) {
    const tickets = await coupleTickets(env, W);
    return { support_tickets: tickets };
  },
  async cron(env) {
    await env.DB.prepare("DELETE FROM platform_sessions WHERE expires_at < ?").bind(new Date().toISOString()).run();
    await env.DB.prepare("DELETE FROM error_log WHERE at < datetime('now', '-90 days')").run();
  },
};
