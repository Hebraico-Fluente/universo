/** Percorre o produto no navegador (celular e computador) e salva capturas em test/shots/.  Uso: npm run dev  e, em outro terminal, npm run e2e */
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright"); // Playwright já instalado no ambiente
import fs from "node:fs";

const B = process.env.BASE || "http://localhost:8787";
const OUT = new URL("./shots/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? "ok    " : "FALHA ") + m); if (!c) { fails++; process.exitCode = 1; } };
const problems = [];
const watch = (p, tag) => {
  p.on("pageerror", e => problems.push(`${tag} erro: ${e.message}`));
  p.on("console", m => { if (m.type() === "error" && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) problems.push(`${tag} console: ${m.text()}`); });
};

const b = await chromium.launch();
let inviteUrl = `${B}/i/demo-tia-lucia-tio-beto`; // o computador usa o convite novo criado no painel pelo celular
for (const [tag, opts] of [["celular", devices["iPhone 13"]], ["computador", { viewport: { width: 1360, height: 860 } }]]) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage(); watch(p, tag);
  const snap = (n, full = false) => p.screenshot({ path: `${OUT}${tag}-${n}.png`, fullPage: full });

  // landing
  await p.goto(B + "/", { waitUntil: "networkidle" }); await W(900);
  ok(await p.locator("h1").innerText().then(t => t.includes("Seu casamento")), `${tag}: landing abre`);
  await snap("01-landing"); await p.evaluate(() => scrollTo(0, 99999)); await W(800); await snap("01b-landing-fim", false);

  // os 3 universos
  for (const s of ["helena-e-rafael", "clara-e-davi", "lia-e-tomas"]) {
    await p.goto(`${B}/c/${s}`, { waitUntil: "networkidle" }); await W(1800);
    ok(await p.locator(".names").count() === 1, `${tag}: site ${s} renderiza`);
    await snap(`02-site-${s}`);
  }
  await p.goto(`${B}/c/helena-e-rafael`, { waitUntil: "networkidle" }); await W(600);
  await p.evaluate(() => document.getElementById("historia").scrollIntoView()); await W(1400); await snap("02b-historia");
  await p.evaluate(() => document.getElementById("dia").scrollIntoView()); await W(1400); await snap("02c-dia");
  ok(!(await p.content()).includes("Jantar de boas-vindas"), `${tag}: evento privado não aparece no site público`);

  // convite
  await p.goto(inviteUrl, { waitUntil: "networkidle" }); await W(700);
  await snap("03-envelope");
  await p.click("#open"); await W(900); await snap("03b-abrindo"); await W(1400);
  ok(await p.locator(".inv-head h1").count() === 1, `${tag}: convite abre depois do envelope`);
  await snap("03c-convite");
  ok(await p.locator(".ev").count() === 3, `${tag}: convite mostra os eventos da família`);
  await p.evaluate(() => document.getElementById("rsvp").scrollIntoView()); await W(800);
  await p.click("#send"); await W(300);
  ok((await p.locator("#err").innerText()).includes("Falta responder"), `${tag}: avisa quando falta responder`);
  const radios = p.locator('.seg input[value="yes"]'); const n = await radios.count();
  for (let i = 0; i < n; i++) await radios.nth(i).check({ force: true });
  await p.locator('.seg input[value="no"]').first().check({ force: true });
  await p.locator(".more summary").first().click(); await p.fill("[name^=diet_]", "Sem lactose");
  await p.fill("[name=note]", "Contem com a gente na pista!");
  await snap("03d-rsvp-preenchido");
  await p.click("#send"); await W(1200);
  ok(await p.locator("#done").isVisible(), `${tag}: confirmação enviada`);
  await snap("03e-confirmado");
  await p.goto(`${B}/i/token-que-nao-existe-1234`, { waitUntil: "networkidle" }); await W(400);
  ok((await p.locator("h1").innerText()).includes("Não encontramos"), `${tag}: link inválido mostra mensagem clara`);

  // painel
  await p.goto(`${B}/painel`, { waitUntil: "networkidle" }); await W(600); await snap("04-login");
  await p.click("#fill"); await W(1500);
  ok(await p.locator(".hello h1").count() === 1, `${tag}: entra no painel de demonstração`);
  await snap("04b-visao-geral", true);
  await p.goto(`${B}/painel#convidados`); await W(1200);
  ok(await p.locator(".tbl .hh").count() >= 5, `${tag}: lista de convites`);
  await snap("04c-convidados");
  await p.click("#add"); await p.fill("#newhh [name=name]", "Família Teste " + tag); await p.fill("#newhh [name=greeting]", "Ana e Léo");
  await p.locator("#people [name=p]").nth(0).fill("Ana Teste"); await p.locator("#people [name=p]").nth(1).fill("Léo Teste");
  await p.click("#newhh button[type=submit]"); await W(1200);
  const link = await p.locator(".linkbox code").innerText().catch(() => "");
  ok(/\/i\/[A-Za-z0-9_-]{22}$/.test(link), `${tag}: cria convite e mostra link novo`);
  await snap("04d-link-gerado");
  await p.goto(`${B}/painel#orcamento`); await W(1200);
  await p.click("#sim button"); await W(700);
  ok((await p.locator("#simr").textContent()).includes("Premissas"), `${tag}: simulador mostra resultado com premissas`);
  await snap("04e-orcamento", true);
  if (link) inviteUrl = link;
  if (link) { const g = await ctx.newPage(); watch(g, tag); await g.goto(link, { waitUntil: "networkidle" }); await W(500); ok((await g.locator(".to").innerText()).includes("Ana e Léo"), `${tag}: link novo abre o convite certo`); await g.close(); }
  await ctx.close();
}
await b.close();
ok(problems.length === 0, "sem erros de JavaScript nem de política de segurança no console" + (problems.length ? ":\n  " + problems.join("\n  ") : ""));
console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
