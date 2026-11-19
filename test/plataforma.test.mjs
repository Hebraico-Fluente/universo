/** Módulo plataforma: admin, clientes, planos/cobranças, flags, domínios, suspensão, suporte e log de erros. */
import { setup, O } from "./helpers.mjs";
import { handle } from "../src/worker.js";
import { sha256 } from "../src/lib.js";
import { featureOn } from "../src/mods/plataforma.js";
import { DEMO } from "../scripts/seed.mjs";

const t = await setup();
const { ok, env } = t;
const db = env._db;

/* ---------- casal comum não entra na plataforma ---------- */
await t.loginDemo();
const coupleCookie = t.cookie;
let r = await t.json("GET", "/api/platform/weddings");
ok(r.status === 401 || r.status === 403, "casal comum não acessa /api/platform (" + r.status + ")");
r = await t.json("POST", "/api/platform/login", { email: DEMO.login.email, password: DEMO.login.password }, { ck: "" });
ok(r.status === 401 && !r.res.headers.get("Set-Cookie"), "login de casal na plataforma é recusado");
r = await t.json("GET", "/api/platform/setup/" + "x".repeat(32), null, { ck: "" });
ok(r.status === 404, "convite de admin inexistente → 404");

/* ---------- primeiro admin: convite de uso único (como o workflow faz) ---------- */
const TOKEN = "plataforma-admin-teste-0123456789";
db.prepare("INSERT INTO platform_invites (token_hash, expires_at) VALUES (?, ?)").run(await sha256(TOKEN), new Date(Date.now() + 864e5).toISOString());
r = await t.json("GET", "/api/platform/setup/" + TOKEN, null, { ck: "" });
ok(r.status === 200 && r.body.ok, "convite de admin válido");
r = await t.json("POST", "/api/platform/setup/" + TOKEN, { name: "Admin Estúdio", email: "admin@exemplo.test", password: "curta" }, { ck: "" });
ok(r.status === 400 && r.body.code === "weak_password", "senha curta recusada");
r = await t.json("POST", "/api/platform/setup/" + TOKEN, { name: "Admin Estúdio", email: "admin@exemplo.test", password: "senha-muito-boa-123" }, { origin: "https://evil.test", ck: "" });
ok(r.status === 403, "setup exige mesma origem");
r = await t.json("POST", "/api/platform/setup/" + TOKEN, { name: "Admin Estúdio", email: "admin@exemplo.test", password: "senha-muito-boa-123" }, { ck: "" });
const admin = (r.res.headers.get("Set-Cookie") || "").split(";")[0];
ok(r.status === 201 && /^__Host-plat=/.test(admin), "setup cria o admin e abre sessão própria");
r = await t.json("POST", "/api/platform/setup/" + TOKEN, { name: "Outra", email: "outra@exemplo.test", password: "senha-muito-boa-123" }, { ck: "" });
ok(r.status === 404, "convite de admin é de uso único");
ok(db.prepare("SELECT platform_role FROM users WHERE email = 'admin@exemplo.test'").get().platform_role === "admin", "users.platform_role = admin");
r = await t.json("POST", "/api/platform/login", { email: "admin@exemplo.test", password: "senha-muito-boa-123" }, { ck: "" });
ok(r.status === 200 && /^__Host-plat=/.test(r.res.headers.get("Set-Cookie") || ""), "login do admin funciona");
r = await t.json("GET", "/api/platform/weddings", null, { ck: coupleCookie + "; " + "__Host-plat=forjado" });
ok(r.status === 401, "cookie de admin forjado é recusado");
t.cookie = admin;

