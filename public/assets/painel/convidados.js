/** Convidados: famílias, convites (links), respostas por evento, cardápio, acompanhantes, lista de espera e lembretes. */
import { $, $$, esc, api } from "../ui.js";
import { viewEl, fail, state, css } from "./core.js";

const fmtDay = s => s ? new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z")).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
let filter = "all";

/* ---------------- convidados ---------------- */
export default async function guests(flash) {
  css("/assets/painel/convidados.css");
  if (!flash) viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const [d, x] = await Promise.all([api("/api/admin/guests"), api("/api/admin/convidados")]);
    const ro = state.me?.role === "viewer";
    const menuName = Object.fromEntries(x.menus.map(m => [m.id, m.name]));
    const status = (g, e) => g.responses[e] || "pending";
    const active = d.households.filter(h => !h.waitlist), wait = d.households.filter(h => h.waitlist);
    const pending = active.filter(h => !h.responded_at);
    const remindable = pending.filter(h => h.has_link && !h.revoked);
    const noLink = pending.filter(h => !h.has_link || h.revoked);
    const people = active.reduce((s, h) => s + h.guests.length, 0);
    const shown = active.filter(h => filter === "all" || (filter === "pending" ? !h.responded_at : !!h.responded_at));
    const sug = x.waitlist;
    const hhById = Object.fromEntries(d.households.map(h => [h.id, h]));
    const hasMenus = ev => x.menus.some(m => m.event_id === ev);

    viewEl().innerHTML = `
      <header class="vh"><div><p class="label">Convidados</p><h1>${people} pessoas em ${active.length} convites</h1></div>
        ${ro ? "" : `<div class="row-btns"><button class="btn" type="button" id="add">Nova família convidada</button>
          <button class="btn ghost" type="button" id="remind" aria-expanded="false" aria-controls="remindP">Lembrar quem não respondeu${remindable.length ? ` (${remindable.length})` : ""}</button>
          <button class="btn ghost" type="button" id="menuB" aria-expanded="false" aria-controls="menuP">Cardápio</button></div>`}
        <div class="row-btns"><a class="btn ghost" href="#restricoes">Restrições alimentares</a></div></header>


      <ul class="gsum" aria-label="Resumo">
        <li><b class="num">${active.length - pending.length}</b> convites respondidos</li>
        <li class="${pending.length ? "warn" : ""}"><b class="num">${pending.length}</b> aguardando resposta${noLink.length ? ` <span class="muted">(${noLink.length} sem link ativo)</span>` : ""}</li>
        <li><b class="num">${wait.length}</b> na lista de espera</li>
        <li><b class="num">${active.reduce((s, h) => s + h.guests.filter(g => g.is_plus_one).length, 0)}</b> acompanhantes</li>
      </ul>

      ${ro ? "" : `<label class="gtoggle"><input type="checkbox" id="byName" ${x.rsvp_by_name ? "checked" : ""}>
        <span><b>Permitir confirmar presença pelo site (pelo nome)</b><br><span class="muted small">Quem não tiver o link digita o nome completo, exatamente como está aqui, na seção Presença do site. Lista de espera e links revogados não confirmam por lá.</span></span></label>`}

      ${sug.households.length && !ro ? `<section class="panel wl-sug" aria-labelledby="wl-t"><h2 id="wl-t">Lista de espera: há lugar</h2>
        <p>${sug.available} ${sug.available > 1 ? "lugares liberados" : "lugar liberado"} por recusas${sug.event ? ` na ${esc(sug.event.toLowerCase())}` : ""}. Sugestão, na ordem da lista:</p>
        <ul class="wl-list">${sug.households.map(id => { const h = hhById[id]; return h ? `<li><span><b>${esc(h.name)}</b> <span class="muted small">${h.guests.length} ${h.guests.length > 1 ? "pessoas" : "pessoa"}</span></span>
          <button class="btn sm" type="button" data-promote="${esc(h.id)}">Chamar e gerar link</button></li>` : ""; }).join("")}</ul>
        <p class="muted small">Nada é enviado sozinho: o link aparece aqui para vocês mandarem.</p></section>` : ""}

      <form class="panel newhh" id="newhh" hidden novalidate>
        <h2>Nova família convidada</h2>
        <div class="grid2">
          <label class="field"><span>Nome do convite (interno)</span><input class="in" name="name" maxlength="80" placeholder="Ex.: Família Souza" required></label>
          <label class="field"><span>Como o convite chama</span><input class="in" name="greeting" maxlength="80" placeholder="Ex.: Tia Lúcia e Tio Beto"></label>
        </div>
        <fieldset class="field"><legend><span>Pessoas</span></legend><div id="people"></div><button class="link" type="button" id="morep">+ adicionar pessoa</button></fieldset>
        <div class="grid2">
          <label class="field"><span>Vagas para acompanhantes</span><select class="in" name="extra">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}">${n ? `${n} (o convidado escreve o nome)` : "Nenhuma"}</option>`).join("")}</select></label>
          <label class="gtoggle in-form"><input type="checkbox" name="waitlist"><span><b>Lista de espera</b><br><span class="muted small">Não gera link agora. Chamem quando abrir lugar.</span></span></label>
        </div>
        <fieldset class="field"><legend><span>Eventos para os quais estão convidados</span></legend>
          <div class="checks">${d.events.map(e => `<label><input type="checkbox" name="ev" value="${esc(e.id)}" checked> ${esc(e.name)}</label>`).join("")}</div></fieldset>
        <label class="field"><span>Mensagem pessoal no convite (opcional)</span><textarea class="in" name="message" rows="2" maxlength="500"></textarea></label>
        <p class="error" id="nerr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Criar convite</button><button class="btn ghost" type="button" id="cancel">Cancelar</button></div>
      </form>

      <section class="panel remind" id="remindP" hidden aria-labelledby="rm-t"><h2 id="rm-t">Lembrar quem não respondeu</h2>
        ${remindable.length ? `<p class="rm-warn"><b>Importante:</b> por segurança, o link de cada convite fica guardado só como código cifrado, então não dá para reenviar o mesmo link. Vocês podem mandar um lembrete sem link (para quem ainda tem a mensagem antiga) ou <b>gerar um link novo</b>: o anterior para de funcionar.</p>
        <ul class="rm-list">${remindable.map(h => `<li data-hh="${esc(h.id)}"><div class="rm-h"><b>${esc(h.name)}</b><span class="muted small">link de ${esc(fmtDay(h.token_at))}${h.reminded_at ? ` · lembrado em ${esc(fmtDay(h.reminded_at))}` : ""}</span></div>
          <p class="rm-msg">${esc(reminderText(state.me?.wedding?.names, h, null))}</p>
          <div class="row-btns rm-acts"><a class="btn ghost sm" href="${esc(wa(reminderText(state.me?.wedding?.names, h, null)))}" target="_blank" rel="noopener" data-mark="${esc(h.id)}">Lembrete sem link (WhatsApp)</a>
            <button class="btn sm" type="button" data-relink="${esc(h.id)}">Gerar novo link e enviar</button></div></li>`).join("")}</ul>`
          : `<p class="muted">Todas as famílias com link ativo já responderam.</p>`}
        ${noLink.length ? `<p class="muted small">Sem link ativo e sem resposta: ${noLink.map(h => esc(h.name)).join(", ")}. Gere o link na lista abaixo.</p>` : ""}
        <p class="muted small">Nada é enviado automaticamente: cada botão abre o WhatsApp com a mensagem pronta, e vocês escolhem o contato.</p></section>

      <section class="panel menus" id="menuP" hidden aria-labelledby="mn-t"><h2 id="mn-t">Cardápio por evento</h2>
        <p class="muted small">Quando um evento tem opções, cada pessoa que confirmar escolhe o prato no convite.</p>
        <div class="mn-grid">${d.events.map(e => `<div class="mn-ev"><h3>${esc(e.name)}</h3>
          <ul class="mn-list">${x.menus.filter(m => m.event_id === e.id).map(m => `<li><span><b>${esc(m.name)}</b>${m.description ? ` <span class="muted small">${esc(m.description)}</span>` : ""}</span><button class="link small danger" type="button" data-delmenu="${esc(m.id)}" aria-label="Remover ${esc(m.name)}">remover</button></li>`).join("") || `<li class="muted small">Sem opções: o convite não pergunta o prato.</li>`}</ul>
          <form class="mn-add" data-ev="${esc(e.id)}" novalidate><label class="sr" for="mn-${esc(e.id)}">Nova opção para ${esc(e.name)}</label><input class="in" id="mn-${esc(e.id)}" name="name" maxlength="60" placeholder="Ex.: Carne, Peixe, Vegetariano">
            <input class="in" name="description" maxlength="160" placeholder="Descrição (opcional)" aria-label="Descrição da opção"><button class="btn sm" type="submit">Adicionar</button></form></div>`).join("")}</div>
        <p class="error" id="mnErr" role="alert"></p></section>

      <div id="linkbox"></div>

      <div class="gfilter" role="group" aria-label="Filtrar convites">
        ${[["all", "Todos"], ["pending", `Aguardando resposta (${pending.length})`], ["done", "Responderam"]].map(([k, l]) => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${filter === k}">${esc(l)}</button>`).join("")}
      </div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th scope="col">Convite</th>${d.events.map(e => `<th scope="col">${esc(e.name)}</th>`).join("")}<th scope="col">Link</th><th scope="col"><span class="sr">Ações</span></th></tr></thead>
        <tbody>${shown.map(h => `
          <tr class="hh${h.responded_at ? "" : " is-pending"}"><th scope="row"><b>${esc(h.name)}</b><span class="small">${h.responded_at ? `<span class="tag yes">respondeu</span>` : `<span class="tag pending">aguardando resposta</span>`}${h.reminded_at && !h.responded_at ? ` <span class="muted">lembrado em ${esc(fmtDay(h.reminded_at))}</span>` : ""}${h.promoted_at ? ` <span class="muted">veio da lista de espera</span>` : ""}</span>
              ${h.note_to_couple ? `<span class="muted small">“${esc(h.note_to_couple)}”</span>` : ""}
              ${ro ? `<span class="muted small">${h.guests.length} de ${h.max_guests} lugares</span>` : `<label class="seats small"><span>Lugares no convite</span><select class="in sm-in" data-max="${esc(h.id)}">${Array.from({ length: 21 - Math.max(1, h.guests.length) }, (_, i) => i + Math.max(1, h.guests.length)).map(n => `<option value="${n}" ${n === h.max_guests ? "selected" : ""}>${n}${n > h.guests.length ? ` (+${n - h.guests.length} acompanhante${n - h.guests.length > 1 ? "s" : ""})` : ""}</option>`).join("")}</select></label>`}</th>
            ${d.events.map(e => `<td class="evc">${h.events.includes(e.id) ? "" : `<span class="muted small">não convidado para ${esc(e.name.toLowerCase())}</span>`}</td>`).join("")}
            <td class="lk">${h.revoked ? `<span class="tag off">revogado</span>` : h.has_link ? `<span class="tag yes">ativo</span>` : `<span class="tag no">sem link</span>`}</td>
            <td class="acts">${ro ? "" : `<button class="btn ghost sm" data-link="${esc(h.id)}">${h.has_link && !h.revoked ? "Novo link" : "Gerar link"}</button>${h.has_link && !h.revoked ? `<button class="link small" data-revoke="${esc(h.id)}">Revogar</button>` : ""}${h.responded_at ? "" : `<button class="link small" data-towait="${esc(h.id)}">Lista de espera</button>`}<button class="link small danger" data-del="${esc(h.id)}" data-name="${esc(h.name)}">Apagar</button>`}</td></tr>
          ${h.guests.map(g => `<tr class="gp"><td>${esc(g.name)}${g.is_child ? ` <span class="muted small">criança</span>` : ""}${g.is_plus_one ? ` <span class="tag no">acompanhante</span>${ro ? "" : ` <button class="link small danger" data-delguest="${esc(g.id)}" data-name="${esc(g.name)}">remover</button>`}` : ""}${g.diet ? `<span class="small diet">🍽 ${esc(g.diet)}</span>` : ""}${g.accessibility ? `<span class="small diet">♿ ${esc(g.accessibility)}</span>` : ""}</td>
            ${d.events.map(e => `<td class="evc" data-label="${esc(e.name)}">${h.events.includes(e.id) ? `<span class="tag ${status(g, e.id)}">${({ yes: "vai", no: "não vai", pending: "pendente" })[status(g, e.id)]}</span>${status(g, e.id) === "yes" && hasMenus(e.id) ? `<span class="small dish">${g.menus?.[e.id] ? esc(menuName[g.menus[e.id]] || "") : `<span class="warn-t">sem prato</span>`}</span>` : ""}` : ""}</td>`).join("")}<td class="emp"></td><td class="emp"></td></tr>`).join("")}`).join("") || `<tr><td colspan="${d.events.length + 3}" class="muted">Nenhum convite neste filtro.</td></tr>`}
        </tbody></table></div>

      ${wait.length ? `<section class="waitl" aria-labelledby="wt-t"><h2 id="wt-t">Lista de espera <span class="muted">(${wait.length})</span></h2>
        <p class="muted small">Estas famílias ainda não receberam link. Na ordem em que foram adicionadas.</p>
        <ol class="wl-all">${wait.map(h => `<li><span><b>${esc(h.name)}</b> <span class="muted small">${h.guests.map(g => esc(g.name)).join(", ")}</span></span>
          ${ro ? "" : `<span class="row-btns"><button class="btn sm ghost" type="button" data-promote="${esc(h.id)}">Chamar e gerar link</button><button class="link small danger" data-del="${esc(h.id)}" data-name="${esc(h.name)}">Apagar</button></span>`}</li>`).join("")}</ol></section>` : ""}
      <p class="muted small">Por segurança, o link de cada convite aparece só quando é gerado. Se perder o link, gere um novo: o anterior para de funcionar.</p>`;

    if (flash) flash();
    if (ro) return bindFilter();

    const peopleEl = $("#people");
    const addPerson = (v = "") => { const r = document.createElement("div"); r.className = "person-row"; r.innerHTML = `<input class="in" name="p" maxlength="80" placeholder="Nome e sobrenome" value="${esc(v)}" aria-label="Nome da pessoa"><label class="small"><input type="checkbox" name="child"> criança</label><button class="link small" type="button" aria-label="Remover pessoa">remover</button>`; r.querySelector("button").onclick = () => r.remove(); peopleEl.append(r); };
    addPerson(); addPerson();
    $("#morep").onclick = () => addPerson();
    $("#add").onclick = () => { $("#newhh").hidden = false; $("#newhh [name=name]").focus(); };
    $("#cancel").onclick = () => { $("#newhh").hidden = true; };
    const toggle = (btn, panel) => { btn.onclick = () => { const p = $(panel); p.hidden = !p.hidden; btn.setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) p.scrollIntoView({ block: "start", behavior: "smooth" }); }; };
    toggle($("#remind"), "#remindP"); toggle($("#menuB"), "#menuP");
    $("#byName").onchange = async e => {
      try { await api("/api/admin/convidados/settings", { method: "PATCH", body: { rsvp_by_name: e.target.checked } }); }
      catch (x) { e.target.checked = !e.target.checked; alert(x.message); }
    };
    $("#newhh").addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target; $("#nerr").textContent = "";
      const gs = $$(".person-row", peopleEl).map(r => ({ name: r.querySelector("[name=p]").value.trim(), is_child: r.querySelector("[name=child]").checked })).filter(g => g.name);
      const events = $$("[name=ev]:checked", f).map(c => c.value);
      try {
        const r = await api("/api/admin/households", { method: "POST", body: { name: f.name.value, greeting: f.greeting.value, message: f.message.value, guests: gs, events, extra_slots: Number(f.extra.value), waitlist: f.waitlist.checked } });
        if (r.link) await showLink(r.link, f.greeting.value || f.name.value);
        else await guests(() => status_(`“${f.name.value}” entrou na lista de espera. Nenhum link foi gerado.`));
      } catch (x) { $("#nerr").textContent = x.message; }
    });
    $$(".mn-add").forEach(f => f.addEventListener("submit", async e => {
      e.preventDefault(); $("#mnErr").textContent = "";
      try { await api("/api/admin/convidados/menus", { method: "POST", body: { event_id: f.dataset.ev, name: f.name.value, description: f.description.value } }); await guests(() => openPanel("#menuB", "#menuP", `#mn-${CSS.escape(f.dataset.ev)}`)); }
      catch (x) { $("#mnErr").textContent = x.message; }
    }));
    viewEl().onchange = async e => {
      const s = e.target.closest("[data-max]"); if (!s) return;
      try { await api(`/api/admin/convidados/households/${s.dataset.max}`, { method: "PATCH", body: { max_guests: Number(s.value) } }); s.closest("label").classList.add("saved"); }
      catch (x) { alert(x.message); guests(); }
    };
    viewEl().onclick = async e => {
      const a = e.target.closest("a[data-mark]");
      if (a) { api(`/api/admin/convidados/households/${a.dataset.mark}/reminded`, { method: "POST" }).catch(() => {}); return; }
      const b = e.target.closest("button"); if (!b) return;
      try {
        if (b.dataset.link) { const r = await api(`/api/admin/households/${b.dataset.link}/link`, { method: "POST" }); await showLink(r.link, hhById[b.dataset.link]?.name); }
        else if (b.dataset.revoke) { if (confirm("Revogar o link? Quem tiver o link antigo não consegue mais abrir o convite.")) { await api(`/api/admin/households/${b.dataset.revoke}/revoke`, { method: "POST" }); guests(); } }
        else if (b.dataset.del) { if (confirm(`Apagar o convite “${b.dataset.name}” e todas as respostas?`)) { await api(`/api/admin/households/${b.dataset.del}`, { method: "DELETE" }); guests(); } }
        else if (b.dataset.delguest) { if (confirm(`Remover o acompanhante “${b.dataset.name}” e as respostas dele?`)) { await api(`/api/admin/convidados/guests/${b.dataset.delguest}`, { method: "DELETE" }); guests(); } }
        else if (b.dataset.delmenu) { await api(`/api/admin/convidados/menus/${b.dataset.delmenu}`, { method: "DELETE" }); await guests(() => openPanel("#menuB", "#menuP")); }
        else if (b.dataset.promote) { const r = await api(`/api/admin/convidados/households/${b.dataset.promote}/promote`, { method: "POST" }); await showLink(r.link, hhById[b.dataset.promote]?.name, true); }
        else if (b.dataset.towait) { if (confirm("Mover para a lista de espera? Se houver link, ele para de funcionar.")) { await api(`/api/admin/convidados/households/${b.dataset.towait}`, { method: "PATCH", body: { waitlist: true } }); guests(); } }
        else if (b.dataset.relink) relink(b, hhById[b.dataset.relink]);
      } catch (x) { alert(x.message); }
    };
    bindFilter();
  } catch (e) { fail(e); }
}

