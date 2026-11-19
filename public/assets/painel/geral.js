/** Visão geral: contagem, confirmações, alertas e orçamento resumido. */
import { $, $$, esc, longDate, money, daysUntil, api } from "../ui.js";
import { viewEl, fail, state } from "./core.js";

/* ---------------- visão geral ---------------- */
export default async function overview() {
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const o = await api("/api/admin/overview");
    const w = o.wedding, b = o.budget;
    const pendingHH = o.households.total - o.households.responded;
    const main = o.events.find(e => e.name.toLowerCase().includes("festa")) || o.events[o.events.length - 1];
    const alerts = [];
    if (pendingHH) alerts.push(`${pendingHH} ${pendingHH > 1 ? "famílias ainda não responderam" : "família ainda não respondeu"}. <a href="#convidados">Ver quem falta</a>`);
    if (o.diets) alerts.push(`${o.diets} ${o.diets > 1 ? "pessoas informaram" : "pessoa informou"} restrição alimentar. Lembre de passar ao buffet.`);
    if (o.gifts?.unchecked) alerts.push(`${o.gifts.unchecked} ${o.gifts.unchecked > 1 ? "presentes avisados por Pix ainda não foram conferidos" : "presente avisado por Pix ainda não foi conferido"} no extrato. <a href="#presentes">Ver presentes</a>`);
    if (b.to_pay > 0) alerts.push(`Faltam ${money(b.to_pay)} a pagar em contratos fechados. <a href="#orcamento">Ver vencimentos</a>`);
    viewEl().innerHTML = `
      <section class="hello">
        <p class="label">${esc(longDate(w.date_iso))}</p>
        <h1>${esc(w.names)}</h1>
        <p class="big num">${daysUntil(w.date_iso)} <span>dias para o casamento</span></p>
      </section>
      <section class="grid3">
        ${o.events.map(e => `<article class="stat">
          <p class="label">${esc(e.name)}</p>
          <p class="n num">${e.yes}<span> / ${e.invited}</span></p><p class="muted">confirmados</p>
          <div class="meter" role="img" aria-label="${e.yes} sim, ${e.no} não, ${e.pending} pendentes"><i class="m-yes"></i><i class="m-no"></i></div>
          <p class="legend"><span class="tag yes">${e.yes} sim</span><span class="tag no">${e.no} não</span><span class="tag pending">${e.pending} pendentes</span></p>
        </article>`).join("")}
      </section>
      <section class="split">
        <article class="panel"><h2>Atenção agora</h2>${alerts.length ? `<ul class="alerts">${alerts.map(a => `<li>${a}</li>`).join("")}</ul>` : `<p class="muted">Nada pendente. Aproveitem.</p>`}</article>
        <article class="panel"><h2>Orçamento</h2>
          <dl class="kv"><div><dt>Planejado</dt><dd class="num">${money(b.planned)}</dd></div><div><dt>Contratado</dt><dd class="num">${money(b.committed)}</dd></div>
          <div><dt>Pago</dt><dd class="num">${money(b.paid)}</dd></div><div><dt>A pagar</dt><dd class="num strong">${money(b.to_pay)}</dd></div></dl>
          <a class="btn ghost sm" href="#orcamento">Abrir orçamento</a></article>
      </section>
      <p class="muted small">Respostas de ${o.households.responded} de ${o.households.total} convites · ${main ? `${main.pending} pessoas pendentes na ${esc(main.name.toLowerCase())}` : ""}</p>`;
    // larguras das barras via CSSOM (sem estilos inline)
    $$(".stat").forEach((el, i) => { const e = o.events[i]; const t = Math.max(1, e.invited); el.querySelector(".m-yes").style.width = (e.yes / t * 100) + "%"; el.querySelector(".m-no").style.width = (e.no / t * 100) + "%"; });
  } catch (e) { fail(e); }
}
