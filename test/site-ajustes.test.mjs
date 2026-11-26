/** Ajustes do site do casal: topo sem "Confirmar presença", mural de P&L desligado, pasta do Google Drive para as fotos. */
import fs from "node:fs";
import { setup } from "./helpers.mjs";
import { sha256 } from "../src/lib.js";
import { DEMO } from "../scripts/seed.mjs";

const t = await setup();
const { ok, env } = t;
const db = env._db;
const read = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

/* ---------- topo do site e documentário ---------- */
{
  const site = read("public/assets/site.js");
  const hero = site.slice(site.indexOf('<section class="hero'), site.indexOf("</section>", site.indexOf('<section class="hero')));
  ok(hero.includes("hero-acts") && !hero.includes("Confirmar presença") && !hero.includes('href="#presenca"'), "topo do site: sem o botão “Confirmar presença”");
  ok(hero.includes("Nossa história") && hero.includes("Salvar na agenda"), "topo continua com “Nossa história” e “Salvar na agenda”");
  ok(site.includes('sec("presenca", "Presença"'), "a seção #presenca continua no site");
  ok(!read("public/assets/site-mods/documentario.js").includes("Confirmar presença") && read("public/assets/site-mods/documentario.js").includes("Voltar ao site"), "último capítulo do documentário: sem “Confirmar presença”, só “Voltar ao site”");
}

/* ---------- quiz: uma vez por pessoa (tela) ---------- */
{
  const site = read("public/assets/site.js");
  ok(!site.includes("Jogar de novo") && !site.includes("qAgain"), "quiz: não existe mais “Jogar de novo”");
  ok(site.includes("Você só pode responder uma vez, capriche!") && site.includes("Você já respondeu o quiz!"), "quiz: aviso de uma vez só e tela de “já respondeu”");
  ok((site.match(/quiz\/inicio/g) || []).length >= 2, "quiz: confere no servidor ao abrir a página e antes de começar");
}

/* ---------- prêmio do quiz ---------- */
{
  const PRIZE = "Quem ficar em 1º lugar no ranking ganha um cartão fura-fila para o bar da festa!";
  const pl = await t.json("GET", "/api/site/petala-e-lucas", null, { ck: "" });
  ok(pl.body.wedding.quiz_premio === PRIZE, "Pétala & Lucas: prêmio do quiz no site (seed = migração 0086)");
  db.prepare("UPDATE weddings SET quiz_premio = '' WHERE slug = 'petala-e-lucas'").run();
  db.exec(read("migrations/0086_quiz_premio.sql").replace(/^ALTER TABLE.*$/m, ""));
  ok(db.prepare("SELECT quiz_premio FROM weddings WHERE slug = 'petala-e-lucas'").get().quiz_premio === PRIZE, "migração 0086 grava o prêmio de P&L");
  ok((await t.json("GET", "/api/site/helena-e-rafael", null, { ck: "" })).body.wedding.quiz_premio === "", "outros casamentos: sem prêmio (caixa não aparece)");
  await t.loginDemo();
  let rr = await t.json("PATCH", "/api/admin/site", { quiz_premio: "Quem ganhar leva um brinde." });
  ok(rr.status === 200 && (await t.json("GET", "/api/site/helena-e-rafael", null, { ck: "" })).body.wedding.quiz_premio === "Quem ganhar leva um brinde.", "casal edita o prêmio no painel");
  ok((await t.json("PATCH", "/api/admin/site", { quiz_premio: "x".repeat(161) })).status === 400, "prêmio com mais de 160 caracteres é recusado");
  await t.json("PATCH", "/api/admin/site", { quiz_premio: "" });
  const site = read("public/assets/site.js");
  ok(site.includes("qprize") && site.includes("const prize = String(w.quiz_premio"), "site: cartão do prêmio no início e linha em cima do ranking");
}