/* ---------- clientes ---------- */
r = await t.json("GET", "/api/platform/weddings");
ok(r.status === 200 && r.body.weddings.some(w => w.slug === "helena-e-rafael" && w.guests > 0 && w.households > 0 && "last_access" in w), "lista de clientes com uso");
r = await t.json("POST", "/api/platform/weddings", { names: "Ana & Bruno", slug: "Ana e Bruno", date_iso: "2028-03-04T16:00:00-03:00", universe: "timeless" });
ok(r.status === 400, "slug inválido recusado");
r = await t.json("POST", "/api/platform/weddings", { names: "Ana & Bruno", slug: "ana-e-bruno", date_iso: "2028-03-04", universe: "timeless" });
ok(r.status === 400, "data sem hora/fuso recusada");
r = await t.json("POST", "/api/platform/weddings", { names: "Ana & Bruno", slug: "ana-e-bruno", date_iso: "2028-03-04T16:00:00-03:00", city: "Curitiba", universe: "timeless", theme: "nao-existe" });
ok(r.status === 400, "tema inexistente recusado");
r = await t.json("POST", "/api/platform/weddings", { names: "Ana & Bruno", slug: "ana-e-bruno", date_iso: "2028-03-04T16:00:00-03:00", city: "Curitiba", universe: "timeless" });
ok(r.status === 201 && r.body.access.link.includes("/painel?acesso="), "cria casamento e devolve link de dono");
const W = r.body.id, ownerLink = r.body.access.link;
const ownerToken = new URL(ownerLink).searchParams.get("acesso");
ok(!db.prepare("SELECT COUNT(*) AS n FROM access_invites WHERE token_hash = ?").get(ownerToken) .n && db.prepare("SELECT COUNT(*) AS n FROM access_invites WHERE token_hash = ?").get(await sha256(ownerToken)).n === 1, "só o hash do link de dono vai ao banco");
r = await t.json("POST", "/api/platform/weddings", { names: "Outro", slug: "ana-e-bruno", date_iso: "2028-03-04T16:00:00-03:00" });
ok(r.status === 409 && r.body.code === "slug_taken", "slug duplicado recusado");
r = await t.json("POST", "/api/platform/weddings", { names: "Outro", slug: "helena-e-rafael", date_iso: "2028-03-04T16:00:00-03:00" });
ok(r.status === 409, "slug de casamento existente recusado");

// o link de dono funciona em /api/auth/setup
r = await t.json("POST", "/api/auth/setup/" + ownerToken, { name: "Ana", email: "ana@exemplo.test", password: "senha-da-ana-2028" }, { ck: "" });
const anaCookie = (r.res.headers.get("Set-Cookie") || "").split(";")[0];
ok(r.status === 201, "link de dono funciona em /api/auth/setup");
r = await t.json("GET", "/api/me", null, { ck: anaCookie });
ok(r.status === 200 && r.body.wedding.slug === "ana-e-bruno" && r.body.role === "owner", "casal novo entra no próprio painel");
ok(r.body.wedding.features && r.body.wedding.features.mesas === true && Object.keys(r.body.wedding.features).length >= 12, "/api/me traz as flags (padrão ligado)");
r = await t.json("GET", "/api/platform/weddings", null, { ck: anaCookie });
ok(r.status === 401, "dono de casamento não acessa a plataforma");

// detalhe, novo link e revogação
r = await t.json("GET", "/api/platform/weddings/" + W);
ok(r.status === 200 && r.body.members.length === 1 && r.body.invites[0].state === "usado" && !JSON.stringify(r.body).includes(ownerToken), "detalhe mostra membros e convites (sem token)");
r = await t.json("POST", `/api/platform/weddings/${W}/access`, { role: "planner", days: 7 });
ok(r.status === 201 && r.body.access.role === "planner", "novo link de acesso (cerimonialista)");
const plannerToken = new URL(r.body.access.link).searchParams.get("acesso");
let d = (await t.json("GET", "/api/platform/weddings/" + W)).body;
const pend = d.invites.find(i => i.state === "pendente");
r = await t.json("POST", `/api/platform/weddings/${W}/access/revoke`, { token_ref: pend.ref });
ok(r.status === 200, "revoga convite pendente");
r = await t.json("GET", "/api/auth/setup/" + plannerToken, null, { ck: "" });
ok(r.status === 404, "link revogado não vale mais");
r = await t.json("POST", `/api/platform/weddings/${W}/access/revoke`, { user_id: d.members[0].user_id });
ok(r.status === 200, "revoga acesso de membro");
r = await t.json("GET", "/api/me", null, { ck: anaCookie });
ok(r.status === 401, "membro revogado perde a sessão");
// religar a Ana para os próximos testes
const again = await t.json("POST", `/api/platform/weddings/${W}/access`, { role: "owner" });
r = await t.json("POST", "/api/auth/setup/" + new URL(again.body.access.link).searchParams.get("acesso"), { name: "Ana", email: "ana@exemplo.test", password: "senha-da-ana-2028" }, { ck: "" });
const ana = (r.res.headers.get("Set-Cookie") || "").split(";")[0];
ok(r.status === 201, "conta existente é religada com a própria senha");

