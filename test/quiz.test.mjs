/** Módulo "quiz" (ranking dos amigos) e música do casal (music_url no editor do site). */
import fs from "node:fs";
import { setup } from "./helpers.mjs";
import { normName, TOP } from "../src/mods/quiz.js";
import { spotifyTrackUrl } from "../src/mods/editor.js";

const t = await setup();
const { ok, env } = t;
const db = env._db;
const SLUG = "helena-e-rafael", LIA = "lia-e-tomas";
const TRACK = "4uLU6hMCjMI75M1A2tKUQC"; // ID de exemplo (só nos testes)
const QUIZ = [0, 1, 2, 3, 0].map((answer, i) => ({ q: `Pergunta de teste ${i + 1}?`, options: ["A", "B", "C", "D"], answer, fact: "Curiosidade." }));
const RIGHT = QUIZ.map(q => q.answer);
const play = (name, answers, seconds = 40, opts = {}) => t.json("POST", `/api/site/${opts.slug || SLUG}/quiz`, { name, answers, seconds, ...(opts.extra || {}) }, { ip: opts.ip || "10.1.0.1", ck: "" , ...(opts.origin !== undefined ? { origin: opts.origin } : {}) });
const ranking = (slug = SLUG, ip = "10.1.9.9") => t.json("GET", `/api/site/${slug}/quiz/ranking`, null, { ip, ck: "" });
const wrong = n => RIGHT.map((a, i) => (i < n ? (a + 1) % 4 : a)); // n respostas erradas

await t.loginDemo();
const demo = t.cookie;

/* ---------------- quiz sem perguntas: rotas fechadas ---------------- */
ok((await ranking()).status === 404, "sem perguntas: ranking não existe");
ok((await play("Ana", [])).status === 404, "sem perguntas: não dá para jogar");
let r = await t.json("PATCH", "/api/admin/site", { quiz: QUIZ });
ok(r.status === 200, "casal cria o quiz pelo editor");

/* ---------------- nome obrigatório e validação ---------------- */
ok((await play("", RIGHT)).status === 400, "nome obrigatório");
ok((await play("A", RIGHT)).status === 400, "nome com 1 letra é recusado");
ok((await play("x".repeat(41), RIGHT)).status === 400, "nome com mais de 40 caracteres é recusado");
ok((await play("!!!", RIGHT)).status === 400, "nome sem letras é recusado");
ok((await play("Ana", RIGHT.slice(0, 3))).body?.code === "quiz_changed", "respostas faltando: o quiz mudou (409)");
ok((await play("Ana", [...RIGHT.slice(0, 4), 7])).status === 400, "resposta fora de 0–3 é recusada");
ok((await play("Ana", RIGHT, "rápido")).status === 400, "tempo inválido é recusado");
ok((await play("Ana", RIGHT, 10, { origin: "https://golpe.com" })).status === 403, "origem errada: 403");
ok((await play("Ana", RIGHT, 10, { origin: null })).status === 403, "sem origem: 403");

/* ---------------- pontuação calculada no servidor ---------------- */
r = await play("Ana Souza", wrong(2), 30, { extra: { score: 5, total: 5, acertos: 5 } });
ok(r.status === 201 && r.body.score === 3 && r.body.total === 5 && r.body.position === 1, "servidor calcula 3 de 5 (ignora a pontuação enviada pelo cliente)");
ok(db.prepare("SELECT score FROM quiz_scores WHERE name_norm = 'ana souza'").get().score === 3, "banco guarda a pontuação do servidor");

