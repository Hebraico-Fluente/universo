/** Testes do módulo "organizacao": fornecedores, propostas, contratação → orçamento, checklist, compromissos,
 *  parcelas, histórico, CSV, central da visão geral (radar de riscos) e isolamento entre casais. */
import { setup } from "./helpers.mjs";
import { DEMO } from "../scripts/seed.mjs";
import { buildChecklist, phaseDate, conflictPairs, localToday } from "../src/mods/organizacao.js";

const t = await setup();
const { ok } = t;
await t.loginDemo();
const db = t.env._db;
const today = localToday();
const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
let r, j;

/* ---------- fornecedores ---------- */
j = (await t.json("GET", "/api/admin/org/vendors")).body;
ok(j.vendors.length >= 6 && j.vendors.every(v => v.wedding_id === "w_demo") && j.categories.length === 6, "lista os fornecedores da demonstração com as categorias do orçamento");
ok(j.vendors.find(v => v.id === "v_sabor").quotes.length === 1 && j.vendors.find(v => v.id === "v_sabor").budget_item?.id === "b2", "fornecedor traz propostas e o lançamento ligado");
ok(j.vendors.at(-1).status === "descartado", "descartados vão para o fim da lista");

r = await t.json("POST", "/api/admin/org/vendors", { name: "Banda Aurora (teste)", category: "Música", contact_name: "Téo", phone: "(41) 99999-0000", whatsapp: true, email: "BANDA@exemplo.com", site: "@banda.aurora",
  status: "orcamento_pedido", owner: "Rafael", notes: "Linha 1\nLinha 2", dates: [{ label: "Ensaio", date: "2027-09-01" }], checklist: [{ text: "Enviar repertório", done: false }] });
const vBand = r.body.id;
ok(r.status === 201 && vBand, "cria fornecedor com contato, status, datas e checklist");
let vb = (await t.json("GET", "/api/admin/org/vendors")).body.vendors.find(v => v.id === vBand);
ok(vb.email === "banda@exemplo.com" && vb.site === "https://instagram.com/banda.aurora" && vb.whatsapp === true && vb.notes === "Linha 1\nLinha 2", "normaliza e-mail, Instagram e mantém as quebras das notas");
ok(vb.dates[0].label === "Ensaio" && vb.checklist[0].text === "Enviar repertório" && vb.doc_url === "", "datas importantes e checklist próprios; campo de contrato preparado (doc_url)");
ok((await t.json("POST", "/api/admin/org/vendors", { name: "X" })).status === 400, "nome curto é recusado");
ok((await t.json("POST", "/api/admin/org/vendors", { name: "Fornecedor", status: "fechado" })).status === 400, "status fora da lista é recusado");
ok((await t.json("POST", "/api/admin/org/vendors", { name: "Fornecedor", doc_url: "javascript:alert(1)" })).status === 400, "link de contrato só http(s)");
ok((await t.json("POST", "/api/admin/org/vendors", { name: "Fornecedor", email: "sem-arroba" })).status === 400, "e-mail inválido é recusado");
r = await t.json("PATCH", `/api/admin/org/vendors/${vBand}`, { checklist: [{ text: "Enviar repertório", done: true }], doc_url: "https://exemplo.com/proposta.pdf" });
vb = (await t.json("GET", "/api/admin/org/vendors")).body.vendors.find(v => v.id === vBand);
ok(r.status === 200 && vb.checklist[0].done === true && vb.doc_url === "https://exemplo.com/proposta.pdf" && vb.name === "Banda Aurora (teste)", "edição parcial mantém o resto");

/* ---------- propostas e comparação ---------- */
r = await t.json("POST", `/api/admin/org/vendors/${vBand}/quotes`, { title: "Banda 4h", amount_cents: 900000, notes: "Com som", received_at: "2026-11-10" });
const qBand = r.body.id;
await t.json("POST", `/api/admin/org/vendors/${vBand}/quotes`, { title: "Banda 6h", amount_cents: 1200000 });
vb = (await t.json("GET", "/api/admin/org/vendors")).body.vendors.find(v => v.id === vBand);
ok(r.status === 201 && vb.quotes.length === 2 && vb.quotes[0].amount_cents === 900000 && vb.status === "proposta_recebida", "várias propostas por fornecedor; status avança para proposta recebida");
const buffet = (await t.json("GET", "/api/admin/org/vendors")).body.vendors.filter(v => v.category === "Buffet").flatMap(v => v.quotes);
ok(buffet.length === 3 && new Set(buffet.map(q => q.vendor_id)).size === 3, "propostas da mesma categoria ficam disponíveis para comparar lado a lado");
ok((await t.json("POST", `/api/admin/org/vendors/${vBand}/quotes`, { amount_cents: -5 })).status === 400, "valor de proposta negativo é recusado");
ok((await t.json("PATCH", `/api/admin/org/quotes/${qBand}`, { amount_cents: 950000, chosen: true })).status === 200, "edita proposta e marca como escolhida");

