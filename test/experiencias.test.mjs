/** Módulo "experiências": concierge, copiloto, padrinhos, segredos, surpresas com sigilo, quest, passaporte, jornal, lugares. */
import { setup } from "./helpers.mjs";
import { DEMO, DEMO_EXP } from "../scripts/seed.mjs";

const t = await setup();
const db = t.env._db;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const S = "/api/site/helena-e-rafael";
const I = tok => "/api/invite/" + tok;
const texts = j => (j.items || []).map(i => i.text).join(" | ");

/* ---------- concierge do site: só dados publicados ---------- */
let r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("Tem estacionamento?"));
t.ok(r.status === 200 && r.body.known && /manobristas/.test(texts(r.body)) && r.body.items.some(i => i.source === "Dúvidas do site"), "concierge: estacionamento vem das Dúvidas do site, com a fonte");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("onde é a cerimônia?"));
t.ok(r.body.known && /Villa Aurora/.test(texts(r.body)) && !/Varanda/.test(texts(r.body)) && r.body.items[0].link?.startsWith("https://www.google.com/maps/search/"), "concierge: local da cerimônia com link de mapa; evento privado (jantar) fica de fora do site");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("qual o traje?"));
t.ok(r.body.known && /Passeio completo/.test(texts(r.body)), "concierge: traje");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("vai ter van de transporte?"));
t.ok(r.body.known && /van sai do Batel/.test(texts(r.body)) && r.body.items[0].source === "Respostas dos noivos", "concierge: transporte vem das respostas cadastradas pelo casal");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("onde posso me hospedar? hotel?"));
t.ok(r.body.known && /Batel/.test(texts(r.body)), "concierge: hospedagem");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("Vai ter open bar?"));
t.ok(r.body.known === false && /ainda não informaram/.test(texts(r.body)) && r.body.items.every(i => !i.source), "concierge: admite quando não sabe (sem inventar)");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("qual é a minha mesa?"));
t.ok(!r.body.known && /convite pessoal/.test(texts(r.body)), "concierge do site não fala de mesa (só o convite pessoal)");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("que horas começa a festa?"));
t.ok(/Festa: .*18h30/.test(texts(r.body)) && !/Cerimônia:/.test(texts(r.body)), "concierge: horário do evento citado");
r = await t.json("GET", S + "/concierge?q=" + encodeURIComponent("tem estacionamento?"), null, {});
t.ok(!JSON.stringify(r.body).match(/Andrade|Lúcia|household|guest/i), "concierge do site não expõe convidados");

/* ---------- concierge do convite: mesa só da própria família ---------- */
r = await t.json("GET", I(DEMO.tokens.lucia) + "/concierge?q=" + encodeURIComponent("qual é minha mesa?"));
t.ok(r.status === 200 && /ainda não definiram/.test(texts(r.body)) && !r.body.known, "convite sem mesa definida: diz que ainda não foi definida");
db.exec(`INSERT INTO seating_tables (id, wedding_id, name) VALUES ('t_flor', 'w_demo', 'Mesa Jasmim'), ('t_sol', 'w_demo', 'Mesa Girassol');
  INSERT INTO seat_assignments (guest_id, table_id, wedding_id) VALUES ('h_lucia_g0', 't_flor', 'w_demo'), ('h_lucia_g1', 't_flor', 'w_demo'), ('h_andrade_g0', 't_sol', 'w_demo');`);