/* ---------------- uma jogada por pessoa: nome (sem acento/maiúscula) ou aparelho ---------------- */
r = await play("  ANA   souza ", wrong(0), 10);
ok(r.status === 409 && r.body.code === "ja_jogou" && r.body.played && r.body.score === 3 && r.body.total === 5 && r.body.position === 1 && r.body.top.find(x => x.me)?.name === "Ana Souza", "mesmo nome (maiúsculas/espaços): 409 já jogou, com a marca e a posição");
r = await play("Âna Sóuza", wrong(0), 50);
ok(r.status === 409 && r.body.code === "ja_jogou", "mesmo nome com acentos: bloqueado");
ok(db.prepare("SELECT COUNT(*) AS n FROM quiz_scores WHERE wedding_id = 'w_demo'").get().n === 1 && db.prepare("SELECT score, name FROM quiz_scores WHERE wedding_id = 'w_demo'").get().score === 3, "a primeira jogada vale (não melhora repetindo)");
{
  const dev = db.prepare("SELECT device_hash FROM quiz_scores WHERE wedding_id = 'w_demo'").get().device_hash;
  ok(/^[A-Za-z0-9+/=]{40,}$/.test(dev || ""), "banco guarda só o hash do aparelho");
  // mesmo aparelho (cookie), outro nome: bloqueado
  const first = await t.call("POST", `/api/site/${SLUG}/quiz/inicio`, {}, { ck: "", ip: "10.1.5.1" });
  const setc = first.headers.get("Set-Cookie") || "", fj = await first.json();
  ok(first.status === 200 && fj.played === false && /^__Host-quizdev=[A-Za-z0-9_-]{16,64}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=\d+$/.test(setc) && fj.device === setc.split(";")[0].split("=")[1], "início: aparelho novo ganha um id (cookie HttpOnly/Secure + JSON para o localStorage)");
  const ck = setc.split(";")[0];
  r = await t.json("POST", `/api/site/${SLUG}/quiz`, { name: "Gabi", answers: RIGHT, seconds: 30 }, { ck, ip: "10.1.5.1" });
  ok(r.status === 201 && r.body.score === 5, "aparelho joga a primeira vez");
  r = await t.json("POST", `/api/site/${SLUG}/quiz`, { name: "Outro Nome", answers: RIGHT, seconds: 30 }, { ck, ip: "10.1.5.1" });
  ok(r.status === 409 && r.body.code === "ja_jogou" && r.body.name === "Gabi", "mesmo aparelho com outro nome: bloqueado");
  r = await t.json("POST", `/api/site/${SLUG}/quiz`, { name: "Outro Nome", answers: RIGHT, seconds: 30, device: fj.device }, { ck: "", ip: "10.1.5.2" });
  ok(r.status === 409, "sem o cookie, o id guardado no navegador (localStorage) também segura");
  r = await t.json("POST", `/api/site/${SLUG}/quiz/inicio`, {}, { ck, ip: "10.1.5.1" });
  ok(r.status === 200 && r.body.played && r.body.score === 5 && r.body.position >= 1 && Array.isArray(r.body.top), "ao abrir a página, o aparelho que já jogou recebe o resultado");
  r = await t.json("POST", `/api/site/${SLUG}/quiz/inicio`, { name: "gabi" }, { ck: "", ip: "10.1.5.3" });
  ok(r.body.played && r.body.name === "Gabi", "antes de começar, o nome já usado é reconhecido (outro aparelho)");
  r = await t.json("POST", `/api/site/${SLUG}/quiz/inicio`, { name: "Pessoa Nova" }, { ck: "", ip: "10.1.5.3" });
  ok(r.body.played === false, "nome novo em aparelho novo pode jogar");
  ok((await t.json("POST", `/api/site/${SLUG}/quiz/inicio`, {}, { ck: "", origin: "https://golpe.com" })).status === 403, "início exige a mesma origem");
  // painel: liberar nova tentativa (apaga a jogada; nome e aparelho voltam a poder jogar)
  const gabi = db.prepare("SELECT id FROM quiz_scores WHERE wedding_id = 'w_demo' AND name = 'Gabi'").get().id;
  ok((await t.json("DELETE", "/api/admin/quiz/" + gabi, null, { ck: demo })).status === 200, "painel libera nova tentativa");
  ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'quiz.retry' AND target = ?").get(gabi).n === 1, "liberar nova tentativa vai para o registro de auditoria");
  r = await t.json("POST", `/api/site/${SLUG}/quiz`, { name: "Gabi", answers: wrong(1), seconds: 31 }, { ck, ip: "10.1.5.1" });
  ok(r.status === 201 && r.body.score === 4, "depois de liberada, a pessoa joga de novo (mesmo nome e aparelho)");
  db.prepare("DELETE FROM quiz_scores WHERE name = 'Gabi'").run();
}
ok(normName("  Zé   da SILVA ") === "ze da silva", "normalização: sem acentos, minúsculo, espaços simples");