/* ---------- contratado → orçamento ---------- */
const before = (await t.json("GET", "/api/admin/budget")).body.totals.committed;
r = await t.json("POST", `/api/admin/org/vendors/${vBand}/contract`, { mode: "new", category_id: "c_musica", quote_id: qBand });
const newItem = r.body.budget_item_id;
j = (await t.json("GET", "/api/admin/budget")).body;
const created = j.items.find(i => i.id === newItem);
ok(r.status === 200 && created && created.amount_cents === 950000 && created.vendor === "Banda Aurora (teste)" && created.category_id === "c_musica", "contratar cria o lançamento no orçamento com o valor da proposta");
ok(j.totals.committed === before + 950000 && created.vendor_ref?.id === vBand, "o contratado do orçamento sobe e o lançamento sabe qual é o fornecedor");
vb = (await t.json("GET", "/api/admin/org/vendors")).body.vendors.find(v => v.id === vBand);
ok(vb.status === "contratado" && vb.budget_item?.id === newItem && vb.quotes.find(q => q.id === qBand).chosen, "fornecedor fica contratado, ligado ao lançamento e com a proposta escolhida");
ok((await t.json("POST", `/api/admin/org/vendors/${vBand}/contract`, { mode: "new", category_id: "c_musica", amount_cents: 1 })).status === 409, "não cria um segundo lançamento para o mesmo fornecedor");
r = await t.json("POST", "/api/admin/org/vendors", { name: "Doceria Ligada (teste)", category: "Doces" });
const vDoce = r.body.id;
r = await t.json("POST", `/api/admin/org/vendors/${vDoce}/contract`, { mode: "link", budget_item_id: "b7" });
ok(r.status === 200 && db.prepare("SELECT budget_item_id FROM vendors WHERE id = ?").get(vDoce).budget_item_id === "b7", "contratar pode ligar a um lançamento que já existe");
ok((await t.json("POST", `/api/admin/org/vendors/${vDoce}/contract`, { mode: "new", category_id: "c_que_nao_existe", amount_cents: 1 })).status === 409
  || (await t.json("POST", `/api/admin/org/vendors/${vDoce}/contract`, { mode: "new", category_id: "c_que_nao_existe", amount_cents: 1 })).status === 400, "categoria inexistente é recusada");

/* ---------- tarefas e checklist automático ---------- */
ok(phaseDate("2027-10-16", "12m") === "2026-10-16" && phaseDate("2027-10-16", "1m") === "2027-09-16" && phaseDate("2027-10-16", "2s") === "2027-10-02" && phaseDate("2027-10-16", "dia") === "2027-10-16", "prazos relativos: meses no calendário, semanas em dias");
ok(phaseDate("2027-03-31", "1m") === "2027-02-28" && phaseDate("2027-01-15", "3m") === "2026-10-15", "fim de mês e virada de ano");
const base = { ceremony: [], prefs: [], guests: 80, venue_defined: false };
const plain = buildChecklist("2027-10-16", base, "2026-01-01");
ok(!plain.some(i => /igreja|cartório|religios/i.test(i.title)), "sem tipo de cerimônia marcado, nenhuma tarefa civil ou religiosa (nada presumido)");
const rel = buildChecklist("2027-10-16", { ...base, ceremony: ["religiosa", "ao_ar_livre"], venue_defined: true }, "2026-01-01");
ok(rel.some(i => i.key === "tpl:religiosa_data") && rel.some(i => i.key === "tpl:ar_livre_plano_b") && !rel.some(i => i.key === "tpl:local") && rel.some(i => i.key === "tpl:local_contrato"), "tipo de cerimônia e local definido mudam o modelo");
ok(buildChecklist("2027-10-16", { ...base, ceremony: ["destination"] }, "2026-01-01").some(i => i.key === "tpl:dest_hospedagem") && buildChecklist("2027-10-16", { ...base, guests: 200 }, "2026-01-01").some(i => i.key === "tpl:logistica"), "destination e número de convidados entram no modelo");
ok(plain.every(i => i.due_date === phaseDate("2027-10-16", i.phase)), "longe da data, cada prazo é a data ideal da etapa");