r = await t.json("GET", I(DEMO.tokens.lucia) + "/concierge?q=" + encodeURIComponent("qual é minha mesa?"));
t.ok(/ainda não definiram/.test(texts(r.body)), "mesa definida mas não liberada no convite (show_tables = 0): não revela");
db.exec("UPDATE weddings SET show_tables = 1 WHERE id = 'w_demo'");
r = await t.json("GET", I(DEMO.tokens.lucia) + "/concierge?q=" + encodeURIComponent("qual é minha mesa?"));
t.ok(r.body.known && /Lúcia Mendes: Mesa Jasmim/.test(texts(r.body)) && !/Girassol|Andrade/.test(texts(r.body)), "mesa liberada: mostra só a mesa da própria família");
r = await t.json("GET", I(DEMO.tokens.lucia) + "/concierge?q=" + encodeURIComponent("onde é o jantar?"));
t.ok(/Varanda/.test(texts(r.body)) && r.body.items[0].source === "Seu convite", "convite: evento privado da família aparece no concierge do convite");
r = await t.json("GET", I(DEMO.tokens.marina) + "/concierge?q=" + encodeURIComponent("onde é o jantar de boas-vindas?"));
t.ok(!/Varanda/.test(texts(r.body)), "convite: evento para o qual a família não foi chamada não aparece");
r = await t.json("GET", I(DEMO.tokens.andrade) + "/concierge?q=" + encodeURIComponent("posso levar acompanhante?"));
t.ok(/Carla Andrade/.test(texts(r.body)) && !/Lúcia/.test(texts(r.body)), "convite: acompanhante responde com as pessoas do próprio convite");
r = await t.json("GET", I("token-que-nao-existe-1234") + "/concierge?q=mesa");
t.ok(r.status === 404, "concierge do convite com token inválido → 404");

/* ---------- copiloto: números reais e citações ---------- */
await t.loginDemo();
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Quantas pessoas ainda não confirmaram?"));
const pend = db.prepare("SELECT name FROM households WHERE wedding_id = 'w_demo' AND waitlist = 0 AND responded_at IS NULL").all().map(x => x.name);
t.ok(r.status === 200 && r.body.intent === "pendentes" && r.body.text.startsWith(`${pend.length} famílias`) && pend.every(n => r.body.cites.some(c => c.label === n && c.href === "#convidados")), `copiloto: ${pend.length} famílias pendentes, citadas com link para a aba`);
const toPay = db.prepare("SELECT SUM(amount_cents - paid_cents) AS n FROM budget_items WHERE wedding_id = 'w_demo'").get().n;
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Quanto ainda precisamos pagar?"));
const brl = c => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: c % 100 ? 2 : 0 });
t.ok(r.body.intent === "pagar" && r.body.text.includes(brl(toPay)) && r.body.cites.length === 5 && r.body.cites.every(c => c.href === "#orcamento"), "copiloto: valor a pagar igual ao orçamento, com os lançamentos citados");
db.exec(`INSERT INTO vendors (id, wedding_id, name, category, status) VALUES ('v_exp1', 'w_demo', 'Doce Mel (fictício)', 'Doces', 'proposta_recebida'), ('v_exp2', 'w_demo', 'Som Claro (fictício)', 'Música', 'contratado'), ('v_exp3', 'w_lia', 'Fornecedor da Lia', 'Doces', 'pesquisando');`);
const vOpen = db.prepare("SELECT name FROM vendors WHERE wedding_id = 'w_demo' AND status NOT IN ('contratado','descartado')").all().map(x => x.name);
const vNoDoc = db.prepare("SELECT name FROM vendors WHERE wedding_id = 'w_demo' AND status = 'contratado' AND doc_url = ''").all().map(x => x.name);
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Quais fornecedores estão com contrato pendente?"));
t.ok(r.body.intent === "contratos" && [...vOpen, ...vNoDoc].every(n => r.body.text.includes(n)) && r.body.cites.length === vOpen.length + vNoDoc.length && r.body.text.startsWith(`${vOpen.length} fornecedores`), `copiloto: ${vOpen.length} fornecedores sem contrato e ${vNoDoc.length} sem documento, citados`);
t.ok(!/Lia/.test(JSON.stringify(r.body)), "copiloto: fornecedores de outro casal não entram");
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Que tarefas priorizar esta semana?"));
t.ok(r.body.intent === "tarefas" && r.status === 200, "copiloto: tarefas da semana");
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Como economizar R$ 10.000?"));
t.ok(r.body.intent === "economizar" && /R\$\s?10\.000/.test(r.body.text) && /convidados a menos/.test(r.body.text) && r.body.cites.some(c => /Buffet completo/.test(c.label)), "copiloto: economia a partir dos contratos por convidado (sem inventar preço)");
db.exec("INSERT INTO appointments (id, wedding_id, title, starts_at, duration_min) VALUES ('ap_exp1', 'w_demo', 'Prova do terno', '2027-03-02T10:00', 90), ('ap_exp2', 'w_demo', 'Degustação de doces', '2027-03-02T11:00', 60), ('ap_exp3', 'w_lia', 'Compromisso da Lia', '2027-03-02T10:30', 60)");
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Há conflito no cronograma?"));
t.ok(r.body.intent === "conflito" && /“Prova do terno” e “Degustação de doces” se sobrepõem/.test(r.body.text) && r.body.cites.some(c => c.label === "Degustação de doces") && !/Lia/.test(JSON.stringify(r.body)), "copiloto: encontra compromissos sobrepostos (só deste casal)");
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Crie uma mensagem educada para quem não respondeu"));
t.ok(r.body.intent === "mensagem" && r.body.draft?.items?.length === pend.length && r.body.draft.items[0].whatsapp.startsWith("https://wa.me/?text=") && /Tia Lúcia e Tio Beto/.test(r.body.draft.items.map(i => i.text).join()), "copiloto: rascunho de mensagem por família (só prepara, não envia)");
t.ok(!/Vídeo das amigas/.test(JSON.stringify(r.body)), "copiloto não menciona surpresa secreta");
t.env.AI = { run: async () => ({ response: "Faltam 999 famílias." }) };
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Quantas pessoas ainda não confirmaram?"));
t.ok(r.body.ai === false && r.body.text.startsWith(`${pend.length} famílias`), "IA opcional: texto com número inventado é descartado");
t.env.AI = { run: async () => ({ response: `Ainda faltam ${pend.length} famílias responderem.` }) };
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("Quantas pessoas ainda não confirmaram?"));
t.ok(r.body.ai === true && r.body.cites.length === pend.length, "IA opcional: só redige a partir dos fatos; citações continuam");
delete t.env.AI;

