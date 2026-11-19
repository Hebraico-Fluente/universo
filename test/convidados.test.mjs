/** Testes do módulo "convidados": menu, acompanhantes, lista de espera, lembretes, mesas, isolamento e limpeza (LGPD). */
import { setup } from "./helpers.mjs";
import { DEMO } from "../scripts/seed.mjs";
import { runCron } from "../src/worker.js";
import { hashPassword } from "../src/lib.js";

const t = await setup();
const { ok, env } = t;
const db = env._db;
await t.loginDemo();
const lia = (await t.login(DEMO.other.email, DEMO.other.password, "10.0.0.8")).cookie;
const asLia = { ck: lia };
const inv = async tok => (await t.json("GET", "/api/invite/" + tok)).body;
let r, j;

/* ---------- cardápio por evento ---------- */
r = await t.json("POST", "/api/admin/convidados/menus", { event_id: "e_festa", name: "Carne", description: "Filé ao molho de vinho" });
const carne = r.body.id;
ok(r.status === 201 && carne, "casal cadastra opção de menu num evento");
const peixe = (await t.json("POST", "/api/admin/convidados/menus", { event_id: "e_festa", name: "Peixe" })).body.id;
const vegJantar = (await t.json("POST", "/api/admin/convidados/menus", { event_id: "e_jantar", name: "Risoto" })).body.id;
ok((await t.json("POST", "/api/admin/convidados/menus", { event_id: "e_w_lia", name: "Carne" })).status === 400, "não cria menu em evento de outro casamento");
ok((await t.json("POST", "/api/admin/convidados/menus", { event_id: "e_festa", name: "" })).status === 400, "opção de menu sem nome é recusada");
j = (await t.json("GET", "/api/admin/convidados")).body;
ok(j.menus.length === 3 && j.menus.filter(m => m.event_id === "e_festa").length === 2, "painel lista as opções por evento");

let marina = await inv(DEMO.tokens.marina);
ok(marina.mods.convidados.menus.length === 2 && marina.mods.convidados.menus.every(m => m.event_id === "e_festa"), "convite só traz o menu dos eventos da família");
let lucia = await inv(DEMO.tokens.lucia);
const [lu, beto] = lucia.guests;
r = await t.json("POST", `/api/invite/${DEMO.tokens.lucia}/rsvp`, { responses: [
  { guest_id: lu.id, event_id: "e_festa", status: "yes", menu: carne }, { guest_id: lu.id, event_id: "e_jantar", status: "yes", menu: vegJantar }, { guest_id: lu.id, event_id: "e_cerimonia", status: "yes" },
  { guest_id: beto.id, event_id: "e_festa", status: "no", menu: peixe }, { guest_id: beto.id, event_id: "e_jantar", status: "no" }, { guest_id: beto.id, event_id: "e_cerimonia", status: "yes" }] });
ok(r.status === 200, "convidado escolhe o prato por pessoa e por evento");
lucia = await inv(DEMO.tokens.lucia);
ok(lucia.responses.find(x => x.guest_id === lu.id && x.event_id === "e_festa").menu_option_id === carne, "escolha de prato fica salva");
ok(lucia.responses.find(x => x.guest_id === beto.id && x.event_id === "e_festa").menu_option_id === null, "quem não vai não fica com prato escolhido");
r = await t.json("POST", `/api/invite/${DEMO.tokens.lucia}/rsvp`, { responses: [{ guest_id: lu.id, event_id: "e_festa", status: "yes", menu: vegJantar }] });
ok(r.status === 400 && r.body.code === "invalid_menu", "não aceita prato de outro evento");
j = (await t.json("GET", "/api/admin/guests")).body;
ok(j.households.find(h => h.id === "h_lucia").guests[0].menus.e_festa === carne, "painel mostra o prato de cada pessoa");
ok((await t.json("DELETE", `/api/admin/convidados/menus/${peixe}`, null, asLia)).status === 404, "outro casal não apaga menu alheio");
ok((await t.json("DELETE", `/api/admin/convidados/menus/${peixe}`)).status === 200, "casal apaga opção de menu");