r = await t.json("POST", "/api/admin/org/checklist", { ceremony: ["civil", "ao_ar_livre"], guests: 120, venue_defined: true, prefs: ["lua_de_mel"], owner: "" });
ok(r.status === 201 && r.body.created > 20 && r.body.skipped === 0, "gera o checklist a partir do formulário");
const gen = db.prepare("SELECT template_key, phase, due_date FROM tasks WHERE wedding_id = 'w_demo' AND template_key IS NOT NULL").all();
const expect = k => { const g = gen.find(x => x.template_key === k); const ideal = phaseDate("2027-10-16", g.phase); return g.due_date === (ideal < today ? today : ideal); };
ok(["tpl:civil_habilitacao", "tpl:numero_final", "tpl:kit", "tpl:civil_dia", "tpl:orcamento", "tpl:lua_de_mel"].every(expect), "prazos corretos relativos à data do casamento (o que já passou vira hoje)");
ok(gen.find(x => x.template_key === "tpl:civil_dia").due_date === "2027-10-16" && gen.find(x => x.template_key === "tpl:numero_final").due_date === "2027-10-02", "tarefa do dia cai no dia; 2 semanas antes cai 14 dias antes");
ok(!gen.some(x => x.template_key === "tpl:religiosa_data") && gen.some(x => x.template_key === "tpl:ar_livre_plano_b"), "só as tarefas dos tipos marcados");
r = await t.json("POST", "/api/admin/org/checklist", { ceremony: ["civil", "ao_ar_livre"], guests: 120, venue_defined: true, prefs: ["lua_de_mel"] });
ok(r.body.created === 0 && r.body.skipped > 20, "gerar de novo não duplica tarefas");
ok((await t.json("POST", "/api/admin/org/checklist", { ceremony: ["catolica"] })).status === 400, "tipo de cerimônia fora da lista é recusado");
j = (await t.json("GET", "/api/admin/org/tasks")).body;
ok(j.profile.ceremony.includes("civil") && j.profile.guests === 120 && j.profile.generated_at, "as respostas do formulário ficam salvas");

r = await t.json("POST", "/api/admin/org/tasks", { title: "Ligar para a banda", owner: "Noivo", due_date: addDays(today, 2), vendor_id: vBand });
const task = r.body.id;
ok(r.status === 201, "cria tarefa com responsável, prazo e fornecedor");
r = await t.json("PATCH", `/api/admin/org/tasks/${task}`, { status: "done" });
let row = db.prepare("SELECT status, done_at, owner, vendor_id FROM tasks WHERE id = ?").get(task);
ok(r.status === 200 && row.status === "done" && row.done_at === today && row.owner === "Noivo" && row.vendor_id === vBand, "concluir com um toque guarda a data e mantém o resto");
await t.json("PATCH", `/api/admin/org/tasks/${task}`, { status: "todo" });
ok(db.prepare("SELECT done_at FROM tasks WHERE id = ?").get(task).done_at === null, "reabrir limpa a data de conclusão");
ok((await t.json("POST", "/api/admin/org/tasks", { title: "Tarefa", vendor_id: "v_de_outro" })).status === 400, "não liga tarefa a fornecedor inexistente");
ok((await t.json("POST", "/api/admin/org/tasks", { title: "Tarefa", due_date: "16/10/2027" })).status === 400, "prazo fora do formato é recusado");

