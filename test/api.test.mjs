/** Testes da API com o Worker real e SQLite em memória.  Uso: npm test */
import { handle } from "../src/worker.js";
import { localEnv } from "./local-env.mjs";
import { DEMO } from "../scripts/seed.mjs";
import { sha256 } from "../src/lib.js";

const env = await localEnv();
const O = "https://universo.test";
let cookie = "";
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; process.exitCode = 1; } console.log((c ? "ok    " : "FALHA ") + m); };
const call = (method, p, data, { origin = O, ip = "10.0.0.1", ck = cookie } = {}) => handle(new Request(O + p, {
  method, headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": ip, ...(ck ? { Cookie: ck } : {}) },
  body: data ? JSON.stringify(data) : undefined }), env);
const login = async (email, password, ip = "10.0.0.9") => {
  const r = await call("POST", "/api/auth/login", { email, password }, { ip, ck: "" });
  const sc = r.headers.get("Set-Cookie") || ""; return { r, cookie: sc.split(";")[0] };
};

/* ---------- páginas e cabeçalhos ---------- */
let r = await call("GET", "/");
ok(r.status === 200 && r.headers.get("Content-Security-Policy")?.includes("script-src 'self'"), "landing responde com CSP");
r = await call("GET", "/i/" + DEMO.tokens.andrade);
ok(r.status === 200 && r.headers.get("X-Robots-Tag")?.includes("noindex") && r.headers.get("Referrer-Policy") === "same-origin", "página do convite não é indexada e não vaza o link");

/* ---------- site público ---------- */
let j = await (await call("GET", "/api/site/helena-e-rafael")).json();
ok(j.wedding.names === "Helena & Rafael" && j.wedding.is_demo === true, "site público do casal (marcado como demonstração)");
ok(j.events.length === 2 && !j.events.some(e => e.name.includes("Jantar")), "evento privado não aparece no site público");
ok(!JSON.stringify(j).match(/Andrade|Rossi|household|"guests"/i), "site público não expõe convidados");
ok((await call("GET", "/api/site/nao-existe")).status === 404, "slug inexistente → 404");

/* ---------- mural de recados ---------- */
r = await call("POST", "/api/site/helena-e-rafael/recados", { author: "Ana", message: "Felicidades!" }, { ip: "20.0.0.1" });
ok(r.status === 201 && (await r.json()).status === "pending", "recado entra como pendente");
j = await (await call("GET", "/api/site/helena-e-rafael")).json();
ok(j.messages.length === 0, "recado pendente não aparece no site");
r = await call("POST", "/api/site/helena-e-rafael/recados", { author: "A", message: "x" }, { ip: "20.0.0.1" });
ok(r.status === 400, "recado vazio ou curto é recusado");
r = await call("POST", "/api/site/helena-e-rafael/recados", { author: "Ana", message: "Oi" }, { origin: "https://spam.com", ip: "20.0.0.1" });
ok(r.status === 403, "recado de outro site é bloqueado");
let gb = 0; for (let i = 0; i < 8; i++) if ((await call("POST", "/api/site/helena-e-rafael/recados", { author: "Robô", message: "spam " + i }, { ip: "20.0.0.2" })).status === 429) gb++;
ok(gb >= 2, "recados limitados por aparelho");

/* ---------- convite pessoal ---------- */
j = await (await call("GET", "/api/invite/" + DEMO.tokens.lucia)).json();
ok(j.household.greeting === "Tia Lúcia e Tio Beto" && j.guests.length === 2 && j.events.length === 3, "convite traz nome, pessoas e os 3 eventos da família");
ok(!JSON.stringify(j).includes("token") && !JSON.stringify(j).includes("Andrade"), "convite não expõe token nem outras famílias");
j = await (await call("GET", "/api/invite/" + DEMO.tokens.marina)).json();
ok(j.events.length === 2 && !j.events.some(e => e.name.includes("Jantar")), "convite só mostra eventos para os quais a família foi chamada");
r = await call("GET", "/api/invite/token-que-nao-existe-123");
ok(r.status === 404, "token inexistente → 404 genérico");