function bindFilter() {
  $$("[data-filter]").forEach(b => b.addEventListener("click", () => { filter = b.dataset.filter; guests(() => $(`[data-filter="${filter}"]`)?.focus()); }));
}
function openPanel(btn, panel, focus) { $(panel).hidden = false; $(btn).setAttribute("aria-expanded", "true"); $(focus || panel)?.focus?.(); $(panel).scrollIntoView({ block: "start" }); }
function status_(text) { $("#linkbox").innerHTML = `<div class="panel linkbox" role="status"><p>${esc(text)}</p></div>`; $("#linkbox").scrollIntoView({ block: "center" }); }

const wa = text => "https://wa.me/?text=" + encodeURIComponent(text);
function reminderText(names, h, link) {
  const who = h.greeting || h.name;
  return link
    ? `Oi, ${who}! Tudo bem? Estamos organizando os últimos detalhes do casamento${names ? ` (${names})` : ""} e ainda não recebemos a confirmação de vocês. Este é o link novo do convite (o anterior não vale mais): ${link}. Se puderem responder até o prazo, ajuda muito. Obrigado!`
    : `Oi, ${who}! Tudo bem? Estamos organizando os últimos detalhes do casamento${names ? ` (${names})` : ""} e ainda não recebemos a confirmação de vocês. Quando puderem, respondam pelo link do convite que mandamos. Se não acharem, avisem que enviamos de novo. Obrigado!`;
}
/** Gera link novo (revoga o anterior) e troca o botão por um link do WhatsApp — sem abrir janelas sozinho. */
async function relink(btn, h) {
  if (!confirm(`Gerar um link novo para “${h.name}”? O link enviado antes para de funcionar.`)) return;
  btn.disabled = true;
  try {
    const r = await api(`/api/admin/households/${h.id}/link`, { method: "POST" });
    const li = btn.closest("li"), text = reminderText(state.me?.wedding?.names, h, r.link);
    li.querySelector(".rm-msg").textContent = text;
    li.querySelector(".rm-acts").innerHTML = `<a class="btn sm" href="${esc(wa(text))}" target="_blank" rel="noopener" data-mark="${esc(h.id)}">Enviar link novo pelo WhatsApp</a><button class="btn ghost sm" type="button" data-copy="${esc(r.link)}">Copiar link</button><span class="muted small" role="status">Link novo gerado. O anterior não funciona mais.</span>`;
    li.querySelector("[data-copy]").onclick = e => copy(e.currentTarget, r.link);
    li.querySelector("a").focus();
  } catch (x) { alert(x.message); btn.disabled = false; }
}
async function copy(btn, text) { try { await navigator.clipboard.writeText(text); btn.textContent = "Copiado!"; } catch { btn.textContent = "Selecione e copie"; } }

async function showLink(link, who, promoted) {
  await guests(() => {
    const msg = `Oi! O convite do nosso casamento é pessoal, feito para vocês: ${link}`;
    $("#linkbox").innerHTML = `<div class="panel linkbox" role="status"><p class="label">${promoted ? "Saiu da lista de espera · " : ""}Link do convite de ${esc(who || "")}</p><p class="url"><code>${esc(link)}</code></p>
      <div class="row-btns"><button class="btn sm" type="button" id="copy">Copiar link</button><a class="btn ghost sm" href="${esc(wa(msg))}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a><a class="link small" href="${esc(link)}" target="_blank" rel="noopener">Abrir como convidado</a></div>
      <p class="muted small">Copie agora: por segurança, este link não fica visível depois.</p></div>`;
    $("#copy").onclick = e => copy(e.currentTarget, link);
    $("#linkbox").scrollIntoView({ block: "center" });
  });
}