/* ---------- acompanhantes ---------- */
ok((await t.json("POST", `/api/invite/${DEMO.tokens.marina}/acompanhantes`, { name: "Pedro Teste" })).status === 409, "sem vaga extra, não dá para adicionar acompanhante");
ok((await t.json("PATCH", "/api/admin/convidados/households/h_marina", { max_guests: 0 })).status === 400, "total de lugares não fica abaixo das pessoas do convite");
ok((await t.json("PATCH", "/api/admin/convidados/households/h_marina", { max_guests: 2 }, asLia)).status === 404, "outro casal não muda vagas de convite alheio");
ok((await t.json("PATCH", "/api/admin/convidados/households/h_marina", { max_guests: 2 })).status === 200, "casal libera uma vaga de acompanhante");
ok((await t.json("POST", `/api/invite/${DEMO.tokens.marina}/acompanhantes`, { name: "Pedro" }, { origin: "https://golpe.com" })).status === 403, "acompanhante só a partir do próprio site (CSRF)");
ok((await t.json("POST", `/api/invite/${DEMO.tokens.marina}/acompanhantes`, { name: "P" })).status === 400, "nome do acompanhante é validado");
r = await t.json("POST", `/api/invite/${DEMO.tokens.marina}/acompanhantes`, { name: "Pedro Teste" });
const pedro = r.body.id;
ok(r.status === 201 && pedro, "convidado adiciona o nome do acompanhante");
ok((await t.json("POST", `/api/invite/${DEMO.tokens.marina}/acompanhantes`, { name: "Mais Um" })).status === 409, "não passa do limite de vagas");
marina = await inv(DEMO.tokens.marina);
ok(marina.guests.length === 2 && marina.guests[1].is_plus_one === true && marina.guests[1].name === "Pedro Teste", "acompanhante aparece no convite");
r = await t.json("POST", `/api/invite/${DEMO.tokens.marina}/rsvp`, { responses: [{ guest_id: pedro, event_id: "e_festa", status: "yes", menu: carne }, { guest_id: pedro, event_id: "e_cerimonia", status: "yes" }] });
ok(r.status === 200, "acompanhante responde como qualquer pessoa do convite");
ok((await t.json("DELETE", `/api/invite/${DEMO.tokens.andrade}/acompanhantes/${pedro}`)).status === 404, "outra família não remove o acompanhante");
ok((await t.json("DELETE", `/api/invite/${DEMO.tokens.marina}/acompanhantes/h_marina_g0`)).status === 404, "só acompanhantes podem ser removidos pelo convite");
r = await t.json("POST", "/api/admin/households", { name: "Família Vagas", guests: [{ name: "Rita Vagas" }], events: ["e_festa"], extra_slots: 2 });
ok(r.status === 201 && db.prepare("SELECT max_guests FROM households WHERE id = ?").get(r.body.id).max_guests === 3, "nova família pode ter vagas extras");
ok((await t.json("POST", "/api/admin/households", { name: "Demais", guests: [{ name: "Rita Vagas" }], events: ["e_festa"], extra_slots: 25 })).status === 400, "vagas extras têm limite");

