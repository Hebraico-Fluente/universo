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
 *   POST /api/site/:slug/presentes           "Já presenteei": aviso do convidado depois do Pix (só os noivos veem)
 *   POST /api/site/:slug/quiz  ·  GET …/quiz/ranking   ranking do quiz (src/mods/quiz.js)
 *
 * API dos noivos (sessão + papel; o casamento vem SEMPRE da sessão)
 *   POST /api/auth/login | /api/auth/logout   GET /api/me
 *   GET|POST /api/auth/setup/:token            convite de acesso ao painel (uso único): escolhe e-mail e senha
 *   GET  /api/admin/overview                  números do painel
 *   GET  /api/admin/guests                    famílias, pessoas e respostas
 *   POST /api/admin/households                cria família convidada (devolve o link uma única vez)
 *   POST /api/admin/households/:id/link       gera link novo (revoga o anterior)
 *   POST /api/admin/households/:id/revoke     revoga o link
 *   DELETE /api/admin/households/:id          apaga a família e as respostas
 *   GET  /api/admin/budget                    orçamento: planejado, contratado, pago, a pagar
 *   POST /api/admin/budget/items              novo lançamento
 *   PATCH /api/admin/budget/items/:id         edita o lançamento (valores, fornecedor, vencimento…)   ·   DELETE apaga
 *   POST /api/admin/budget/categories          nova categoria   ·   PATCH|DELETE /api/admin/budget/categories/:id
 *   POST /api/admin/budget/starter             cria as categorias sugeridas (só se ainda não houver nenhuma)
 *   GET  /api/admin/budget/simulate?extra=30  simula mais convidados com base nos contratos por pessoa
 *   GET  /api/admin/recados                   recados do mural (pendentes e aprovados)
 *   POST /api/admin/recados/:id/approve       aprova um recado   ·   DELETE /api/admin/recados/:id   apaga
 *   GET  /api/admin/presentes                 avisos de presentes recebidos por Pix
 *   POST /api/admin/presentes/:id/check       marca/desmarca "conferido no extrato"   ·   DELETE /api/admin/presentes/:id   apaga
 *   GET  /api/admin/export                    exporta todos os dados do casamento (LGPD)
 */
import { MODS } from "./mods/index.js";
import { spotifyTrackId } from "./mods/editor.js";
import { householdByToken as guestsHouseholdByToken } from "./mods/convidados.js";
import { gate as platformGate, logServerError, featuresOf } from "./mods/plataforma.js";
import * as org from "./mods/organizacao.js"; // orçamento avançado (parcelas, histórico) e central da visão geral
import { json, err, HttpError, fail, str, int, oneOf, isoDate, body, randomToken, uid, sha256, hashPassword, safeEqual, rateLimit, clientIp, audit, parseJson } from "./lib.js";

const SESSION_DAYS = 14;
const COOKIE = "__Host-sess";
const LIMITS = { login: 10, invite: 60, rsvp: 30 };
const WRITE_ROLES = ["owner", "planner"];

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "media-src 'self' blob:",
    "img-src 'self' data: https://images.unsplash.com",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self' https://open.spotify.com",
    "connect-src 'self'",
    "frame-src https://open.spotify.com", // player da música do casal (só depois do clique do visitante)
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
};

/* ---------------- roteamento ---------------- */
export default {
  fetch: (req, env) => handle(req, env),
  /** Rotina diária (wrangler.jsonc → triggers.crons): cada módulo faz a sua parte (ex.: apagar dados vencidos, abrir cápsulas). */
  scheduled: (ev, env, ctx) => ctx.waitUntil(runCron(env, new Date(ev.scheduledTime || Date.now()))),
};
export async function runCron(env, now = new Date()) {
  for (const mod of MODS) if (mod.cron) { try { await mod.cron(env, now); } catch (e) { console.error("cron", mod.name, e); } }
}

export async function handle(req, env) {
  let url = new URL(req.url);
  let p = url.pathname;
  try {
    // plataforma: domínio próprio do casal (Host) e casamento suspenso — src/mods/plataforma.js
    const g = await platformGate(req, env, url);
    if (g instanceof Response) return withSecurity(g, true);
    if (g) { req = g; url = new URL(req.url); p = url.pathname; }
    if (p.startsWith("/api/")) return await api(req, env, url);
    // rotas fora de /api que módulos atendem diretamente (ex.: /m/:id, arquivos de mídia)
    {
      const rctx = { req, env, url, p, m: req.method, session: () => session(req, env), sameOrigin: () => sameOrigin(req, url) };
      for (const mod of MODS) if (mod.raw) { const r = await mod.raw(rctx); if (r) return withSecurity(r, false); }
    }
    // páginas com rotas amigáveis → arquivos estáticos
    let asset = null;
    if (p === "/" || p === "/index.html") asset = "/index.html";
    else if (/^\/c\/[a-z0-9-]{3,60}\/?$/.test(p)) asset = "/casal.html";
    else if (/^\/i\/[A-Za-z0-9_-]{16,64}\/?$/.test(p)) asset = "/convite.html";
    else if (p === "/painel" || p === "/painel/") asset = "/painel/index.html";
    let priv = false;
    if (!asset) for (const mod of MODS) for (const [re, file, isPrivate] of mod.pages || []) if (!asset && re.test(p)) { asset = file; priv = !!isPrivate; }
    let res = await env.ASSETS.fetch(new Request(new URL(asset || p, url.origin), req));
    if (asset === "/casal.html" && res.ok && req.method === "GET") res = await withShareMeta(res, env, url, p);
    return withSecurity(res, asset === "/convite.html" || priv);
  } catch (e) {
    if (e instanceof HttpError) return err(e.status, e.message, e.code);
    console.error(e);
    await logServerError(env, req, e); // só rota/tipo/mensagem higienizada, sem dados pessoais
    return err(500, "Erro inesperado. Tente de novo.", "server_error");
  }
}

