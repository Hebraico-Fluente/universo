/** Tarefas e agenda: checklist gerado pela data e pelo tipo de cerimônia, tarefas com responsável e prazo, compromissos. */
import { $, $$, esc, api } from "../ui.js";
import { viewEl, fail, css } from "./core.js";
import { dBR } from "./orcamento.js";

const PHASE = { "12m": "12 meses antes", "9m": "9 meses antes", "6m": "6 meses antes", "3m": "3 meses antes", "1m": "1 mês antes", "2s": "2 semanas antes", "1s": "1 semana antes", dia: "No dia" };
const KIND = { degustacao: "Degustação", prova: "Prova de traje", reuniao: "Reunião", visita: "Visita", outro: "Outro" };
const OWNERS = ["Noiva", "Noivo", "Os dois", "Mãe", "Pai", "Cerimonialista", "Madrinha", "Padrinho"];
const ui = { filter: "todas", owner: "", showDone: false };
const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const days = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const addD = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const endTime = (s, min) => { const t = new Date(Date.parse(s + ":00Z") + min * 6e4).toISOString(); return t.slice(11, 16); };
const CHECK = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default async function tasks() {
  css("/assets/painel/organizacao.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/org/tasks");
    const today = d.today, week = addD(today, 7), month = addD(today, 31);
    const vName = Object.fromEntries(d.vendors.map(v => [v.id, v.name]));
    const open = d.tasks.filter(t => t.status !== "done");
    const late = open.filter(t => t.due_date && t.due_date < today);
    const thisWeek = open.filter(t => t.due_date && t.due_date >= today && t.due_date <= week);
    const owners = [...new Set(d.tasks.map(t => t.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (ui.owner && ui.owner !== "__none" && !owners.includes(ui.owner)) ui.owner = "";
    const byOwner = t => !ui.owner || (ui.owner === "__none" ? !t.owner : t.owner === ui.owner);
    let list = (ui.filter === "atrasadas" ? late : ui.filter === "semana" ? thisWeek : ui.filter === "todas" ? d.tasks : open).filter(byOwner);
    if (!ui.showDone) list = list.filter(t => t.status !== "done");
    const groups = [
      ["Atrasadas", list.filter(t => t.status !== "done" && t.due_date && t.due_date < today), "is-late"],
      ["Esta semana", list.filter(t => t.status !== "done" && t.due_date && t.due_date >= today && t.due_date <= week)],
      ["Este mês", list.filter(t => t.status !== "done" && t.due_date && t.due_date > week && t.due_date <= month)],
      ["Mais adiante", list.filter(t => t.status !== "done" && t.due_date && t.due_date > month)],
      ["Sem prazo", list.filter(t => t.status !== "done" && !t.due_date)],
      ["Concluídas", list.filter(t => t.status === "done")],
    ].filter(g => g[1].length);
    const upcoming = d.appointments.filter(a => a.starts_at.slice(0, 10) >= today), past = d.appointments.filter(a => a.starts_at.slice(0, 10) < today).reverse();
    const apById = Object.fromEntries(d.appointments.map(a => [a.id, a]));
    const pr = d.profile;

    viewEl().innerHTML = `<div class="o-root">
      <header class="vh"><div><p class="label">Tarefas e agenda</p><h1>${d.tasks.length ? `${open.length} ${open.length === 1 ? "tarefa aberta" : "tarefas abertas"}${late.length ? `, ${late.length} ${late.length === 1 ? "atrasada" : "atrasadas"}` : ""}` : "Um passo de cada vez"}</h1></div>
        <div class="row-btns"><button class="btn" type="button" id="addT">Nova tarefa</button><button class="btn ghost" type="button" id="genT">${pr.generated_at ? "Atualizar checklist" : "Gerar checklist"}</button><button class="btn ghost" type="button" id="addA">Novo compromisso</button></div></header>

      <form class="panel bform" id="ckForm" hidden novalidate aria-labelledby="ckT">
        <h2 id="ckT">Checklist do casamento</h2>
        <p class="muted">Criamos as tarefas com prazos contados a partir de ${esc(dBR(d.wedding_date))}: 12, 9, 6, 3 e 1 mês antes, 2 semanas, 1 semana e o dia. O que já passou entra com prazo para hoje. Gerar de novo só acrescenta o que falta, sem duplicar.</p>
        <fieldset><legend>Tipo de cerimônia</legend>
          <p class="small muted">Marquem tudo o que vale para vocês. Sem marcação, não criamos tarefas de cartório nem religiosas.</p>
          <div class="checks">${d.ceremonies.map(([k, l]) => `<label class="o-check-l"><input type="checkbox" name="ceremony" value="${k}" ${pr.ceremony.includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div></fieldset>
        <div class="grid2">
          <label class="field"><span>Número de convidados (estimativa)</span><input class="in" name="guests" type="number" min="0" max="5000" inputmode="numeric" value="${pr.guests || ""}"></label>
          <fieldset><legend>O local da festa já está definido?</legend><div class="checks">
            <label class="o-check-l"><input type="radio" name="venue" value="1" ${pr.venue_defined ? "checked" : ""}> Sim</label><label class="o-check-l"><input type="radio" name="venue" value="0" ${pr.venue_defined ? "" : "checked"}> Ainda não</label></div></fieldset>
        </div>
        <fieldset><legend>Preferências</legend><div class="checks">${d.prefs.map(([k, l]) => `<label class="o-check-l"><input type="checkbox" name="prefs" value="${k}" ${pr.prefs.includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div></fieldset>
        <label class="field"><span>Responsável padrão (opcional)</span><input class="in" name="owner" maxlength="60" list="owners" placeholder="Deixem em branco para distribuir depois"></label>
        <p class="error" id="ckerr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Gerar tarefas</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
      </form>

      <form class="panel bform" id="tForm" hidden novalidate aria-labelledby="tT">
        <h2 id="tT">Nova tarefa</h2>
        <label class="field"><span>Tarefa</span><input class="in" name="title" maxlength="140" required placeholder="Ex.: Escolher as músicas da entrada"></label>
        <div class="grid2">
          <label class="field"><span>Responsável</span><input class="in" name="owner" maxlength="60" list="owners" placeholder="Ex.: noiva, noivo, mãe, cerimonialista"></label>
          <label class="field"><span>Prazo</span><input class="in" name="due_date" type="date"></label>
          <label class="field"><span>Situação</span><select class="in" name="status"><option value="todo">A fazer</option><option value="doing">Em andamento</option><option value="done">Concluída</option></select></label>
          <label class="field"><span>Fornecedor ligado (opcional)</span><select class="in" name="vendor_id"><option value="">Nenhum</option>${d.vendors.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Notas</span><textarea class="in" name="notes" rows="2" maxlength="1000"></textarea></label>
        <p class="error" id="terr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
      </form>

      <form class="panel bform" id="aForm" hidden novalidate aria-labelledby="aT">
        <h2 id="aT">Novo compromisso</h2>
        <div class="grid2">
          <label class="field"><span>Compromisso</span><input class="in" name="title" maxlength="120" required placeholder="Ex.: Degustação do buffet"></label>
          <label class="field"><span>Tipo</span><select class="in" name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label class="field"><span>Data</span><input class="in" name="date" type="date" required></label>
          <div class="grid2"><label class="field"><span>Horário</span><input class="in" name="time" type="time" required value="10:00"></label>
            <label class="field"><span>Duração</span><select class="in" name="duration_min">${[[30, "30 min"], [60, "1 hora"], [90, "1h30"], [120, "2 horas"], [180, "3 horas"], [240, "4 horas"]].map(([v, l]) => `<option value="${v}" ${v === 60 ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
          <label class="field"><span>Local</span><input class="in" name="place" maxlength="160" placeholder="Endereço ou nome do lugar"></label>
          <label class="field"><span>Fornecedor (opcional)</span><select class="in" name="vendor_id"><option value="">Nenhum</option>${d.vendors.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Notas</span><textarea class="in" name="notes" rows="2" maxlength="800" placeholder="O que levar, quem vai…"></textarea></label>
        <p class="error" id="aerr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
      </form>
      <datalist id="owners">${[...new Set([...owners, ...OWNERS])].map(o => `<option value="${esc(o)}"></option>`).join("")}</datalist>

      <div class="o-tgrid">
        <section aria-labelledby="tlist">
          <h2 class="sr" id="tlist">Tarefas</h2>
          ${!d.tasks.length ? `<div class="panel o-empty"><h2>Comecem pelo checklist</h2><p>Respondam quatro perguntas (tipo de cerimônia, convidados, local e preferências) e montamos as tarefas com prazo, do “12 meses antes” até o dia. Nada é presumido: vocês escolhem o que vale.</p><div class="row-btns"><button class="btn" type="button" data-gen>Gerar checklist</button></div></div>` : `
          <div class="o-filters">
            <div class="o-chips" role="group" aria-label="Filtrar tarefas">
              <button class="o-chip" type="button" data-f="abertas" aria-pressed="${ui.filter === "abertas" || ui.filter === "todas"}">Todas <b>${open.length}</b></button>
              <button class="o-chip" type="button" data-f="atrasadas" aria-pressed="${ui.filter === "atrasadas"}">Atrasadas <b>${late.length}</b></button>
              <button class="o-chip" type="button" data-f="semana" aria-pressed="${ui.filter === "semana"}">Esta semana <b>${thisWeek.length}</b></button>
            </div>
            <label class="field"><span class="sr">Responsável</span><select class="in" id="fOwner"><option value="">Qualquer responsável</option>${owners.map(o => `<option value="${esc(o)}" ${ui.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}<option value="__none" ${ui.owner === "__none" ? "selected" : ""}>Sem responsável</option></select></label>
            <label class="o-check-l small"><input type="checkbox" id="fDone" ${ui.showDone ? "checked" : ""}> Mostrar concluídas (${d.tasks.length - open.length})</label>
          </div>
          ${groups.length ? groups.map(([title, ts, cls]) => `<section class="o-group ${cls || ""}"><h3>${title} <small>${ts.length}</small></h3><ul class="o-tasks">${ts.map(t => taskRow(t, today, vName)).join("")}</ul></section>`).join("")
            : `<p class="o-calm">Nada por aqui com esse filtro. ${ui.filter === "atrasadas" ? "Nenhuma tarefa atrasada." : ""}</p>`}`}
        </section>

        <aside class="panel o-agenda" aria-labelledby="agT">
          <h2 id="agT">Próximos compromissos</h2>
          ${upcoming.length ? `<ul class="o-appts">${upcoming.map(a => apptRow(a, vName, apById)).join("")}</ul>` : `<p class="muted">Nenhum compromisso marcado. Degustações, provas e reuniões entram aqui, com aviso se dois caírem no mesmo horário.</p>`}
          <div class="row-btns"><button class="btn ghost sm" type="button" data-newa>Novo compromisso</button></div>
          ${past.length ? `<details class="o-past"><summary>Compromissos passados (${past.length})</summary><ul class="o-appts">${past.map(a => apptRow(a, vName, apById)).join("")}</ul></details>` : ""}
        </aside>
      </div></div>`;

    const root = $(".o-root", viewEl());
    const forms = { ck: $("#ckForm"), t: $("#tForm"), a: $("#aForm") };
    const show = (f, title) => { Object.values(forms).forEach(x => x.hidden = true); f.hidden = false; if (title) f.querySelector("h2").textContent = title; f.querySelector(".error").textContent = ""; f.scrollIntoView({ block: "start", behavior: "smooth" }); f.querySelector("input:not([type=checkbox]):not([type=radio]), select, input").focus({ preventScroll: true }); };
    const openTask = t => { const f = forms.t; f.reset(); f.dataset.id = t?.id || ""; if (t) { f.title.value = t.title; f.owner.value = t.owner; f.due_date.value = t.due_date || ""; f.status.value = t.status; f.vendor_id.value = t.vendor_id || ""; f.notes.value = t.notes; } show(f, t ? "Editar tarefa" : "Nova tarefa"); };
    const openAppt = a => { const f = forms.a; f.reset(); f.dataset.id = a?.id || ""; if (a) { f.title.value = a.title; f.kind.value = a.kind; f.date.value = a.starts_at.slice(0, 10); f.time.value = a.starts_at.slice(11, 16); f.duration_min.value = String(a.duration_min); if (f.duration_min.value !== String(a.duration_min)) f.duration_min.insertAdjacentHTML("beforeend", `<option value="${a.duration_min}" selected>${a.duration_min} min</option>`); f.place.value = a.place; f.vendor_id.value = a.vendor_id || ""; f.notes.value = a.notes; } else f.date.value = addD(today, 7); show(f, a ? "Editar compromisso" : "Novo compromisso"); };
    $$("[data-cancel]", root).forEach(b => b.addEventListener("click", () => Object.values(forms).forEach(x => x.hidden = true)));

    forms.ck.addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target, er = $("#ckerr"); er.textContent = "";
      const body = { ceremony: $$("[name=ceremony]:checked", f).map(x => x.value), prefs: $$("[name=prefs]:checked", f).map(x => x.value), guests: parseInt(f.guests.value, 10) || 0, venue_defined: f.venue.value === "1", owner: f.owner.value };
      try { const r = await api("/api/admin/org/checklist", { method: "POST", body }); ui.filter = "abertas"; await tasks(); announce(r.created ? `${r.created} tarefas criadas${r.skipped ? ` (${r.skipped} já existiam)` : ""}.` : "Nenhuma tarefa nova: o checklist já estava completo."); }
      catch (x) { er.textContent = x.message; }
    });
    forms.t.addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target, er = $("#terr"); er.textContent = "";
      if (f.title.value.trim().length < 2) return er.textContent = "Descreva a tarefa.";
      const body = { title: f.title.value, owner: f.owner.value, due_date: f.due_date.value || null, status: f.status.value, vendor_id: f.vendor_id.value || null, notes: f.notes.value };
      try { await api(f.dataset.id ? `/api/admin/org/tasks/${f.dataset.id}` : "/api/admin/org/tasks", { method: f.dataset.id ? "PATCH" : "POST", body }); tasks(); } catch (x) { er.textContent = x.message; }
    });
    forms.a.addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target, er = $("#aerr"); er.textContent = "";
      if (f.title.value.trim().length < 2) return er.textContent = "Dê um nome ao compromisso.";
      if (!f.date.value || !f.time.value) return er.textContent = "Informe a data e o horário.";
      const body = { title: f.title.value, kind: f.kind.value, date: f.date.value, time: f.time.value, duration_min: +f.duration_min.value, place: f.place.value, vendor_id: f.vendor_id.value || null, notes: f.notes.value };
      try { await api(f.dataset.id ? `/api/admin/org/appointments/${f.dataset.id}` : "/api/admin/org/appointments", { method: f.dataset.id ? "PATCH" : "POST", body }); tasks(); } catch (x) { er.textContent = x.message; }
    });
    $("#fOwner")?.addEventListener("change", e => { ui.owner = e.target.value; tasks(); });
    $("#fDone")?.addEventListener("change", e => { ui.showDone = e.target.checked; tasks(); });

    root.onclick = async e => {
      const b = e.target.closest("button"); if (!b) return;
      const ds = b.dataset;
      try {
        if (b.id === "addT") return openTask();
        if (b.id === "genT" || ds.gen !== undefined) return show(forms.ck);
        if (b.id === "addA" || ds.newa !== undefined) return openAppt();
        if (ds.f) { ui.filter = ds.f; return tasks(); }
        if (ds.done) {
          const t = d.tasks.find(x => x.id === ds.done), done = t.status !== "done";
          b.setAttribute("aria-pressed", String(done)); b.closest(".o-task").classList.toggle("done", done);
          await api(`/api/admin/org/tasks/${t.id}`, { method: "PATCH", body: { status: done ? "done" : "todo" } });
          await tasks(); announce(done ? `“${t.title}” concluída.` : `“${t.title}” reaberta.`);
          document.querySelector(`[data-done="${CSS.escape(t.id)}"]`)?.focus();
          return;
        }
        if (ds.tedit) return openTask(d.tasks.find(x => x.id === ds.tedit));
        if (ds.tdel) { const t = d.tasks.find(x => x.id === ds.tdel); if (confirm(`Apagar a tarefa “${t.title}”?`)) { await api(`/api/admin/org/tasks/${t.id}`, { method: "DELETE" }); tasks(); } }
        if (ds.aedit) return openAppt(apById[ds.aedit]);
        if (ds.adel) { const a = apById[ds.adel]; if (confirm(`Apagar o compromisso “${a.title}”?`)) { await api(`/api/admin/org/appointments/${a.id}`, { method: "DELETE" }); tasks(); } }
      } catch (x) { alert(x.message); tasks(); }
    };
  } catch (e) { fail(e); }
}

function taskRow(t, today, vName) {
  const done = t.status === "done";
  let due = "";
  if (t.due_date && !done) { const n = days(today, t.due_date);
    due = n < 0 ? `<span class="late">atrasada há ${-n} ${-n === 1 ? "dia" : "dias"}</span>` : n === 0 ? `<span class="soon">para hoje</span>` : n <= 7 ? `<span class="soon">em ${n} ${n === 1 ? "dia" : "dias"}</span>` : `<span>até ${esc(dBR(t.due_date))}</span>`; }
  else if (done && t.done_at) due = `<span>concluída em ${esc(dBR(t.done_at))}</span>`;
  return `<li class="o-task ${done ? "done" : ""}">
    <button class="o-tick" type="button" data-done="${esc(t.id)}" aria-pressed="${done}" aria-label="${done ? "Reabrir" : "Concluir"}: ${esc(t.title)}"><i>${CHECK}</i></button>
    <div><p class="o-ttl">${esc(t.title)}${t.status === "doing" ? ` <span class="tag pending">em andamento</span>` : ""}</p>
      <p class="o-tmeta">${due}${t.owner ? `<span>${esc(t.owner)}</span>` : `<span class="who-none">sem responsável</span>`}${t.vendor_id && vName[t.vendor_id] ? `<a href="#fornecedores">${esc(vName[t.vendor_id])}</a>` : ""}${t.phase ? `<span>${esc(PHASE[t.phase] || "")}</span>` : ""}</p>
      ${t.notes ? `<p class="small muted o-pre">${esc(t.notes)}</p>` : ""}</div>
    <div class="o-tacts"><button class="link small" type="button" data-tedit="${esc(t.id)}" aria-label="Editar ${esc(t.title)}">Editar</button><button class="link small danger" type="button" data-tdel="${esc(t.id)}" aria-label="Apagar ${esc(t.title)}">Apagar</button></div>
  </li>`;
}
function apptRow(a, vName, byId) {
  const [y, m, d] = a.starts_at.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const conf = a.conflict_with.map(id => byId[id]).filter(Boolean);
  return `<li class="o-appt ${conf.length ? "is-conf" : ""}">
    <div class="o-day" aria-hidden="true"><small>${esc(wd)}</small><b>${d}</b><small>${MON[m - 1]}</small></div>
    <div><h4>${esc(a.title)}</h4>
      <p><span class="sr">${esc(dBR(a.starts_at))}, </span>${esc(a.starts_at.slice(11, 16))}–${esc(endTime(a.starts_at, a.duration_min))} · ${esc(KIND[a.kind])}${a.place ? ` · ${esc(a.place)}` : ""}</p>
      ${a.vendor_id && vName[a.vendor_id] ? `<p><a href="#fornecedores">${esc(vName[a.vendor_id])}</a></p>` : ""}
      ${conf.length ? `<p class="conf">Conflito de horário com ${conf.map(c => `“${esc(c.title)}”`).join(" e ")}</p>` : ""}
      ${a.notes ? `<p class="muted o-pre">${esc(a.notes)}</p>` : ""}
      <div class="o-tacts"><button class="link small" type="button" data-aedit="${esc(a.id)}" aria-label="Editar ${esc(a.title)}">Editar</button><button class="link small danger" type="button" data-adel="${esc(a.id)}" aria-label="Apagar ${esc(a.title)}">Apagar</button></div></div>
  </li>`;
}
/** Aviso para leitores de tela (e visível por um instante). */
function announce(msg) {
  let el = $("#o-live");
  if (!el) { el = document.createElement("p"); el.id = "o-live"; el.className = "sr"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = ""; setTimeout(() => { el.textContent = msg; }, 50);
}