/* ---------------- tempo limitado a 5 s – 1 h ---------------- */
r = await play("Bruno", wrong(0), 0);
ok(r.body.seconds === 5, "tempo abaixo de 5 s vira 5 s");
r = await play("Carla", wrong(1), 99999);
ok(r.body.seconds === 3600, "tempo acima de 1 h vira 1 h");

/* ---------------- desempate por tempo ---------------- */
r = await play("Duda", wrong(0), 12);
ok(r.body.position === 2, "mesmos acertos: quem foi mais rápido fica na frente (Bruno 5 s > Duda 12 s)");
r = await ranking();
ok(r.status === 200 && r.body.top.map(x => x.name).join() === "Bruno,Duda,Carla,Ana Souza", "ranking: mais acertos, depois menor tempo");
ok(r.body.top.every(x => Object.keys(x).sort().join() === "name,score,total"), "ranking público mostra só nome, acertos e total");
ok(r.res.headers.get("Cache-Control") === "no-store", "ranking não fica em cache");

/* ---------------- top 10 e posição do próprio visitante ---------------- */
for (let i = 0; i < 12; i++) await play(`Amigo ${String(i).padStart(2, "0")}`, wrong(2), 60 + i, { ip: "10.1.1." + i });
r = await play("Último Lugar", wrong(5), 3000, { ip: "10.1.2.1" });
ok(r.body.position === 17 && r.body.count === 17 && r.body.top.length === TOP && !r.body.top.some(x => x.me), "fora do top 10: posição certa e o top tem 10");
r = await play("Duda", wrong(0), 30, { ip: "10.1.2.2" });
ok(r.status === 409 && r.body.top.filter(x => x.me).length === 1 && r.body.top.find(x => x.me).name === "Duda" && r.body.position === 2, "quem já jogou vê a própria marca no top 10 (marcada)");
ok((await ranking()).body.top.length === TOP, "GET ranking devolve só o top 10");

/* ---------------- limite por IP ---------------- */
let last;
for (let i = 0; i < 25; i++) last = await play("Spam " + i, RIGHT, 30, { ip: "10.9.9.9" });
ok(last.status === 429, "limite de tentativas por IP");
ok(db.prepare("SELECT COUNT(*) AS n FROM quiz_scores WHERE name LIKE 'Spam %'").get().n <= 20, "tentativas acima do limite não entram no ranking");

/* ---------------- isolamento entre casais ---------------- */
db.prepare("UPDATE weddings SET quiz_json = ? WHERE id = 'w_lia'").run(JSON.stringify(QUIZ.slice(0, 3)));
r = await play("Ana Souza", RIGHT.slice(0, 3), 9, { slug: LIA, ip: "10.2.0.1" });
ok(r.status === 201 && r.body.position === 1 && r.body.count === 1 && r.body.total === 3, "outro casal tem ranking próprio");
ok((await ranking(LIA)).body.top.length === 1 && !(await ranking()).body.top.some(x => x.total === 3), "rankings não se misturam");
const lia = (await t.login("lia@universo.app", "outro-casal-demo-2027", "10.0.0.20")).cookie;
const demoRow = db.prepare("SELECT id FROM quiz_scores WHERE wedding_id = 'w_demo' AND name = 'Bruno'").get();
ok((await t.json("DELETE", "/api/admin/quiz/" + demoRow.id, null, { ck: lia })).status === 404, "um casal não apaga nomes do ranking de outro");
r = await t.json("GET", "/api/admin/quiz", null, { ck: lia });
ok(r.status === 200 && r.body.items.length === 1 && r.body.items[0].total === 3, "painel do outro casal mostra só o próprio ranking");

