/** Privacidade (LGPD): quando os dados dos convidados são apagados, mudar o prazo, exportar e apagar agora. */
import { $, esc, longDate, api } from "../ui.js";
import { viewEl, fail, css } from "./core.js";

const dmy = ymd => ymd.split("-").reverse().join("/");
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export default async function privacidade() {
  css("/assets/painel/privacidade.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  viewEl().onchange = null;
  try { draw(await api("/api/admin/privacidade")); } catch (e) { fail(e); }
}

function draw(p, msg) {
  const c = p.counts;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round((Date.parse(p.purge_on) - Date.parse(today)) / 864e5);
  viewEl().innerHTML = `<div class="priv-v">
    <header class="vh"><div><p class="label">Privacidade</p><h1>Dados dos convidados</h1></div></header>

    <section class="pv-hero${p.purged_at ? " done" : ""}" aria-labelledby="pv-when">
      ${p.purged_at
        ? `<p class="label">Limpeza feita</p><p class="pv-date" id="pv-when">Dados apagados em ${esc(new Date(p.purged_at.replace(" ", "T") + "Z").toLocaleDateString("pt-BR"))}</p>
           <p>Nomes, respostas, restrições, acessibilidade, convites e avisos de presente dos convidados foram apagados. O site, os eventos, o orçamento e a planta das mesas continuam.</p>`
        : `<p class="label">Limpeza automática</p><p class="pv-date" id="pv-when">${esc(dmy(p.purge_on))}</p>
           <p>Os dados pessoais dos convidados serão apagados ${days > 0 ? `daqui a ${plural(days, "dia", "dias")}` : "na próxima rotina diária"}: ${plural(p.retention_days, "dia", "dias")} depois do casamento (${esc(longDate(p.date))}). É a data que aparece no convite de cada família.</p>`}
    </section>
    ${msg ? `<p class="pv-msg" role="status">${esc(msg)}</p>` : ""}

    <div class="pv-grid">
      <section class="panel" aria-labelledby="pv-what"><h2 id="pv-what">O que está guardado agora</h2>
        <dl class="pv-kv">
          <div><dt>Convites (famílias)</dt><dd class="num">${c.households}</dd></div>
          <div><dt>Pessoas</dt><dd class="num">${c.guests}</dd></div>
          <div><dt>Respostas</dt><dd class="num">${c.rsvps}</dd></div>
          <div><dt>Com restrição ou acessibilidade</dt><dd class="num">${c.sensitive}</dd></div>
          <div><dt>Avisos de presente</dt><dd class="num">${c.gift_notices}</dd></div>
        </dl>
        <p class="muted small">Na limpeza saem: nomes, respostas e pratos, acompanhantes, restrições alimentares, acessibilidade, recados no RSVP, links de convite, lugares nas mesas e avisos de “Já presenteei”. Ficam: site, eventos, orçamento, cardápio e a planta das mesas (sem nomes).</p>
      </section>

      <section class="panel" aria-labelledby="pv-exp"><h2 id="pv-exp">Exportar antes</h2>
        <p>Baixe um arquivo com todos os dados do casamento, inclusive convidados, respostas e mesas. Guardem num lugar seguro: ele tem dados pessoais.</p>
        <a class="btn ghost" href="/api/admin/export" download>Baixar todos os dados (JSON)</a>
      </section>

      ${p.purged_at ? "" : `<section class="panel" aria-labelledby="pv-ret"><h2 id="pv-ret">Prazo da limpeza</h2>
        ${p.can_edit ? `<form id="retForm" class="pv-ret" novalidate>
          <label class="field"><span>Apagar quantos dias depois do casamento?</span>
            <input class="in num" name="days" type="number" min="30" max="365" step="1" value="${p.retention_days}" inputmode="numeric" aria-describedby="retHint"></label>
          <p class="hint" id="retHint">De 30 a 365 dias. A nova data aparece no convite na hora.</p>
          <p class="error" id="retErr" role="alert"></p>
          <button class="btn" type="submit">Salvar prazo</button></form>`
        : `<p>${plural(p.retention_days, "dia", "dias")} depois do casamento.</p><p class="muted small">Só quem é dono do casamento pode mudar o prazo.</p>`}
      </section>`}
    </div>

    ${p.can_edit && !p.purged_at ? `<section class="pv-danger" aria-labelledby="pv-del"><h2 id="pv-del">Apagar dados dos convidados agora</h2>
      <p>Apaga <b>na hora e sem volta</b> tudo o que está na lista acima. Os links de convite param de funcionar. Exportem antes se quiserem guardar.</p>
      <form id="delForm" novalidate>
        <label class="field"><span>Para confirmar, digite o nome do casal: <b class="pv-names">${esc(p.names)}</b></span><input class="in" name="confirm" autocomplete="off" spellcheck="false"></label>
        <p class="error" id="delErr" role="alert"></p>
        <button class="btn danger-btn" type="submit" disabled>Apagar dados dos convidados agora</button>
      </form></section>` : ""}
  </div>`;

  $("#retForm")?.addEventListener("submit", async e => {
    e.preventDefault(); $("#retErr").textContent = "";
    const n = Number(e.target.days.value);
    if (!Number.isInteger(n) || n < 30 || n > 365) { $("#retErr").textContent = "Escolha de 30 a 365 dias."; return; }
    try { const r = await api("/api/admin/privacidade", { method: "PATCH", body: { retention_days: n } }); draw(r, `Prazo salvo: os dados serão apagados em ${dmy(r.purge_on)}.`); $(".pv-msg")?.focus(); }
    catch (x) { $("#retErr").textContent = x.message; }
  });
  const f = $("#delForm");
  if (f) {
    const norm = v => v.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
    const btn = f.querySelector("button");
    f.confirm.addEventListener("input", () => { btn.disabled = norm(f.confirm.value) !== norm(p.names); });
    f.addEventListener("submit", async e => {
      e.preventDefault(); $("#delErr").textContent = "";
      if (btn.disabled) return;
      if (!confirm("Última confirmação: apagar agora os dados de todos os convidados? Não dá para desfazer.")) return;
      btn.disabled = true; btn.textContent = "Apagando…";
      try {
        const r = await api("/api/admin/privacidade/apagar", { method: "POST", body: { confirm: f.confirm.value } });
        draw(await api("/api/admin/privacidade"), `Pronto: ${plural(r.deleted.guests, "pessoa apagada", "pessoas apagadas")} de ${plural(r.deleted.households, "convite", "convites")}.`);
      } catch (x) { $("#delErr").textContent = x.message; btn.disabled = false; btn.textContent = "Apagar dados dos convidados agora"; }
    });
  }
}
