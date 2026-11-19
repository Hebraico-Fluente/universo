/** Capturas do site e do convite de Pétala & Lucas (celular e computador).  Uso: npm run dev  e  node test/shots-petalucas.mjs */
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const B = process.env.BASE || "http://localhost:8787", OUT = new URL("./shots/", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
const b = await chromium.launch();
for (const [tag, opts] of [["celular", devices["iPhone 13"]], ["computador", { viewport: { width: 1440, height: 900 } }]]) {
  const c = await b.newContext(opts); const p = await c.newPage();
  p.on("pageerror", e => errs.push(tag + " " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) errs.push(tag + " " + m.text()); });
  await p.goto(`${B}/c/petala-e-lucas`, { waitUntil: "networkidle" }); await W(1800);
  await p.screenshot({ path: `${OUT}pl-${tag}-01-abertura.png` });
  for (const id of ["historia", "dia", "traje", "presenca", "recados", "presentes"]) {
    await p.evaluate(i => document.getElementById(i)?.scrollIntoView(), id); await W(1300);
    await p.screenshot({ path: `${OUT}pl-${tag}-${id}.png` });
  }
  await p.evaluate(() => document.querySelector(".schedule")?.scrollIntoView({ block: "start" })); await W(1300);
  await p.screenshot({ path: `${OUT}pl-${tag}-cronograma.png` });
  await p.evaluate(() => scrollTo(0, 0)); await W(300);
  await p.screenshot({ path: `${OUT}pl-${tag}-pagina.png`, fullPage: true });
  // recado
  await p.evaluate(() => document.getElementById("recados").scrollIntoView()); await W(600);
  await p.fill("#gbForm [name=author]", "Tia Teste"); await p.fill("#gbForm [name=message]", "Muitas felicidades!"); await p.click("#gbForm button"); await W(800);
  console.log(tag, "recado:", (await p.locator(".gb-ok").textContent().catch(() => "não enviou")).slice(0, 40));
  // convite
  await p.goto(`${B}/i/exemplo-petala-e-lucas-2027`, { waitUntil: "networkidle" }); await W(900);
  await p.screenshot({ path: `${OUT}pl-${tag}-convite-envelope.png` });
  await p.click("#open"); await W(2600);
  await p.screenshot({ path: `${OUT}pl-${tag}-convite.png` });
  await p.evaluate(() => document.getElementById("rsvp").scrollIntoView()); await W(900);
  await p.screenshot({ path: `${OUT}pl-${tag}-convite-rsvp.png` });
  await c.close();
}
await b.close();
console.log("erros:", JSON.stringify(errs));
