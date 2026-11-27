/** Visão geral = central do casamento: contagem, progresso, confirmações, radar de riscos, urgências, agenda, pagamentos e orçamento. */
import { $, $$, esc, longDate, money, daysUntil, api } from "../ui.js";
import { viewEl, fail, css } from "./core.js";

const dBR = iso => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "");
const LEVEL = { alto: "Urgente", medio: "Atenção", baixo: "Lembrete" };

export default async function overview() {
  css("/assets/painel/organizacao.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const o = await api("/api/admin/overview");
    const w = o.wedding, b = o.budget, c = o.mods?.organizacao;
    const pendingHH = o.households.total - o.households.responded;
    const main = o.events.find(e => e.name.toLowerCase().includes("festa")) || o.events[o.events.length - 1];
    // "Atenção agora": pendências do dia a dia (o radar abaixo cuida dos riscos)
    const alerts = [];
    if (pendingHH) alerts.push(`${pendingHH} ${pendingHH > 1 ? "famílias ainda não responderam" : "família ainda não respondeu"}. <a href="#convidados">Ver quem falta</a>`);
    if (o.gifts?.unchecked) alerts.push(`${o.gifts.unchecked} ${o.gifts.unchecked > 1 ? "presentes avisados por Pix ainda não foram conferidos" : "presente avisado por Pix ainda não foi conferido"} no extrato. <a href="#presentes">Ver presentes</a>`);
    if (b.to_pay > 0) alerts.push(`Faltam ${money(b.to_pay)} a pagar em contratos fechados. <a href="#orcamento">Ver vencimentos</a>`);
    if (!c && o.diets) alerts.push(`${o.diets} ${o.diets > 1 ? "pessoas informaram" : "pessoa informou"} restrição alimentar. <a href="#restricoes">Ver lista para o buffet</a>`);
    // alertas simples publicados por outros módulos ({ text, href })
    for (const [name, m] of Object.entries(o.mods || {})) if (name !== "organizacao" && Array.isArray(m?.alerts)) for (const a of m.alerts.slice(0, 4)) if (a?.text) alerts.push(`${esc(a.text)}${a.href && /^#[\w-]+$/.test(a.href) ? ` <a href="${esc(a.href)}">Abrir</a>` : ""}`);

    viewEl().innerHTML = `<div class="o-root">
      <section class="hello">
        <p class="label">${esc(longDate(w.date_iso))}</p>
        <h1>${esc(w.names)}</h1>
        <p class="big num">${daysUntil(w.date_iso)} <span>dias para o casamento</span></p>
      </section>
      ${c ? `<section class="o-progress" aria-labelledby="pgT">
        <div class="o-pct"><p class="label" id="pgT">Progresso do casamento</p><b class="num">${c.progress.pct}<span>%</span></b>
          <p>${c.progress.parts.some(p => p.total) ? "Média do que já está resolvido em tarefas, respostas dos convidados e fornecedores." : "Comecem pelas tarefas e pelos fornecedores: o progresso aparece aqui."}</p></div>
        <ul class="o-parts">${c.progress.parts.map(p => `<li><a href="${p.href}"><span class="o-pl"><span>${esc(p.label)}</span><span>${p.total ? `${p.done} de ${p.total}` : "nada cadastrado"}</span></span>
          <span class="o-bar" role="progressbar" aria-label="${esc(p.label)}" aria-valuemin="0" aria-valuemax="${p.total || 0}" aria-valuenow="${p.done}" aria-valuetext="${p.done} de ${p.total}"><i data-w="${p.total ? Math.round(p.done / p.total * 100) : 0}"></i></span></a></li>`).join("")}</ul>
      </section>` : ""}
      <section class="grid3">
        ${o.events.map(e => `<article class="stat">
          <p class="label">${esc(e.name)}</p>
          <p class="n num">${e.yes}<span> / ${e.invited}</span></p><p class="muted">confirmados</p>
          <div class="meter" role="img" aria-label="${e.yes} sim, ${e.no} não, ${e.pending} pendentes"><i class="m-yes"></i><i class="m-no"></i></div>
          <p class="legend"><span class="tag yes">${e.yes} sim</span><span class="tag no">${e.no} não</span><span class="tag pending">${e.pending} pendentes</span></p>
        </article>`).join("")}
      </section>
      <section class="split">
        ${c ? `<article class="panel" aria-labelledby="rdT"><h2 id="rdT">Radar de riscos</h2>
          ${c.risks.length ? `<ul class="o-radar">${c.risks.map(r => `<li class="o-risk ${r.level}">
            <div><p class="o-lvl">${LEVEL[r.level]}</p><h3>${esc(r.title)}</h3></div>
            <p class="o-ra-why">${esc(r.why)}</p>
            <div class="o-ra"><a href="${esc(r.href)}">${esc(r.action || "Resolver")}</a><button class="link small" type="button" data-dismiss="${esc(r.key)}" aria-label="Descartar alerta: ${esc(r.title)}">Descartar</button></div></li>`).join("")}</ul>`
            : `<p class="o-calm">Nenhum risco à vista agora. O radar olha pagamentos, prazos de confirmação, conflitos de agenda, tarefas sem dono, contratos e restrições alimentares.</p>`}
          ${c.dismissed ? `<p class="small muted">${c.dismissed} ${c.dismissed > 1 ? "alertas descartados" : "alerta descartado"} · <button class="link small" type="button" id="restore">mostrar de novo</button></p>` : ""}
        </article>` : ""}
        <article class="panel"><h2>Atenção agora</h2>${alerts.length ? `<ul class="alerts">${alerts.map(a => `<li>${a}</li>`).join("")}</ul>` : `<p class="muted">Nada pendente. Aproveitem.</p>`}
          <h2 class="o-h2">Orçamento</h2>
          <dl class="kv"><div><dt>Planejado</dt><dd class="num">${money(b.planned)}</dd></div><div><dt>Contratado</dt><dd class="num">${money(b.committed)}</dd></div>
          <div><dt>Pago</dt><dd class="num">${money(b.paid)}</dd></div><div><dt>A pagar</dt><dd class="num strong">${money(b.to_pay)}</dd></div></dl>
          <a class="btn ghost sm" href="#orcamento">Abrir orçamento</a></article>
      </section>
      ${c ? `<section class="o-cols">
        <article class="panel" aria-labelledby="utT"><h2 id="utT">Tarefas urgentes</h2>
          ${c.urgent_tasks.length ? `<ul class="o-mini">${c.urgent_tasks.map(t => `<li><div><b>${esc(t.title)}</b><span class="muted small">${t.owner ? esc(t.owner) : "sem responsável"}${t.vendor ? " · " + esc(t.vendor) : ""}</span></div>
            <div class="r"><span class="small ${t.overdue ? "over" : "muted"}">${t.overdue ? "atrasada · " : ""}${esc(dBR(t.due_date))}</span></div></li>`).join("")}</ul>`
            : `<p class="muted">Nada vencendo nos próximos 7 dias.${c.open_tasks ? "" : " Gerem o checklist na aba Tarefas."}</p>`}
          <a class="btn ghost sm" href="#tarefas">Ver tarefas</a></article>
        <article class="panel" aria-labelledby="pcT"><h2 id="pcT">Próximos compromissos</h2>
          ${c.appointments.length ? `<ul class="o-mini">${c.appointments.map(a => `<li><div><b>${esc(a.title)}</b><span class="muted small">${esc(a.place || "")}</span></div>
            <div class="r"><span class="small">${esc(dBR(a.starts_at))}</span><span class="small muted">${esc(a.starts_at.slice(11, 16))}</span></div></li>`).join("")}</ul>`
            : `<p class="muted">Nenhum compromisso marcado.</p>`}
          <a class="btn ghost sm" href="#tarefas">Abrir agenda</a></article>
        <article class="panel" aria-labelledby="ppT"><h2 id="ppT">Próximos pagamentos</h2>
          ${c.payments.length ? `<ul class="o-mini">${c.payments.map(p => `<li><div><b>${esc(p.description)}</b><span class="muted small">${esc(p.vendor || "")}${p.n ? `${p.vendor ? " · " : ""}parcela ${p.n}/${p.of}` : ""}</span></div>
            <div class="r"><span class="num">${money(p.left_cents)}</span><span class="small ${p.overdue ? "over" : "muted"}">${p.overdue ? "venceu " : ""}${esc(dBR(p.due_date))}</span></div></li>`).join("")}</ul>`
            : `<p class="muted">Nenhum pagamento com data marcada.</p>`}
          <a class="btn ghost sm" href="#orcamento">Ver orçamento</a></article>
      </section>` : ""}
      <p class="muted small">Respostas de ${o.households.responded} de ${o.households.total} convites · ${main ? `${main.pending} pessoas pendentes na ${esc(main.name.toLowerCase())}` : ""}</p></div>`;

    // larguras via CSSOM (sem estilos inline)
    $$(".stat").forEach((el, i) => { const e = o.events[i]; const t = Math.max(1, e.invited); el.querySelector(".m-yes").style.width = (e.yes / t * 100) + "%"; el.querySelector(".m-no").style.width = (e.no / t * 100) + "%"; });
    requestAnimationFrame(() => $$(".o-bar i").forEach(i => { i.style.width = i.dataset.w + "%"; }));

    $(".o-root", viewEl()).onclick = async e => {
      const btn = e.target.closest("button"); if (!btn) return;
      try {
        if (btn.dataset.dismiss) {
          await api("/api/admin/org/alerts/dismiss", { method: "POST", body: { key: btn.dataset.dismiss } });
          await overview();
          // foco volta para o próximo alerta (ou para o título do radar) para quem navega por teclado
          const nextBtn = $("[data-dismiss]"), h = $("#rdT");
          if (nextBtn) nextBtn.focus(); else if (h) { h.tabIndex = -1; h.focus(); }
        }
        if (btn.id === "restore") { await api("/api/admin/org/alerts/dismissed", { method: "DELETE" }); overview(); }
      } catch (x) { alert(x.message); }
    };
  } catch (e) { fail(e); }
}
