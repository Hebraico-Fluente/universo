/**
 * Mesas: planta 2D do salão com mesas redondas/retangulares e elementos fixos (pista, palco, buffet, entrada, bar).
 * Tudo se move arrastando (mouse e toque, via Pointer Events) ou pelo teclado (setas). Convidados confirmados
 * vão para as mesas arrastando ou pelo seletor "Mesa de …" (alternativa acessível). Nada é decidido sozinho:
 * "Sugerir agrupamento por família" só mostra uma proposta, que o casal confirma.
 */
import { $, $$, esc, api } from "../ui.js";
import { viewEl, fail, state, css } from "./core.js";

const KINDS = { pista: "Pista de dança", palco: "Palco", buffet: "Buffet", entrada: "Entrada", bar: "Bar" };
let d = null, proposal = null;
const ro = () => state.me?.role === "viewer";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export default async function mesas() {
  css("/assets/painel/mesas.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  viewEl().onchange = null;
  try { d = await api("/api/admin/mesas"); proposal = null; render(); } catch (e) { fail(e); }
}
async function reload(focusSel) {
  try { d = await api("/api/admin/mesas"); render(); if (focusSel) $(focusSel)?.focus(); } catch (e) { fail(e); }
}

/* ---------------- desenho ---------------- */
const seatedAt = id => d.guests.filter(g => g.table_id === id);
const tableSize = t => t.shape === "rect" ? [clamp(10 + t.seats * 1.1, 12, 34), null] : [clamp(8 + t.seats * 0.6, 9, 22), null];
function groupByFamily(list) {
  const fam = new Map();
  for (const g of list) { if (!fam.has(g.household_id)) fam.set(g.household_id, { id: g.household_id, name: g.household, guests: [] }); fam.get(g.household_id).guests.push(g); }
  return [...fam.values()];
}
function moveSelect(g) {
  return `<label class="sr" for="mv-${esc(g.id)}">Mesa de ${esc(g.name)}</label><select class="mv" id="mv-${esc(g.id)}" data-guest="${esc(g.id)}" ${ro() ? "disabled" : ""}>
    <option value="">Sem mesa</option>${d.tables.map(t => `<option value="${esc(t.id)}" ${g.table_id === t.id ? "selected" : ""}>${esc(t.name)} (${seatedAt(t.id).length}/${t.seats})</option>`).join("")}</select>`;
}
function chip(g) {
  return `<li class="gchip${g.confirmed ? "" : " gone"}" data-guest="${esc(g.id)}">
    ${ro() ? "" : `<span class="grip" aria-hidden="true" title="Arrastar">⠿</span>`}
    <span class="gname">${esc(g.name)}${g.is_child ? ` <span class="muted small">criança</span>` : ""}${g.is_plus_one ? ` <span class="muted small">acomp.</span>` : ""}${g.confirmed ? "" : ` <span class="tag off">não vai mais</span>`}</span>
    ${moveSelect(g)}</li>`;
}
function famBlock(f, withFamilyMove) {
  return `<div class="fam"><div class="fam-h"><p class="fam-n">${esc(f.name)}</p>${withFamilyMove && !ro() && f.guests.length > 1 ? `<label class="sr" for="fm-${esc(f.id)}">Mover a família ${esc(f.name)} inteira</label><select class="mv fam-mv" id="fm-${esc(f.id)}" data-family="${esc(f.id)}"><option value="">Família inteira para…</option>${d.tables.map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${seatedAt(t.id).length}/${t.seats})</option>`).join("")}</select>` : ""}</div>
    <ul class="chips">${f.guests.map(chip).join("")}</ul></div>`;
}

function render() {
  const conf = d.guests.filter(g => g.confirmed);
  const unseated = conf.filter(g => !g.table_id);
  const seated = d.guests.filter(g => g.table_id);
  const over = d.tables.filter(t => seatedAt(t.id).length > t.seats);
  const gone = seated.filter(g => !g.confirmed);
  const ev = d.events.find(e => e.id === d.event_id);
  viewEl().innerHTML = `<div class="mesas" id="mesas">
    <header class="vh"><div><p class="label">Mesas${ev ? ` · ${esc(ev.name)}` : ""}</p><h1>Mapa de mesas</h1></div>
      <div class="row-btns no-print">${ro() ? "" : `<button class="btn" type="button" id="newT" aria-expanded="false" aria-controls="tForm">Nova mesa</button>
        <button class="btn ghost" type="button" id="newI" aria-expanded="false" aria-controls="iForm">Elemento fixo</button>
        <button class="btn ghost" type="button" id="sugB" ${unseated.length && d.tables.length ? "" : "disabled"}>Sugerir agrupamento por família</button>`}
        <button class="btn ghost" type="button" id="printB">Imprimir</button></div></header>

    <div class="ms-bar no-print">
      <p class="ms-stats"><b class="num">${conf.length}</b> confirmados · <b class="num">${conf.length - unseated.length}</b> com mesa · <b class="num ${unseated.length ? "warn-t" : ""}">${unseated.length}</b> sem mesa · <b class="num">${d.tables.reduce((s, t) => s + t.seats, 0)}</b> lugares em ${plural(d.tables.length, "mesa", "mesas")}</p>
      ${d.events.length > 1 && !ro() ? `<label class="ms-ev"><span>Mesas para</span><select class="in" id="evSel">${d.events.map(e => `<option value="${esc(e.id)}" ${e.id === d.event_id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></label>` : ""}
      ${ro() ? "" : `<label class="ms-show"><input type="checkbox" id="showT" ${d.show_tables ? "checked" : ""}><span><b>Mostrar mesas aos convidados</b><br><span class="muted small">O convite pessoal passa a mostrar “Sua mesa: …”.</span></span></label>`}
    </div>
    ${over.length || gone.length ? `<div class="ms-alerts no-print" role="status">${over.map(t => `<p class="al">⚠ <b>${esc(t.name)}</b> passou ${plural(seatedAt(t.id).length - t.seats, "lugar", "lugares")} da capacidade (${seatedAt(t.id).length}/${t.seats}).</p>`).join("")}${gone.length ? `<p class="al">⚠ ${plural(gone.length, "pessoa com mesa não vai mais", "pessoas com mesa não vão mais")} ao evento: ${gone.map(g => esc(g.name)).join(", ")}.</p>` : ""}</div>` : ""}

    <form class="panel ms-form no-print" id="tForm" hidden novalidate><h2>Nova mesa</h2>
      <div class="ms-fields"><label class="field"><span>Nome</span><input class="in" name="name" maxlength="40" placeholder="Mesa ${d.tables.length + 1}"></label>
        <fieldset class="field"><legend><span>Formato</span></legend><div class="seg"><label><input type="radio" name="shape" value="round" checked><span>Redonda</span></label><label><input type="radio" name="shape" value="rect"><span>Retangular</span></label></div></fieldset>
        <label class="field"><span>Lugares</span><input class="in" name="seats" type="number" min="1" max="40" value="8" inputmode="numeric"></label></div>
      <p class="error" id="tErr" role="alert"></p><div class="row-btns"><button class="btn" type="submit">Criar mesa</button><button class="btn ghost" type="button" data-close="tForm">Cancelar</button></div></form>
    <form class="panel ms-form no-print" id="iForm" hidden novalidate><h2>Elemento fixo da planta</h2>
      <div class="ms-fields"><label class="field"><span>Tipo</span><select class="in" name="kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <label class="field"><span>Nome (opcional)</span><input class="in" name="label" maxlength="40" placeholder="Ex.: Pista principal"></label></div>
      <p class="error" id="iErr" role="alert"></p><div class="row-btns"><button class="btn" type="submit">Adicionar</button><button class="btn ghost" type="button" data-close="iForm">Cancelar</button></div></form>
    <div id="sugBox" class="no-print">${proposal ? proposalHtml() : ""}</div>

    <div class="ms-main">
      <section class="plan-wrap" aria-labelledby="pl-t"><h2 id="pl-t" class="ms-h">Planta do salão</h2>
        <div class="plan-scroll"><div class="plan" id="plan">
          ${d.items.map(it => `<div class="fi fi-${esc(it.kind)}" data-item="${esc(it.id)}" ${ro() ? "" : `tabindex="0" role="button" aria-roledescription="elemento móvel" aria-label="${esc(it.label)}. Use as setas para mover."`}>${esc(it.label)}</div>`).join("")}
          ${d.tables.map(t => { const n = seatedAt(t.id).length; return `<div class="tb ${t.shape}${n > t.seats ? " over" : ""}" data-table="${esc(t.id)}" data-drop="${esc(t.id)}" tabindex="0" role="button" aria-roledescription="mesa móvel"
            aria-label="${esc(t.name)}, ${n} de ${t.seats} lugares.${ro() ? "" : " Setas movem a mesa; Enter abre a lista."}"><span class="tb-n">${esc(t.name)}</span><span class="tb-c num">${n}/${t.seats}</span></div>`; }).join("")}
          ${d.tables.length || d.items.length ? "" : `<p class="plan-empty">Crie a primeira mesa e arraste para o lugar certo.</p>`}
        </div></div>
        <p class="hint no-print">Arraste mesas e elementos (no celular, toque e arraste). Pelo teclado: Tab até a mesa e use as setas (Shift move mais).</p>
        ${d.items.length && !ro() ? `<ul class="fi-list no-print">${d.items.map(it => `<li><span>${esc(it.label)}</span><button class="link small danger" type="button" data-delitem="${esc(it.id)}" aria-label="Remover ${esc(it.label)}">remover</button></li>`).join("")}</ul>` : ""}
      </section>
      <aside class="unseated" data-drop="" aria-labelledby="us-t"><h2 id="us-t" class="ms-h">Sem mesa <span class="muted">(${unseated.length})</span></h2>
        ${unseated.length ? groupByFamily(unseated).map(f => famBlock(f, true)).join("") : `<p class="muted small">${conf.length ? "Todos os confirmados já têm mesa." : "Ninguém confirmou presença neste evento ainda."}</p>`}
        ${ro() ? "" : `<p class="hint">Arraste uma pessoa até uma mesa, ou escolha no seletor ao lado do nome.</p>`}
      </aside>
    </div>

    <section class="tlist" aria-labelledby="tl-t"><h2 id="tl-t" class="ms-h">Mesas e quem senta em cada uma</h2>
      <div class="tcards">${d.tables.map(t => { const ps = seatedAt(t.id), n = ps.length; return `<article class="tcard${n > t.seats ? " over" : ""}" id="card-${esc(t.id)}" data-drop="${esc(t.id)}" tabindex="-1" aria-labelledby="tn-${esc(t.id)}">
        <header class="tc-h"><div><h3 id="tn-${esc(t.id)}">${esc(t.name)}</h3><p class="muted small">${t.shape === "rect" ? "Retangular" : "Redonda"} · <span class="num ${n > t.seats ? "over-t" : ""}">${n}/${t.seats}</span> lugares</p></div>
          ${ro() ? "" : `<div class="tc-acts no-print"><button class="link small" type="button" data-edit="${esc(t.id)}" aria-expanded="false">Editar</button><button class="link small danger" type="button" data-deltable="${esc(t.id)}">Apagar</button></div>`}</header>
        ${n > t.seats ? `<p class="al" role="status">⚠ Passou ${plural(n - t.seats, "lugar", "lugares")} da capacidade.</p>` : ""}
        <form class="tc-edit no-print" data-tid="${esc(t.id)}" hidden novalidate>
          <label class="field"><span>Nome</span><input class="in" name="name" maxlength="40" value="${esc(t.name)}"></label>
          <label class="field"><span>Formato</span><select class="in" name="shape"><option value="round" ${t.shape === "round" ? "selected" : ""}>Redonda</option><option value="rect" ${t.shape === "rect" ? "selected" : ""}>Retangular</option></select></label>
          <label class="field"><span>Lugares</span><input class="in" name="seats" type="number" min="1" max="40" value="${t.seats}" inputmode="numeric"></label>
          <div class="row-btns"><button class="btn sm" type="submit">Salvar</button></div><p class="error" role="alert"></p></form>
        ${n ? groupByFamily(ps).map(f => famBlock(f, false)).join("") : `<p class="muted small drop-hint">Mesa vazia. Arraste pessoas para cá.</p>`}
      </article>`; }).join("") || `<p class="muted">Nenhuma mesa ainda.</p>`}</div>
    </section>
    <p class="print-note">Mapa de mesas · ${esc(state.me?.wedding?.names || "")}${ev ? ` · ${esc(ev.name)}` : ""}</p>
  </div>`;
  place(); bind();
}
/** Posição e tamanho via CSSOM (a política de segurança não permite estilos inline no HTML). */
function place() {
  for (const t of d.tables) { const el = $(`[data-table="${CSS.escape(t.id)}"]`); if (!el) continue; el.style.left = t.x + "%"; el.style.top = t.y + "%"; el.style.width = tableSize(t)[0] + "%"; }
  for (const it of d.items) { const el = $(`[data-item="${CSS.escape(it.id)}"]`); if (!el) continue; el.style.left = it.x + "%"; el.style.top = it.y + "%"; el.style.width = it.w + "%"; el.style.height = (it.h * 1.5) + "%"; }
}

/* ---------------- sugestão por família (só preenche vagas; o casal confirma) ---------------- */
function suggest() {
  const free = Object.fromEntries(d.tables.map(t => [t.id, t.seats - seatedAt(t.id).length]));
  const fams = groupByFamily(d.guests.filter(g => g.confirmed && !g.table_id)).sort((a, b) => b.guests.length - a.guests.length);
  const moves = [], left = [];
  for (const f of fams) {
    // a mesa com menos sobra que ainda cabe a família inteira
    const fit = d.tables.filter(t => free[t.id] >= f.guests.length).sort((a, b) => free[a.id] - free[b.id])[0];
    if (fit) { free[fit.id] -= f.guests.length; moves.push({ fam: f, table: fit }); } else left.push(f);
  }
  return { moves, left };
}
function proposalHtml() {
  const { moves, left } = proposal;
  return `<section class="panel sug" aria-labelledby="sg-t" tabindex="-1" id="sugP"><h2 id="sg-t">Sugestão de agrupamento</h2>
    ${moves.length ? `<p>Mantém cada família junta e só usa lugares vagos. Nada muda até vocês confirmarem.</p>
    <ul class="sug-list">${moves.map(m => `<li><b>${esc(m.fam.name)}</b> <span class="muted small">(${m.fam.guests.length})</span> → ${esc(m.table.name)}</li>`).join("")}</ul>` : `<p>Nenhuma família cabe inteira nas vagas que sobraram.</p>`}
    ${left.length ? `<p class="muted small">Ficam sem mesa (não cabem juntas em nenhuma mesa): ${left.map(f => `${esc(f.name)} (${f.guests.length})`).join(", ")}.</p>` : ""}
    <div class="row-btns">${moves.length ? `<button class="btn" type="button" id="sugOk">Confirmar sugestão</button>` : ""}<button class="btn ghost" type="button" id="sugNo">Descartar</button></div></section>`;
}

/* ---------------- ações ---------------- */
async function seat(assignments, focusSel) {
  try { await api("/api/admin/mesas/seats", { method: "POST", body: { assignments } }); } catch (x) { alert(x.message); }
  await reload(focusSel);
}
function bind() {
  const v = viewEl();
  $("#printB").onclick = () => print();
  if (ro()) return;
  const tog = (btn, id) => { btn.onclick = () => { const f = $("#" + id); f.hidden = !f.hidden; btn.setAttribute("aria-expanded", String(!f.hidden)); if (!f.hidden) f.querySelector("input,select")?.focus(); }; };
  tog($("#newT"), "tForm"); tog($("#newI"), "iForm");
  $$("[data-close]").forEach(b => b.onclick = () => { $("#" + b.dataset.close).hidden = true; });
  $("#tForm").onsubmit = async e => {
    e.preventDefault(); const f = e.target, n = d.tables.length;
    try {
      await api("/api/admin/mesas/tables", { method: "POST", body: { ...(f.name.value.trim() ? { name: f.name.value } : {}), shape: f.shape.value, seats: Number(f.seats.value),
        x: 12 + (n % 6) * 15, y: clamp(42 + Math.floor(n / 6) * 18, 5, 95) } });
      await reload("#newT");
    } catch (x) { $("#tErr").textContent = x.message; }
  };
  $("#iForm").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { await api("/api/admin/mesas/items", { method: "POST", body: { kind: f.kind.value, ...(f.label.value.trim() ? { label: f.label.value } : {}) } }); await reload("#newI"); }
    catch (x) { $("#iErr").textContent = x.message; }
  };
  $("#sugB").onclick = () => { proposal = suggest(); $("#sugBox").innerHTML = proposalHtml(); bindProposal(); $("#sugP").focus(); };
  bindProposal();
  $("#showT").onchange = async e => { try { await api("/api/admin/mesas", { method: "PATCH", body: { show_tables: e.target.checked } }); } catch (x) { e.target.checked = !e.target.checked; alert(x.message); } };
  $("#evSel")?.addEventListener("change", async e => { await api("/api/admin/mesas", { method: "PATCH", body: { event_id: e.target.value } }).catch(x => alert(x.message)); reload("#evSel"); });

  v.onchange = e => {
    const s = e.target.closest("select.mv"); if (!s) return;
    if (s.dataset.family) { if (!s.value) return; seat(d.guests.filter(g => g.household_id === s.dataset.family && g.confirmed && !g.table_id).map(g => ({ guest_id: g.id, table_id: s.value })), `#card-${CSS.escape(s.value)}`); }
    else seat([{ guest_id: s.dataset.guest, table_id: s.value || null }], `#mv-${CSS.escape(s.dataset.guest)}`);
  };
  v.onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    try {
      if (b.dataset.edit) { const f = $(`.tc-edit[data-tid="${CSS.escape(b.dataset.edit)}"]`); f.hidden = !f.hidden; b.setAttribute("aria-expanded", String(!f.hidden)); if (!f.hidden) f.name.focus(); }
      else if (b.dataset.deltable) { const t = d.tables.find(x => x.id === b.dataset.deltable); if (confirm(`Apagar “${t.name}”? Quem estava nela volta para “Sem mesa”.`)) { await api(`/api/admin/mesas/tables/${t.id}`, { method: "DELETE" }); reload(); } }
      else if (b.dataset.delitem) { await api(`/api/admin/mesas/items/${b.dataset.delitem}`, { method: "DELETE" }); reload(); }
    } catch (x) { alert(x.message); }
  };
  $$(".tc-edit").forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    try { await api(`/api/admin/mesas/tables/${f.dataset.tid}`, { method: "PATCH", body: { name: f.name.value, shape: f.shape.value, seats: Number(f.seats.value) } }); reload(`#card-${CSS.escape(f.dataset.tid)}`); }
    catch (x) { f.querySelector(".error").textContent = x.message; }
  });
  bindPlan(); bindGuestDrag();
}
function bindProposal() {
  $("#sugNo")?.addEventListener("click", () => { proposal = null; $("#sugBox").innerHTML = ""; $("#sugB")?.focus(); });
  $("#sugOk")?.addEventListener("click", async () => {
    const list = proposal.moves.flatMap(m => m.fam.guests.map(g => ({ guest_id: g.id, table_id: m.table.id })));
    proposal = null; await seat(list, "#sugB");
  });
}