/* ---------- Pétala & Lucas: sem mural ---------- */
let r = await t.json("GET", "/api/site/petala-e-lucas", null, { ck: "" });
ok(r.status === 200 && r.body.wedding.guestbook === false && r.body.messages.length === 0, "Pétala & Lucas: mural de recados desligado (seed = migração 0077)");
r = await t.json("POST", "/api/site/petala-e-lucas/recados", { author: "Teste", message: "Oi!" }, { ck: "" });
ok(r.status === 404, "Pétala & Lucas: POST de recado → 404");
{
  db.prepare("UPDATE weddings SET guestbook = 1 WHERE slug = 'petala-e-lucas'").run();
  db.prepare("INSERT INTO guestbook (id, wedding_id, author, message, status) VALUES ('m_guardado', 'w_petalucas', 'Alguém', 'recado guardado', 'approved')").run();
  db.exec(read("migrations/0077_petalucas_sem_mural.sql"));
  ok(db.prepare("SELECT guestbook FROM weddings WHERE slug = 'petala-e-lucas'").get().guestbook === 0, "migração 0077 desliga o mural de P&L");
  ok(db.prepare("SELECT COUNT(*) AS n FROM guestbook WHERE id = 'm_guardado'").get().n === 1, "migração 0077 não apaga recados guardados");
  ok(db.prepare("SELECT guestbook FROM weddings WHERE id = 'w_demo'").get().guestbook === 1, "migração 0077 só mexe em P&L");
}

/* ---------- desafio "Deixe um carinho" depende do mural ---------- */
{
  const inv = async () => (await t.json("GET", "/api/invite/" + DEMO.tokens.andrade, null, { ck: "" })).body;
  const has = b => JSON.stringify(b?.mods?.experiencias?.quest || []).includes("Deixe um carinho");
  ok(has(await inv()), "com mural: o desafio “Deixe um carinho” aparece no convite");
  db.prepare("UPDATE weddings SET guestbook = 0 WHERE id = 'w_demo'").run();
  ok(!has(await inv()) && (await inv()).mods.experiencias.quest.length > 0, "sem mural: o desafio some do convite (os outros ficam)");
  await t.loginDemo();
  r = await t.json("GET", "/api/admin/exp/quest");
  ok(!r.body.templates.some(x => x.key === "recado") && r.body.challenges.find(c => c.kind === "recado")?.off === true, "painel: sem o modelo “recado” e o desafio existente marcado como fora do convite");
  ok((await t.json("POST", "/api/admin/exp/quest", { key: "recado" })).status === 400, "sem mural: não dá para adicionar o desafio do recado");
  db.prepare("UPDATE weddings SET guestbook = 1 WHERE id = 'w_demo'").run();
}

/* ---------- pasta do Google Drive ---------- */
const FOLDER = "https://drive.google.com/drive/folders/1sFBIoYDgo728artjSkZcTZp9hmtP3EJK";
r = await t.json("GET", "/api/site/petala-e-lucas", null, { ck: "" });
ok(r.body.mods.midia?.gallery?.drive_folder === FOLDER && r.body.mods.midia.gallery.uploads === true, "Pétala & Lucas: site recebe o link da pasta (seed = migração 0079)");
{
  db.prepare("DELETE FROM media_settings WHERE wedding_id = 'w_petalucas'").run();
  db.exec(read("migrations/0079_pasta_do_drive.sql").replace(/^ALTER TABLE.*$/m, ""));
  db.exec(read("migrations/0079_pasta_do_drive.sql").replace(/^ALTER TABLE.*$/m, ""));
  const row = db.prepare("SELECT uploads_on, drive_pasta_url FROM media_settings WHERE wedding_id = 'w_petalucas'").all();
  ok(row.length === 1 && row[0].uploads_on === 1 && row[0].drive_pasta_url === FOLDER, "migração 0079 grava a pasta de P&L (idempotente)");
}
const sitePhotos = async () => (await t.json("GET", "/api/site/helena-e-rafael", null, { ck: "" })).body.mods.midia?.gallery;
await t.json("PATCH", "/api/admin/midia/ajustes", { uploads_on: true });
ok((await sitePhotos()).drive_folder === "", "sem pasta: o site não recebe link (mantém o formulário)");
r = await t.json("GET", "/api/admin/midia/drive");
ok(r.status === 200 && r.body.pasta_url === "" && r.body.can_edit === true, "painel: noivos veem o cartão do Drive");
for (const bad of ["https://evil.test/drive/folders/abcdefghijklmno", "http://drive.google.com/drive/folders/abcdefghijklmno", "https://drive.google.com/file/d/abcdefghijklmno/view",
  "https://drive.google.com.evil.test/drive/folders/abcdefghijklmno", "https://docs.google.com/forms/d/abcdefghijklmno", `${FOLDER}"><script>`, "javascript:alert(1)", `${FOLDER}#x`])
  ok((await t.json("PATCH", "/api/admin/midia/drive", { pasta_url: bad })).status === 400, "link recusado: " + bad);