/* ---------- padrinhos ---------- */
const P = "/api/padrinhos/";
r = await t.json("GET", P + DEMO_EXP.padrinhos.joao, null, { ck: "" });
t.ok(r.status === 200 && r.body.me.name === "João Lima" && /15h30/.test(r.body.info.instructions) && r.body.tasks.length === 2 && r.body.team.length === 2, "padrinho entra pelo próprio link: instruções, tarefas dele e as de todos");
t.ok(!JSON.stringify(r.body).includes("Vídeo das amigas"), "padrinho fora da surpresa não a vê");
t.ok(!JSON.stringify(r.body).match(/token|hash/i), "portal não expõe tokens");
r = await t.json("POST", P + DEMO_EXP.padrinhos.joao + "/tasks/pt_alianca", { done: true }, { ck: "" });
t.ok(r.status === 200, "padrinho marca a tarefa como feita");
r = await t.json("POST", P + DEMO_EXP.padrinhos.joao + "/wall", { message: "Combinado, sábado!" }, { ck: "", origin: "https://golpe.com" });
t.ok(r.status === 403, "mural dos padrinhos: escrita de outro site é bloqueada");
r = await t.json("POST", P + DEMO_EXP.padrinhos.joao + "/wall", { message: "Combinado, sábado!" }, { ck: "" });
t.ok(r.status === 201, "padrinho escreve no mural");
r = await t.json("GET", "/api/admin/exp/padrinhos");
t.ok(r.body.padrinhos.length === 2 && r.body.wall_count === 2 && !JSON.stringify(r.body).includes("Combinado, sábado"), "casal vê os padrinhos e tarefas, mas não lê o mural privado");
t.ok(r.body.tasks.find(x => x.id === "pt_alianca").done_by === "João Lima", "casal vê quem concluiu a tarefa");
r = await t.json("POST", "/api/admin/exp/padrinhos", { name: "Ana Souza", role: "madrinha" });
const ana = r.body; const anaTok = ana.link.split("/padrinhos/")[1];
t.ok(r.status === 201 && ana.link.includes("/padrinhos/") && (await t.call("GET", "/padrinhos/" + anaTok, null, { ck: "" })).headers.get("X-Robots-Tag")?.includes("noindex"), "casal cadastra padrinho e recebe o link (página privada)");
t.ok(!db.prepare("SELECT COUNT(*) AS n FROM padrinhos WHERE token_hash = ?").get(anaTok).n, "token do padrinho guardado só como hash");
await t.json("POST", `/api/admin/exp/padrinhos/${ana.id}/revoke`);
r = await t.json("GET", P + anaTok, null, { ck: "" });
t.ok(r.status === 404, "link de padrinho revogado → 404");