/* ---------------- arrastar na planta (mesas e elementos) ---------------- */
function bindPlan() {
  const plan = $("#plan"); if (!plan) return;
  const save = (el, x, y) => {
    const t = el.dataset.table, it = el.dataset.item;
    const rec = t ? d.tables.find(o => o.id === t) : d.items.find(o => o.id === it);
    rec.x = x; rec.y = y;
    return api(t ? `/api/admin/mesas/tables/${t}` : `/api/admin/mesas/items/${it}`, { method: "PATCH", body: { x, y } }).catch(x => alert(x.message));
  };
  plan.addEventListener("pointerdown", e => {
    const el = e.target.closest("[data-table],[data-item]"); if (!el || e.button > 0) return;
    const r = plan.getBoundingClientRect(), b = el.getBoundingClientRect();
    const off = { x: e.clientX - (b.left + b.width / 2), y: e.clientY - (b.top + b.height / 2) };
    let moved = false, x = 0, y = 0;
    el.setPointerCapture(e.pointerId); el.classList.add("moving");
    const mv = ev => {
      x = clamp(Math.round((ev.clientX - off.x - r.left) / r.width * 1000) / 10, 0, 100);
      y = clamp(Math.round((ev.clientY - off.y - r.top) / r.height * 1000) / 10, 0, 100);
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      moved = true; el.style.left = x + "%"; el.style.top = y + "%";
    };
    const up = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.classList.remove("moving");
      if (moved) save(el, x, y);
      else if (el.dataset.table) { const c = $(`#card-${CSS.escape(el.dataset.table)}`); c?.scrollIntoView({ block: "center", behavior: "smooth" }); c?.focus({ preventScroll: true }); }
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  });
  let timer = null;
  plan.addEventListener("keydown", e => {
    const el = e.target.closest("[data-table],[data-item]"); if (!el) return;
    if (e.key === "Enter" && el.dataset.table) { e.preventDefault(); $(`#card-${CSS.escape(el.dataset.table)}`)?.focus(); return; }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!dir) return;
    e.preventDefault();
    const rec = el.dataset.table ? d.tables.find(o => o.id === el.dataset.table) : d.items.find(o => o.id === el.dataset.item);
    const step = e.shiftKey ? 5 : 1;
    rec.x = clamp(Math.round((rec.x + dir[0] * step) * 10) / 10, 0, 100); rec.y = clamp(Math.round((rec.y + dir[1] * step) * 10) / 10, 0, 100);
    el.style.left = rec.x + "%"; el.style.top = rec.y + "%";
    clearTimeout(timer); timer = setTimeout(() => save(el, rec.x, rec.y), 400);
  });
}

