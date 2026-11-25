/** Módulo "van": pergunta "Quer ir de van?" dentro do RSVP, vagas/espera, painel, exportação e limpeza (LGPD). */
import { setup } from "./helpers.mjs";
import { PETALUCAS, DEMO } from "../scripts/seed.mjs";

const t = await setup();
const { ok, env } = t;
const db = env._db;
const TOKEN = PETALUCAS.token; // família de exemplo de P&L: Marina e João, 1 evento
const rsvp = (statuses, van, token = TOKEN, ip = "10.6.0.1") => t.json("POST", `/api/invite/${token}/rsvp`,
  { responses: [["g_pl_0", statuses[0]], ["g_pl_1", statuses[1]]].map(([guest_id, status]) => ({ guest_id, event_id: "e_pl", status })), details: [], note: "", ...(van !== undefined ? { van } : {}) }, { ck: "", ip });
const row = () => db.prepare("SELECT * FROM van_interessados WHERE household_id = 'h_pl_ex'").get();

/* ---------- convite traz a pergunta (P&L: ligada, WhatsApp obrigatório) ---------- */
let r = await t.json("GET", "/api/invite/" + TOKEN, null, { ck: "" });
const v = r.body.mods.van;
ok(v && v.texto.includes("deixe seu nome e WhatsApp") && v.exige_celular === true && v.mine === null && v.grupo === "" && !("items" in v), "convite de P&L: pergunta da van com o texto do casal, sem lista");
ok(!JSON.stringify((await t.json("GET", "/api/site/petala-e-lucas", null, { ck: "" })).body).includes("van_interessados") && !(await t.json("GET", "/api/site/petala-e-lucas", null, { ck: "" })).body.mods.van, "site público não recebe nada da van");
ok((await t.json("GET", "/api/invite/" + DEMO.tokens.andrade, null, { ck: "" })).body.mods.van === undefined, "casamento sem a van ligada: sem pergunta");

/* ---------- RSVP com van ---------- */
r = await rsvp(["yes", "yes"], { quer: true, pessoas: 2, celular: "" });
ok(r.status === 400 && /WhatsApp/.test(r.body.error) && !db.prepare("SELECT COUNT(*) AS n FROM rsvps WHERE guest_id = 'g_pl_0'").get().n, "WhatsApp obrigatório: recusa e não grava nem o RSVP");
ok((await rsvp(["yes", "yes"], { quer: true, pessoas: 2, celular: "(41) 3333-4444" })).status === 400, "telefone fixo não vale (precisa ser celular)");
ok((await rsvp(["yes", "no"], { quer: true, pessoas: 2, celular: "41999998888" })).status === 400, "mais pessoas na van do que confirmados: recusa");
r = await rsvp(["yes", "yes"], { quer: true, pessoas: 2, celular: "+55 (41) 99999-8888" });
ok(r.status === 200 && r.body.van?.quer === true && r.body.van.espera === false && r.body.van.grupo === "", "RSVP com van: gravado junto (sem grupo ainda)");
ok(row()?.pessoas === 2 && row().celular === "41999998888" && row().nome === "Marina e João" && !row().espera, "lista guarda a família, 2 pessoas e só os dígitos do WhatsApp");
r = await rsvp(["yes", "yes"]);
ok(r.status === 200 && row()?.pessoas === 2, "reenviar sem responder a van não mexe na lista");
r = await rsvp(["yes", "yes"], { quer: true, pessoas: 1, celular: "41988887777" });
ok(db.prepare("SELECT COUNT(*) AS n FROM van_interessados WHERE household_id = 'h_pl_ex'").get().n === 1 && row().pessoas === 1 && row().celular === "41988887777", "re-RSVP atualiza a mesma linha (uma por família)");
r = await t.json("GET", "/api/invite/" + TOKEN, null, { ck: "" });
ok(r.body.mods.van.mine?.pessoas === 1 && r.body.mods.van.mine.celular === "41988887777", "convite volta com a resposta da família preenchida");
r = await rsvp(["yes", "yes"], { quer: false });
ok(r.status === 200 && !row(), "“Não” tira a família da lista");
await rsvp(["yes", "yes"], { quer: true, pessoas: 2, celular: "41999998888" });
r = await rsvp(["no", "no"], { quer: true, pessoas: 2, celular: "41999998888" });
ok(r.status === 200 && !row(), "mudou o RSVP para “não vou”: sai da lista da van");