const lucia = await (await call("GET", "/api/invite/" + DEMO.tokens.lucia)).json();
const [g1, g2] = lucia.guests;
r = await call("POST", `/api/invite/${DEMO.tokens.lucia}/rsvp`, {
  responses: [{ guest_id: g1.id, event_id: "e_cerimonia", status: "yes" }, { guest_id: g1.id, event_id: "e_festa", status: "yes" }, { guest_id: g1.id, event_id: "e_jantar", status: "no" },
    { guest_id: g2.id, event_id: "e_cerimonia", status: "yes" }, { guest_id: g2.id, event_id: "e_festa", status: "no" }],
  details: [{ guest_id: g1.id, diet: "Sem lactose", accessibility: "" }], note: "Mal podemos esperar!" });
ok(r.status === 200, "família confirma por pessoa e por evento");
j = await (await call("GET", "/api/invite/" + DEMO.tokens.lucia)).json();
ok(j.responses.length === 5 && j.guests[0].diet === "Sem lactose" && j.household.note === "Mal podemos esperar!", "respostas, restrição e recado ficam salvos");
r = await call("POST", `/api/invite/${DEMO.tokens.lucia}/rsvp`, { responses: [{ guest_id: g2.id, event_id: "e_festa", status: "yes" }] });
j = await (await call("GET", "/api/invite/" + DEMO.tokens.lucia)).json();
ok(r.status === 200 && j.responses.find(x => x.guest_id === g2.id && x.event_id === "e_festa").status === "yes", "convidado pode alterar a resposta");
r = await call("POST", `/api/invite/${DEMO.tokens.marina}/rsvp`, { responses: [{ guest_id: g1.id, event_id: "e_festa", status: "yes" }] });
ok(r.status === 400, "não aceita responder por pessoa de outro convite");
const marina = await (await call("GET", "/api/invite/" + DEMO.tokens.marina)).json();
r = await call("POST", `/api/invite/${DEMO.tokens.marina}/rsvp`, { responses: [{ guest_id: marina.guests[0].id, event_id: "e_jantar", status: "yes" }] });
ok(r.status === 400, "não aceita evento para o qual a família não foi convidada");
r = await call("POST", `/api/invite/${DEMO.tokens.marina}/rsvp`, { responses: [{ guest_id: marina.guests[0].id, event_id: "e_festa", status: "talvez" }] });
ok(r.status === 400, "resposta fora de sim/não é recusada");
r = await call("POST", `/api/invite/${DEMO.tokens.marina}/rsvp`, { responses: [{ guest_id: marina.guests[0].id, event_id: "e_festa", status: "yes" }] }, { origin: "https://golpe.com" });
ok(r.status === 403, "RSVP de outro site é bloqueado (CSRF)");