// Prévia do link (WhatsApp, Instagram, iMessage): título, descrição e imagem do casal no <head> do site.
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const escAttr = v => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function shareMeta(w, origin) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(w.date_iso || "");
  const date = m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : "";
  const place = [w.venue_name, w.city].filter(Boolean).join(" · ");
  const title = `${w.names} · Vamos nos casar!`;
  const desc = [date, place].filter(Boolean).join(" · ") + ". Confirme sua presença, veja a nossa história e a lista de presentes.";
  const img = w.og_image || w.hero_image || "";
  const abs = img ? (/^https?:\/\//.test(img) ? img : origin + (img.startsWith("/") ? "" : "/") + img) : "";
  const t = [`<title>${escAttr(title)}</title>`, `<meta name="description" content="${escAttr(desc)}">`,
    `<meta property="og:type" content="website">`, `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${escAttr(title)}">`, `<meta property="og:description" content="${escAttr(desc)}">`,
    `<meta name="twitter:card" content="${abs ? "summary_large_image" : "summary"}">`];
  if (abs) t.push(`<meta property="og:image" content="${escAttr(abs)}">`, `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`, `<meta property="og:image:alt" content="${escAttr(w.names)}">`, `<meta name="twitter:image" content="${escAttr(abs)}">`);
  return t.join("\n");
}
async function withShareMeta(res, env, url, p) {
  const slug = (p.match(/^\/c\/([a-z0-9-]{3,60})/) || [])[1];
  if (!slug) return res;
  let w = null;
  try { w = await env.DB.prepare("SELECT names, date_iso, city, venue_name, hero_image, og_image FROM weddings WHERE slug = ?").bind(slug).first(); } catch { return res; }
  if (!w) return res;
  const html = (await res.text()).replace(/<title>[^<]*<\/title>/, "").replace("</head>", shareMeta(w, url.origin) + "\n</head>");
  const h = new Headers(res.headers); h.delete("Content-Length"); h.delete("ETag");
  return new Response(html, { status: res.status, headers: h });
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
  if (m === "POST" && (r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/presentes$/))) { sameOrigin(req, url); return postGiftNotice(req, env, r[1]); }
  if ((r = p.match(/^\/api\/invite\/([A-Za-z0-9_-]{16,64})(\/rsvp)?$/))) {
    if (m === "GET" && !r[2]) return inviteData(req, env, r[1]);
    if (m === "POST" && r[2]) { sameOrigin(req, url); return inviteRsvp(req, env, r[1]); }
  }
  const ctx = { req, env, url, p, m, session: () => session(req, env), sameOrigin: () => sameOrigin(req, url) };
  for (const mod of MODS) if (mod.public) { const res = await mod.public(ctx); if (res) return res; }
  for (const mod of MODS) if (mod.root) { const res = await mod.root(ctx); if (res) return res; }
  // autenticação
  if (p === "/api/auth/login" && m === "POST") { sameOrigin(req, url); return login(req, env, url); }
  if (p === "/api/auth/logout" && m === "POST") { sameOrigin(req, url); return logout(req, env); }
  if ((r = p.match(/^\/api\/auth\/setup\/([A-Za-z0-9_-]{20,64})$/))) {
    if (m === "GET") return setupInfo(req, env, r[1]);
    if (m === "POST") { sameOrigin(req, url); return setupAccess(req, env, url, r[1]); }
  }
  if (p === "/api/me" && m === "GET") { const s = await session(req, env); return json({ user: { name: s.user_name, email: s.email }, wedding: { id: s.wedding_id, names: s.names, slug: s.slug, is_demo: !!s.is_demo, theme: s.theme || "", universe: s.universe, features: await featuresOf(env, s.wedding_id) }, role: s.role }); }

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
    if (p === "/api/admin/budget/items" && m === "POST") return createItem(req, env, W, actor);
    if ((r = p.match(/^\/api\/admin\/budget\/items\/([\w-]{2,40})$/))) {
      if (m === "PATCH") return updateItem(req, env, W, r[1], actor);
      if (m === "DELETE") return deleteItem(env, W, r[1], actor);
    }
    if (p === "/api/admin/budget/categories" && m === "POST") return createCategory(req, env, W);
    if (p === "/api/admin/budget/starter" && m === "POST") return starterCategories(env, W);
    if ((r = p.match(/^\/api\/admin\/budget\/categories\/([\w-]{2,40})$/))) {
      if (m === "PATCH") return updateCategory(req, env, W, r[1]);
      if (m === "DELETE") return deleteCategory(env, W, r[1], actor);
    }
    if (p === "/api/admin/budget/simulate" && m === "GET") return simulate(env, W, url);
    if (p === "/api/admin/export" && m === "GET") return exportData(env, W, actor);
    if (p === "/api/admin/recados" && m === "GET") return json({ messages: (await env.DB.prepare("SELECT id, author, message, status, created_at FROM guestbook WHERE wedding_id = ? ORDER BY status = 'pending' DESC, created_at DESC").bind(W).all()).results });
    if ((r = p.match(/^\/api\/admin\/recados\/([\w-]{2,40})(\/approve)?$/))) {
      const own = await env.DB.prepare("SELECT id FROM guestbook WHERE id = ? AND wedding_id = ?").bind(r[1], W).first();
      if (!own) fail(404, "Recado não encontrado", "not_found");
      if (m === "POST" && r[2]) { await env.DB.prepare("UPDATE guestbook SET status = 'approved' WHERE id = ? AND wedding_id = ?").bind(r[1], W).run(); return json({ ok: true }); }
      if (m === "DELETE" && !r[2]) { await env.DB.prepare("DELETE FROM guestbook WHERE id = ? AND wedding_id = ?").bind(r[1], W).run(); await audit(env, W, actor, "guestbook.delete", r[1]); return json({ ok: true }); }
    }
    if (p === "/api/admin/presentes" && m === "GET") return json({ gifts: (await env.DB.prepare("SELECT id, gift, cents, author, message, checked, created_at FROM gift_notices WHERE wedding_id = ? ORDER BY created_at DESC").bind(W).all()).results });
    if ((r = p.match(/^\/api\/admin\/presentes\/([\w-]{2,40})(\/check)?$/))) {
      const own = await env.DB.prepare("SELECT id, checked FROM gift_notices WHERE id = ? AND wedding_id = ?").bind(r[1], W).first();
      if (!own) fail(404, "Aviso não encontrado", "not_found");
      if (m === "POST" && r[2]) { await env.DB.prepare("UPDATE gift_notices SET checked = ? WHERE id = ? AND wedding_id = ?").bind(own.checked ? 0 : 1, r[1], W).run(); return json({ ok: true, checked: !own.checked }); }
      if (m === "DELETE" && !r[2]) { await env.DB.prepare("DELETE FROM gift_notices WHERE id = ? AND wedding_id = ?").bind(r[1], W).run(); await audit(env, W, actor, "gift_notice.delete", r[1]); return json({ ok: true }); }
    }
    const actx = { ...ctx, s, W, actor };
    for (const mod of MODS) if (mod.admin) { const res = await mod.admin(actx); if (res) return res; }
  }
  return err(404, "Não encontrado", "not_found");
}