/* ---------- surpresas com sigilo ---------- */
r = await t.json("GET", "/api/admin/exp/surpresas");
t.ok(r.status === 200 && !JSON.stringify(r.body).includes("Vídeo das amigas") && !JSON.stringify(r.body).includes("sp_video"), "surpresa para o casal não aparece no painel antes da revelação");
r = await t.json("DELETE", "/api/admin/exp/surpresas/sp_video");
t.ok(r.status === 404, "casal não consegue apagar nem confirmar que a surpresa existe (404)");
r = await t.json("GET", "/api/admin/export");
t.ok(!JSON.stringify(r.body).includes("Vídeo das amigas"), "exportação do casal não leva a surpresa ainda secreta");
r = await t.json("GET", "/api/admin/overview");
t.ok(!JSON.stringify(r.body).includes("Vídeo"), "visão geral não denuncia a surpresa");
r = await t.json("GET", P + DEMO_EXP.padrinhos.marina, null, { ck: "" });
t.ok(r.body.surprises.length === 1 && r.body.surprises[0].organizer && r.body.surprises[0].posts.length === 1, "madrinha organizadora vê a surpresa");
r = await t.json("POST", P + DEMO_EXP.padrinhos.marina + "/surprises/sp_video/members", { name: "Carol (amiga)" }, { ck: "" });
const carol = r.body.link.split("/surpresa/")[1];
t.ok(r.status === 201 && r.body.link.includes("/surpresa/"), "organizadora gera link para colaboradora");
r = await t.json("GET", "/api/surpresa/" + carol, null, { ck: "" });
t.ok(r.status === 200 && r.body.surprise.title === "Vídeo das amigas da faculdade" && r.body.me.name === "Carol (amiga)", "colaboradora entra pelo link próprio");
r = await t.json("POST", "/api/surpresa/" + carol + "/posts", { message: "Gravei o meu!", link: "https://exemplo.com/video" }, { ck: "" });
t.ok(r.status === 201, "colaboradora deixa mensagem com link");
r = await t.json("POST", "/api/surpresa/" + carol + "/posts", { message: "oi", link: "javascript:alert(1)" }, { ck: "" });
t.ok(r.status === 400, "link que não é https é recusado");
r = await t.json("POST", P + DEMO_EXP.padrinhos.joao + "/surprises", { kind: "discurso", title: "Discurso para a Marina", honoree_type: "padrinho", honoree_ref: "pd_marina" }, { ck: "" });
const sMarina = r.body.id;
t.ok(r.status === 201, "padrinho cria surpresa para outra madrinha");
r = await t.json("POST", P + DEMO_EXP.padrinhos.joao + `/surprises/${sMarina}/members`, { padrinho_id: "pd_marina" }, { ck: "" });
t.ok(r.status === 400, "homenageada não pode ser chamada para a própria surpresa");
r = await t.json("GET", P + DEMO_EXP.padrinhos.marina, null, { ck: "" });
t.ok(!JSON.stringify(r.body).includes("Discurso para a Marina"), "homenageada (padrinho) não vê a surpresa");
r = await t.json("GET", "/api/admin/exp/surpresas");
t.ok(r.body.surprises.some(s => s.title === "Discurso para a Marina"), "casal vê surpresas que não são para o casal");
r = await t.json("POST", "/api/admin/exp/surpresas", { kind: "homenagem", title: "Homenagem para a Tia Lúcia", honoree_type: "household", honoree_ref: "h_lucia" });
t.ok(r.status === 201, "casal cria surpresa para uma família");
r = await t.json("GET", I(DEMO.tokens.lucia));
t.ok(!JSON.stringify(r.body).includes("Homenagem para a Tia"), "família homenageada não vê a surpresa no convite");
r = await t.json("POST", "/api/admin/exp/surpresas", { kind: "video", title: "Do casal para o casal", honoree_type: "casal" });
t.ok(r.status === 400, "casal não cria surpresa para si mesmo");
db.exec(`UPDATE surprises SET reveal_at = '${today}' WHERE id = 'sp_video'`);
r = await t.json("GET", "/api/admin/exp/surpresas");
const rev = r.body.surprises.find(s => s.id === "sp_video");
t.ok(rev && rev.posts.some(p => p.message === "Gravei o meu!"), "na data de revelação a surpresa aparece para o casal, com as mensagens");