/* ---------- compromissos ---------- */
r = await t.json("POST", "/api/admin/org/appointments", { title: "Prova do terno", kind: "prova", date: addDays(today, 12), time: "18:00", duration_min: 60, place: "Alfaiataria (teste)", vendor_id: vBand });
const ap1 = r.body.id;
r = await t.json("POST", "/api/admin/org/appointments", { title: "Reunião com a banda", kind: "reuniao", date: addDays(today, 12), time: "18:30", duration_min: 30 });
const ap2 = r.body.id;
j = (await t.json("GET", "/api/admin/org/tasks")).body;
ok(j.appointments.find(a => a.id === ap1).conflict_with.includes(ap2), "compromissos no mesmo horário são marcados como conflito");
ok(j.appointments.find(a => a.id === "a_prova").conflict_with.includes("a_flores"), "conflito da demonstração detectado");
ok(conflictPairs([{ id: "a", starts_at: "2027-01-01T10:00", duration_min: 60 }, { id: "b", starts_at: "2027-01-01T11:00", duration_min: 30 }]).length === 0, "compromisso que começa quando o outro termina não conflita");
ok((await t.json("POST", "/api/admin/org/appointments", { title: "Sem hora", date: addDays(today, 3), time: "25:00" })).status === 400, "horário inválido é recusado");
await t.json("PATCH", `/api/admin/org/appointments/${ap2}`, { time: "20:00" });
j = (await t.json("GET", "/api/admin/org/tasks")).body;
ok(j.appointments.find(a => a.id === ap1).conflict_with.length === 0 && j.appointments.find(a => a.id === ap2).starts_at.endsWith("T20:00"), "remarcar desfaz o conflito");

/* ---------- parcelas ---------- */
j = (await t.json("GET", "/api/admin/budget")).body;
const b2 = j.items.find(i => i.id === "b2");
ok(b2.installments.length === 4 && b2.installments.filter(x => x.paid_at).reduce((s, x) => s + x.amount_cents, 0) === b2.paid_cents, "lançamento parcelado: o pago é a soma das parcelas pagas");
ok(j.upcoming.some(u => u.item_id === "b2" && u.installment_id && u.left_cents === 777000) && j.upcoming.every(u => u.left_cents > 0), "próximos pagamentos consideram parcela por parcela");
ok(j.upcoming.some(u => u.item_id === "b4" && u.overdue), "parcela vencida aparece como atrasada");
r = await t.json("POST", "/api/admin/budget/items", { category_id: "c_decor", description: "Iluminação cênica", vendor: "Luz & Cena (teste)", amount_cents: 300000,
  installments: [{ amount_cents: 100000, due_date: "2027-01-10", paid: true }, { amount_cents: 100000, due_date: "2027-03-10" }, { amount_cents: 100000, due_date: "2027-05-10" }] });
const inst = r.body.id;
let it = (await t.json("GET", "/api/admin/budget")).body.items.find(i => i.id === inst);
ok(r.status === 201 && it.installments.length === 3 && it.paid_cents === 100000 && it.due_date === "2027-03-10", "novo lançamento em 3 parcelas: pago e próximo vencimento vêm das parcelas");
ok((await t.json("POST", "/api/admin/budget/items", { category_id: "c_decor", description: "Parcelas erradas", amount_cents: 300000, installments: [{ amount_cents: 100000 }] })).body.code === "installments_sum", "soma das parcelas precisa bater com o valor");
ok((await t.json("PATCH", `/api/admin/budget/items/${inst}`, { paid_cents: 300000 })).status === 409, "lançamento parcelado não aceita pago direto (paga-se por parcela)");
ok((await t.json("PATCH", `/api/admin/budget/items/${inst}`, { amount_cents: 1 })).status === 409, "mudar o valor de um parcelado exige ajustar as parcelas junto");
r = await t.json("POST", `/api/admin/budget/installments/${it.installments[1].id}/pay`, { receipt_url: "https://exemplo.com/comprovante.pdf" });
it = (await t.json("GET", "/api/admin/budget")).body.items.find(i => i.id === inst);
ok(r.status === 200 && it.paid_cents === 200000 && it.due_date === "2027-05-10" && it.installments[1].paid_at === today && it.installments[1].receipt_url.endsWith("comprovante.pdf"), "pagar parcela por parcela com comprovante (link)");
ok((await t.json("POST", `/api/admin/budget/installments/${it.installments[1].id}/pay`, { paid: false })).body.paid_cents === 100000, "desfazer o pagamento de uma parcela");
ok((await t.json("POST", `/api/admin/budget/installments/${it.installments[2].id}/pay`, { receipt_url: "ftp://x" })).status === 400, "comprovante só aceita link http(s)");
r = await t.json("PATCH", `/api/admin/budget/items/${inst}`, { amount_cents: 400000, installments: [{ id: it.installments[0].id, amount_cents: 100000, due_date: "2027-01-10", paid: true, paid_at: "2027-01-09" }, { amount_cents: 300000, due_date: "2027-06-01" }] });
it = (await t.json("GET", "/api/admin/budget")).body.items.find(i => i.id === inst);
ok(r.status === 200 && it.amount_cents === 400000 && it.installments.length === 2 && it.installments[0].paid_at === "2027-01-09" && it.paid_cents === 100000, "editar valor e parcelas juntos");
r = await t.json("PATCH", `/api/admin/budget/items/${inst}`, { installments: [] });
it = (await t.json("GET", "/api/admin/budget")).body.items.find(i => i.id === inst);
ok(r.status === 200 && it.installments.length === 0 && it.paid_cents === 100000, "tirar as parcelas mantém o valor já pago");
ok((await t.json("PATCH", "/api/admin/budget/items/b3", { receipt_url: "https://exemplo.com/recibo-bar.pdf" })).status === 200, "comprovante (link) no lançamento");

