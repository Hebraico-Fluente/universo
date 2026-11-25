/**
 * Formulário de RSVP compartilhado: convite pessoal (/i/:token) e "Confirmar pelo nome" no site do casal.
 * Por pessoa e por evento, com prato (quando o evento tem cardápio), acompanhantes até o limite do convite,
 * restrição alimentar, acessibilidade e recado. Usa só os endpoints do convite (/api/invite/:token/...).
 * Com a van ligada (mods.van, módulo "van"), quem confirma vê "Quer ir de van?" — vai no mesmo envio (campo `van`).
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
  /** Quantas pessoas da família marcaram "Vou" em algum evento. */
  const yesCount = () => data.guests.filter(g => qq(`input[name^="r_${CSS.escape(g.id)}_"][value="yes"]`).some(i => i.checked)).length;
  /** Van: a pergunta só aparece com alguém confirmado; "Sim" abre quantas pessoas e WhatsApp. */
  const syncVan = () => {
    const box = q(".rf-van"); if (!box) return;
    const n = yesCount(); box.hidden = n === 0;
    const sim = q('[name="van_quer"][value="sim"]')?.checked;
    q(".rf-van-sim").hidden = !sim;
    // padrão = todos os confirmados; se a pessoa escolheu (ou já tinha resposta), mantém a escolha (até o número de confirmados)
    const sel = q('[name="van_pessoas"]'), cur = sel.dataset.touched ? +sel.value || 0 : 0;
    const pick = Math.max(1, cur ? Math.min(cur, n) : n);
    sel.innerHTML = Array.from({ length: Math.max(1, n) }, (_, k) => `<option value="${k + 1}"${pick === k + 1 ? " selected" : ""}>${k + 1}</option>`).join("");
  };
  const fmtPhone = d => !d ? "" : d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;

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
        ${vanHtml(dis)}
        <label class="field note"><span>Recado para os noivos <span class="muted">(opcional)</span></span><textarea class="in" name="note" rows="3" maxlength="600" ${dis}>${esc(h.note)}</textarea></label>
        <p class="priv">🔒 Seus dados servem só para organizar o casamento, ficam visíveis apenas para os noivos e são apagados ${purge ? `até ${esc(dmy(purge))}` : "depois da festa"}.</p>
        <p class="error rf-err" role="alert"></p>
        ${isOpen ? `<button class="btn accent rf-send" type="submit">${answered ? "Atualizar respostas" : "Enviar confirmação"}</button>` : ""}
      </form>
      <div class="done" hidden tabindex="-1"><p class="label">Recebido</p><h2 class="done-t"></h2><div class="done-van" hidden></div><p class="muted">Você pode voltar e mudar as respostas até o prazo (${esc(longDate(data.wedding.rsvp_deadline + "T12:00:00-03:00"))}).</p><button class="link rf-edit" type="button">Ver ou alterar respostas</button></div>`;
    restore(keep); syncMenus(); syncVan();
    const f = q("form");
    f.addEventListener("submit", submit);
    f.addEventListener("change", e => { if (e.target.type === "radio") { syncMenus(); syncVan(); } if (e.target.name === "van_pessoas") e.target.dataset.touched = "1"; });
    q(".rf-edit").addEventListener("click", () => { q(".done").hidden = true; f.hidden = false; f.querySelector("input,select,textarea")?.focus(); });
    q(".plus-btn")?.addEventListener("click", addPlus);
    q(".plus-name")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addPlus(); } });
    qq(".rm-plus").forEach(b => b.addEventListener("click", () => removePlus(b.dataset.rm, b)));
  }
  function vanHtml(dis) {
    const v = data.mods?.van; if (!v) return "";
    const mine = v.mine;
    return `<fieldset class="rf-van" hidden><legend>Quer ir de van para o casamento?</legend>
      <p class="rf-van-t muted">${esc(v.texto)}</p>
      ${[v.ponto && `Saída: ${v.ponto}`, v.saida && `Ida: ${v.saida}`, v.volta && `Volta: ${v.volta}`, v.valor_cents > 0 && `Valor por pessoa: ${(v.valor_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`].filter(Boolean).map(x => `<p class="small">${esc(x)}</p>`).join("")}
      ${v.esgotado && !mine ? `<p class="rf-van-full"><b>Vagas esgotadas</b>: se responder Sim, vocês entram na lista de espera.</p>` : ""}
      <div class="seg" role="radiogroup" aria-label="Quer ir de van para o casamento?">
        <label><input type="radio" name="van_quer" value="sim" ${mine ? "checked" : ""} ${dis}><span>Sim</span></label>
        <label><input type="radio" name="van_quer" value="nao" ${dis}><span>Não</span></label>
      </div>
      <div class="rf-van-sim grid2" hidden>
        <label class="field"><span>Quantas pessoas?</span><select class="in" name="van_pessoas"${mine ? ' data-touched="1"' : ""} ${dis}>${mine ? `<option value="${mine.pessoas}" selected>${mine.pessoas}</option>` : ""}</select></label>
        <label class="field"><span>WhatsApp${v.exige_celular ? "" : " (opcional)"}</span><input class="in" name="van_celular" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(41) 99999-9999" value="${esc(fmtPhone(mine?.celular || ""))}"${v.exige_celular ? " required" : ""} ${dis}></label>
      </div>
      ${mine?.espera ? `<p class="small">Vocês estão na <b>lista de espera</b> da van.</p>` : ""}
      <p class="small muted">${v.exige_celular ? "O WhatsApp serve para os noivos colocarem vocês no grupo da van." : "Os noivos vão avisar os detalhes."}</p>
    </fieldset>`;
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
    // van (só com alguém confirmado e se a pergunta foi respondida)
    let van;
    const vbox = q(".rf-van");
    if (vbox && !vbox.hidden) {
      const quer = q('[name="van_quer"]:checked')?.value;
      if (quer === "nao") van = { quer: false };
      if (quer === "sim") {
        const cel = f.van_celular;
        if (cel.required && cel.value.replace(/\D/g, "").length < 10) { err.textContent = "Escreva o WhatsApp com DDD para a van."; cel.focus(); return; }
        van = { quer: true, pessoas: +f.van_pessoas.value, celular: cel.value };
      }
    }
    const btn = q(".rf-send"); btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const res = await api(`/api/invite/${token}/rsvp`, { method: "POST", body: { responses, details, note: f.note.value, ...(van ? { van } : {}) } });
      await reload();
      render(false);
      q("form").hidden = true; const done = q(".done"); done.hidden = false;
      q(".done-t").textContent = responses.some(r => r.status === "yes") ? "Que alegria! Está confirmado." : "Que pena. Obrigado por avisar.";
      const vd = q(".done-van");
      vd.innerHTML = res?.van?.quer ? (res.van.espera ? `<p>Van: vocês estão na <b>lista de espera</b>. Se abrir vaga, os noivos avisam.</p>`
        : `<p>Van: anotado! ${res.van.grupo ? "" : "Os noivos vão avisar os detalhes."}</p>${res.van.grupo ? `<a class="btn accent" href="${esc(res.van.grupo)}" target="_blank" rel="noopener">Entrar no grupo da van <span aria-hidden="true">↗</span><span class="sr"> (abre o WhatsApp)</span></a>` : ""}`) : "";
      vd.hidden = !res?.van?.quer;
      done.scrollIntoView({ block: "center" }); done.focus({ preventScroll: true });
    } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Tentar de novo"; }
  }
  render(false);
  return { get data() { return data; } };
}
