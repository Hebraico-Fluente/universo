/** Convidados: famílias, convites (links), respostas por evento. */
import { $, $$, esc, longDate, money, daysUntil, api } from "../ui.js";
import { viewEl, fail, state } from "./core.js";

/* ---------------- convidados ---------------- */
export default async function guests() {
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/guests");
    const evName = Object.fromEntries(d.events.map(e => [e.id, e.name]));
    const status = (g, e) => g.responses[e] || "pending";
    viewEl().innerHTML = `
      <header class="vh"><div><p class="label">Convidados</p><h1>${d.households.reduce((s, h) => s + h.guests.length, 0)} pessoas em ${d.households.length} convites</h1></div>
        <button class="btn" type="button" id="add">Nova família convidada</button></header>
      <form class="panel newhh" id="newhh" hidden novalidate>
        <h2>Nova família convidada</h2>
        <div class="grid2">
          <label class="field"><span>Nome do convite (interno)</span><input class="in" name="name" maxlength="80" placeholder="Ex.: Família Souza" required></label>
          <label class="field"><span>Como o convite chama</span><input class="in" name="greeting" maxlength="80" placeholder="Ex.: Tia Lúcia e Tio Beto"></label>
        </div>
        <fieldset class="field"><legend><span>Pessoas</span></legend><div id="people"></div><button class="link" type="button" id="morep">+ adicionar pessoa</button></fieldset>
        <fieldset class="field"><legend><span>Eventos para os quais estão convidados</span></legend>
          <div class="checks">${d.events.map(e => `<label><input type="checkbox" name="ev" value="${esc(e.id)}" checked> ${esc(e.name)}</label>`).join("")}</div></fieldset>
        <label class="field"><span>Mensagem pessoal no convite (opcional)</span><textarea class="in" name="message" rows="2" maxlength="500"></textarea></label>
        <p class="error" id="nerr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Criar convite</button><button class="btn ghost" type="button" id="cancel">Cancelar</button></div>
      </form>
      <div id="linkbox"></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th scope="col">Convite</th>${d.events.map(e => `<th scope="col">${esc(e.name)}</th>`).join("")}<th scope="col">Link</th><th scope="col"><span class="sr">Ações</span></th></tr></thead>
        <tbody>${d.households.map(h => `
          <tr class="hh"><th scope="row"><b>${esc(h.name)}</b><span class="muted small">${h.responded_at ? "respondeu" : "aguardando resposta"}${h.note_to_couple ? ` · “${esc(h.note_to_couple)}”` : ""}</span></th>
            ${d.events.map(e => `<td class="evc">${h.events.includes(e.id) ? "" : `<span class="muted small">não convidado para ${esc(e.name.toLowerCase())}</span>`}</td>`).join("")}
            <td class="lk">${h.revoked ? `<span class="tag off">revogado</span>` : h.has_link ? `<span class="tag yes">ativo</span>` : `<span class="tag no">sem link</span>`}</td>
            <td class="acts"><button class="btn ghost sm" data-link="${esc(h.id)}">${h.has_link && !h.revoked ? "Novo link" : "Gerar link"}</button>${h.has_link && !h.revoked ? `<button class="link small" data-revoke="${esc(h.id)}">Revogar</button>` : ""}<button class="link small danger" data-del="${esc(h.id)}" data-name="${esc(h.name)}">Apagar</button></td></tr>
          ${h.guests.map(g => `<tr class="gp"><td>${esc(g.name)}${g.is_child ? ` <span class="muted small">criança</span>` : ""}${g.diet ? `<span class="small diet">🍽 ${esc(g.diet)}</span>` : ""}${g.accessibility ? `<span class="small diet">♿ ${esc(g.accessibility)}</span>` : ""}</td>
            ${d.events.map(e => `<td class="evc" data-label="${esc(e.name)}">${h.events.includes(e.id) ? `<span class="tag ${status(g, e.id)}">${({ yes: "vai", no: "não vai", pending: "pendente" })[status(g, e.id)]}</span>` : ""}</td>`).join("")}<td class="emp"></td><td class="emp"></td></tr>`).join("")}`).join("")}
        </tbody></table></div>
      <p class="muted small">Por segurança, o link de cada convite aparece só quando é gerado. Se perder o link, gere um novo: o anterior para de funcionar.</p>`;

    const people = $("#people");
    const addPerson = (v = "") => { const r = document.createElement("div"); r.className = "person-row"; r.innerHTML = `<input class="in" name="p" maxlength="80" placeholder="Nome e sobrenome" value="${esc(v)}" aria-label="Nome da pessoa"><label class="small"><input type="checkbox" name="child"> criança</label><button class="link small" type="button" aria-label="Remover pessoa">remover</button>`; r.querySelector("button").onclick = () => r.remove(); people.append(r); };
    addPerson(); addPerson();
    $("#morep").onclick = () => addPerson();
    $("#add").onclick = () => { $("#newhh").hidden = false; $("#newhh [name=name]").focus(); };
    $("#cancel").onclick = () => { $("#newhh").hidden = true; };
    $("#newhh").addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target; $("#nerr").textContent = "";
      const guests = $$(".person-row", people).map(r => ({ name: r.querySelector("[name=p]").value.trim(), is_child: r.querySelector("[name=child]").checked })).filter(g => g.name);
      const events = $$("[name=ev]:checked", f).map(c => c.value);
      try { const r = await api("/api/admin/households", { method: "POST", body: { name: f.name.value, greeting: f.greeting.value, message: f.message.value, guests, events } }); await guests_(r.link, f.greeting.value || f.name.value); }
      catch (x) { $("#nerr").textContent = x.message; }
    });
    viewEl().onclick = async e => {
      const b = e.target.closest("button"); if (!b) return;
      try {
        if (b.dataset.link) { const r = await api(`/api/admin/households/${b.dataset.link}/link`, { method: "POST" }); await guests_(r.link, b.closest("tr").querySelector("b").textContent); }
        else if (b.dataset.revoke) { if (confirm("Revogar o link? Quem tiver o link antigo não consegue mais abrir o convite.")) { await api(`/api/admin/households/${b.dataset.revoke}/revoke`, { method: "POST" }); guests(); } }
        else if (b.dataset.del) { if (confirm(`Apagar o convite “${b.dataset.name}” e todas as respostas?`)) { await api(`/api/admin/households/${b.dataset.del}`, { method: "DELETE" }); guests(); } }
      } catch (x) { alert(x.message); }
    };
  } catch (e) { fail(e); }
}
async function guests_(link, who) {
  await guests();
  const msg = `Oi! O convite do nosso casamento é pessoal, feito para vocês: ${link}`;
  $("#linkbox").innerHTML = `<div class="panel linkbox" role="status"><p class="label">Link do convite de ${esc(who)}</p><p class="url"><code>${esc(link)}</code></p>
    <div class="row-btns"><button class="btn sm" type="button" id="copy">Copiar link</button><a class="btn ghost sm" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a><a class="link small" href="${esc(link)}" target="_blank" rel="noopener">Abrir como convidado</a></div>
    <p class="muted small">Copie agora: por segurança, este link não fica visível depois.</p></div>`;
  $("#copy").onclick = async e => { try { await navigator.clipboard.writeText(link); e.target.textContent = "Copiado!"; } catch { e.target.textContent = "Selecione e copie"; } };
  $("#linkbox").scrollIntoView({ block: "center" });
}