/* ---------- lista de espera ---------- */
r = await t.json("POST", "/api/admin/households", { name: "Família Espera", greeting: "Nina e Caio", guests: [{ name: "Nina Espera" }, { name: "Caio Espera" }], events: ["e_cerimonia", "e_festa"], waitlist: true });
const espera = r.body.id;
ok(r.status === 201 && r.body.link === null && r.body.waitlist === true, "família na lista de espera é criada sem link");
r = await t.json("POST", "/api/admin/households", { name: "Família Grande Espera", guests: [1, 2, 3, 4, 5].map(i => ({ name: "Pessoa " + i })), events: ["e_festa"], waitlist: true });
const grande = r.body.id;
j = (await t.json("GET", "/api/admin/guests")).body;
const esp = j.households.find(h => h.id === espera);
ok(esp.waitlist === true && !esp.has_link, "painel identifica quem está na lista de espera");
j = (await t.json("GET", "/api/admin/convidados")).body;
// recusas na festa: Marina (seed) + Beto (acima) = 2 lugares
ok(j.waitlist.freed === 2 && j.waitlist.available === 2 && j.waitlist.households.includes(espera) && !j.waitlist.households.includes(grande), "recusas liberam lugares e o painel sugere quem cabe da lista de espera");
ok((await t.json("POST", `/api/admin/convidados/households/${espera}/promote`, null, asLia)).status === 404, "outro casal não promove família alheia");
r = await t.json("POST", `/api/admin/convidados/households/${espera}/promote`);
const espTok = r.body.link?.split("/i/")[1];
ok(r.status === 200 && espTok && (await t.json("GET", "/api/invite/" + espTok)).status === 200, "promover com um clique gera o link e o convite abre");
ok((await t.json("POST", `/api/admin/convidados/households/${espera}/promote`)).status === 409, "não promove duas vezes");
j = (await t.json("GET", "/api/admin/convidados")).body;
ok(j.waitlist.used === 2 && j.waitlist.available === 0 && j.waitlist.households.length === 0, "lugares ocupados pela promoção saem da sugestão");
ok((await t.json("PATCH", "/api/admin/convidados/households/h_andrade", { waitlist: true })).status === 409, "quem já respondeu não volta para a lista de espera");
r = await t.json("PATCH", `/api/admin/convidados/households/${espera}`, { waitlist: true });
ok(r.status === 200 && (await t.json("GET", "/api/invite/" + espTok)).status === 404, "voltar para a lista de espera desativa o link");
r = await t.json("POST", `/api/admin/households/${grande}/link`);
ok(r.status === 200 && db.prepare("SELECT waitlist FROM households WHERE id = ?").get(grande).waitlist === 0, "gerar link pelo botão normal também tira da lista de espera");

/* ---------- lembretes ---------- */
r = await t.json("POST", "/api/admin/convidados/households/h_lucas/reminded");
ok(r.status === 200 && db.prepare("SELECT reminded_at FROM households WHERE id = 'h_lucas'").get().reminded_at, "painel registra o lembrete enviado");
ok((await t.json("POST", "/api/admin/convidados/households/h_lucas/reminded", null, asLia)).status === 404, "outro casal não mexe nos lembretes alheios");
j = (await t.json("GET", "/api/admin/overview")).body;
ok(j.mods.convidados.alerts.some(a => a.text.includes("ainda não respond")), "visão geral avisa quem com link ativo não respondeu");