/* ---------- histórico ---------- */
await t.json("PATCH", `/api/admin/budget/items/${inst}`, { description: "Iluminação e projeção", vendor: "Luz & Cena" });
j = (await t.json("GET", `/api/admin/budget/history?item=${inst}`)).body;
const h0 = j.history[0];
ok(h0.action === "update" && h0.who === "Helena (demonstração)" && h0.at && h0.changes.some(c => c.field === "description" && c.from === "Iluminação cênica" && c.to === "Iluminação e projeção"), "histórico guarda quem, quando e o que mudou");
ok(j.history.some(h => h.action === "pay") && j.history.some(h => h.action === "unpay") && j.history.some(h => h.action === "create"), "histórico registra criação e pagamentos");
await t.json("DELETE", `/api/admin/budget/items/${inst}`);
j = (await t.json("GET", "/api/admin/budget/history")).body;
ok(j.history.some(h => h.item_id === inst && h.action === "delete") && db.prepare("SELECT COUNT(*) AS n FROM budget_installments WHERE item_id = ?").get(inst).n === 0, "exclusão fica no histórico e apaga as parcelas");
ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'budget.item.delete' AND target = ?").get(inst).n === 1, "exclusão também vai para a auditoria");

/* ---------- CSV ---------- */
r = await t.call("GET", "/api/admin/budget/export.csv");
const raw = new Uint8Array(await r.arrayBuffer());
const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(raw);
const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
ok(r.status === 200 && r.headers.get("Content-Type").includes("text/csv") && r.headers.get("Content-Disposition").includes("orcamento-helena-e-rafael"), "exporta CSV para planilha");
ok(csv.startsWith("﻿") && lines[0].startsWith("Tipo;Categoria;Descrição") && lines.some(l => l.startsWith("Parcela 2/4;Buffet e bebidas;Buffet completo")) && lines.at(-1).startsWith("Total;"), "CSV com BOM, ponto e vírgula, parcelas e total");
ok(lines.some(l => l.includes("33300,00")), "valores com vírgula decimal");
await t.json("POST", "/api/admin/budget/items", { category_id: "c_decor", description: "=HYPERLINK(\"x\")", amount_cents: 100 });
const csv2 = await (await t.call("GET", "/api/admin/budget/export.csv")).text();
ok(csv2.includes(`"'=HYPERLINK(""x"")"`), "CSV neutraliza fórmulas e escapa aspas");
ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'budget.export_csv'").get().n >= 1, "exportação do CSV fica na auditoria");