for (const good of [FOLDER, FOLDER + "?usp=sharing", FOLDER + "?usp=drive_link", "https://drive.google.com/drive/u/0/folders/1sFBIoYDgo728artjSkZcTZp9hmtP3EJK"])
  ok((await t.json("PATCH", "/api/admin/midia/drive", { pasta_url: good })).status === 200, "link aceito: " + good);
ok((await sitePhotos()).drive_folder === "https://drive.google.com/drive/u/0/folders/1sFBIoYDgo728artjSkZcTZp9hmtP3EJK", "com pasta: o site recebe o link");
await t.json("PATCH", "/api/admin/midia/ajustes", { uploads_on: false });
ok(!(await sitePhotos())?.drive_folder, "envio de fotos desligado: nem formulário nem link");
await t.json("PATCH", "/api/admin/midia/ajustes", { uploads_on: true });
ok((await sitePhotos()).drive_folder, "religar o envio não apaga a pasta (os ajustes não mexem no link)");
ok((await t.json("PATCH", "/api/admin/midia/drive", { pasta_url: "" })).status === 200 && (await sitePhotos()).drive_folder === "", "tirar o link volta ao formulário");
ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE wedding_id = 'w_demo' AND action LIKE 'drive.folder.%'").get().n >= 2, "mudanças do link vão para o registro de auditoria");
{
  // cerimonial (planner) vê, mas não muda
  db.prepare("INSERT INTO users (id, email, name, pass_hash, pass_salt) VALUES ('u_cer', 'cerimonial@exemplo.test', 'Cerimonial', 'x', 'x')").run();
  db.prepare("INSERT INTO memberships (user_id, wedding_id, role) VALUES ('u_cer', 'w_demo', 'planner')").run();
  db.prepare("INSERT INTO sessions (id_hash, user_id, wedding_id, expires_at) VALUES (?, 'u_cer', 'w_demo', ?)").run(await sha256("sessao-cerimonial-drive"), new Date(Date.now() + 864e5).toISOString());
  const ck = "__Host-sess=sessao-cerimonial-drive";
  r = await t.json("GET", "/api/admin/midia/drive", null, { ck });
  ok(r.status === 200 && r.body.can_edit === false, "cerimonial vê o cartão sem poder editar");
  ok((await t.json("PATCH", "/api/admin/midia/drive", { pasta_url: FOLDER }, { ck })).status === 403, "cerimonial não muda o link da pasta");
}
{
  const g = read("public/assets/site-mods/galeria.js");
  ok(g.includes("Enviar fotos no Google Drive") && g.includes('target="_blank" rel="noopener"') && g.includes("É preciso estar logado numa conta Google."), "site: botão da pasta abre em nova aba (noopener) com o aviso da conta Google");
  ok(g.includes("const form = drive || (g.uploads ?"), "site: com a pasta, o botão substitui o formulário; sem ela, o formulário fica igual");
}