/* ---------- confirmar presença pelo nome (site público) ---------- */
const byName = (name, slug = "helena-e-rafael", opts = {}) => t.json("POST", `/api/site/${slug}/presenca`, { name }, { ip: "40.0.0." + (opts.n ?? 1), ...opts });
ok((await t.json("GET", "/api/site/helena-e-rafael")).body.mods.convidados.rsvp_by_name === true, "site sabe que dá para confirmar pelo nome (padrão: ligado)");
r = await byName("  CÁRLA   andrade ");
const tmp = r.body.token;
ok(r.status === 201 && tmp && !JSON.stringify(r.body).includes("Andrade"), "nome completo exato (sem acento/maiúsculas/espaços) acha a família e só devolve um token");
j = (await t.json("GET", "/api/invite/" + tmp)).body;
ok(j.household.greeting === "Carla, Paulo, Sofia e Theo" && j.guests.length === 4, "token temporário abre o mesmo RSVP da família");
ok(db.prepare("SELECT COUNT(*) AS n FROM rsvp_name_tokens WHERE token_hash = ?").get(tmp).n === 0, "token temporário guardado só como hash");
r = await t.json("POST", `/api/invite/${tmp}/rsvp`, { responses: [{ guest_id: "h_andrade_g0", event_id: "e_festa", status: "yes", menu: carne }] });
ok(r.status === 200, "confirma pelo site com os mesmos endpoints do convite");
r = await byName("Carla", undefined, { n: 2 });
ok(r.status === 404 && r.body.code === "name_not_found" && r.body.error.startsWith("Não encontramos seu nome"), "nome parcial não acha (resposta genérica)");
ok((await byName("Carla Andrad", undefined, { n: 2 })).status === 404, "nada de busca aproximada");
await t.json("POST", "/api/admin/households", { name: "Dupla 1", guests: [{ name: "Ana Duplicada" }], events: ["e_festa"] });
await t.json("POST", "/api/admin/households", { name: "Dupla 2", guests: [{ name: "Ana  Duplicada" }], events: ["e_festa"] });
const amb = await byName("Ana Duplicada", undefined, { n: 3 }), none = await byName("Pessoa Inexistente", undefined, { n: 3 });
ok(amb.status === 404 && JSON.stringify(amb.body) === JSON.stringify(none.body), "nome ambíguo tem a mesma resposta de 'não encontrado'");
ok((await byName("Nina Espera", undefined, { n: 4 })).status === 404, "lista de espera não confirma pelo site");
const rita = db.prepare("SELECT household_id FROM guests WHERE name = 'Rita Vagas'").get().household_id;
await t.json("POST", `/api/admin/households/${rita}/revoke`);
ok((await byName("Rita Vagas", undefined, { n: 4 })).status === 404, "link revogado não confirma pelo site");
ok((await byName("Carla Andrade", "lia-e-tomas", { n: 5 })).status === 404 && (await byName("Pessoa de outro casamento", undefined, { n: 5 })).status === 404, "só acha convidados do próprio casal");
ok((await byName("Carla Andrade", undefined, { n: 6, origin: "https://golpe.com" })).status === 403, "confirmar pelo nome só a partir do próprio site (CSRF)");
let lim = 0; for (let i = 0; i < 13; i++) if ((await byName("Tentativa " + i, undefined, { n: 7 })).status === 429) lim++;
ok(lim >= 3, "tentativas pelo nome são limitadas por IP (10 por hora)");
db.prepare("UPDATE rsvp_name_tokens SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
ok((await t.json("GET", "/api/invite/" + tmp)).status === 404 && (await t.json("POST", `/api/invite/${tmp}/rsvp`, { responses: [{ guest_id: "h_andrade_g0", event_id: "e_festa", status: "no" }] })).status === 404, "token temporário expira");
const tmp2 = (await byName("Paulo Andrade", undefined, { n: 8 })).body.token;
ok((await t.json("PATCH", "/api/admin/convidados/settings", { rsvp_by_name: "não" })).status === 400, "interruptor validado");
ok((await t.json("PATCH", "/api/admin/convidados/settings", { rsvp_by_name: false })).status === 200, "casal desliga a confirmação pelo site");
ok((await byName("Paulo Andrade", undefined, { n: 9 })).status === 404 && (await t.json("GET", "/api/invite/" + tmp2)).status === 404, "desligado: 404 e tokens temporários param de valer");
ok((await t.json("GET", "/api/site/helena-e-rafael")).body.mods.convidados.rsvp_by_name === false, "site esconde o formulário quando desligado");
ok((await t.json("GET", "/api/site/lia-e-tomas")).body.mods.convidados.rsvp_by_name === true, "interruptor de um casal não afeta outro");
await t.json("PATCH", "/api/admin/convidados/settings", { rsvp_by_name: true });
ok((await t.json("GET", "/api/admin/convidados")).body.rsvp_by_name === true, "painel mostra o interruptor ligado");

/* ---------- mesas ---------- */
j = (await t.json("GET", "/api/admin/mesas")).body;
ok(j.event_id === "e_festa" && j.tables.length === 0, "mesas usam o último evento (a festa) por padrão");
ok(j.guests.every(g => g.confirmed) && j.guests.some(g => g.name === "Carla Andrade") && !j.guests.some(g => g.name === "Marina Costa"), "só confirmados na festa aparecem para sentar");
r = await t.json("POST", "/api/admin/mesas/tables", { name: "Família da noiva", shape: "round", seats: 4, x: 20, y: 30 });
const t1 = r.body.id;
ok(r.status === 201 && r.body.seats === 4, "cria mesa redonda com capacidade e posição");
r = await t.json("POST", "/api/admin/mesas/tables", { shape: "rect", seats: 10 });
const t2 = r.body.id;
ok(r.status === 201 && r.body.name === "Mesa 2" && r.body.shape === "rect", "cria mesa retangular com nome automático");
ok((await t.json("POST", "/api/admin/mesas/tables", { shape: "hexagonal" })).status === 400, "formato de mesa é validado");
ok((await t.json("POST", "/api/admin/mesas/tables", { seats: 0 })).status === 400, "capacidade é validada");
ok((await t.json("PATCH", `/api/admin/mesas/tables/${t1}`, { x: 150 })).status === 400, "posição fora da planta é recusada");
r = await t.json("PATCH", `/api/admin/mesas/tables/${t1}`, { x: 64.25, y: 70 });
ok(r.status === 200 && db.prepare("SELECT x, y FROM seating_tables WHERE id = ?").get(t1).x === 64.3, "arrastar salva a posição x/y");
r = await t.json("POST", "/api/admin/mesas/items", { kind: "pista" });
const pista = r.body.id;
ok(r.status === 201 && r.body.label === "Pista de dança", "adiciona elemento fixo (pista)");
ok((await t.json("POST", "/api/admin/mesas/items", { kind: "piscina" })).status === 400, "tipo de elemento é validado");
ok((await t.json("PATCH", `/api/admin/mesas/items/${pista}`, { x: 50, y: 10 })).status === 200, "move elemento fixo");
const andrade = j.guests.filter(g => g.household_id === "h_andrade").map(g => g.id);
r = await t.json("POST", "/api/admin/mesas/seats", { assignments: [...andrade, "h_rossi_g0"].map(id => ({ guest_id: id, table_id: t1 })) });
j = (await t.json("GET", "/api/admin/mesas")).body;
ok(r.status === 200 && j.guests.filter(g => g.table_id === t1).length === 5, "coloca pessoas na mesa (e permite passar da capacidade)");
r = await t.json("POST", "/api/admin/mesas/seats", { assignments: [{ guest_id: "h_rossi_g0", table_id: t2 }, { guest_id: andrade[0], table_id: null }] });
j = (await t.json("GET", "/api/admin/mesas")).body;
ok(j.guests.find(g => g.id === "h_rossi_g0").table_id === t2 && !j.guests.find(g => g.id === andrade[0]).table_id, "move entre mesas e tira da mesa");
ok((await t.json("POST", "/api/admin/mesas/seats", { assignments: [{ guest_id: "g_w_lia", table_id: t1 }] })).status === 400, "não senta pessoa de outro casamento");
const liaTable = (await t.json("POST", "/api/admin/mesas/tables", { name: "Mesa da Lia" }, asLia)).body.id;
ok((await t.json("POST", "/api/admin/mesas/seats", { assignments: [{ guest_id: andrade[1], table_id: liaTable }] })).status === 400, "não usa mesa de outro casamento");
ok((await t.json("POST", "/api/admin/mesas/seats", { assignments: [{ guest_id: andrade[1], table_id: liaTable }] }, asLia)).status === 400, "outro casal não senta convidados alheios");
ok((await t.json("PATCH", `/api/admin/mesas/tables/${t1}`, { name: "Invadida" }, asLia)).status === 404 && (await t.json("DELETE", `/api/admin/mesas/tables/${t1}`, null, asLia)).status === 404, "outro casal não altera nem apaga mesa alheia");
ok((await t.json("DELETE", `/api/admin/mesas/items/${pista}`, null, asLia)).status === 404, "outro casal não apaga elemento alheio");
j = (await t.json("GET", "/api/admin/mesas", null, asLia)).body;
ok(j.tables.length === 1 && j.tables[0].name === "Mesa da Lia" && j.items.length === 0 && j.guests.length === 0, "outro casal só vê a própria planta");
let andradeInv = await inv(DEMO.tokens.andrade);
ok(andradeInv.mods.convidados.tables === null, "convite não mostra mesa enquanto o casal não libera");
ok((await t.json("PATCH", "/api/admin/mesas", { show_tables: "sim" })).status === 400, "toggle validado");
ok((await t.json("PATCH", "/api/admin/mesas", { show_tables: true })).status === 200, "casal libera as mesas para os convidados");
andradeInv = await inv(DEMO.tokens.andrade);
ok(andradeInv.mods.convidados.tables.length === 3 && andradeInv.mods.convidados.tables.every(x => x.table_name === "Família da noiva") && !JSON.stringify(andradeInv.mods).includes("Rossi"), "convidado vê a própria mesa (e só a da família)");
ok((await t.json("PATCH", "/api/admin/mesas", { event_id: "e_w_lia" })).status === 400, "evento das mesas precisa ser deste casamento");
ok((await t.json("DELETE", `/api/admin/mesas/tables/${t2}`)).status === 200 && db.prepare("SELECT COUNT(*) AS n FROM seat_assignments WHERE table_id = ?").get(t2).n === 0, "apagar mesa devolve as pessoas para 'sem mesa'");

/* ---------- privacidade ---------- */
j = (await t.json("GET", "/api/admin/privacidade")).body;
ok(j.retention_days === 60 && j.purge_on === "2027-12-15" && j.can_edit && j.counts.guests > 0, "painel mostra prazo e data da limpeza (casamento + 60 dias)");
ok((await inv(DEMO.tokens.andrade)).mods.convidados.purge_on === "2027-12-15", "convite recebe a data real da limpeza");
ok((await t.json("PATCH", "/api/admin/privacidade", { retention_days: 10 })).status === 400 && (await t.json("PATCH", "/api/admin/privacidade", { retention_days: 400 })).status === 400, "prazo fica entre 30 e 365 dias");
r = await t.json("PATCH", "/api/admin/privacidade", { retention_days: 90 });
ok(r.status === 200 && r.body.purge_on === "2028-01-14", "dono muda o prazo");
// planejador(a) entra no painel, mas não muda prazo nem apaga
const pw = await hashPassword("senha-da-cerimonialista");
db.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt) VALUES ('u_plan', 'plan@exemplo.com', 'Cerimonial', ?, ?)").run(pw.hash, pw.salt);
db.prepare("INSERT INTO memberships (user_id, wedding_id, role) VALUES ('u_plan', 'w_demo', 'planner')").run();
const plan = { ck: (await t.login("plan@exemplo.com", "senha-da-cerimonialista", "10.0.0.6")).cookie };
ok((await t.json("GET", "/api/admin/privacidade", null, plan)).body.can_edit === false, "planejador vê a privacidade só para leitura");
ok((await t.json("PATCH", "/api/admin/privacidade", { retention_days: 30 }, plan)).status === 403, "planejador não muda o prazo");
ok((await t.json("POST", "/api/admin/privacidade/apagar", { confirm: "Helena & Rafael" }, plan)).status === 403, "planejador não apaga os dados");

