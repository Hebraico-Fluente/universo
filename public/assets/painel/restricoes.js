/** Restrições: lista para o buffet (restrição alimentar de quem confirmou presença) e acessibilidade. Lê /api/admin/guests. */
import { $, esc, api } from "../ui.js";
import { viewEl, fail, state, css } from "./core.js";

export default async function restricoes() {
  css("/assets/painel/convidados.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/guests");
    const active = d.households.filter(h => !h.waitlist);
    const going = g => Object.values(g.responses || {}).includes("yes");
    const open = (h, g) => h.events.some(e => (g.responses || {})[e] !== "no"); // ainda pode vir (algum evento sem "não")
    const rows = key => active.flatMap(h => h.guests.filter(g => g[key]).map(g => ({ name: g.name, text: g[key], child: g.is_child, invite: h.name, going: going(g), open: open(h, g) })));
    const diet = rows("diet"), acc = rows("accessibility");
    const dietYes = diet.filter(r => r.going), dietWait = diet.filter(r => !r.going && r.open);
    const table = (list, head) => `<table class="bf-t"><thead><tr><th scope="col">Nome</th><th scope="col">${head}</th></tr></thead>
      <tbody>${list.map(r => `<tr><td>${esc(r.name)}${r.child ? ` <span class="muted small">criança</span>` : ""}</td><td>${esc(r.text)}</td></tr>`).join("")}</tbody></table>`;

    viewEl().innerHTML = `
      <header class="vh"><div><p class="label">Restrições</p><h1>${dietYes.length} ${dietYes.length === 1 ? "pessoa com restrição alimentar" : "pessoas com restrição alimentar"}</h1>
        <p class="muted">Quem confirmou presença e escreveu uma restrição ao responder o convite (no convite pessoal ou pelo nome no site).</p></div></header>

      <section class="panel buffet" aria-labelledby="bf-t"><h2 id="bf-t">Lista para o buffet</h2>
        ${dietYes.length ? `${table(dietYes, "Restrição alimentar")}
          <div class="row-btns"><button class="btn sm" type="button" id="bfCopy">Copiar lista</button><button class="btn ghost sm" type="button" id="bfCsv">Baixar planilha (CSV)</button></div>`
        : `<p class="muted">Ninguém que confirmou presença informou restrição alimentar até agora.</p>`}
      </section>

      ${dietWait.length ? `<section class="panel buffet" aria-labelledby="bw-t"><h2 id="bw-t">Ainda não confirmaram presença</h2>
        <p class="muted small">Escreveram uma restrição, mas ainda não responderam “Vou”. Entram na lista do buffet quando confirmarem.</p>
        ${table(dietWait, "Restrição alimentar")}</section>` : ""}

      <section class="panel buffet" aria-labelledby="ac-t"><h2 id="ac-t">Acessibilidade</h2>
        ${acc.filter(r => r.going).length ? table(acc.filter(r => r.going), "O que a pessoa precisa") + `<p class="muted small">Passem ao local e ao cerimonial (vaga, rampa, lugar perto da saída…).</p>`
        : `<p class="muted">Ninguém que confirmou presença pediu acessibilidade até agora.</p>`}
      </section>`;

    $("#bfCopy")?.addEventListener("click", async e => {
      const t = `Restrições alimentares · ${state.me?.wedding?.names || "casamento"}\n` + dietYes.map(r => `• ${r.name}${r.child ? " (criança)" : ""}: ${r.text}`).join("\n");
      try { await navigator.clipboard.writeText(t); e.target.textContent = "Lista copiada!"; } catch { e.target.textContent = "Não deu para copiar"; }
    });
    $("#bfCsv")?.addEventListener("click", () => {
      const q = v => `"${String(v).replace(/"/g, '""')}"`;
      const csv = "﻿" + ["Nome;Restrição alimentar;Criança;Convite", ...dietYes.map(r => [r.name, r.text, r.child ? "sim" : "", r.invite].map(q).join(";"))].join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "restricoes-alimentares.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  } catch (x) { fail(x); }
}