/* ---------- mensagens secretas ---------- */
r = await t.json("GET", I(DEMO.tokens.andrade));
const sec = r.body.mods.experiencias.secrets;
t.ok(sec.length === 1 && sec[0].title === "Para a Sofia e o Theo", "mensagem secreta aparece no convite da família certa");
for (const k of ["lucia", "marina", "rossi"]) { const x = await t.json("GET", I(DEMO.tokens[k])); t.ok(!JSON.stringify(x.body).includes("Sofia e o Theo") && !(x.body.mods.experiencias.secrets || []).length, `mensagem secreta não aparece no convite de ${k}`); }
r = await t.json("GET", S);
t.ok(!JSON.stringify(r.body).includes("Sofia e o Theo"), "mensagem secreta não aparece no site");
r = await t.json("POST", "/api/admin/exp/segredos", { household_id: "h_marina", body: "Abra só no dia!", show_from: "2099-01-01" });
t.ok(r.status === 201, "casal agenda mensagem secreta");
r = await t.json("GET", I(DEMO.tokens.marina));
t.ok(!(r.body.mods.experiencias.secrets || []).length, "mensagem com data futura ainda não chega ao convite");
r = await t.json("POST", "/api/admin/exp/segredos", { household_id: "h_lia", body: "Invasão" });
t.ok(r.status === 404, "não aceita família de outro casal");
r = await t.json("POST", "/api/admin/exp/segredos", { household_id: "h_marina", body: "x", media_url: "https://evil.com/a.jpg", media_type: "image" });
t.ok(r.status === 400, "mídia só do próprio site");
r = await t.json("POST", I(DEMO.tokens.andrade) + "/exp/segredo/sg_andrade", {});
t.ok(r.status === 200, "família marca a mensagem como aberta");
r = await t.json("POST", I(DEMO.tokens.lucia) + "/exp/segredo/sg_andrade", {});
t.ok(r.status === 404, "outra família não mexe na mensagem secreta alheia");

/* ---------- quest ---------- */
r = await t.json("GET", I(DEMO.tokens.lucia));
const q = r.body.mods.experiencias.quest;
t.ok(q.length === 4 && q.every(c => c.done === false) && !JSON.stringify(q).match(/score|pontos|rank/i), "quest no convite, sem ranking nem pontos");
r = await t.json("POST", I(DEMO.tokens.lucia) + "/exp/quest/qc_brinde", { done: true });
t.ok(r.status === 200 && (await t.json("GET", I(DEMO.tokens.lucia))).body.mods.experiencias.quest.find(c => c.id === "qc_brinde").done, "convidado marca desafio como feito");
t.ok(!(await t.json("GET", I(DEMO.tokens.andrade))).body.mods.experiencias.quest.find(c => c.id === "qc_brinde").done, "o feito é só da própria família");
r = await t.json("GET", "/api/admin/exp/quest");
t.ok(r.body.challenges.find(c => c.id === "qc_brinde").done === 1, "casal vê só a contagem por desafio");

/* ---------- passaporte ---------- */
r = await t.json("GET", I(DEMO.tokens.lucia));
const pass = r.body.mods.experiencias.passport;
t.ok(pass.length === 3 && pass.every(e => !e.checked_at), "passaporte com os 3 eventos da família");
t.ok((await t.json("GET", I(DEMO.tokens.marina))).body.mods.experiencias.passport.map(e => e.id).join() === "e_cerimonia,e_festa", "passaporte só com os eventos da família");
r = await t.json("POST", I(DEMO.tokens.lucia) + "/exp/checkin/e_festa", {});
t.ok(r.status === 409, "check-in fora do dia do evento é recusado");
db.exec(`UPDATE events SET starts_at = '${today}T18:30:00-03:00' WHERE id = 'e_festa'`);
r = await t.json("POST", I(DEMO.tokens.lucia) + "/exp/checkin/e_festa", {});
t.ok(r.status === 201 && (await t.json("GET", I(DEMO.tokens.lucia))).body.mods.experiencias.passport.find(e => e.id === "e_festa").checked_by === "guest", "convidado faz check-in no dia");
r = await t.json("POST", I(DEMO.tokens.marina) + "/exp/checkin/e_jantar", {});
t.ok(r.status === 404, "não faz check-in em evento para o qual não foi convidado");
r = await t.json("POST", "/api/admin/exp/passaporte/checkin", { event_id: "e_cerimonia", household_id: "h_rossi" });
t.ok(r.status === 200 && (await t.json("GET", I(DEMO.tokens.rossi))).body.mods.experiencias.passport.find(e => e.id === "e_cerimonia").checked_by === "couple", "casal marca o check-in pelo painel");

