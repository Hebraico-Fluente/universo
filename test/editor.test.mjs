/** Módulo "editor": o casal edita o próprio site pelo painel (GET/PATCH /api/admin/site, desfazer, seções escondidas). */
import fs from "node:fs";
import { setup } from "./helpers.mjs";
import { hashPassword } from "../src/lib.js";
import { ICONS } from "../src/mods/editor.js";

const t = await setup();
const { ok } = t;
const SLUG = "helena-e-rafael";
const site = async (slug = SLUG) => (await t.json("GET", `/api/site/${slug}`)).body.wedding;
const patch = (data, opts) => t.json("PATCH", "/api/admin/site", data, opts);

// sem login
ok((await t.json("GET", "/api/admin/site", null, { ck: "" })).status === 401, "sem sessão: 401");

await t.loginDemo();
const demo = t.cookie;

// ícones: a lista do servidor é a mesma do navegador
const iconsJs = fs.readFileSync(new URL("../public/assets/icons.js", import.meta.url), "utf8");
const browserIcons = [...iconsJs.matchAll(/^\s{2}([a-z0-9_-]+):\s*'/gm)].map(m => m[1]);
ok(browserIcons.length > 5 && browserIcons.join() === ICONS.join(), "ícones iguais aos de public/assets/icons.js");

/* ---------------- leitura ---------------- */
let r = await t.json("GET", "/api/admin/site");
ok(r.status === 200 && r.body.values.names === "Helena & Rafael" && r.body.slug === SLUG, "GET devolve os campos do casal");
ok(Array.isArray(r.body.values.story) && r.body.values.story.length === 3 && r.body.values.hidden.length === 0, "GET traz listas e seções escondidas");
ok(r.body.icons.includes("rings") && r.body.limits.quiz > 0 && r.body.theme === "", "GET traz ícones, limites e tema");

/* ---------------- dados principais ---------------- */
r = await patch({ names: "Helena  &Rafael", date: "2027-10-16T17:00:00-03:00", city: "Curitiba · PR", venue_name: "Villa Aurora", rsvp_deadline: "2027-09-20", welcome: "Venham celebrar com a gente.", rsvp_note: "Convite individual." });
ok(r.status === 200 && r.body.changed.length === 6 && !r.body.changed.includes("names"), "salva dados principais (nomes normalizados não contam como mudança)");
let w = await site();
ok(w.names === "Helena & Rafael" && w.date === "2027-10-16T17:00:00-03:00" && w.venue_name === "Villa Aurora" && w.welcome === "Venham celebrar com a gente." && w.rsvp_note === "Convite individual." && w.rsvp_deadline === "2027-09-20", "GET /api/site reflete os dados principais");
ok((await patch({ names: "Só um nome" })).status === 400, "nomes sem & são rejeitados");
ok((await patch({ date: "2027-10-16 17:00" })).status === 400, "data sem fuso é rejeitada");
ok((await patch({ rsvp_deadline: "2027-11-01" })).status === 400, "prazo depois do casamento é rejeitado");
ok((await patch({ welcome: "x".repeat(5000) })).status === 400, "texto enorme é rejeitado");
ok((await patch({ slug: "outro-endereco" })).status === 400, "slug não é editável");
ok((await patch({ theme: "petalucas" })).status === 400, "tema não é editável");
ok((await patch({ is_demo: 0 })).body?.code === "unknown_field", "campo desconhecido é rejeitado");
ok((await patch({ welcome: 42 })).status === 400, "tipo errado é rejeitado");
r = await patch({ welcome: "Venham celebrar com a gente." });
ok(r.status === 200 && r.body.changed.length === 0, "sem mudança não cria versão");

/* ---------------- aparência e imagens ---------------- */
ok((await patch({ universe: "dreamscape" })).status === 200 && (await site()).universe === "dreamscape", "muda o universo visual");
ok((await patch({ universe: "neon" })).status === 400, "universo inexistente é rejeitado");
ok((await patch({ hero_image: "javascript:alert(1)" })).body?.code === "invalid_url", "URL javascript: é rejeitada");
ok((await patch({ hero_image: "http://exemplo.com/a.jpg" })).status === 400, "URL http (sem s) é rejeitada");
ok((await patch({ hero_image: 'https://exemplo.com/a.jpg")' })).status === 400, "URL com aspas/parênteses é rejeitada");
ok((await patch({ hero_image: "/m/../segredo" })).status === 400, "caminho com .. é rejeitado");
ok((await patch({ hero_image: "/m/abc123" })).status === 200 && (await site()).hero_image === "/m/abc123", "aceita foto enviada (/m/...)");
ok((await patch({ hero_image: "https://images.unsplash.com/photo-1?w=2000" })).status === 200, "aceita https");

/* ---------------- história ---------------- */
const story = [{ year: "2020", title: "Primeiro", text: "A." }, { year: "2023", title: "Segundo", text: "B.", image: "/m/foto1" }];
ok((await patch({ story })).status === 200, "salva a história");
ok((await patch({ story: [story[1], story[0]] })).status === 200, "reordena a história");
w = await site();
ok(w.story.length === 2 && w.story[0].title === "Segundo" && w.story[0].image === "/m/foto1", "site mostra a história na nova ordem");
ok((await patch({ story: Array.from({ length: 13 }, () => story[0]) })).body?.code === "too_many", "história com itens demais é rejeitada");
ok((await patch({ story: [{ year: "2020", title: "", text: "x" }] })).status === 400, "item da história sem título é rejeitado");
ok((await patch({ story: [{ ...story[0], image: "javascript:x" }] })).status === 400, "foto da história com URL ruim é rejeitada");

/* ---------------- cronograma, traje, dúvidas ---------------- */
ok((await patch({ schedule: [{ time: "16h", title: "Cerimônia", text: "", icon: "bomba" }] })).body?.code === "invalid_icon", "ícone inexistente é rejeitado");
ok((await patch({ schedule: [{ time: "16h", title: "Cerimônia", text: "No jardim", icon: "rings" }, { time: "18h", title: "Festa", text: "", icon: "music" }] })).status === 200, "salva o cronograma");
ok((await patch({ dress: [{ title: "Passeio", text: "Leve e elegante", icon: "shirt" }] })).status === 200, "salva o traje");
ok((await patch({ faq: [{ q: "Tem estacionamento?", a: "Sim." }] })).status === 200, "salva as dúvidas");
w = await site();
ok(w.schedule.length === 2 && w.schedule[0].icon === "rings" && w.dress[0].title === "Passeio" && w.faq[0].a === "Sim.", "site mostra cronograma, traje e dúvidas");

/* ---------------- presentes e Pix ---------------- */
ok((await patch({ pix_name: "Helena Maria e Rafael Souza" })).status === 400, "nome do Pix com mais de 25 caracteres é rejeitado");
ok((await patch({ pix_city: "Sao Jose dos Pinhais" })).status === 400, "cidade do Pix com mais de 15 caracteres é rejeitada");
ok((await patch({ gift_url: "http://loja.com/lista" })).status === 400, "lista externa sem https é rejeitada");
ok((await patch({ gift_url: "javascript:alert(1)" })).status === 400, "lista externa javascript: é rejeitada");
ok((await patch({ gifts: [{ title: "Jantar", cents: -5 }] })).status === 400, "valor negativo é rejeitado");
ok((await patch({ gifts: [{ title: "Jantar", cents: 100, icon: "foguete" }] })).status === 400, "ícone de presente inexistente é rejeitado");
r = await patch({ gifts: [{ title: "Jantar", cents: 25000, icon: "glass", note: "Na lua de mel" }, { title: "Valor livre", cents: 0 }], pix_key: "helena@exemplo.com", pix_name: "Helena e Rafael", pix_city: "Curitiba", gift_url: "https://loja.exemplo.com/lista" });
ok(r.status === 200, "salva presentes e Pix");
w = await site();
ok(w.gifts.length === 2 && w.gifts[0].icon === "glass" && w.pix_city === "Curitiba" && w.gift_url === "https://loja.exemplo.com/lista", "site mostra presentes e Pix");

/* ---------------- quiz ---------------- */
const quiz = [{ q: "Onde se conheceram?", options: ["Livraria", "Praia", "Show", "Faculdade"], answer: 0, fact: "Numa livraria em São Paulo." }];
ok((await patch({ quiz: [{ ...quiz[0], options: ["a", "b", "c"] }] })).status === 400, "quiz com 3 opções é rejeitado");
ok((await patch({ quiz: [{ ...quiz[0], answer: 4 }] })).status === 400, "quiz com resposta fora das opções é rejeitado");
ok((await patch({ quiz })).status === 200 && (await site()).quiz.length === 1, "salva o quiz e o site mostra");

/* ---------------- liga/desliga ---------------- */
ok((await patch({ hidden: ["quiz", "faq"], guestbook: false })).status === 200, "esconde quiz e dúvidas, desliga o mural");
w = await site();
ok(w.quiz.length === 0 && w.faq.length === 0 && w.guestbook === false && w.story.length === 2, "site não mostra seções escondidas");
r = await t.json("GET", "/api/admin/site");
ok(r.body.values.quiz.length === 1 && r.body.values.faq.length === 1 && r.body.values.hidden.join() === "faq,quiz", "o conteúdo escondido continua guardado no painel");
ok((await patch({ quiz: [...quiz, { q: "Qual o nome do cachorro?", options: ["Café", "Chá", "Leite", "Pão"], answer: 0, fact: "Café." }] })).status === 200 && (await site()).quiz.length === 0, "editar seção escondida não publica");
ok((await patch({ hidden: ["faq"] })).status === 200 && (await site()).quiz.length === 2, "mostrar de novo publica o conteúdo editado");
ok((await patch({ hidden: ["blog"] })).status === 400, "seção desconhecida é rejeitada");
ok((await patch({ hidden: ["gifts"] })).status === 200, "esconde presentes");
w = await site();
ok(w.gifts.length === 0 && w.pix_key === "" && w.gift_url === "", "presentes escondidos tiram lista, Pix e link do site");
ok((await t.json("POST", "/api/site/" + SLUG + "/presentes", { author: "Ana", gift: null }, { ip: "10.9.9.9" })).status === 404, "sem Pix publicado, o aviso de presente fica fechado");
ok((await patch({ hidden: [], guestbook: true })).status === 200 && (await site()).pix_key === "helena@exemplo.com", "mostrar presentes devolve o Pix");

/* ---------------- desfazer ---------------- */
await patch({ welcome: "Texto que vamos desfazer." });
ok((await site()).welcome === "Texto que vamos desfazer.", "alteração antes de desfazer");
r = await t.json("POST", "/api/admin/site/undo", {});
ok(r.status === 200 && r.body.section === "main" && (await site()).welcome === "Venham celebrar com a gente.", "desfaz a última alteração");
await patch({ story: [story[0]] });
await patch({ city: "Quatro Barras · PR" });
r = await t.json("POST", "/api/admin/site/undo", { section: "story" });
w = await site();
ok(r.status === 200 && w.story.length === 2 && w.city === "Quatro Barras · PR", "desfaz a última alteração de uma seção sem mexer nas outras");
ok((await t.json("POST", "/api/admin/site/undo", { section: "nada" })).status === 400, "seção de desfazer inválida");
r = await t.json("GET", "/api/admin/site");
ok(r.body.history.items.length > 0 && r.body.history.items.some(h => h.undone) && r.body.history.items[0].who && r.body.history.undoable.includes("main"), "histórico com quem alterou e o que foi desfeito");
const audits = (await t.env.DB.prepare("SELECT action, target FROM audit_log WHERE wedding_id = 'w_demo' AND action LIKE 'site.%'").all()).results;
ok(audits.some(a => a.action === "site.update" && a.target === "main:date,city,venue_name,rsvp_deadline,welcome,rsvp_note") && audits.some(a => a.action === "site.undo"), "auditoria registra as chaves alteradas e o desfazer");

/* ---------------- isolamento entre casais ---------------- */
const lia = await t.login("lia@universo.app", "outro-casal-demo-2027", "10.0.0.20");
r = await t.json("GET", "/api/admin/site", null, { ck: lia.cookie });
ok(r.status === 200 && r.body.values.names === "Lia & Tomás" && r.body.history.items.length === 0 && r.body.history.undoable.length === 0, "outro casal vê só o próprio site e histórico");
ok((await t.json("POST", "/api/admin/site/undo", {}, { ck: lia.cookie })).status === 404, "outro casal não desfaz alterações alheias");
ok((await patch({ welcome: "Bem-vindos a Trancoso." }, { ck: lia.cookie })).status === 200, "outro casal edita o próprio site");
ok((await site("lia-e-tomas")).welcome === "Bem-vindos a Trancoso." && (await site()).welcome === "Venham celebrar com a gente.", "edição de um casal não afeta o outro");

/* ---------------- papéis e origem ---------------- */
const pw = await hashPassword("leitura-somente-2027");
await t.env.DB.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt) VALUES ('u_view', 'viewer@exemplo.com', 'Leitora', ?, ?)").bind(pw.hash, pw.salt).run();
await t.env.DB.prepare("INSERT INTO memberships (user_id, wedding_id, role) VALUES ('u_view', 'w_demo', 'viewer')").run();
const viewer = await t.login("viewer@exemplo.com", "leitura-somente-2027", "10.0.0.30");
ok((await t.json("GET", "/api/admin/site", null, { ck: viewer.cookie })).status === 200, "viewer lê o editor");
ok((await patch({ welcome: "Hackeado" }, { ck: viewer.cookie })).status === 403, "viewer não edita");
ok((await t.json("POST", "/api/admin/site/undo", {}, { ck: viewer.cookie })).status === 403, "viewer não desfaz");
ok((await patch({ welcome: "Sem origem" }, { origin: null, ck: demo })).status === 403, "escrita sem origem é bloqueada");
ok((await site()).welcome === "Venham celebrar com a gente.", "nada mudou depois das tentativas negadas");

/* ---------------- tema próprio ---------------- */
await t.env.DB.prepare("INSERT INTO memberships (user_id, wedding_id, role) VALUES ('u_view', 'w_petalucas', 'owner')").run();
await t.env.DB.prepare("DELETE FROM memberships WHERE user_id = 'u_view' AND wedding_id = 'w_demo'").run();
const pl = await t.login("viewer@exemplo.com", "leitura-somente-2027", "10.0.0.31");
r = await t.json("GET", "/api/admin/site", null, { ck: pl.cookie });
ok(r.status === 200 && r.body.theme === "petalucas" && r.body.values.map_image.startsWith("/assets/themes/petalucas/"), "casal com tema próprio: GET mostra o tema");
ok((await patch({ universe: "editorial" }, { ck: pl.cookie })).body?.code === "theme_locked", "com tema próprio o universo não muda");
ok((await site("petala-e-lucas")).universe === "timeless", "o tema continua intacto");

t.done("editor");