/* ---------- central da visão geral: progresso e radar de riscos ---------- */
j = (await t.json("GET", "/api/admin/overview")).body;
let c = j.mods.organizacao;
ok(c && c.progress.parts.length === 3 && c.progress.pct >= 0 && c.progress.pct <= 100, "visão geral traz o progresso do casamento");
ok(c.progress.parts.find(p => p.key === "vendors").done === 6 && c.progress.parts.find(p => p.key === "guests").total === 5, "progresso conta fornecedores contratados e convites respondidos");
ok(c.urgent_tasks.length > 0 && c.urgent_tasks.every(x => x.due_date <= addDays(today, 7)) && c.urgent_tasks.some(x => x.overdue), "tarefas urgentes (atrasadas e desta semana)");
ok(c.appointments.length > 0 && c.payments.length > 0, "próximos compromissos e pagamentos");
const keys = c.risks.map(x => x.key);
ok(keys.some(k => k.startsWith("pay:")) && c.risks.find(x => x.key.startsWith("pay:")).level === "alto", "radar: pagamento atrasado");
ok(keys.includes("conf:a_prova:a_flores") || keys.includes("conf:a_flores:a_prova"), "radar: compromissos em conflito de horário");
ok(keys.some(k => k.startsWith("owner:")), "radar: tarefas sem responsável");
ok(keys.includes("doc:v_luz") && !keys.includes("doc:v_sabor"), "radar: contratado sem contrato anexado (só quem não tem)");
ok(keys.some(k => k.startsWith("diet:")), "radar: restrições alimentares para o buffet");
ok(c.risks.every(x => x.title && x.why && x.href), "cada alerta vem explicado e com caminho para resolver");
r = await t.json("POST", "/api/admin/org/alerts/dismiss", { key: "doc:v_luz" });
c = (await t.json("GET", "/api/admin/overview")).body.mods.organizacao;
ok(r.status === 200 && !c.risks.some(x => x.key === "doc:v_luz") && c.dismissed === 1, "alerta descartado some e fica salvo");
ok((await t.json("POST", "/api/admin/org/alerts/dismiss", { key: "<script>" })).status === 400, "chave de alerta validada");

/* lista de espera (módulo convidados) fica fora das contagens e do radar */
let ov = (await t.json("GET", "/api/admin/overview")).body;
const festa0 = ov.events.find(e => e.id === "e_festa"), hh0 = ov.households, diets0 = ov.diets;
r = await t.json("POST", "/api/admin/households", { name: "Família em espera (teste)", guests: [{ name: "Pessoa Espera" }, { name: "Outra Espera" }], events: ["e_cerimonia", "e_festa"], waitlist: true });
ok(r.status === 201, "cria família na lista de espera");
const wid = r.body.id;
db.prepare("UPDATE guests SET diet = 'Sem glúten' WHERE household_id = ?").run(wid);
db.prepare("INSERT INTO rsvps (guest_id, event_id, status) SELECT id, 'e_festa', 'yes' FROM guests WHERE household_id = ?").run(wid);
ov = (await t.json("GET", "/api/admin/overview")).body;
const festa1 = ov.events.find(e => e.id === "e_festa");
ok(festa1.invited === festa0.invited && festa1.yes === festa0.yes && festa1.pending === festa0.pending, "visão geral: convidados por evento ignoram a lista de espera");
ok(ov.households.total === hh0.total && ov.households.responded === hh0.responded && ov.diets === diets0, "visão geral: famílias e restrições ignoram a lista de espera");
ok(ov.mods.organizacao.progress.parts.find(p => p.key === "guests").total === hh0.total && !ov.mods.organizacao.risks.some(x => x.key === `diet:${diets0 + 2}`), "radar e progresso ignoram a lista de espera");
await t.json("DELETE", `/api/admin/households/${wid}`);

/* radar: mais confirmados que lugares, só se o módulo convidados publicar as mesas */
const { commandCenter } = await import("../src/mods/organizacao.js");
const baseO = { wedding: { rsvp_deadline: "2099-01-01" }, households: { total: 0, responded: 0 }, diets: 0, events: [{ yes: 12 }] };
let cc = await commandCenter(t.env, "w_lia", baseO, { convidados: { tables: [{ seats: 8 }] } });
ok(cc.risks.some(x => x.key === "seats:12:8"), "radar: mais confirmados do que lugares nas mesas (com dados do módulo convidados)");
cc = await commandCenter(t.env, "w_lia", baseO, {});
ok(!cc.risks.some(x => x.key.startsWith("seats")), "sem dados de mesas, o alerta não aparece (não depende do outro módulo)");