/* ---------- lugares, documentário e jornal ---------- */
r = await t.json("GET", S);
t.ok(r.body.mods.experiencias.lugares.length === 3 && r.body.mods.experiencias.documentario === true && r.body.mods.experiencias.concierge === true, "site recebe lugares e interruptores");
t.ok(!JSON.stringify(r.body.mods.experiencias).match(/Andrade|padrinho|secret|surpres/i), "site() não leva nada pessoal");
r = await t.json("PATCH", "/api/admin/exp/settings", { soundtrack: { url: "https://cdn.terceiros.com/musica.mp3", title: "x" } });
t.ok(r.status === 400, "trilha sonora só com arquivo do próprio site");
r = await t.json("PATCH", "/api/admin/exp/settings", { soundtrack: { url: "/api/media/m_123", title: "Nossa trilha", song: "Djavan - Oceano" } });
t.ok(r.status === 200 && (await t.json("GET", S)).body.mods.experiencias.soundtrack.url === "/api/media/m_123", "trilha própria publicada");
r = await t.json("GET", "/api/admin/exp/jornal");
const pub = JSON.stringify((await t.json("GET", S)).body);
t.ok(r.status === 200 && r.body.words.length >= 4 && r.body.words.every(w => pub.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(w.word)), "jornal: palavras-cruzadas só com palavras publicadas");
t.ok(r.body.story.length === 3 && !JSON.stringify(r.body).match(/Andrade|Lúcia/), "jornal: história publicada, sem convidados");
t.ok((await t.call("GET", "/c/helena-e-rafael/jornal")).headers.get("Cache-Control") === "no-store", "página do jornal é privada (no-store)");

/* ---------- interruptores ---------- */
r = await t.json("PATCH", "/api/admin/exp/settings", { flags: { concierge: false, mensagens: false, quest: false, passaporte: false, lugares: false, copilot: false, padrinhos: false } });
t.ok(r.status === 200, "casal desliga experiências");
t.ok((await t.json("GET", S + "/concierge?q=traje")).status === 404, "concierge desligado no site → 404");
t.ok((await t.json("GET", I(DEMO.tokens.lucia) + "/concierge?q=mesa")).status === 404, "concierge desligado no convite → 404");
r = await t.json("GET", I(DEMO.tokens.andrade));
t.ok(!r.body.mods.experiencias.secrets && !r.body.mods.experiencias.quest && !r.body.mods.experiencias.passport, "mensagens, quest e passaporte desligados somem do convite");
t.ok(!(await t.json("GET", S)).body.mods.experiencias.lugares.length, "lugares desligados somem do site");
t.ok((await t.json("GET", "/api/admin/exp/copilot?q=pagar")).status === 404, "copiloto desligado → 404");
t.ok((await t.json("GET", P + DEMO_EXP.padrinhos.joao, null, { ck: "" })).status === 404, "portal dos padrinhos desligado → 404");
r = await t.json("PATCH", "/api/admin/exp/settings", { flags: { concierge: true, copilot: true, padrinhos: true } });
db.exec(`UPDATE weddings SET features_json = '{"concierge":false}' WHERE id = 'w_demo'`);
t.ok((await t.json("GET", S + "/concierge?q=traje")).status === 404 && (await t.json("GET", "/api/admin/exp")).body.items.find(i => i.key === "concierge").blocked, "funcionalidade desligada pela plataforma vence o interruptor do casal");
db.exec(`UPDATE weddings SET features_json = '{}' WHERE id = 'w_demo'`);
t.ok((await t.json("PATCH", "/api/admin/exp/settings", { flags: { inexistente: true } })).status === 400, "interruptor desconhecido é recusado");

