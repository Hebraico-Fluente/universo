/** Presentes avisados por Pix ("Já presenteei"). */
import { $, $$, esc, longDate, money, daysUntil, api } from "../ui.js";
import { viewEl, fail, state } from "./core.js";

/* ---------------- presentes ---------------- */
export default async function gifts() {
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/presentes"), list = d.gifts;
    const total = list.reduce((s, g) => s + g.cents, 0), ok = list.filter(g => g.checked).reduce((s, g) => s + g.cents, 0);
    viewEl().innerHTML = `
      <header class="vh"><div><p class="label">Presentes</p><h1>${list.length ? `${list.length} ${list.length > 1 ? "presentes avisados" : "presente avisado"} · ${money(total)}` : "Nenhum presente avisado ainda"}</h1></div></header>
      <p class="muted gnote">Quando um convidado faz o Pix pelo site e toca em “Já presenteei”, o aviso aparece aqui. O dinheiro cai direto na conta de vocês, sem intermediário: confiram no extrato e marquem como conferido.</p>
      ${list.length ? `<dl class="kv wide"><div><dt>Avisados</dt><dd class="num">${money(total)}</dd></div><div><dt>Conferidos no extrato</dt><dd class="num strong">${money(ok)}</dd></div><div><dt>A conferir</dt><dd class="num">${list.filter(g => !g.checked).length}</dd></div></dl>
      <ul class="glist">${list.map(g => `<li class="gn${g.checked ? " done" : ""}">
        <div class="gn-h"><b>${esc(g.author)}</b><span class="num">${g.cents ? money(g.cents) : "valor não informado"}${g.via === "cartao" ? ` <span class="tag ok">pago no cartão</span>` : ""}</span></div>
        <p class="small muted">${esc(g.gift)} · ${esc(new Date(g.created_at.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))}</p>
        ${g.message ? `<p class="gn-msg">“${esc(g.message)}”</p>` : ""}
        <div class="row-btns"><button class="btn ${g.checked ? "ghost " : ""}sm" type="button" data-check="${esc(g.id)}">${g.checked ? "✓ Conferido" : "Marcar como conferido"}</button><button class="link small danger" type="button" data-gdel="${esc(g.id)}">Apagar</button></div>
      </li>`).join("")}</ul>` : ""}`;
    viewEl().onclick = async e => {
      const c = e.target.closest("[data-check]"), x = e.target.closest("[data-gdel]");
      try {
        if (c) { await api(`/api/admin/presentes/${c.dataset.check}/check`, { method: "POST" }); gifts(); }
        if (x && confirm("Apagar este aviso de presente?")) { await api(`/api/admin/presentes/${x.dataset.gdel}`, { method: "DELETE" }); gifts(); }
      } catch (er) { alert(er.message); }
    };
  } catch (e) { fail(e); }
}