/* ---------- flags ---------- */
r = await t.json("PATCH", "/api/platform/weddings/" + W, { features: { mesas: false, quiz: false } });
ok(r.status === 200, "desliga funcionalidades");
r = await t.json("PATCH", "/api/platform/weddings/" + W, { features: { inexistente: false } });
ok(r.status === 400, "flag desconhecida recusada");
r = await t.json("GET", "/api/me", null, { ck: ana });
ok(r.body.wedding.features.mesas === false && r.body.wedding.features.quiz === false && r.body.wedding.features.tarefas === true, "/api/me reflete as flags");
r = await t.json("GET", "/api/site/ana-e-bruno", null, { ck: "" });
ok(r.status === 200 && r.body.mods.plataforma.features.mesas === false && r.body.mods.plataforma.features.galeria === true, "/api/site traz as flags");
ok(!JSON.stringify(r.body.mods.plataforma).match(/@|plan|charge|note/i), "site só expõe as flags");
ok(featureOn({ features_json: '{"quiz":false}' }, "quiz") === false && featureOn({ features_json: "{}" }, "quiz") === true && featureOn(null, "x") === true, "featureOn: padrão ligado");

/* ---------- planos e cobranças ---------- */
r = await t.json("POST", "/api/platform/plans", { name: "Essencial", project_cents: 0, monthly_cents: 0 });
ok(r.status === 400, "plano sem preço recusado");
r = await t.json("POST", "/api/platform/plans", { name: "Essencial", project_cents: 150000, monthly_cents: 0, features: ["mural", "quiz", "presentes_pix"] });
ok(r.status === 201, "cria plano");
const plan = r.body.id;
r = await t.json("POST", "/api/platform/plans", { name: "X", project_cents: 1, features: ["foguete"] });
ok(r.status === 400, "plano com funcionalidade desconhecida recusado");
r = await t.json("PATCH", "/api/platform/weddings/" + W, { plan_id: plan });
ok(r.status === 200, "atribui plano");
r = await t.json("POST", `/api/platform/weddings/${W}/apply-plan`);
ok(r.status === 200 && r.body.features.quiz === true && r.body.features.mesas === false, "aplica funcionalidades do plano");
r = await t.json("POST", `/api/platform/weddings/${W}/charges`, { description: "Entrada", cents: 75000, due_date: "2027-01-10", method: "pix", status: "pago" });
ok(r.status === 201, "registra pagamento");
r = await t.json("POST", `/api/platform/weddings/${W}/charges`, { description: "Saldo", cents: 75000, due_date: "2020-01-10", method: "boleto", status: "pendente" });
ok(r.status === 400, "método inválido recusado");
r = await t.json("POST", `/api/platform/weddings/${W}/charges`, { description: "Saldo", cents: 75000, due_date: "2020-01-10", method: "transferencia", status: "pendente", note: "combinado por WhatsApp" });
ok(r.status === 201, "registra cobrança pendente");
const ch = r.body.id;
d = (await t.json("GET", "/api/platform/weddings/" + W)).body;
ok(d.balance.billed === 150000 && d.balance.paid === 75000 && d.balance.open === 75000 && d.balance.overdue === 75000, "saldo do cliente (pago, em aberto, vencido)");
r = await t.json("PATCH", "/api/platform/charges/" + ch, { status: "pago", method: "cartao" });
ok(r.status === 200, "marca cobrança como paga");
r = await t.json("GET", "/api/platform/billing");
const cli = r.body.clients.find(c => c.id === W);
ok(cli.paid === 150000 && cli.open === 0 && cli.plan_name === "Essencial" && r.body.charges.some(c => c.id === ch && c.paid_at), "cobrança: saldo por cliente");
r = await t.json("GET", "/api/platform/plans");
ok(r.body.plans[0].weddings === 1 && r.body.plans[0].features.includes("quiz"), "lista de planos com uso");