/* ---------- isolamento entre casais ---------- */
const other = await t.login(DEMO.other.email, DEMO.other.password, "10.0.0.8");
const oc = { ck: other.cookie };
j = (await t.json("GET", "/api/admin/org/vendors", null, oc)).body;
ok(j.vendors.length === 0 && j.items.length === 0 && j.categories.length === 0, "outro casal não vê fornecedores, lançamentos nem categorias alheias");
ok((await t.json("PATCH", `/api/admin/org/vendors/${vBand}`, { name: "Invadido" }, oc)).status === 404 && (await t.json("DELETE", "/api/admin/org/vendors/v_sabor", null, oc)).status === 404, "outro casal não edita nem apaga fornecedor alheio");
ok((await t.json("POST", "/api/admin/org/vendors/v_sabor/quotes", { amount_cents: 1 }, oc)).status === 404 && (await t.json("PATCH", `/api/admin/org/quotes/${qBand}`, { amount_cents: 1 }, oc)).status === 404, "outro casal não mexe em propostas alheias");
ok((await t.json("POST", "/api/admin/org/vendors/v_mesa/contract", { mode: "new", category_id: "c_buffet", amount_cents: 1 }, oc)).status === 404, "outro casal não contrata fornecedor alheio");
r = await t.json("POST", "/api/admin/org/vendors", { name: "Fornecedor da Lia" }, oc);
ok((await t.json("POST", `/api/admin/org/vendors/${r.body.id}/contract`, { mode: "link", budget_item_id: "b1" }, oc)).status === 400, "não liga fornecedor próprio a lançamento de outro casal");
ok((await t.json("POST", "/api/admin/org/tasks", { title: "Tarefa da Lia", vendor_id: "v_sabor" }, oc)).status === 400, "não liga tarefa a fornecedor de outro casal");
ok((await t.json("POST", "/api/admin/org/appointments", { title: "Reunião", date: "2027-01-01", time: "10:00", vendor_id: "v_sabor" }, oc)).status === 400, "não liga compromisso a fornecedor de outro casal");
ok((await t.json("PATCH", `/api/admin/org/tasks/${task}`, { status: "done" }, oc)).status === 404 && (await t.json("DELETE", "/api/admin/org/appointments/a_degust", null, oc)).status === 404, "outro casal não altera tarefas nem compromissos alheios");
j = (await t.json("GET", "/api/admin/org/tasks", null, oc)).body;
ok(j.tasks.length === 0 && j.appointments.length === 0 && j.vendors.length === 1, "outro casal só vê as próprias tarefas, compromissos e fornecedores");
ok((await t.json("POST", "/api/admin/budget/installments/p_demo_1/pay", {}, oc)).status === 404, "outro casal não paga parcela alheia");
j = (await t.json("GET", "/api/admin/budget/history", null, oc)).body;
ok(j.history.length === 0, "outro casal não vê o histórico alheio");
const ocsv = await (await t.call("GET", "/api/admin/budget/export.csv", null, oc)).text();
ok(!ocsv.includes("Buffet") && ocsv.includes("Total;"), "CSV só com os dados do próprio casal");
await t.json("POST", "/api/admin/org/alerts/dismiss", { key: "doc:v_villa" }, oc);
c = (await t.json("GET", "/api/admin/overview")).body.mods.organizacao;
ok(c.dismissed === 1, "descartar alerta num casal não afeta o outro");
ok(!JSON.stringify((await t.json("GET", "/api/admin/overview", null, oc)).body).includes("Sabor"), "visão geral do outro casal não vaza dados");

/* ---------- exclusões com auditoria e CSRF ---------- */
ok((await t.json("DELETE", `/api/admin/org/tasks/${task}`)).status === 200 && (await t.json("DELETE", `/api/admin/org/appointments/${ap2}`)).status === 200 && (await t.json("DELETE", `/api/admin/org/quotes/${qBand}`)).status === 200, "apaga tarefa, compromisso e proposta");
r = await t.json("DELETE", `/api/admin/org/vendors/${vBand}`);
ok(r.status === 200 && db.prepare("SELECT vendor_id FROM appointments WHERE id = ?").get(ap1).vendor_id === null && db.prepare("SELECT COUNT(*) AS n FROM budget_items WHERE id = ?").get(newItem).n === 1, "apagar fornecedor solta tarefas e compromissos e mantém o lançamento");
ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('task.delete','appointment.delete','vendor.quote.delete','vendor.delete')").get().n === 4, "exclusões ficam na auditoria");
ok((await t.json("POST", "/api/admin/org/vendors", { name: "Golpe" }, { origin: "https://golpe.com" })).status === 403, "escrita de outro site é bloqueada (CSRF)");
ok((await t.json("GET", "/api/admin/org/vendors", null, { ck: "" })).status === 401, "sem login → 401");
j = (await t.json("GET", "/api/admin/export")).body;
const ex = j.organizacao || j;
ok(Array.isArray(ex.vendors) && Array.isArray(ex.tasks) && Array.isArray(ex.budget_installments) && ex.vendors.length > 0 && ex.vendors.every(v => v.wedding_id === "w_demo"), "exportação completa (LGPD) inclui a organização");

t.done("organizacao");