/** Dados extras que cada módulo publica no site, no convite ou na visão geral (ficam em data.mods[nome]). */
async function modsData(kind, ...args) {
  const out = {};
  for (const mod of MODS) if (mod[kind]) { const v = await mod[kind](...args); if (v !== undefined && v !== null) out[mod.name] = v; }
  return out;
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
  const s = await env.DB.prepare(`SELECT s.user_id, s.wedding_id, s.expires_at, u.name AS user_name, u.email, m.role, w.names, w.slug, w.is_demo, w.theme, w.universe
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
/* ---------------- convite de acesso ao painel ---------------- */
async function accessInvite(req, env, token) {
  await rateLimit(env, "setup:" + clientIp(req), 20);
  const inv = await env.DB.prepare("SELECT a.*, w.names FROM access_invites a JOIN weddings w ON w.id = a.wedding_id WHERE a.token_hash = ?").bind(await sha256(token)).first();
  if (!inv || inv.used_at || inv.expires_at < new Date().toISOString()) fail(404, "Este link de acesso não vale mais. Peça um novo ao Gueta Studio.", "setup_invalid");
  return inv;
}
async function setupInfo(req, env, token) {
  const inv = await accessInvite(req, env, token);
  return json({ wedding: inv.names, role: inv.role });
}
async function setupAccess(req, env, url, token) {
  const inv = await accessInvite(req, env, token);
  const b = await body(req);
  const name = str(b.name, { min: 2, max: 80, field: "Seu nome" });
  const email = str(b.email, { min: 5, max: 160, field: "E-mail" }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "E-mail inválido", "invalid");
  const password = typeof b.password === "string" ? b.password : "";
  if (password.length < 10 || password.length > 200) fail(400, "A senha precisa ter pelo menos 10 caracteres", "weak_password");
  let user = await env.DB.prepare("SELECT id, pass_hash, pass_salt FROM users WHERE email = ?").bind(email).first();
  if (user) {
    // e-mail já cadastrado: só liga ao casamento se a senha for a da conta
    const { hash } = await hashPassword(password, user.pass_salt);
    if (!safeEqual(hash, user.pass_hash)) fail(409, "Este e-mail já tem conta. Use a senha dessa conta para entrar.", "email_exists");
  } else {
    const pw = await hashPassword(password);
    user = { id: uid("u_") };
    await env.DB.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt) VALUES (?, ?, ?, ?, ?)").bind(user.id, email, name, pw.hash, pw.salt).run();
  }
  const done = await env.DB.prepare("UPDATE access_invites SET used_at = datetime('now'), used_by = ? WHERE token_hash = ? AND used_at IS NULL").bind(user.id, inv.token_hash).run();
  if (!done.meta?.changes) fail(404, "Este link de acesso já foi usado.", "setup_invalid");
  await env.DB.prepare("INSERT INTO memberships (user_id, wedding_id, role) VALUES (?, ?, ?) ON CONFLICT(user_id, wedding_id) DO UPDATE SET role = excluded.role").bind(user.id, inv.wedding_id, inv.role).run();
  await audit(env, inv.wedding_id, "user:" + user.id, "access.setup", inv.role);
  const raw = randomToken(32);
  await env.DB.prepare("INSERT INTO sessions (id_hash, user_id, wedding_id, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(raw), user.id, inv.wedding_id, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()).run();
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 201, { "Set-Cookie": `${secure ? COOKIE : "sess"}=${raw}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}` });
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
  return json({ wedding: publicWedding(w), events: ev.results, messages: msgs, mods: await modsData("site", env, w) }, 200, { "Cache-Control": "public, max-age=60" });
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
/** "Já presenteei": o título e o valor vêm da lista do casal; só o "valor livre" aceita o valor informado pelo convidado. */
async function postGiftNotice(req, env, slug) {
  const w = await env.DB.prepare("SELECT id, pix_key, gifts_json FROM weddings WHERE slug = ?").bind(slug).first();
  if (!w || !w.pix_key) fail(404, "Lista de presentes não encontrada", "not_found");
  await rateLimit(env, "gift:" + clientIp(req), 6);
  const b = await body(req, 4000);
  const gifts = parseJson(w.gifts_json, []);
  const g = b.gift == null ? { title: "Pix livre", cents: 0 } : gifts[int(b.gift,{ min: 0, max: Math.max(0, gifts.length - 1), field: "Presente" })];
  if (!g) fail(400, "Presente: valor inválido", "invalid");
  const cents = g.cents > 0 ? g.cents : (b.cents == null || b.cents === "" ? 0 : int(b.cents, { min: 0, max: 10_000_000, field: "Valor" }));
  const author = str(b.author, { min: 2, max: 60, field: "Seu nome" }), message = str(b.message, { max: 400, field: "Mensagem" });
  await env.DB.prepare("INSERT INTO gift_notices (id, wedding_id, gift, cents, author, message) VALUES (?, ?, ?, ?, ?, ?)").bind(uid("p_"), w.id, String(g.title).slice(0, 80), cents, author, message).run();
  return json({ ok: true }, 201);
}
function publicWedding(w) {
  return { names: w.names, date: w.date_iso, city: w.city, universe: w.universe, welcome: w.welcome, hero_image: w.hero_image,
    story: parseJson(w.story_json, []), gifts: parseJson(w.gifts_json, []), pix_key: w.pix_key, pix_name: w.pix_name || w.names, pix_city: w.pix_city || w.city, faq: parseJson(w.faq_json, []),
    rsvp_deadline: w.rsvp_deadline, is_demo: !!w.is_demo, slug: w.slug,
    theme: w.theme || "", venue_name: w.venue_name || "", schedule: parseJson(w.schedule_json, []), dress: parseJson(w.dress_json, []),
    map_image: w.map_image || "", gift_url: w.gift_url || "", rsvp_note: w.rsvp_note || "", guestbook: !!w.guestbook,
    quiz: parseJson(w.quiz_json, []), quiz_premio: w.quiz_premio || "",
    music: spotifyTrackId(w.music_url) ? { track: spotifyTrackId(w.music_url), label: w.music_label || "" } : null };
}

/* ---------------- convite pessoal ---------------- */
async function householdByToken(env, token) {
  // link pessoal ou acesso temporário de "confirmar pelo nome" (src/mods/convidados.js);
  // token inexistente, vencido e revogado têm a mesma resposta (sem enumeração)
  return guestsHouseholdByToken(env, token);
}
async function inviteData(req, env, token) {
  await rateLimit(env, "invite:" + clientIp(req), LIMITS.invite);
  const h = await householdByToken(env, token);
  const w = await env.DB.prepare("SELECT * FROM weddings WHERE id = ?").bind(h.wedding_id).first();
  const events = (await env.DB.prepare(`SELECT e.id, e.name, e.starts_at, e.venue, e.address, e.dress_code, e.notes FROM invitations i
    JOIN events e ON e.id = i.event_id WHERE i.household_id = ? ORDER BY e.sort, e.starts_at`).bind(h.id).all()).results;
  const guests = (await env.DB.prepare("SELECT id, name, is_child, is_plus_one, diet, accessibility FROM guests WHERE household_id = ? ORDER BY sort").bind(h.id).all()).results;
  const rs = (await env.DB.prepare("SELECT r.guest_id, r.event_id, r.status, r.menu_option_id FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE g.household_id = ?").bind(h.id).all()).results;
  return json({
    wedding: publicWedding(w),
    household: { name: h.name, greeting: h.greeting || h.name, message: h.message, max_guests: h.max_guests, note: h.note_to_couple, responded_at: h.responded_at },
    events, guests: guests.map(g => ({ ...g, is_child: !!g.is_child, is_plus_one: !!g.is_plus_one })),
    responses: rs, open: !deadlinePassed(w.rsvp_deadline),
    mods: await modsData("invite", env, w, h),
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
  // opções de menu dos eventos desta família (módulo convidados): a escolha só vale com "sim" e para o próprio evento
  const menus = (await env.DB.prepare("SELECT id, event_id FROM menu_options WHERE wedding_id = ?").bind(h.wedding_id).all()).results;
  const stmts = [];
  for (const r of responses) {
    if (!guests.includes(r.guest_id) || !events.includes(r.event_id)) fail(400, "Pessoa ou evento fora deste convite", "invalid_target");
    oneOf(r.status, ["yes", "no"], "resposta");
    let menu = null;
    if (r.menu != null && r.menu !== "") {
      if (!menus.some(o => o.id === r.menu && o.event_id === r.event_id)) fail(400, "Opção de menu inválida para este evento", "invalid_menu");
      if (r.status === "yes") menu = r.menu;
    }
    stmts.push(env.DB.prepare("INSERT INTO rsvps (guest_id, event_id, status, menu_option_id, updated_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(guest_id, event_id) DO UPDATE SET status = excluded.status, menu_option_id = excluded.menu_option_id, updated_at = excluded.updated_at").bind(r.guest_id, r.event_id, r.status, menu));
  }
  for (const g of Array.isArray(b.details) ? b.details : []) {
    if (!guests.includes(g.guest_id)) fail(400, "Pessoa fora deste convite", "invalid_target");
    stmts.push(env.DB.prepare("UPDATE guests SET diet = ?, accessibility = ? WHERE id = ? AND household_id = ?")
      .bind(str(g.diet, { max: 160, field: "Restrição alimentar" }), str(g.accessibility, { max: 160, field: "Acessibilidade" }), g.guest_id, h.id));
  }
  stmts.push(env.DB.prepare("UPDATE households SET note_to_couple = ?, responded_at = datetime('now') WHERE id = ?").bind(str(b.note, { max: 600, field: "Recado" }), h.id));
  // ganchos dos módulos no mesmo envio (ex.: van): validam ANTES de gravar e gravam DEPOIS
  const hooks = [];
  for (const mod of MODS) if (mod.rsvp) { const f = await mod.rsvp(env, h, b, responses); if (f) hooks.push(f); }
  await batch(env, stmts);
  await audit(env, h.wedding_id, "guest:" + h.id, "rsvp", String(responses.length));
  const extra = {};
  for (const f of hooks) Object.assign(extra, await f());
  return json({ ok: true, ...extra });
}
async function batch(env, stmts) { if (env.DB.batch) return env.DB.batch(stmts); for (const s of stmts) await s.run(); }

/* ---------------- painel: convidados ---------------- */
async function overview(env, W) {
  const w = await env.DB.prepare("SELECT names, date_iso, rsvp_deadline, slug, is_demo FROM weddings WHERE id = ?").bind(W).first();
  const events = (await env.DB.prepare(`SELECT e.id, e.name, e.starts_at,
      (SELECT COUNT(*) FROM invitations i JOIN guests g ON g.household_id = i.household_id JOIN households h ON h.id = i.household_id WHERE i.event_id = e.id AND h.waitlist = 0) AS invited,
      (SELECT COUNT(*) FROM rsvps r JOIN guests g ON g.id = r.guest_id JOIN households h ON h.id = g.household_id WHERE r.event_id = e.id AND r.status = 'yes' AND h.waitlist = 0) AS yes,
      (SELECT COUNT(*) FROM rsvps r JOIN guests g ON g.id = r.guest_id JOIN households h ON h.id = g.household_id WHERE r.event_id = e.id AND r.status = 'no' AND h.waitlist = 0) AS no
    FROM events e WHERE e.wedding_id = ? ORDER BY e.sort, e.starts_at`).bind(W).all()).results;
  // lista de espera (módulo convidados) fica fora das contagens e do radar: essas famílias ainda não foram convidadas
  const hh = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(responded_at IS NOT NULL) AS responded FROM households WHERE wedding_id = ? AND waitlist = 0").bind(W).first();
  const diets = (await env.DB.prepare("SELECT COUNT(*) AS n FROM guests g JOIN households h ON h.id = g.household_id WHERE g.wedding_id = ? AND g.diet <> '' AND h.waitlist = 0").bind(W).first()).n;
  const b = await budgetTotals(env, W);
  const gf = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(cents), 0) AS cents, COALESCE(SUM(checked = 0), 0) AS unchecked FROM gift_notices WHERE wedding_id = ?").bind(W).first();
  const out = { wedding: { ...w, is_demo: !!w.is_demo }, events: events.map(e => ({ ...e, pending: e.invited - e.yes - e.no })),
    households: { total: hh.total || 0, responded: hh.responded || 0 }, diets, budget: b, gifts: gf, mods: await modsData("overview", env, W) };
  // central do casamento (módulo organização): progresso, urgências e radar de riscos — lê o que os outros módulos publicaram
  out.mods.organizacao = await org.commandCenter(env, W, out, out.mods);
  return json(out);
}
async function guestList(env, W) {
  const hs = (await env.DB.prepare("SELECT id, name, greeting, max_guests, revoked, token_hash IS NOT NULL AS has_link, token_at, responded_at, note_to_couple, waitlist, promoted_at, reminded_at FROM households WHERE wedding_id = ? ORDER BY created_at, rowid").bind(W).all()).results;
  const gs = (await env.DB.prepare("SELECT id, household_id, name, is_child, is_plus_one, diet, accessibility FROM guests WHERE wedding_id = ? ORDER BY sort").bind(W).all()).results;
  const inv = (await env.DB.prepare("SELECT i.household_id, i.event_id FROM invitations i JOIN households h ON h.id = i.household_id WHERE h.wedding_id = ?").bind(W).all()).results;
  const rs = (await env.DB.prepare("SELECT r.guest_id, r.event_id, r.status, r.menu_option_id FROM rsvps r JOIN guests g ON g.id = r.guest_id WHERE g.wedding_id = ?").bind(W).all()).results;
  const events = (await env.DB.prepare("SELECT id, name FROM events WHERE wedding_id = ? ORDER BY sort, starts_at").bind(W).all()).results;
  return json({ events, households: hs.map(h => ({
    ...h, revoked: !!h.revoked, has_link: !!h.has_link, waitlist: !!h.waitlist,
    events: inv.filter(i => i.household_id === h.id).map(i => i.event_id),
    guests: gs.filter(g => g.household_id === h.id).map(g => {
      const mine = rs.filter(r => r.guest_id === g.id);
      return { ...g, is_child: !!g.is_child, is_plus_one: !!g.is_plus_one, responses: Object.fromEntries(mine.map(r => [r.event_id, r.status])),
        menus: Object.fromEntries(mine.filter(r => r.menu_option_id).map(r => [r.event_id, r.menu_option_id])) };
    }),
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
  // vagas extras para acompanhantes (o convidado escreve o nome no convite) e lista de espera (sem link por enquanto)
  const extra = b.extra_slots == null || b.extra_slots === "" ? 0 : int(b.extra_slots, { min: 0, max: 20 - people.length, field: "Vagas para acompanhantes" });
  const waitlist = b.waitlist === true;
  const stmts = [env.DB.prepare("INSERT INTO households (id, wedding_id, name, greeting, message, max_guests, waitlist) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, W, name, str(b.greeting, { max: 80, field: "Como chamar" }), str(b.message, { max: 500, field: "Mensagem" }), people.length + extra, waitlist ? 1 : 0)];
  people.forEach((g, i) => stmts.push(env.DB.prepare("INSERT INTO guests (id, wedding_id, household_id, name, is_child, sort) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid("g_"), W, id, str(g.name, { min: 2, max: 80, field: "Nome do convidado" }), g.is_child ? 1 : 0, i)));
  for (const e of evIds) stmts.push(env.DB.prepare("INSERT INTO invitations (household_id, event_id) VALUES (?, ?)").bind(id, e));
  await batch(env, stmts);
  const link = waitlist ? null : await issueToken(env, W, id, url);
  await audit(env, W, actor, "household.create", id);
  return json({ id, link, waitlist }, 201);
}
async function ownHousehold(env, W, hid) {
  const h = await env.DB.prepare("SELECT id FROM households WHERE id = ? AND wedding_id = ?").bind(hid, W).first();
  if (!h) fail(404, "Convite não encontrado", "not_found");
}
async function newLink(env, W, hid, actor, url) {
  await ownHousehold(env, W, hid);
  // gerar link para quem está na lista de espera = chamar a família (sai da lista)
  await env.DB.prepare("UPDATE households SET waitlist = 0, promoted_at = datetime('now') WHERE id = ? AND wedding_id = ? AND waitlist = 1").bind(hid, W).run();
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
  const cats = (await env.DB.prepare("SELECT id, name, planned_cents FROM budget_categories WHERE wedding_id = ? ORDER BY sort, rowid").bind(W).all()).results;
  const rows = (await env.DB.prepare("SELECT id, category_id, description, vendor, amount_cents, paid_cents, due_date, per_guest_cents, receipt_url FROM budget_items WHERE wedding_id = ? ORDER BY due_date IS NULL, due_date").bind(W).all()).results;
  // parcelas, fornecedor ligado e próximos pagamentos considerando parcelas (módulo organização)
  const { items, upcoming } = await org.budgetExtras(env, W, rows);
  return json({
    totals: await budgetTotals(env, W),
    categories: cats.map(c => { const its = items.filter(i => i.category_id === c.id); return { ...c, committed: its.reduce((s, i) => s + i.amount_cents, 0), paid: its.reduce((s, i) => s + i.paid_cents, 0) }; }),
    items,
    upcoming: upcoming.slice(0, 8),
  });
}
async function createItem(req, env, W, actor) {
  const b = await body(req);
  const cat = await env.DB.prepare("SELECT id FROM budget_categories WHERE id = ? AND wedding_id = ?").bind(String(b.category_id || ""), W).first();
  if (!cat) fail(400, "Categoria inválida", "invalid");
  const id = uid("b_");
  const amount = int(b.amount_cents, { field: "Valor" });
  let paid = int(b.paid_cents ?? 0, { field: "Pago" }), due = isoDate(b.due_date, "Vencimento");
  const plan = org.parseInstallments(b.installments, amount); // parcelas opcionais: o pago e o vencimento passam a vir delas
  if (plan.rows.length) { paid = plan.paid; due = plan.due; }
  if (paid > amount) fail(400, "O valor pago não pode passar do contratado", "invalid");
  const desc = str(b.description, { min: 2, max: 120, field: "Descrição" }), vendor = str(b.vendor, { max: 80, field: "Fornecedor" });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO budget_items (id, wedding_id, category_id, description, vendor, amount_cents, paid_cents, due_date, per_guest_cents, receipt_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, W, cat.id, desc, vendor, amount, paid, due, b.per_guest_cents == null || b.per_guest_cents === "" ? null : int(b.per_guest_cents, { field: "Valor por convidado" }),
        receiptUrl(b.receipt_url)),
    ...(plan.rows.length ? org.installmentStmts(env, W, id, plan.rows) : []),
    org.historyStmt(env, W, id, desc, actor, "create", [{ field: "amount_cents", from: null, to: amount }, ...(paid ? [{ field: "paid_cents", from: null, to: paid }] : []), ...(plan.rows.length ? [{ field: "installments", from: null, to: plan.rows.length }] : [])]),
  ]);
  return json({ id }, 201);
}
/** Comprovante: por enquanto um link (o upload de arquivos virá do módulo de mídia). */
function receiptUrl(v) {
  const s = str(v, { max: 500, field: "Comprovante" });
  if (s && !/^https?:\/\/[^\s<>"']+$/i.test(s)) fail(400, "Comprovante: use um link que comece com https://", "invalid");
  return s;
}
async function updateItem(req, env, W, id, actor) {
  const it = await env.DB.prepare("SELECT * FROM budget_items WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!it) fail(404, "Lançamento não encontrado", "not_found");
  const b = await body(req);
  const amount = b.amount_cents != null ? int(b.amount_cents, { field: "Valor" }) : it.amount_cents;
  let paid = b.paid_cents != null ? int(b.paid_cents, { field: "Pago" }) : it.paid_cents;
  let due = b.due_date !== undefined ? isoDate(b.due_date, "Vencimento") : it.due_date;
  // lançamento parcelado: pago e vencimento vêm das parcelas (enviadas junto ou já salvas)
  const plan = b.installments !== undefined ? org.parseInstallments(b.installments, amount) : null;
  const hadInst = await org.installmentCount(env, W, id);
  if (plan?.rows.length) { paid = plan.paid; due = plan.due; }
  else if (!plan && hadInst) {
    if (amount !== it.amount_cents) fail(409, "Este lançamento é parcelado: ajuste as parcelas junto com o valor.", "installments");
    if (paid !== it.paid_cents) fail(409, "Este lançamento é parcelado: registre o pagamento em cada parcela.", "installments");
    due = it.due_date;
  }
  if (paid > amount) fail(400, "O valor pago não pode passar do contratado", "invalid");
  let cat = it.category_id;
  if (b.category_id !== undefined && b.category_id !== it.category_id) {
    const c = await env.DB.prepare("SELECT id FROM budget_categories WHERE id = ? AND wedding_id = ?").bind(String(b.category_id || ""), W).first();
    if (!c) fail(400, "Categoria inválida", "invalid");
    cat = c.id;
  }
  const desc = b.description !== undefined ? str(b.description, { min: 2, max: 120, field: "Descrição" }) : it.description;
  const vendor = b.vendor !== undefined ? str(b.vendor, { max: 80, field: "Fornecedor" }) : it.vendor;
  const perGuest = b.per_guest_cents === undefined ? it.per_guest_cents : (b.per_guest_cents == null || b.per_guest_cents === "" ? null : int(b.per_guest_cents, { field: "Valor por convidado" }));
  const receipt = b.receipt_url !== undefined ? receiptUrl(b.receipt_url) : it.receipt_url;
  const after = { amount_cents: amount, paid_cents: paid, due_date: due, category_id: cat, description: desc, vendor, per_guest_cents: perGuest, receipt_url: receipt };
  const changes = org.diff(it, after);
  if (plan && (plan.rows.length || hadInst)) changes.push({ field: "installments", from: hadInst, to: plan.rows.length });
  await env.DB.batch([
    env.DB.prepare("UPDATE budget_items SET amount_cents = ?, paid_cents = ?, due_date = ?, category_id = ?, description = ?, vendor = ?, per_guest_cents = ?, receipt_url = ? WHERE id = ? AND wedding_id = ?")
      .bind(amount, paid, due, cat, desc, vendor, perGuest, receipt, id, W),
    ...(plan ? org.installmentStmts(env, W, id, plan.rows) : []),
    ...(changes.length ? [org.historyStmt(env, W, id, desc, actor, changes.length === 1 && changes[0].field === "paid_cents" ? "pay" : "update", changes)] : []),
  ]);
  return json({ ok: true });
}
async function deleteItem(env, W, id, actor) {
  const it = await env.DB.prepare("SELECT id, description, amount_cents, paid_cents FROM budget_items WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!it) fail(404, "Lançamento não encontrado", "not_found");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM budget_installments WHERE item_id = ? AND wedding_id = ?").bind(id, W),
    env.DB.prepare("UPDATE vendors SET budget_item_id = NULL WHERE budget_item_id = ? AND wedding_id = ?").bind(id, W),
    env.DB.prepare("DELETE FROM budget_items WHERE id = ? AND wedding_id = ?").bind(id, W),
    org.historyStmt(env, W, id, it.description, actor, "delete", [{ field: "amount_cents", from: it.amount_cents, to: null }, { field: "paid_cents", from: it.paid_cents, to: null }]),
  ]);
  await audit(env, W, actor, "budget.item.delete", id);
  return json({ ok: true });
}
const STARTER = ["Local", "Buffet e comida", "Bebidas", "Decoração e flores", "Foto e vídeo", "Música e som", "Trajes e beleza", "Papelaria e convites", "Lembrancinhas", "Outros"];
async function starterCategories(env, W) {
  const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM budget_categories WHERE wedding_id = ?").bind(W).first()).n;
  if (n) fail(409, "Vocês já têm categorias", "exists");
  await env.DB.batch(STARTER.map((name, i) => env.DB.prepare("INSERT INTO budget_categories (id, wedding_id, name, planned_cents, sort) VALUES (?, ?, ?, 0, ?)").bind(uid("c_"), W, name, i)));
  return json({ ok: true, created: STARTER.length }, 201);
}
async function createCategory(req, env, W) {
  const b = await body(req);
  const name = str(b.name, { min: 2, max: 60, field: "Categoria" });
  const planned = int(b.planned_cents ?? 0, { field: "Planejado" });
  const sort = (await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM budget_categories WHERE wedding_id = ?").bind(W).first()).s;
  const id = uid("c_");
  await env.DB.prepare("INSERT INTO budget_categories (id, wedding_id, name, planned_cents, sort) VALUES (?, ?, ?, ?, ?)").bind(id, W, name, planned, sort).run();
  return json({ id }, 201);
}
async function updateCategory(req, env, W, id) {
  const c = await env.DB.prepare("SELECT * FROM budget_categories WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!c) fail(404, "Categoria não encontrada", "not_found");
  const b = await body(req);
  const name = b.name !== undefined ? str(b.name, { min: 2, max: 60, field: "Categoria" }) : c.name;
  const planned = b.planned_cents !== undefined ? int(b.planned_cents, { field: "Planejado" }) : c.planned_cents;
  await env.DB.prepare("UPDATE budget_categories SET name = ?, planned_cents = ? WHERE id = ? AND wedding_id = ?").bind(name, planned, id, W).run();
  return json({ ok: true });
}
async function deleteCategory(env, W, id, actor) {
  const c = await env.DB.prepare("SELECT id FROM budget_categories WHERE id = ? AND wedding_id = ?").bind(id, W).first();
  if (!c) fail(404, "Categoria não encontrada", "not_found");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM budget_installments WHERE wedding_id = ? AND item_id IN (SELECT id FROM budget_items WHERE category_id = ? AND wedding_id = ?)").bind(W, id, W),
    env.DB.prepare("UPDATE vendors SET budget_item_id = NULL WHERE wedding_id = ? AND budget_item_id IN (SELECT id FROM budget_items WHERE category_id = ? AND wedding_id = ?)").bind(W, id, W),
    env.DB.prepare("DELETE FROM budget_items WHERE category_id = ? AND wedding_id = ?").bind(id, W),
    env.DB.prepare("DELETE FROM budget_categories WHERE id = ? AND wedding_id = ?").bind(id, W),
  ]);
  await audit(env, W, actor, "budget.category.delete", id);
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
    gift_notices: await q("SELECT * FROM gift_notices WHERE wedding_id = ?"),
  };
  Object.assign(data, await modsData("exportData", env, W));
  await audit(env, W, actor, "export");
  return json(data, 200, { "Content-Disposition": `attachment; filename="casamento-${data.wedding.slug}.json"` });
}