/* ---------- suspensão ---------- */
r = await t.json("PATCH", "/api/platform/weddings/" + W, { suspended: true });
ok(r.status === 200, "suspende casamento");
r = await t.json("GET", "/api/site/ana-e-bruno", null, { ck: "" });
ok(r.status === 403 && r.body.code === "suspended", "site suspenso responde com aviso");
r = await t.call("GET", "/c/ana-e-bruno", null, { ck: "" });
const html = await r.text();
ok(r.status === 503 && html.includes("em pausa") && !html.includes("<style") && !/<script/.test(html) && r.headers.get("Content-Security-Policy"), "página do site suspenso: aviso educado, sem inline");
r = await t.json("GET", "/api/me", null, { ck: ana });
ok(r.status === 403 && r.body.code === "suspended" && /pausa/.test(r.body.error), "painel suspenso mostra aviso");
r = await t.json("GET", "/api/admin/overview", null, { ck: ana });
ok(r.status === 403, "API do painel bloqueada quando suspenso");
r = await t.json("GET", "/api/site/helena-e-rafael", null, { ck: "" });
ok(r.status === 200, "outros casamentos seguem normais");
r = await t.json("PATCH", "/api/platform/weddings/" + W, { suspended: false, is_demo: true });
r = await t.json("GET", "/api/site/ana-e-bruno", null, { ck: "" });
ok(r.status === 200 && r.body.wedding.is_demo === true, "reativa e marca como demonstração");

/* ---------- domínio próprio ---------- */
r = await t.json("POST", `/api/platform/weddings/${W}/domains`, { host: "https://www.AnaeBruno.com.br/" });
ok(r.status === 201 && r.body.host === "anaebruno.com.br", "registra domínio (normalizado)");
r = await t.json("POST", `/api/platform/weddings/${W}/domains`, { host: "anaebruno.com.br" });
ok(r.status === 409, "domínio duplicado recusado");
r = await t.json("POST", `/api/platform/weddings/${W}/domains`, { host: "x.workers.dev" });
ok(r.status === 400, "domínio da plataforma recusado");
const viaHost = (host, p) => handle(new Request("https://" + host + p, { headers: { "CF-Connecting-IP": "10.0.0.3" } }), env);
r = await viaHost("anaebruno.com.br", "/");
ok((await r.text()).includes("Universo") && r.status === 200, "domínio pendente ainda não serve o site do casal");
r = await t.json("PATCH", "/api/platform/domains/anaebruno.com.br", { status: "active" });
ok(r.status === 200, "ativa domínio");
r = await viaHost("anaebruno.com.br", "/");
ok(r.status === 200 && (await r.text()).includes("/assets/site.js"), "domínio ativo: / serve o site");
r = await viaHost("www.anaebruno.com.br", "/api/site/undefined");
let j = await r.json();
ok(r.status === 200 && j.wedding.slug === "ana-e-bruno", "domínio ativo (com www): API do site é do casal certo");
r = await viaHost("anaebruno.com.br", "/api/site/helena-e-rafael");
ok((await r.json()).wedding.slug === "ana-e-bruno", "domínio próprio não serve outro casal");
r = await viaHost("anaebruno.com.br", "/api/platform/weddings");
ok(r.status === 404, "plataforma não responde por domínio de casal");
r = await viaHost("universo.moshikg10.workers.dev", "/");
ok(!(await r.text()).includes("/assets/site.js"), "workers.dev continua servindo a landing");
r = await t.call("GET", "/", null, { ck: "" });
ok(!(await r.text()).includes("/assets/site.js"), "host principal continua servindo a landing");