/* ---------------- moderação no painel ---------------- */
ok((await t.json("GET", "/api/admin/quiz", null, { ck: "" })).status === 401, "ranking completo exige login");
r = await t.json("GET", "/api/admin/quiz", null, { ck: demo });
ok(r.status === 200 && r.body.items.length > TOP && r.body.items[0].name === "Bruno" && r.body.items[0].position === 1 && "seconds" in r.body.items[0], "casal vê o ranking completo (com tempo)");
ok((await t.json("DELETE", "/api/admin/quiz/" + demoRow.id, null, { ck: demo, origin: "https://golpe.com" })).status === 403, "apagar exige a origem do painel");
ok((await t.json("DELETE", "/api/admin/quiz/" + demoRow.id, null, { ck: demo })).status === 200, "casal apaga um nome");
ok(!(await ranking()).body.top.some(x => x.name === "Bruno"), "nome apagado some do ranking público");
ok(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE wedding_id = 'w_demo' AND action = 'quiz.retry' AND target = ?").get(demoRow.id).n === 1, "apagar fica na auditoria");
ok((await t.json("DELETE", "/api/admin/quiz/" + demoRow.id, null, { ck: demo })).status === 404, "apagar de novo: 404");

/* ---------------- LGPD: exportação e limpeza ---------------- */
r = await t.json("GET", "/api/admin/export", null, { ck: demo });
const ex = r.body.quiz?.quiz_scores || r.body.quiz_scores;
ok(r.status === 200 && Array.isArray(ex) && ex.length > TOP && ex.every(x => !("name_norm" in x)), "exportação inclui o ranking do quiz");
r = await t.json("POST", "/api/admin/privacidade/apagar", { confirm: "Helena & Rafael" }, { ck: demo });
ok(r.status === 200, "casal apaga os dados dos convidados");
ok(db.prepare("SELECT COUNT(*) AS n FROM quiz_scores WHERE wedding_id = 'w_demo'").get().n === 0, "limpeza LGPD apaga o ranking do quiz");
ok(db.prepare("SELECT COUNT(*) AS n FROM quiz_scores WHERE wedding_id = 'w_lia'").get().n === 1, "limpeza de um casal não toca no ranking do outro");

/* ---------------- quiz escondido: ranking fecha ---------------- */
await t.json("PATCH", "/api/admin/site", { hidden: ["quiz"] }, { ck: demo });
ok((await ranking(SLUG, "10.3.0.1")).status === 404 && (await play("Zeca", RIGHT, 20, { ip: "10.3.0.2" })).status === 404, "quiz escondido: ranking e jogo fechados");

/* ---------------- Pétala & Lucas: 18 perguntas (seed = migrações 0075 + 0080 + 0082 + 0084 + 0087 + 0089) ---------------- */
const { PL_QUIZ } = await (async () => { const s = (await t.json("GET", "/api/site/petala-e-lucas")).body.wedding.quiz; return { PL_QUIZ: s }; })();
{
  const right = q => q.options[q.answer];
  const by = text => PL_QUIZ.find(q => q.q === text);
  ok(PL_QUIZ.length === 18 && !PL_QUIZ.some(q => q.q === "E qual é a bebida do noivo?" || q.q === "Quais destes são os gatos do casal?"), "Pétala & Lucas: 18 perguntas, sem a da bebida do noivo e sem a dos gatos");
  ok(right(by("Qual é o drink da noiva?")) === "Caipirinha de limão sem açúcar", "a pergunta do drink da noiva continua");
  ok(right(by("Como o Lucas entrou na mudança da Pétala, em 2019?")) === "Carregando caixas" && by("Como o Lucas entrou na mudança da Pétala, em 2019?").fact === "Carregando caixas! Desde então, não se desgrudaram.", "mudança de 2019 → “Carregando caixas”");
  const novas = [
    ["Qual o bicho favorito do Lucas?", "Coffee|Pólen|Felipe|Miguel", "Coffee"],
    ["Qual o perfume que o Lucas vai usar no casamento?", "Jequiti Cebolinha|Grand Soir|Malbecão da Massa|Naxos", "Grand Soir"],
    ["Qual a viagem favorita do casal?", "Lençóis Maranhenses|Afropunk Salvador|Carnaval Rio de Janeiro|Interior do Maranhão", "Interior do Maranhão"],
    ["Qual a fruta favorita da Pétala?", "Limão|Jambo|Maracujá|Cupuaçu", "Jambo"],
    ["Qual a série favorita do casal?", "Magnatas do Crime|As Quatro Estações|Machos Alpha|Attack on Titan", "Magnatas do Crime"],
    ["Qual o lugar favorito do casal em Curitiba?", "Il Barbuto|Na Feira Bar|Casa Alaafia|Sociedade Treze de Maio", "Sociedade Treze de Maio"],
    ["Qual o carro dos sonhos da Pétala?", "BYD Seal|Honda Civic Type R|Ferrari Testarossa|Kombi do Scooby-Doo", "Honda Civic Type R"],
    ["Qual o anime favorito do Lucas?", "Naruto Shippuden|Attack on Titan|Jujutsu Kaisen|Demon Slayer", "Attack on Titan"],
    ["Quantas plantas a Pétala tem?", "108|46|97|85", "46"],
    ["Quantos perfumes o Lucas tem?", "55|42|38|61", "55"],
    ["Qual o pet mais velho do casal?", "Coffee|Miguel|Antônio|Pólen", "Pólen"],
  ];
  ok(JSON.stringify(PL_QUIZ.slice(7).map(q => [q.q, q.options.join("|"), right(q)])) === JSON.stringify(novas), "as 11 perguntas novas, na ordem, com as opções e respostas do casal");
}
{
  // reconstrói o quiz pelas migrações, como no banco de produção: 5 originais (0005) → 0075 → 0080 → 0082 → 0084
  const mig = n => fs.readFileSync(new URL(`../migrations/${n}.sql`, import.meta.url), "utf8");
  const get = () => JSON.parse(db.prepare("SELECT quiz_json FROM weddings WHERE id = 'w_petalucas'").get().quiz_json);
  const ix = PL_QUIZ.findIndex(q => q.q === "Como o Lucas entrou na mudança da Pétala, em 2019?");
  const orig5 = PL_QUIZ.slice(0, 5).map((q, i) => i === ix ? { ...q, answer: 0, fact: "Ele ofereceu seus serviços como arquiteto. Desde então, não se desgrudaram." } : q);
  db.prepare("UPDATE weddings SET quiz_json = ? WHERE id = 'w_petalucas'").run(JSON.stringify(orig5));
  db.exec(mig("0075_petalucas_mais_perguntas_no_quiz")); db.exec(mig("0075_petalucas_mais_perguntas_no_quiz"));
  const a = get();
  ok(a.length === 9 && a[7].q === "E qual é a bebida do noivo?" && a[7].options[a[7].answer] === "Tequila", "migração 0075 acrescenta as 4 perguntas (uma vez só)");
  db.exec(mig("0080_petalucas_bicho_do_lucas_no_quiz")); db.exec(mig("0080_petalucas_bicho_do_lucas_no_quiz"));
  ok(get().length === 16, "migração 0080 acrescenta 7 perguntas (uma vez só)");
  db.exec(mig("0082_petalucas_resposta_da_mudanca")); db.exec(mig("0082_petalucas_resposta_da_mudanca"));
  const before84 = get();
  db.exec(mig("0084_petalucas_sem_bebida_do_noivo")); db.exec(mig("0084_petalucas_sem_bebida_do_noivo"));
  const after84 = get();
  db.exec(mig("0087_petalucas_mais_quatro_perguntas_no_quiz")); db.exec(mig("0087_petalucas_mais_quatro_perguntas_no_quiz"));
  const before89 = get();
  db.exec(mig("0089_petalucas_sem_pergunta_dos_gatos")); db.exec(mig("0089_petalucas_sem_pergunta_dos_gatos"));
  const full = get();
  ok(before89.length === 19 && JSON.stringify(full) === JSON.stringify(before89.filter(q => q.q !== "Quais destes são os gatos do casal?")), "0089 só tira a pergunta dos gatos (as outras idênticas e na mesma ordem)");
  ok(JSON.stringify(full) === JSON.stringify(PL_QUIZ), "0082 corrige a mudança, 0084 tira a bebida do noivo e 0087 põe o anime, as plantas, os perfumes e o pet mais velho, 0089 tira os gatos: igual ao seed (idempotente)");
  ok(JSON.stringify(after84) === JSON.stringify(before84.filter(q => q.q !== "E qual é a bebida do noivo?")), "0084 só tira aquela pergunta (as outras idênticas e na mesma ordem)");
  r = await play("Visitante", full.map(q => q.answer), 60, { slug: "petala-e-lucas", ip: "10.4.0.1" });
  ok(r.status === 201 && r.body.score === 18 && r.body.total === 18, "Pétala & Lucas: 18 de 18 calculado no servidor");
  const coffee = full.findIndex(q => q.q === "Qual o bicho favorito do Lucas?");
  r = await play("Visitante 2", full.map((q, i) => i === coffee ? 1 : q.answer), 70, { slug: "petala-e-lucas", ip: "10.4.0.2" });
  ok(r.status === 201 && r.body.score === 17 && r.body.total === 18, "errar só a pergunta do Coffee: 17 de 18");
  ok((await play("Visitante 3", full.map(q => q.answer).concat(0), 50, { slug: "petala-e-lucas", ip: "10.4.0.3" })).status === 409, "quiz antigo em cache (19 respostas) recebe “recarregue a página”");
}

/* ---------------- música do casal (music_url) ---------------- */
const variants = [
  `https://open.spotify.com/track/${TRACK}`,
  `https://open.spotify.com/track/${TRACK}?si=a1b2c3d4e5f64a7b`,
  `https://open.spotify.com/intl-pt/track/${TRACK}?si=abc123`,
  `https://open.spotify.com/intl-pt-br/track/${TRACK}`,
  `https://open.spotify.com/embed/track/${TRACK}?utm_source=generator&theme=0`,
  `  https://open.spotify.com/track/${TRACK}/  `,
  `spotify:track:${TRACK}`,
];
ok(variants.every(v => spotifyTrackUrl(v) === `https://open.spotify.com/track/${TRACK}`), "links válidos do Spotify são normalizados para o ID");
const bad = [
  "javascript:alert(1)", `http://open.spotify.com/track/${TRACK}`, `https://open.spotify.com.golpe.com/track/${TRACK}`,
  `https://golpe.com/open.spotify.com/track/${TRACK}`, `https://open.spotify.com/album/${TRACK}`, `https://open.spotify.com/playlist/${TRACK}`,
  "https://open.spotify.com/track/curto", `https://open.spotify.com/track/${TRACK}"><script>`, `https://youtube.com/watch?v=${TRACK}`,
  `https://open.spotify.com/track/${TRACK}#"onload=x`, `data:text/html,${TRACK}`,
];
for (const v of bad) {
  r = await t.json("PATCH", "/api/admin/site", { music_url: v }, { ck: demo });
  if (r.status !== 400 || r.body.code !== "invalid_url") { ok(false, "music_url recusado: " + v); }
}
ok(true, `music_url recusa ${bad.length} links que não são faixa do Spotify (javascript:, outros domínios, álbum, http…)`);
ok((await t.json("GET", `/api/site/${SLUG}`)).body.wedding.music === null, "sem música: o site não recebe nada");
r = await t.json("PATCH", "/api/admin/site", { music_url: `https://open.spotify.com/intl-pt/track/${TRACK}?si=xyz`, music_label: "Pétala — Djavan" }, { ck: demo });
ok(r.status === 200 && r.body.values.music_url === `https://open.spotify.com/track/${TRACK}` && r.body.changed.join() === "music_url,music_label", "painel salva o link normalizado e o rótulo");
let w = (await t.json("GET", `/api/site/${SLUG}`)).body.wedding;
ok(w.music?.track === TRACK && w.music.label === "Pétala — Djavan", "site recebe só o ID da faixa e o rótulo");
ok((await t.json("PATCH", "/api/admin/site", { music_label: "x".repeat(61) }, { ck: demo })).status === 400, "rótulo com mais de 60 caracteres é recusado");
ok((await t.json("PATCH", "/api/admin/site", { music_url: `https://open.spotify.com/track/${TRACK}` }, { ck: lia })).status === 200
  && (await t.json("GET", `/api/site/${LIA}`)).body.wedding.music.label === "", "outro casal configura a própria música");
r = await t.json("POST", "/api/admin/site/undo", { section: "music" }, { ck: demo });
ok(r.status === 200 && r.body.values.music_url === "" && (await t.json("GET", `/api/site/${SLUG}`)).body.wedding.music === null, "desfazer remove a música");

/* ---------------- CSP: o player do Spotify pode ser embutido ---------------- */
r = await t.call("GET", `/c/${SLUG}`);
const csp = r.headers.get("Content-Security-Policy");
ok(csp.includes("frame-src https://open.spotify.com") && csp.includes("frame-ancestors 'none'") && csp.includes("script-src 'self'"), "CSP permite só o embed do Spotify (o resto continua igual)");
ok(fs.readFileSync(new URL("../public/assets/site-mods/index.js", import.meta.url), "utf8").includes("./musica.js"), "módulo da música registrado no site");

t.done("quiz");
