/**
 * Formulário de RSVP compartilhado: convite pessoal (/i/:token) e "Confirmar pelo nome" no site do casal.
 * Por pessoa e por evento, com prato (quando o evento tem cardápio), acompanhantes até o limite do convite,
 * restrição alimentar, acessibilidade e recado. Usa só os endpoints do convite (/api/invite/:token/...).
 *   mountRsvp(root, { token, data, onData })  → desenha em root; data = resposta de GET /api/invite/:token
 */
import { $, $$, esc, longDate, api } from "../ui.js";

const CSS_HREF = "/assets/invite-mods/rsvp-form.css";
export function loadCss() {
  if (document.querySelector(`link[href="${CSS_HREF}"]`)) return Promise.resolve();
  return new Promise(r => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = CSS_HREF; l.onload = l.onerror = r; document.head.append(l); });
}
const dmy = ymd => ymd.split("-").reverse().join("/");
let seq = 0;

export function mountRsvp(root, { token, data, onData }) {
  const uidp = "rf" + (++seq) + "-";
  const cm = () => data.mods?.convidados || {};
  const menusFor = ev => (cm().menus || []).filter(m => m.event_id === ev);
  const q = s => $(s, root), qq = s => $$(s, root);
  root.classList.add("rsvpf");

  function snapshot() {
    const f = q("form"); if (!f) return null;
    const vals = {};
    for (const el of f.elements) if (el.name) {
      if (el.type === "radio") { if (el.checked) vals[el.name] = el.value; }
      else if (el.type !== "button" && el.type !== "submit") vals[el.name] = el.value;
    }
    return { vals, open: qq("details.more[open]").map(d => d.dataset.g) };
  }
  function restore(s) {
    if (!s) return;
    const f = q("form");
    for (const [k, v] of Object.entries(s.vals)) for (const el of $$(`[name="${CSS.escape(k)}"]`, f)) {
      if (el.type === "radio") el.checked = el.value === v; else if (!el.disabled) el.value = v;
    }
    for (const g of s.open) { const d = q(`details.more[data-g="${CSS.escape(g)}"]`); if (d) d.open = true; }
  }
  /** O prato só aparece para quem marcou "Vou". */
  const syncMenus = () => qq(".menu-pick").forEach(box => { box.hidden = !q(`[name="r_${box.dataset.g}_${box.dataset.e}"][value="yes"]`)?.checked; });

  function render(keepState = true) {
    const keep = keepState ? snapshot() : null;
    const { household: h, events, guests, responses, open: isOpen } = data;
    const resp = (g, e) => responses.find(r => r.guest_id === g && r.event_id === e) || {};
    const answered = responses.length > 0;
    const slots = Math.max(0, (h.max_guests || 0) - guests.length);
    const purge = cm().purge_on, dis = isOpen ? "" : "disabled";
    root.innerHTML = `
      <form class="rf-form" novalidate>
        ${guests.map(g => `<fieldset class="person${g.is_plus_one ? " plus" : ""}">
          <legend><span class="pname">${esc(g.name)}</span>${g.is_child ? `<span class="tag no">criança</span>` : ""}${g.is_plus_one ? `<span class="tag no">acompanhante</span>` : ""}</legend>
          ${g.is_plus_one && isOpen ? `<button class="link small rm-plus" type="button" data-rm="${esc(g.id)}" aria-label="Remover ${esc(g.name)} do convite">Remover acompanhante</button>` : ""}
          ${events.map(e => { const r = resp(g.id, e.id), opts = menusFor(e.id); return `<div class="row"><span class="ename">${esc(e.name)}</span>
            <div class="seg" role="radiogroup" aria-label="${esc(g.name)} · ${esc(e.name)}">
              <label><input type="radio" name="r_${g.id}_${e.id}" value="yes" ${r.status === "yes" ? "checked" : ""} ${dis}><span>Vou</span></label>
              <label><input type="radio" name="r_${g.id}_${e.id}" value="no" ${r.status === "no" ? "checked" : ""} ${dis}><span>Não vou</span></label>
            </div></div>
            ${opts.length ? `<label class="field menu-pick" data-g="${esc(g.id)}" data-e="${esc(e.id)}"${r.status === "yes" ? "" : " hidden"}><span>Prato de ${esc(g.name.split(" ")[0])} · ${esc(e.name)}</span>
              <select class="in" name="m_${g.id}_${e.id}" ${dis}><option value="">Escolha uma opção</option>${opts.map(o => `<option value="${esc(o.id)}" ${r.menu_option_id === o.id ? "selected" : ""}>${esc(o.name)}${o.description ? ` · ${esc(o.description)}` : ""}</option>`).join("")}</select></label>` : ""}`; }).join("")}
          <details class="more" data-g="${esc(g.id)}"${g.diet || g.accessibility ? " open" : ""}><summary>Restrição alimentar ou acessibilidade <span class="muted">(opcional)</span></summary>
            <div class="grid2">
              <label class="field"><span>Restrição alimentar</span><input class="in" name="diet_${g.id}" maxlength="160" value="${esc(g.diet)}" placeholder="Ex.: vegetariana, sem glúten" ${dis}></label>
              <label class="field"><span>Acessibilidade</span><input class="in" name="acc_${g.id}" maxlength="160" value="${esc(g.accessibility)}" placeholder="Ex.: cadeira de rodas" ${dis}></label>
            </div></details>
        </fieldset>`).join("")}
        ${isOpen && slots > 0 ? `<div class="plus-add" role="group" aria-labelledby="${uidp}pa">
          <p id="${uidp}pa"><b>${slots > 1 ? `Seu convite tem mais ${slots} lugares.` : "Seu convite tem mais 1 lugar."}</b> Vai levar alguém? Escreva o nome completo do acompanhante.</p>
          <div class="pa-row"><label class="sr" for="${uidp}pn">Nome do acompanhante</label><input class="in plus-name" id="${uidp}pn" maxlength="80" autocomplete="off" placeholder="Nome e sobrenome">
          <button class="btn ghost plus-btn" type="button">Adicionar acompanhante</button></div>
          <p class="error plus-err" role="alert"></p></div>` : ""}
        <label class="field note"><span>Recado para os noivos <span class="muted">(opcional)</span></span><textarea class="in" name="note" rows="3" maxlength="600" ${dis}>${esc(h.note)}</textarea></label>
        <p class="priv">🔒 Seus dados servem só para organizar o casamento, ficam visíveis apenas para os noivos e são apagados ${purge ? `até ${esc(dmy(purge))}` : "depois da festa"}.</p>
        <p class="error rf-err" role="alert"></p>
        ${isOpen ? `<button class="btn accent rf-send" type="submit">${answered ? "Atualizar respostas" : "Enviar confirmação"}</button>` : ""}
      </form>
      <div class="done" hidden tabindex="-1"><p class="label">Recebido</p><h2 class="done-t"></h2><p class="muted">Você pode voltar e mudar as respostas até o prazo (${esc(longDate(data.wedding.rsvp_deadline + "T12:00:00-03:00"))}).</p><button class="link rf-edit" type="button">Ver ou alterar respostas</button></div>`;
    restore(keep); syncMenus();
    const f = q("form");
    f.addEventListener("submit", submit);
    f.addEventListener("change", e => { if (e.target.type === "radio") syncMenus(); });
    q(".rf-edit").addEventListener("click", () => { q(".done").hidden = true; f.hidden = false; f.querySelector("input,select,textarea")?.focus(); });
    q(".plus-btn")?.addEventListener("click", addPlus);
    q(".plus-name")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addPlus(); } });
    qq(".rm-plus").forEach(b => b.addEventListener("click", () => removePlus(b.dataset.rm, b)));
  }
  async function reload() { data = await api(`/api/invite/${token}`); onData?.(data); }

  async function addPlus() {
    const inp = q(".plus-name"), err = q(".plus-err"), btn = q(".plus-btn");
    err.textContent = "";
    const name = inp.value.trim();
    if (name.length < 2) { err.textContent = "Escreva o nome do acompanhante."; inp.focus(); return; }
    btn.disabled = true;
    try {
      const r = await api(`/api/invite/${token}/acompanhantes`, { method: "POST", body: { name } });
      await reload(); render();
      const first = q(`[name="r_${r.id}_${data.events[0]?.id}"]`);
      first?.closest("fieldset")?.scrollIntoView({ block: "center" }); first?.focus({ preventScroll: true });
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  }
  async function removePlus(id, btn) {
    if (!confirm("Remover este acompanhante do convite?")) return;
    btn.disabled = true;
    try { await api(`/api/invite/${token}/acompanhantes/${encodeURIComponent(id)}`, { method: "DELETE" }); await reload(); render(); q("form")?.scrollIntoView({ block: "start" }); }
    catch (x) { q(".rf-err").textContent = x.message; btn.disabled = false; }
  }
  async function submit(e) {
    e.preventDefault();
    const f = e.target, err = q(".rf-err");
    err.textContent = "";
    const responses = [], details = [];
    let noMenu = null;
    for (const g of data.guests) {
      for (const ev of data.events) {
        const v = f[`r_${g.id}_${ev.id}`]?.value;
        if (!v) continue;
        const r = { guest_id: g.id, event_id: ev.id, status: v };
        const sel = f[`m_${g.id}_${ev.id}`];
        if (sel && v === "yes") { if (sel.value) r.menu = sel.value; else noMenu = noMenu || sel; }
        responses.push(r);
      }
      details.push({ guest_id: g.id, diet: f[`diet_${g.id}`].value, accessibility: f[`acc_${g.id}`].value });
    }
    const missing = data.guests.length * data.events.length - responses.length;
    if (missing > 0) { err.textContent = `Falta responder ${missing} ${missing > 1 ? "itens" : "item"}. Marque “Vou” ou “Não vou” em cada evento.`; return; }
    if (noMenu) { err.textContent = "Falta escolher o prato de quem vai."; noMenu.focus(); return; }
    const btn = q(".rf-send"); btn.disabled = true; btn.textContent = "Enviando…";
    try {
      await api(`/api/invite/${token}/rsvp`, { method: "POST", body: { responses, details, note: f.note.value } });
      await reload();
      render(false);
      q("form").hidden = true; const done = q(".done"); done.hidden = false;
      q(".done-t").textContent = responses.some(r => r.status === "yes") ? "Que alegria! Está confirmado." : "Que pena. Obrigado por avisar.";
      done.scrollIntoView({ block: "center" }); done.focus({ preventScroll: true });
    } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Tentar de novo"; }
  }
  render(false);
  return { get data() { return data; } };
}