/* ---------- painel ---------- */
const sess = async (id, W, role) => {
  db.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt) VALUES (?, ?, ?, 'x', 'x')").run(id, id + "@exemplo.test", id);
  db.prepare("INSERT INTO memberships (user_id, wedding_id, role) VALUES (?, ?, ?)").run(id, W, role);
  const { sha256 } = await import("../src/lib.js");
  db.prepare("INSERT INTO sessions (id_hash, user_id, wedding_id, expires_at) VALUES (?, ?, ?, ?)").run(await sha256("s-" + id), id, W, new Date(Date.now() + 864e5).toISOString());
  return { ck: "__Host-sess=s-" + id };
};
const owner = await sess("pl_dono", "w_petalucas", "owner"), viewer = await sess("pl_ver", "w_petalucas", "viewer");
r = await t.json("PATCH", "/api/admin/van", { grupo_url: "https://evil.test/x" }, owner);
ok(r.status === 400, "link do grupo só do WhatsApp (chat.whatsapp.com)");
r = await t.json("PATCH", "/api/admin/van", { grupo_url: "https://chat.whatsapp.com/AbCdEfGhIjKlMn12", vagas: 2 }, owner);
ok(r.status === 200 && r.body.settings.grupo_url.startsWith("https://chat.whatsapp.com/") && r.body.settings.vagas === 2 && r.body.settings.exige_celular === true, "casal salva link do grupo e vagas");
ok((await t.json("PATCH", "/api/admin/van", { vagas: 2 }, viewer)).status === 403, "acesso só leitura não muda a van");
r = await rsvp(["yes", "yes"], { quer: true, pessoas: 2, celular: "41999998888" });
ok(r.body.van.grupo === "https://chat.whatsapp.com/AbCdEfGhIjKlMn12" && !r.body.van.espera, "depois do RSVP com van, a resposta traz o link do grupo");
ok((await t.json("GET", "/api/invite/" + TOKEN, null, { ck: "" })).body.mods.van.grupo.startsWith("https://chat.whatsapp.com/"), "ao voltar ao convite, quem está na lista vê o grupo");
// outra família ocupa as vagas: a próxima vai para a espera
db.prepare("INSERT INTO households (id, wedding_id, name, greeting, max_guests, token_hash) VALUES ('h_pl_t2', 'w_petalucas', 'Família Teste', 'Família Teste', 2, ?)").run(await (await import("../src/lib.js")).sha256("familia-teste-van-0123456789"));
db.prepare("INSERT INTO guests (id, wedding_id, household_id, name, sort) VALUES ('g_t2_0', 'w_petalucas', 'h_pl_t2', 'Ana Teste', 0), ('g_t2_1', 'w_petalucas', 'h_pl_t2', 'Beto Teste', 1)").run();
db.prepare("INSERT INTO invitations (household_id, event_id) VALUES ('h_pl_t2', 'e_pl')").run();
const rsvp2 = (van) => t.json("POST", "/api/invite/familia-teste-van-0123456789/rsvp", { responses: [{ guest_id: "g_t2_0", event_id: "e_pl", status: "yes" }, { guest_id: "g_t2_1", event_id: "e_pl", status: "yes" }], details: [], note: "", van }, { ck: "", ip: "10.6.0.2" });
r = await rsvp2({ quer: true, pessoas: 2, celular: "11987654321" });
ok(r.status === 200 && r.body.van.espera === true && r.body.van.grupo === "", "passou das vagas: entra na lista de espera (sem o link do grupo)");
ok((await t.json("GET", "/api/invite/familia-teste-van-0123456789", null, { ck: "" })).body.mods.van.esgotado === true, "convite avisa que as vagas acabaram");
r = await t.json("GET", "/api/admin/van", null, owner);
ok(r.status === 200 && r.body.items.length === 2 && r.body.totals.pessoas === 2 && r.body.totals.espera === 2 && r.body.items.find(x => x.espera).nome === "Família Teste" && r.body.items.every(x => !("household_id" in x) || x.household_id === undefined), "painel: lista, totais e quem está na espera");
const wait = r.body.items.find(x => x.espera).id;
r = await t.json("PATCH", "/api/admin/van/" + wait, { espera: false }, owner);
ok(r.status === 200 && r.body.totals.pessoas === 4 && r.body.totals.espera === 0, "casal passa alguém da espera para a lista");
r = await t.call("GET", "/api/admin/van/csv", undefined, owner);
const csv = await r.text();
ok(r.status === 200 && /text\/csv/.test(r.headers.get("Content-Type")) && csv.includes("Marina e João;2;41999998888") && csv.includes("Família Teste"), "planilha CSV com a lista");
ok((await t.json("GET", "/api/admin/van", null, { ck: "" })).status === 401, "lista exige login");
await t.loginDemo();
ok((await t.json("GET", "/api/admin/van")).body.items.length === 0 && (await t.json("DELETE", "/api/admin/van/" + wait)).status === 404, "outro casal não vê nem apaga a lista de P&L");
r = await t.json("DELETE", "/api/admin/van/" + wait, null, owner);
ok(r.status === 200 && r.body.items.length === 1, "casal apaga um interessado");

/* ---------- LGPD: exportação e limpeza ---------- */
r = await t.json("GET", "/api/admin/export", null, owner);
ok(r.status === 200 && r.body.van?.interessados?.length === 1 && r.body.van.interessados[0].celular === "41999998888", "exportação completa inclui a lista da van");
const { MODS } = await import("../src/mods/index.js");
await MODS.find(m => m.name === "van").purgeGuests(env, "w_petalucas");
ok(db.prepare("SELECT COUNT(*) AS n FROM van_interessados WHERE wedding_id = 'w_petalucas'").get().n === 0, "limpeza dos dados dos convidados apaga a lista da van");

/* ---------- desligada ---------- */
await t.json("PATCH", "/api/admin/van", { on: false }, owner);
ok((await t.json("GET", "/api/invite/" + TOKEN, null, { ck: "" })).body.mods.van === undefined, "desligada: o convite não pergunta");
r = await rsvp(["yes", "yes"], { quer: true, pessoas: 2, celular: "41999998888" });
ok(r.status === 200 && !r.body.van && !row(), "desligada: a resposta da van é ignorada");

t.done("van");