/* ---------- fotos da "Nossa história" de P&L (migração 0081) ---------- */
{
  const story = () => JSON.parse(db.prepare("SELECT story_json FROM weddings WHERE id = 'w_petalucas'").get().story_json);
  const seeded = story();
  ok(seeded[0].image === "/assets/themes/petalucas/historia/2017.jpg" && seeded[1].image === "/assets/themes/petalucas/historia/2019.jpg" && seeded[2].title === "O pedido" && seeded[2].video === "/assets/themes/petalucas/historia/pedido.mp4" && seeded[2].year === "2026" && seeded[2].text === "13 de junho de 2026." && seeded.map(x => x.year).join() === "2017,2019,2026,2027"
    && seeded[3].image === "/assets/themes/petalucas/historia/2027.jpg" && seeded.length === 4
    && seeded[3].alt === "Pétala sorrindo e mostrando a aliança, com Lucas à mesa ao fundo" && seeded[1].alt === "Pétala e Lucas abraçados, numa selfie no espelho", "P&L: fotos e descrições nos capítulos 2017, 2019 e 2027 (seed)");
  const bare = seeded.filter(x => x.title !== "O pedido").map(({ image, alt, ...x }) => x);
  db.prepare("UPDATE weddings SET story_json = ? WHERE id = 'w_petalucas'").run(JSON.stringify(bare));
  const mig = read("migrations/0081_petalucas_fotos_da_historia.sql");
  db.exec(mig); db.exec(mig);
  ok(JSON.stringify(story()) === JSON.stringify(seeded), "migração 0081 põe as três fotos e o capítulo do pedido entre 2019 e 2027 (idempotente)");
  {
    const v = fs.readFileSync(new URL("../public/assets/themes/petalucas/historia/pedido.mp4", import.meta.url));
    ok(v.length < 4 * 1024 * 1024 && v.subarray(4, 8).toString() === "ftyp" && !v.includes(Buffer.from("com.apple.quicktime")) && !v.includes(Buffer.from("creationdate")), "vídeo do pedido: MP4 abaixo de 4 MB, sem data/local do iPhone");
    ok(v.indexOf(Buffer.from("moov")) < v.indexOf(Buffer.from("mdat")), "vídeo do pedido: faststart (moov antes de mdat)");
  }
  // o editor do painel mantém o vídeo ao salvar a história (e recusa vídeo de fora)
  await t.loginDemo();
  const demoStory = [{ year: "2020", title: "Teste", text: "", video: "/assets/themes/petalucas/historia/pedido.mp4", poster: "/assets/themes/petalucas/historia/pedido.jpg", alt: "Vídeo" }];
  r = await t.json("PATCH", "/api/admin/site", { story: demoStory });
  ok(r.status === 200 && JSON.stringify(r.body.values.story[0]) === JSON.stringify(demoStory[0]), "editor: vídeo, capa e descrição do capítulo sobrevivem ao salvar");
  ok((await t.json("PATCH", "/api/admin/site", { story: [{ ...demoStory[0], video: "https://evil.test/x.mp4" }] })).status === 400, "editor: vídeo só do próprio site");
  {
    const NEW = "O casal só foi se encontrar quando Pétala estava se mudando e o Lucas apareceu para ajudar carregando caixas. Pétala chamou ele para assistir O Diabo Veste Prada, mas ela não tinha o filme em casa. Desde então eles não se desgrudaram.";
    ok(seeded[1].text === NEW, "P&L: capítulo de 2019 conta que o Lucas ajudou carregando caixas (como no quiz)");
    db.prepare("UPDATE weddings SET story_json = ? WHERE id = 'w_petalucas'").run(JSON.stringify(seeded.map((x, i) => i === 1 ? { ...x, text: NEW.replace("apareceu para ajudar carregando caixas", "ofereceu seus serviços como arquiteto") } : x)));
    const m83 = read("migrations/0083_petalucas_historia_carregando_caixas.sql");
    db.exec(m83); db.exec(m83);
    ok(JSON.stringify(story()) === JSON.stringify(seeded), "migração 0083 troca só o texto de 2019 (foto e descrição ficam; idempotente)");
  }
  for (const f of ["2017", "2019", "2027", "pedido"]) {
    const b = fs.readFileSync(new URL(`../public/assets/themes/petalucas/historia/${f}.jpg`, import.meta.url));
    ok(b[0] === 0xff && b[1] === 0xd8 && !b.includes(Buffer.from("Exif")) && !b.includes(Buffer.from("GPS")) && b.length < 300_000, `foto ${f}: JPEG leve e sem metadados EXIF/GPS`);
  }
  const r2 = await t.json("GET", "/api/site/petala-e-lucas", null, { ck: "" });
  ok(r2.body.wedding.story[0].alt.includes("piscina"), "site recebe a descrição da foto");
}