/* ---------------- arrastar convidados entre mesas (mouse e toque) ---------------- */
function bindGuestDrag() {
  const v = viewEl();
  v.querySelector(".mesas").addEventListener("pointerdown", e => {
    const c = e.target.closest(".gchip"); if (!c || e.button > 0 || e.target.closest("select,label")) return;
    if (e.pointerType !== "mouse" && !e.target.closest(".grip")) return; // no toque, só pela alça (o resto rola a página)
    const gid = c.dataset.guest, sx = e.clientX, sy = e.clientY;
    let ghost = null, hot = null;
    const target = ev => {
      if (ghost) ghost.hidden = true;
      const z = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-drop]");
      if (ghost) ghost.hidden = false;
      return z;
    };
    const mv = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        ghost = document.createElement("div"); ghost.className = "drag-ghost"; ghost.textContent = c.querySelector(".gname").textContent.trim();
        document.body.append(ghost); c.classList.add("dragging");
      }
      ev.preventDefault();
      ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px";
      const z = target(ev);
      if (z !== hot) { hot?.classList.remove("drop-hot"); hot = z; hot?.classList.add("drop-hot"); }
    };
    const up = ev => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel);
      if (!ghost) return;
      const z = target(ev); ghost.remove(); c.classList.remove("dragging"); hot?.classList.remove("drop-hot");
      if (z) { const tid = z.dataset.drop || null; const g = d.guests.find(x => x.id === gid); if ((g.table_id || null) !== tid) seat([{ guest_id: gid, table_id: tid }], `#mv-${CSS.escape(gid)}`); }
    };
    const cancel = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); ghost?.remove(); c.classList.remove("dragging"); hot?.classList.remove("drop-hot"); };
    addEventListener("pointermove", mv, { passive: false }); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
  });
}
