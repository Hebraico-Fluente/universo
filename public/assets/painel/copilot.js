/**
 * Copiloto dos noivos (widget do painel): botão discreto na barra + painel lateral.
 * Respostas com os dados reais do casamento, sempre com "Baseado em" (registros + aba). Não altera nada e não envia nada:
 * mensagens saem como rascunho para copiar ou abrir no WhatsApp.  API: GET /api/admin/exp/copilot?q=
 */
import { $, esc, api } from "../ui.js";
import { css } from "./core.js";

const SUG = ["Quantas pessoas ainda não confirmaram?", "Quanto ainda precisamos pagar?", "Quais fornecedores estão com contrato pendente?",
  "Que tarefas priorizar esta semana?", "Como economizar R$ 10.000?", "Há conflito no cronograma?", "Crie uma mensagem educada para quem não respondeu"];
const TABS = { "#convidados": "Convidados", "#orcamento": "Orçamento", "#fornecedores": "Fornecedores", "#tarefas": "Tarefas", "#geral": "Visão geral" };

export default async function copilotWidget() {
  let flags;
  try { flags = (await api("/api/admin/exp")).flags; } catch { return; }
  if (!flags?.copilot) return;
  css("/assets/painel/copilot.css");
  const who = $(".bar .who");
  if (!who || $("#cp-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.id = "cp-btn"; btn.className = "link cp-btn";
  btn.innerHTML = `<span class="cp-spark" aria-hidden="true">✦</span><span class="cp-l">Copiloto</span>`; btn.title = "Copiloto";
  btn.setAttribute("aria-label", "Copiloto");
  btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
  who.prepend(btn);

  const panel = document.createElement("aside");
  panel.className = "cp"; panel.id = "cp"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "cp-t");
  panel.innerHTML = `<header class="cp-h"><div><p class="label">Copiloto</p><h2 id="cp-t">O que vocês querem saber?</h2>
      <p class="cp-sub">Respondo com os dados do painel e mostro de onde veio cada número. Não mudo nada nem envio mensagens.</p></div>
      <button class="cp-x" type="button" aria-label="Fechar o copiloto">×</button></header>
    <div class="cp-log" aria-live="polite"></div>
    <div class="cp-sug">${SUG.map(s => `<button class="cp-chip" type="button">${esc(s)}</button>`).join("")}</div>
    <form class="cp-form" novalidate><label class="sr" for="cp-q">Pergunta para o copiloto</label>
      <input class="in" id="cp-q" name="q" maxlength="300" autocomplete="off" placeholder="Pergunte sobre convidados, pagamentos, tarefas…">
      <button class="btn sm" type="submit">Perguntar</button></form>`;
  document.body.append(panel);
  const log = panel.querySelector(".cp-log"), form = panel.querySelector(".cp-form");
  const open = () => { panel.hidden = false; requestAnimationFrame(() => panel.classList.add("on")); btn.setAttribute("aria-expanded", "true"); form.q.focus(); };
  const close = () => { panel.classList.remove("on"); btn.setAttribute("aria-expanded", "false"); setTimeout(() => { panel.hidden = true; }, 260); btn.focus(); };
  btn.addEventListener("click", () => panel.hidden ? open() : close());
  panel.querySelector(".cp-x").addEventListener("click", close);
  panel.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  const ask = async q => {
    q = q.trim(); if (!q) return;
    const turn = document.createElement("div"); turn.className = "cp-turn";
    turn.innerHTML = `<p class="cp-q">${esc(q)}</p><div class="cp-a wait"><span class="cp-dots"><i></i><i></i><i></i></span></div>`;
    log.append(turn); turn.scrollIntoView({ block: "end" });
    form.q.value = "";
    try {
      const r = await api("/api/admin/exp/copilot?q=" + encodeURIComponent(q));
      turn.querySelector(".cp-a").outerHTML = answer(r);
      bind(turn);
    } catch (e) { turn.querySelector(".cp-a").outerHTML = `<div class="cp-a"><p>${esc(e.status === 404 ? "O copiloto está desligado em Experiências." : e.message)}</p></div>`; }
    turn.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  form.addEventListener("submit", e => { e.preventDefault(); ask(form.q.value); });
  panel.querySelectorAll(".cp-chip").forEach(c => c.addEventListener("click", () => ask(c.textContent)));
  log.addEventListener("click", e => { const a = e.target.closest("a[data-tab]"); if (a && matchMedia("(max-width:760px)").matches) close(); });
}

function answer(r) {
  const groups = {};
  for (const c of r.cites || []) (groups[c.href] ||= []).push(c);
  return `<div class="cp-a">
    <p class="cp-text">${esc(r.text)}</p>
    ${r.ai ? `<p class="cp-ai">Texto redigido com IA a partir dos fatos abaixo.</p>` : ""}
    ${r.draft?.items?.length ? `<div class="cp-draft"><p class="label">Rascunho (nada é enviado sozinho)</p>
      <ul>${r.draft.items.map((d, i) => `<li><span class="cp-dn">${esc(d.name)}</span><span class="cp-dacts"><button class="link small" type="button" data-copy="${i}">Copiar</button><a class="link small" href="${esc(d.whatsapp)}" target="_blank" rel="noopener">Abrir no WhatsApp</a></span></li>`).join("")}</ul>
      <details><summary class="small">Ver o texto</summary><p class="cp-tpl">${esc(r.draft.items[0].text)}</p></details>
      <textarea class="sr" aria-hidden="true" tabindex="-1" data-texts>${esc(JSON.stringify(r.draft.items.map(d => d.text)))}</textarea></div>` : ""}
    ${r.cites?.length ? `<div class="cp-cites"><p class="label">Baseado em ${r.cites.length} ${r.cites.length > 1 ? "registros" : "registro"}</p>
      ${Object.entries(groups).map(([href, cs]) => `<div class="cp-g"><a class="cp-tab" href="${esc(href)}" data-tab>${esc(TABS[href] || "Abrir")} ›</a><ul>${cs.slice(0, 12).map(c => `<li><b>${esc(c.label)}</b>${c.detail ? `<span>${esc(c.detail)}</span>` : ""}</li>`).join("")}${cs.length > 12 ? `<li class="muted small">e mais ${cs.length - 12}</li>` : ""}</ul></div>`).join("")}</div>` : ""}
    ${r.missing?.length ? `<p class="cp-miss">Ainda sem dados de: ${esc(r.missing.join(", "))}.</p>` : ""}
  </div>`;
}
function bind(turn) {
  const ta = turn.querySelector("[data-texts]");
  if (!ta) return;
  const texts = JSON.parse(ta.value);
  turn.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => {
    navigator.clipboard.writeText(texts[+b.dataset.copy]).then(() => { b.textContent = "Copiado!"; setTimeout(() => { b.textContent = "Copiar"; }, 1800); }).catch(() => { b.textContent = "Não deu para copiar"; });
  }));
}