/* ---------- autenticação ---------- */
ok((await call("GET", "/api/admin/overview", null, { ck: "" })).status === 401, "painel sem login → 401");
let L = await login(DEMO.login.email, "senha-errada");
ok(L.r.status === 401, "senha errada → 401");
L = await login("ninguem@exemplo.com", "qualquer-coisa");
ok(L.r.status === 401 && (await L.r.json()).code === "bad_credentials", "e-mail inexistente tem a mesma resposta da senha errada");
L = await login(DEMO.login.email, DEMO.login.password);
cookie = L.cookie;
ok(L.r.status === 200 && /HttpOnly/.test(L.r.headers.get("Set-Cookie")) && /Secure/.test(L.r.headers.get("Set-Cookie")) && /SameSite=Lax/.test(L.r.headers.get("Set-Cookie")), "login cria cookie HttpOnly, Secure, SameSite");
ok(env._db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id_hash = ?").get(cookie.split("=")[1])?.n === 0, "o banco guarda só o hash da sessão");
j = await (await call("GET", "/api/me")).json();
ok(j.wedding.names === "Helena & Rafael" && j.role === "owner", "sessão ligada ao casamento certo");

/* ---------- painel ---------- */
j = await (await call("GET", "/api/admin/overview")).json();
const festa = j.events.find(e => e.id === "e_festa");
ok(festa.invited === 12 && festa.yes + festa.no + festa.pending === 12, "visão geral conta convidados, confirmados e pendentes por evento");
ok(j.budget.planned === 11400000 && j.budget.to_pay === j.budget.committed - j.budget.paid, "visão geral traz totais do orçamento");
j = await (await call("GET", "/api/admin/guests")).json();
ok(j.households.length === 5 && j.households.every(h => !("token_hash" in h)), "lista de famílias sem expor hash do token");

r = await call("POST", "/api/admin/households", { name: "Família Teste", greeting: "Ana e Léo", guests: [{ name: "Ana Teste" }, { name: "Léo Teste", is_child: true }], events: ["e_cerimonia", "e_festa"] });
j = await r.json();
const newToken = j.link?.split("/i/")[1];
ok(r.status === 201 && /^https:\/\/universo\.test\/i\/[A-Za-z0-9_-]{22}$/.test(j.link), "nova família recebe link com token aleatório");
let inv = await (await call("GET", "/api/invite/" + newToken)).json();
ok(inv.household.greeting === "Ana e Léo" && inv.guests[1].is_child === true, "o link novo abre o convite certo");
r = await call("POST", `/api/admin/households/${j.id}/link`);
const token2 = (await r.json()).link.split("/i/")[1];
ok((await call("GET", "/api/invite/" + newToken)).status === 404 && (await call("GET", "/api/invite/" + token2)).status === 200, "gerar link novo invalida o anterior");
await call("POST", `/api/admin/households/${j.id}/revoke`);
ok((await call("GET", "/api/invite/" + token2)).status === 404, "revogar desativa o convite");
r = await call("POST", "/api/admin/households", { name: "X", guests: [{ name: "Fulano" }], events: ["e_w_lia"] });
ok(r.status === 400, "não aceita evento de outro casamento");
r = await call("POST", "/api/admin/households", { name: "Sem origem", guests: [{ name: "Fulano" }], events: ["e_festa"] }, { origin: null });
ok(r.status === 403, "escrita sem Origin é bloqueada (CSRF)");
r = await call("DELETE", `/api/admin/households/${j.id}`);
ok(r.status === 200 && env._db.prepare("SELECT COUNT(*) AS n FROM guests WHERE household_id = ?").get(j.id).n === 0, "apagar família apaga as pessoas e respostas");

/* ---------- orçamento ---------- */
j = await (await call("GET", "/api/admin/budget")).json();
ok(j.categories.length === 6 && j.upcoming.length > 0 && j.upcoming.every(u => u.amount_cents > u.paid_cents), "orçamento por categoria e próximos pagamentos");
r = await call("PATCH", "/api/admin/budget/items/b3", { paid_cents: 900000 });
ok(r.status === 400, "pago não pode passar do contratado");
r = await call("PATCH", "/api/admin/budget/items/b3", { paid_cents: 200000 });
j = await (await call("GET", "/api/admin/budget")).json();
ok(r.status === 200 && j.items.find(i => i.id === "b3").paid_cents === 200000, "registrar pagamento atualiza o lançamento");
r = await call("POST", "/api/admin/budget/items", { category_id: "c_papel", description: "Lembrancinhas", amount_cents: 80000, due_date: "2027-09-01", per_guest_cents: 900 });
ok(r.status === 201, "novo lançamento com valor por convidado");
j = await (await call("GET", "/api/admin/budget/simulate?extra=30")).json();
ok(j.can_estimate && j.total_cents === 30 * (18500 + 4500 + 900) && j.assumptions.length >= 2 && j.lines.every(l => l.source), "simulação usa só contratos por pessoa e mostra premissas");

/* ---------- moderação do mural ---------- */
j = await (await call("GET", "/api/admin/recados")).json();
const rec = j.messages.find(m => m.author === "Ana");
ok(rec && rec.status === "pending", "noivos veem recados pendentes");
r = await call("POST", `/api/admin/recados/${rec.id}/approve`);
j = await (await call("GET", "/api/site/helena-e-rafael")).json();
ok(r.status === 200 && j.messages.some(m => m.message === "Felicidades!"), "recado aprovado aparece no site");

/* ---------- isolamento entre casais ---------- */
const other = await login(DEMO.other.email, DEMO.other.password, "10.0.0.8");
const oc = other.cookie;
j = await (await call("GET", "/api/admin/guests", null, { ck: oc })).json();
ok(j.households.length === 1 && j.households[0].name === "Convidado de outro casal", "outro casal só vê os próprios convidados");
ok((await call("POST", "/api/admin/households/h_andrade/revoke", null, { ck: oc })).status === 404, "outro casal não revoga convite alheio");
ok((await call("PATCH", "/api/admin/budget/items/b1", { paid_cents: 0 }, { ck: oc })).status === 404, "outro casal não altera orçamento alheio");
ok((await call("POST", `/api/admin/recados/${rec.id}/approve`, null, { ck: oc })).status === 404, "outro casal não modera recados alheios");
ok((await call("DELETE", "/api/admin/households/h_rossi", null, { ck: oc })).status === 404 && env._db.prepare("SELECT COUNT(*) AS n FROM households WHERE id='h_rossi'").get().n === 1, "outro casal não apaga família alheia");

/* ---------- exportação ---------- */
r = await call("GET", "/api/admin/export");
j = await r.json();
ok(r.headers.get("Content-Disposition")?.includes("attachment") && j.guests.length > 0 && !JSON.stringify(j.households).includes("token_hash"), "exportação completa sem hash de tokens");
ok(env._db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('export','household.revoke','household.link')").get().n >= 3, "ações sensíveis ficam no log de auditoria");

/* ---------- limites ---------- */
let blocked = 0;
for (let i = 0; i < 65; i++) if ((await call("GET", "/api/invite/chute-" + String(i).padStart(12, "0"), null, { ip: "66.6.6.6" })).status === 429) blocked++;
ok(blocked >= 4, "chutes de token são limitados por IP");
blocked = 0;
for (let i = 0; i < 12; i++) if ((await login(DEMO.login.email, "errada-" + i, "77.7.7.7")).r.status === 429) blocked++;
ok(blocked >= 1, "tentativas de login são limitadas");

/* ---------- convite de acesso ao painel (uso único) ---------- */
const setupTok = "acesso-teste-petala-lucas-0001";
env._db.prepare("INSERT INTO access_invites (token_hash, wedding_id, role, expires_at) VALUES (?, 'w_petalucas', 'owner', ?)").run(await sha256(setupTok), new Date(Date.now() + 864e5).toISOString());
env._db.prepare("INSERT INTO access_invites (token_hash, wedding_id, role, expires_at) VALUES (?, 'w_petalucas', 'owner', ?)").run(await sha256("acesso-vencido-000000000001"), new Date(Date.now() - 1000).toISOString());
j = await (await call("GET", "/api/auth/setup/" + setupTok, null, { ck: "" })).json();
ok(j.wedding === "Pétala & Lucas", "link de acesso mostra de qual casamento é");
ok((await call("GET", "/api/auth/setup/acesso-vencido-000000000001", null, { ck: "" })).status === 404, "link de acesso vencido não vale");
r = await call("POST", "/api/auth/setup/" + setupTok, { name: "Pétala", email: "petala@exemplo.com", password: "curta" }, { ck: "" });
ok(r.status === 400, "senha curta é recusada");
r = await call("POST", "/api/auth/setup/" + setupTok, { name: "Pétala", email: "petala@exemplo.com", password: "uma-senha-bem-longa" }, { ck: "", origin: "https://golpe.com" });
ok(r.status === 403, "criação de acesso de outro site é bloqueada");
r = await call("POST", "/api/auth/setup/" + setupTok, { name: "Pétala", email: "Petala@Exemplo.com", password: "uma-senha-bem-longa" }, { ck: "" });
const pc = (r.headers.get("Set-Cookie") || "").split(";")[0];
ok(r.status === 201 && pc, "casal cria o acesso e já entra");
j = await (await call("GET", "/api/me", null, { ck: pc })).json();
ok(j.wedding.names === "Pétala & Lucas" && j.role === "owner", "acesso ligado ao casamento certo, como dono");
j = await (await call("GET", "/api/admin/guests", null, { ck: pc })).json();
ok(j.households.length === 1 && j.households[0].name.includes("Exemplo"), "casal vê só os próprios convites");
ok((await call("POST", "/api/auth/setup/" + setupTok, { name: "Outro", email: "x@exemplo.com", password: "outra-senha-longa" }, { ck: "" })).status === 404, "link de acesso só vale uma vez");
ok((await login("petala@exemplo.com", "uma-senha-bem-longa", "10.0.0.7")).r.status === 200, "depois, entra com e-mail e senha escolhidos");

/* ---------- sair ---------- */
await call("POST", "/api/auth/logout");
ok((await call("GET", "/api/me")).status === 401, "sair encerra a sessão");

console.log(`\n${passed} passaram, ${failed} falharam`);