/* ---------- suporte ---------- */
r = await t.json("POST", "/api/admin/suporte", { subject: "Dúvida no RSVP", body: "Como mudo o prazo de confirmação?" }, { ck: ana });
ok(r.status === 201, "casal abre chamado pelo painel");
const tk = r.body.id;
r = await t.json("POST", "/api/admin/suporte", { subject: "x", body: "y" }, { ck: ana, origin: "https://evil.test" });
ok(r.status === 403, "chamado exige mesma origem");
r = await t.json("GET", "/api/admin/suporte", null, { ck: coupleCookie });
ok(r.status === 200 && !r.body.tickets.some(x => x.id === tk), "outro casal não vê o chamado");
r = await t.json("POST", "/api/admin/suporte/" + tk, { body: "invasão" }, { ck: coupleCookie });
ok(r.status === 404, "outro casal não responde o chamado");
r = await t.json("GET", "/api/platform/tickets");
ok(r.body.tickets.some(x => x.id === tk && x.names === "Ana & Bruno" && x.status === "open"), "admin vê o chamado");
r = await t.json("POST", `/api/platform/tickets/${tk}/reply`, { body: "No painel, aba Convidados. Qualquer coisa, estamos aqui." });
ok(r.status === 200 && r.body.status === "answered", "admin responde");
r = await t.json("GET", "/api/admin/suporte", null, { ck: ana });
const mine = r.body.tickets.find(x => x.id === tk);
ok(mine.status === "answered" && mine.messages.length === 2 && mine.messages[1].author === "plataforma", "casal vê a resposta");
r = await t.json("POST", `/api/platform/tickets/${tk}/status`, { status: "closed" });
ok(r.status === 200 && (await t.json("GET", "/api/platform/tickets?status=closed")).body.tickets.some(x => x.id === tk), "admin fecha o chamado");

/* ---------- log de erros (sem dados pessoais) ---------- */
const boom = { ...env, ASSETS: { fetch() { throw new Error("falhou para maria.silva@exemplo.com cpf 12345678900 nome 'Maria Silva' token abcdefghijklmnopqrstuv"); } } };
const quiet = console.error; console.error = () => {}; // o worker loga o erro no console (esperado aqui)
r = await handle(new Request(O + "/i/demo-familia-andrade-2027", { headers: { "CF-Connecting-IP": "10.9.9.9" } }), boom);
console.error = quiet;
ok(r.status === 500, "erro inesperado → 500");
r = await t.json("GET", "/api/platform/errors");
const e0 = r.body.errors[0];
ok(e0 && e0.route === "/i/:p" && e0.method === "GET", "erro registrado com rota sem token");
const flat = JSON.stringify(r.body);
ok(!/maria|silva|12345678900|demo-familia|abcdefghijkl|10\.9\.9\.9/i.test(flat), "log de erro sem e-mail, nome, número, token ou IP");

/* ---------- uso e auditoria ---------- */
r = await t.json("GET", "/api/platform/usage");
ok(r.status === 200 && r.body.totals.weddings >= 3 && r.body.tables.some(x => x.name === "guests" && x.rows > 0 && x.bytes > 0) && r.body.totals.errors_7d >= 1, "painel de uso com totais e tabelas");
ok(!JSON.stringify(r.body.requests_24h).match(/\d+\.\d+\.\d+\.\d+/), "requisições agregadas sem IP");
r = await t.json("GET", "/api/platform/audit");
ok(r.body.entries.some(a => a.action === "platform.wedding.suspend") && r.body.entries.some(a => a.action === "platform.wedding.create"), "ações do admin vão para a auditoria");

/* ---------- escrita da plataforma exige mesma origem ---------- */
r = await t.json("PATCH", "/api/platform/weddings/" + W, { suspended: true }, { origin: "https://evil.test" });
ok(r.status === 403, "escrita na plataforma exige mesma origem");
r = await t.json("POST", "/api/platform/logout");
r = await t.json("GET", "/api/platform/weddings");
ok(r.status === 401, "logout encerra a sessão do admin");
r = await t.call("GET", "/plataforma", null, { ck: "" });
ok(r.status === 200 && r.headers.get("X-Robots-Tag")?.includes("noindex") && r.headers.get("Cache-Control") === "no-store", "/plataforma é privada (noindex, no-store)");

t.done("plataforma");