/* ---------- vídeo servido com Range (o Safari exige 206) ---------- */
{
  const res = await t.call("GET", "/assets/themes/petalucas/historia/pedido.mp4", undefined, { ck: "" });
  ok(res.status === 200 && res.headers.get("Content-Type") === "video/mp4", "vídeo do pedido servido como video/mp4");
  const part = await env.ASSETS.fetch(new Request("https://x/assets/themes/petalucas/historia/pedido.mp4", { headers: { Range: "bytes=0-1" } }));
  ok(part.status === 206 && (await part.arrayBuffer()).byteLength === 2 && /^bytes 0-1\//.test(part.headers.get("Content-Range")), "pedido de Range devolve 206 com 2 bytes");
  const viaWorker = await (await import("../src/worker.js")).handle(new Request("https://universo.test/assets/themes/petalucas/historia/pedido.mp4", { headers: { Range: "bytes=0-1" } }), env);
  ok(viaWorker.status === 206 && viaWorker.headers.get("Content-Range"), "o worker repassa o 206 (cabeçalhos de segurança não quebram o Range)");
}

/* ---------- prévia do link (WhatsApp) ---------- */
{
  const { handle } = await import("../src/worker.js");
  const r = await handle(new Request("https://universo.test/c/petala-e-lucas"), env);
  const html = await r.text();
  ok(r.status === 200 && html.includes('<meta property="og:image" content="https://universo.test/assets/themes/petalucas/og.jpg">'), "site de P&L: og:image absoluta com a imagem da prévia");
  ok(html.includes("<title>Pétala &amp; Lucas · Vamos nos casar!</title>") && html.includes("20 de fevereiro de 2027 · Estância Dom Raul · Piraquara · PR"), "site de P&L: título e descrição da prévia");
  ok((html.match(/<title>/g) || []).length === 1, "um título só");
  ok(fs.existsSync(new URL("../public/assets/themes/petalucas/og.jpg", import.meta.url)), "a imagem da prévia existe");
  const sql = read("migrations/0091_imagem_de_previa_do_link.sql");
  ok(sql.includes("og_image") && sql.includes("/assets/themes/petalucas/og.jpg"), "migração 0091 grava a imagem de P&L");
}

/* ---------- domínio antigo → petalaelucas.com.br ---------- */
{
  const { handle } = await import("../src/worker.js");
  const wr = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const DOMAIN_REDIRECTS = (wr.match(/"DOMAIN_REDIRECTS": "([^"]+)"/) || [])[1];
  const e2 = { ...env, DOMAIN_REDIRECTS };
  let r = await handle(new Request("https://petalaelucas.guetastudio.com.br/?v=1#x"), e2);
  ok(r.status === 301 && r.headers.get("Location") === "https://petalaelucas.com.br/?v=1", "domínio antigo manda (301) para petalaelucas.com.br, com a consulta");
  r = await handle(new Request("https://www.petalaelucas.com.br/api/site/x"), e2);
  ok(r.status === 301 && r.headers.get("Location") === "https://petalaelucas.com.br/api/site/x", "www vai para o domínio sem www");
  r = await handle(new Request("https://universo.test/c/petala-e-lucas"), e2);
  ok(r.status === 200, "outros endereços não são redirecionados");
}

t.done("site-ajustes");