r = await t.call("GET", "/api/admin/export");
j = await r.json();
const ex = j.convidados || j; // módulos podem vir aninhados (mods por nome) ou mesclados no topo
ok(Array.isArray(ex.menu_options) && ex.menu_options.length === 2 && ex.seating_tables.length === 1 && ex.seat_assignments.length >= 1 && ex.floor_items.length === 1 && ex.privacy.retention_days === 90, "exportação inclui cardápio, mesas, lugares, planta e prazo de limpeza");
ok(j.rsvps.some(x => x.menu_option_id === carne) && j.guests.some(g => g.is_plus_one === 1), "exportação inclui pratos e acompanhantes");

// exclusão manual (Lia & Tomás)
ok((await t.json("POST", "/api/admin/privacidade/apagar", { confirm: "Lia e Tomás" }, asLia)).status === 400, "exclusão manual exige o nome exato do casal");
ok((await t.json("POST", "/api/admin/privacidade/apagar", { confirm: "Lia & Tomás" }, { ck: lia, origin: "https://golpe.com" })).status === 403, "exclusão manual só a partir do painel (CSRF)");
r = await t.json("POST", "/api/admin/privacidade/apagar", { confirm: "  lia & tomás " }, asLia);
ok(r.status === 200 && r.body.deleted.guests === 1, "dono apaga os dados dos convidados agora");
ok(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_lia'").get().n === 0 && db.prepare("SELECT guests_purged_at FROM weddings WHERE id = 'w_lia'").get().guests_purged_at, "dados apagados e data da limpeza registrada");
ok(db.prepare("SELECT COUNT(*) AS n FROM seating_tables WHERE wedding_id = 'w_lia'").get().n === 1, "mesas (sem nomes) continuam para o casal");
ok(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_demo'").get().n > 0, "exclusão de um casal não toca nos outros");
ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE wedding_id = 'w_lia' AND action = 'guests.purge'").get().n === 1, "exclusão manual fica na auditoria");

// rotina diária: Pétala & Lucas (20/02/2027 + 60 = 21/04/2027) vence antes; Helena & Rafael (+90) só em 14/01/2028
db.prepare("INSERT INTO gift_notices (id, wedding_id, gift, cents, author) VALUES ('p_pl', 'w_petalucas', 'Pizza', 15000, 'Alguém')").run();
await runCron(env, new Date("2027-04-20T06:23:00Z"));
ok(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_petalucas'").get().n === 2, "rotina não apaga antes do prazo");
await runCron(env, new Date("2027-04-21T06:23:00Z"));
ok(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_petalucas'").get().n === 0
  && db.prepare("SELECT COUNT(*) AS n FROM households WHERE wedding_id = 'w_petalucas'").get().n === 0
  && db.prepare("SELECT COUNT(*) AS n FROM gift_notices WHERE wedding_id = 'w_petalucas'").get().n === 0, "rotina apaga convidados, convites e avisos de quem passou do prazo");
ok(db.prepare("SELECT guests_purged_at FROM weddings WHERE id = 'w_petalucas'").get().guests_purged_at, "rotina marca guests_purged_at");
ok(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_demo'").get().n > 0 && db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_clara'").get().n === 1, "rotina não toca em quem ainda está no prazo");
ok((await t.json("GET", "/api/invite/" + "exemplo-petala-e-lucas-2027")).status === 404, "link de convite deixa de abrir depois da limpeza");
await runCron(env, new Date("2028-01-14T06:23:00Z"));
ok(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_demo'").get().n === 0
  && db.prepare("SELECT COUNT(*) AS n FROM rsvps").get().n === 0 + db.prepare("SELECT COUNT(*) AS n FROM rsvps r JOIN guests g ON g.id = r.guest_id").get().n
  && db.prepare("SELECT COUNT(*) AS n FROM seat_assignments WHERE wedding_id = 'w_demo'").get().n === 0, "prazo de 90 dias respeitado: limpeza com respostas e lugares");
ok(db.prepare("SELECT COUNT(*) AS n FROM guests WHERE wedding_id = 'w_clara'").get().n === 1, "casamento de 2028 continua intacto");
j = (await t.json("GET", "/api/admin/privacidade")).body;
ok(j.purged_at && j.counts.guests === 0, "painel mostra que a limpeza já foi feita");
ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor = 'system:cron' AND action = 'guests.purge'").get().n === 2, "limpezas da rotina ficam na auditoria");

t.done("convidados");
