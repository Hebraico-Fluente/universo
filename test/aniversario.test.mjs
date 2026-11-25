/** Módulo aniversario: e-mail da cápsula do tempo aos 6 meses e 1 ano (e 5/10 anos para cápsulas antigas). */
import { setup } from "./helpers.mjs";
import { runCron } from "../src/worker.js";
import { sha256 } from "../src/lib.js";
import { anniversaryEmail } from "../src/mods/aniversario.js";

const t = await setup();
const { ok, env } = t;
const db = env._db;

/* ---------- Resend falso ---------- */
const sent = [];
let mode = "ok";
globalThis.fetch = async (url, init = {}) => {
  if (String(url) !== "https://api.resend.com/emails") throw new Error("rede não esperada: " + url);
  const b = JSON.parse(init.body);
  if (mode === "fail") return new Response(JSON.stringify({ message: "erro" }), { status: 500 });
  sent.push({ auth: init.headers.Authorization, ...b });
  return new Response(JSON.stringify({ id: "em_" + sent.length }), { status: 200 });
};
const cron = d => runCron(env, new Date(d + "T12:00:00Z"));
const marked = W => db.prepare("SELECT meses FROM aniversarios_enviados WHERE wedding_id = ? ORDER BY meses").all(W).map(r => r.meses);
const to = W => sent.filter(m => m.to[0].endsWith("@" + W + ".exemplo.test"));

/* ---------- casamentos de teste ---------- */
const wed = (id, date, extra = {}) => {
  const o = { id, slug: id.replace(/_/g, "-"), names: `Ana & Bia (${id})`, date_iso: date + "T16:00:00-03:00", rsvp_deadline: date, ...extra };
  db.prepare(`INSERT INTO weddings (${Object.keys(o).join(", ")}) VALUES (${Object.keys(o).map(() => "?").join(", ")})`).run(...Object.values(o));
};
const member = (W, name, role) => {
  const id = "u_" + W + "_" + name;
  db.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt) VALUES (?, ?, ?, 'x', 'x')").run(id, `${name}@${W}.exemplo.test`, name);
  db.prepare("INSERT INTO memberships (user_id, wedding_id, role) VALUES (?, ?, ?)").run(id, W, role);
};
const couple = (W, date, extra) => { wed(W, date, extra); member(W, "ana", "owner"); member(W, "bia", "owner"); member(W, "cerimonial", "planner"); };
couple("w_a", "2025-03-10");
couple("w_b", "2024-02-29");                       // 29/02: 1 ano depois = 28/02/2025
couple("w_c", "2025-05-05");                       // rotina perdida: envia 4 dias depois
couple("w_d", "2025-05-01");                       // 8 dias depois: fora da janela
couple("w_e", "2025-06-15");                       // Resend falha no dia: tenta no seguinte
couple("w_demo2", "2025-03-10", { is_demo: 1 });
couple("w_susp", "2025-03-10", { suspended: 1 });
couple("w_flag", "2025-03-10", { features_json: JSON.stringify({ aniversario: false }) });
// cápsulas de w_a: uma de 1 ano (nova) e uma antiga de 5 anos (anterior à migração 0078)
db.prepare("INSERT INTO capsules (id, wedding_id, author, message, years, months) VALUES ('cp_a12', 'w_a', 'Tia Rosa', 'SEGREDO-DA-CAPSULA', 1, 12)").run();
db.prepare("INSERT INTO capsules (id, wedding_id, author, message, years, months) VALUES ('cp_a60', 'w_a', 'Avó Lia', 'carta antiga', 5, 60)").run();
db.prepare("UPDATE capsules SET months = NULL WHERE id = 'cp_a60'").run(); // linha antiga: só years

/* ---------- sem chave: não envia e não marca ---------- */
await cron("2025-09-10");
ok(sent.length === 0 && marked("w_a").length === 0, "sem RESEND_API_KEY: nada é enviado nem marcado");
env.RESEND_API_KEY = "re_teste_falso";
env.MAIL_FROM = "Gueta Studio <casamentos@exemplo.test>";
env.PANEL_ORIGIN = "https://painel.exemplo.test";
await cron("2025-09-11");
ok(to("w_a").length === 2 && marked("w_a").join() === "6", "configurada depois: sai no dia seguinte (dentro da janela) e marca");

/* ---------- 6 meses: nota sem cápsulas ---------- */
{
  const m = to("w_a")[0];
  ok(m.subject === "Hoje faz 6 meses do casamento de vocês" && m.text.includes("https://painel.exemplo.test/painel") && m.html.includes("Abrir o painel"), "6 meses sem cápsulas: nota de aniversário apontando para o painel");
  ok(m.auth === "Bearer re_teste_falso" && m.from === env.MAIL_FROM && !/<img/i.test(m.html) && m.html.includes("Enviado pelo Gueta Studio") && /responder/.test(m.text), "Resend com a chave; sem pixel de rastreio; rodapé com como parar de receber");
  ok(to("w_a").map(x => x.to[0]).sort().join() === "ana@w_a.exemplo.test,bia@w_a.exemplo.test", "um e-mail por noivo (owner); cerimonial (planner) não recebe");
}

/* ---------- meses sem marco: nada ---------- */
let n = sent.length;
await cron("2025-11-25"); // 8 meses e meio de w_a (os 6 meses de w_c e w_d foram no começo de novembro: fora da janela)
await cron("2026-01-10"); // 10 meses
ok(sent.length === n, "8 e 10 meses: nenhum e-mail");