/* ---------- isolamento entre casais ---------- */
const lia = await t.login(DEMO.other.email, DEMO.other.password);
const L = { ck: lia.cookie };
r = await t.json("GET", "/api/admin/exp/padrinhos", null, L);
t.ok(r.status === 200 && r.body.padrinhos.length === 0, "outro casal não vê padrinhos de Helena & Rafael");
r = await t.json("GET", "/api/admin/exp/surpresas", null, L);
t.ok(r.body.surprises.length === 0 && !r.body.households.some(h => h.id.startsWith("h_and")), "outro casal não vê surpresas nem famílias");
t.ok((await t.json("DELETE", "/api/admin/exp/segredos/sg_andrade", null, L)).status === 404, "outro casal não apaga mensagem secreta alheia");
t.ok((await t.json("DELETE", "/api/admin/exp/lugares/lp_livraria", null, L)).status === 404, "outro casal não apaga lugar alheio");
t.ok((await t.json("POST", "/api/admin/exp/padrinhos/pd_joao/link", null, L)).status === 404, "outro casal não gera link de padrinho alheio");
t.ok((await t.json("POST", "/api/admin/exp/passaporte/checkin", { event_id: "e_festa", household_id: "h_lucia" }, L)).status === 400, "outro casal não faz check-in em família alheia");
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("quantas pessoas não confirmaram?"), null, L);
t.ok(r.status === 200 && !/Andrade|Lúcia|Rossi/.test(JSON.stringify(r.body)), "copiloto do outro casal só usa os dados dele");
r = await t.json("GET", "/api/admin/exp/copilot?q=" + encodeURIComponent("quais fornecedores estão com contrato pendente?"), null, L);
t.ok(/Fornecedor da Lia/.test(r.body.text) && !/Doce Mel/.test(r.body.text), "fornecedores no copiloto: cada casal só os seus");

/* ---------- lista de espera e limpeza LGPD ---------- */
db.exec("UPDATE households SET waitlist = 1 WHERE id = 'h_rossi'");
t.ok((await t.json("GET", I(DEMO.tokens.rossi))).status === 404 && (await t.json("POST", I(DEMO.tokens.rossi) + "/exp/quest/qc_brinde", { done: true })).status === 404, "família em lista de espera não recebe passaporte/quest/mensagens");
t.ok((await t.json("POST", "/api/admin/exp/passaporte/checkin", { event_id: "e_festa", household_id: "h_rossi" })).status === 400, "casal não faz check-in de quem está na lista de espera");
db.exec("UPDATE households SET waitlist = 0 WHERE id = 'h_rossi'");
const { MODS } = await import("../src/mods/index.js");
await MODS.find(m => m.name === "experiencias").purgeGuests(t.env, "w_demo");
const left = ["passport_checkins", "quest_done", "secret_messages", "padrinhos", "padrinho_wall", "padrinho_tasks", "surprises", "surprise_members", "surprise_posts"]
  .map(tb => db.prepare(`SELECT COUNT(*) AS n FROM ${tb} WHERE wedding_id = 'w_demo'`).get().n);
t.ok(left.every(n => n === 0), "purgeGuests apaga check-ins, quest, segredos, padrinhos (tokens e mural) e surpresas");
t.ok(db.prepare("SELECT COUNT(*) AS n FROM padrinhos WHERE wedding_id = 'w_lia'").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM memory_places WHERE wedding_id = 'w_demo'").get().n === 3, "purgeGuests mantém o conteúdo do casal (lugares) e não toca em outro casal");
t.ok(!JSON.parse(db.prepare("SELECT padrinhos_json FROM exp_settings WHERE wedding_id = 'w_demo'").get().padrinhos_json).contacts.length, "contatos combinados com os padrinhos também são apagados");
t.ok((await t.json("GET", P + DEMO_EXP.padrinhos.joao, null, { ck: "" })).status === 404, "link de padrinho deixa de funcionar depois da limpeza");

t.done("experiencias");