/* ---------- 1 ano: a cápsula abriu ---------- */
await cron("2026-03-10");
{
  const m = to("w_a").filter(x => x.subject.startsWith("Hoje faz 1 ano"));
  ok(m.length === 2 && m[0].subject === "Hoje faz 1 ano: a cápsula do tempo de vocês abriu", "1 ano: assunto da cápsula aberta");
  ok(m[0].text.includes("1 mensagem") && !m[0].html.includes("SEGREDO-DA-CAPSULA") && !m[0].text.includes("Tia Rosa"), "o e-mail diz só quantas mensagens abriram, nunca o conteúdo nem quem escreveu");
  ok(db.prepare("SELECT opened_at FROM capsules WHERE id = 'cp_a12'").get().opened_at && !db.prepare("SELECT opened_at FROM capsules WHERE id = 'cp_a60'").get().opened_at, "a rotina abre a cápsula de 1 ano antes de avisar (a de 5 anos segue lacrada)");
  ok(marked("w_a").join() === "6,12", "marca 6 e 12 meses");
}
ok(to("w_demo2").length === 0 && to("w_susp").length === 0 && to("w_flag").length === 0 && !marked("w_demo2").length && !marked("w_susp").length && !marked("w_flag").length,
  "demonstração, suspenso e funcionalidade desligada: sem e-mail");
n = sent.length;
await cron("2026-03-10");
await cron("2026-03-12");
ok(sent.length === n, "rodar de novo (mesmo dia e dentro da janela) não reenvia");

/* ---------- 29/02 ---------- */
ok(to("w_b").length === 0, "29/02: nada antes");
await cron("2025-02-28");
ok(to("w_b").filter(x => x.subject.startsWith("Hoje faz 1 ano")).length === 2 && marked("w_b").includes(12), "casou em 29/02: o 1 ano é em 28/02 do ano não bissexto");

/* ---------- rotina perdida ---------- */
await cron("2026-05-09");
ok(to("w_c").filter(x => x.subject.startsWith("Hoje faz 1 ano")).length === 2, "rotina parada por 4 dias: ainda envia (janela de 7 dias)");
ok(!to("w_d").some(x => x.subject.startsWith("Hoje faz 1 ano")) && !marked("w_d").includes(12), "8 dias depois do marco: não envia mais");

/* ---------- falha na Resend: tenta no dia seguinte ---------- */
mode = "fail";
await cron("2026-06-15");
ok(!marked("w_e").includes(12), "Resend falhou: a reserva é desfeita");
mode = "ok";
await cron("2026-06-16");
ok(to("w_e").filter(x => x.subject.startsWith("Hoje faz 1 ano")).length === 2 && marked("w_e").includes(12), "no dia seguinte sai o e-mail");
n = sent.length;
await cron("2027-03-10");
ok(sent.length === n, "2 anos: nenhum e-mail");

/* ---------- simulação: só o administrador da plataforma ---------- */
await t.loginDemo();
let r = await t.json("GET", "/api/platform/aniversarios?data=2030-03-10");
ok(r.status === 401 || r.status === 403, "casal não acessa a simulação");
r = await t.json("GET", "/api/platform/aniversarios?data=2030-03-10", null, { ck: "" });
ok(r.status === 401, "sem sessão: 401");
db.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt, platform_role) VALUES ('u_adm', 'adm@exemplo.test', 'Adm', 'x', 'x', 'admin')").run();
db.prepare("INSERT INTO platform_sessions (id_hash, user_id, expires_at) VALUES (?, 'u_adm', ?)").run(await sha256("sessao-admin-aniversario"), new Date(Date.now() + 864e5).toISOString());
const adm = { ck: "__Host-plat=sessao-admin-aniversario" };
r = await t.json("GET", "/api/platform/aniversarios?data=2030-03-10", null, adm);
const a = r.body?.envios?.find(e => e.casamento.includes("w_a"));
ok(r.status === 200 && a && a.meses === 60 && a.marco === "5 anos" && a.capsulas === 1 && a.noivos === 2 && r.body.email_configurado === true, "simulação: cápsula antiga de 5 anos também gera e-mail (com contagem e número de noivos)");
ok(!JSON.stringify(r.body).includes("@") && r.body.envios.every(e => !["w_demo2", "w_susp", "w_flag"].some(x => e.casamento.includes(x))), "simulação sem endereços e sem casamentos fora da regra");
ok((await t.json("GET", "/api/platform/aniversarios?data=10-03-2030", null, adm)).status === 400, "data inválida → 400");
n = sent.length;
ok((await t.json("GET", "/api/platform/aniversarios?data=2030-03-10", null, adm)).status === 200 && sent.length === n, "simulação não envia nada");
await cron("2030-03-10");
ok(to("w_a").filter(x => x.subject === "Hoje faz 5 anos: a cápsula do tempo de vocês abriu").length === 2, "cápsula antiga de 5 anos: abre e avisa na data");

/* ---------- conteúdo do e-mail ---------- */
const e = anniversaryEmail({ names: "Pétala & Lucas", label: "1 ano", capsules: 3, panel: "https://casamento.guetastudio.com.br/painel", ownerName: "Pétala Souza" });
ok(e.subject === "Hoje faz 1 ano: a cápsula do tempo de vocês abriu" && e.text.startsWith("Oi, Pétala!") && e.text.includes("3 mensagens") && e.html.includes("Pétala &amp; Lucas"), "e-mail: nome escapado no HTML e contagem no texto");

t.done("aniversario");
