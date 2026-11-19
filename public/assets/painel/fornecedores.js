/** Fornecedores: cadastro, status de contratação, propostas (com comparação lado a lado), datas, checklist e ligação com o orçamento. */
import { $, $$, esc, money, api } from "../ui.js";
import { viewEl, fail, css } from "./core.js";
import { toCents, reais, dBR } from "./orcamento.js";

const STATUS = { pesquisando: "Pesquisando", orcamento_pedido: "Orçamento pedido", proposta_recebida: "Proposta recebida", contratado: "Contratado", descartado: "Descartado" };
const TAG = { pesquisando: "no", orcamento_pedido: "pending", proposta_recebida: "info", contratado: "ok", descartado: "off" };
const SUGGEST = ["Local", "Buffet", "Bebidas", "Doces e bolo", "Decoração e flores", "Foto e vídeo", "Música", "Beleza", "Trajes", "Papelaria", "Cerimonial", "Celebrante", "Transporte", "Lembrancinhas"];
const ui = { mode: "lista", filter: "todos", open: new Set() };

const telHref = p => "tel:" + p.replace(/[^\d+]/g, "");
const waHref = p => { let n = p.replace(/\D/g, ""); if (n.length <= 11) n = "55" + n; return "https://wa.me/" + n; };
const siteLabel = s => s.replace(/^https?:\/\/(www\.)?/, "").replace(/^instagram\.com\//, "@").replace(/\/$/, "");

export default async function vendors() {
  css("/assets/painel/organizacao.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/org/vendors");
    const live = d.vendors.filter(v => v.status !== "descartado");
    const contracted = d.vendors.filter(v => v.status === "contratado").length;
    const cats = [...new Set([...d.vendors.map(v => v.category).filter(Boolean), ...d.categories.map(c => c.name), ...SUGGEST])];
    const count = s => d.vendors.filter(v => v.status === s).length;
    const shown = d.vendors.filter(v => ui.filter === "todos" || v.status === ui.filter);
    const withQuotes = [...new Set(d.vendors.filter(v => v.quotes.length).map(v => v.category || "Sem categoria"))];

    viewEl().innerHTML = `<div class="o-root">
      <header class="vh"><div><p class="label">Fornecedores</p><h1>${d.vendors.length ? `${contracted} de ${live.length} ${live.length === 1 ? "fornecedor contratado" : "fornecedores contratados"}` : "Quem vai fazer o casamento acontecer"}</h1></div>
        <div class="row-btns"><button class="btn" type="button" id="addV">Novo fornecedor</button></div></header>
      <p class="muted o-note">Contatos, propostas e contratos num lugar só. Quando marcarem um fornecedor como contratado, o valor pode entrar direto no orçamento.</p>

      ${vendorForm(d, cats)}
      <form class="panel bform o-contract" id="cForm" hidden novalidate aria-labelledby="cT">
        <h2 id="cT">Contratar</h2>
        <div class="grid2">
          <label class="field"><span>Proposta escolhida (opcional)</span><select class="in" name="quote_id"></select></label>
          <label class="field"><span>Valor contratado</span><input class="in num" name="amount" inputmode="decimal" placeholder="R$ 0,00"></label>
        </div>
        <fieldset class="o-radio"><legend>No orçamento</legend>
          <label><input type="radio" name="mode" value="new" checked> Criar um lançamento novo com esse valor</label>
          <label><input type="radio" name="mode" value="link"> Ligar a um lançamento que já existe</label>
          <label><input type="radio" name="mode" value="none"> Só marcar como contratado, sem lançar agora</label>
        </fieldset>
        <div class="grid2" id="cNew">
          <label class="field"><span>Categoria do orçamento</span><select class="in" name="category_id">${d.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Primeiro vencimento (opcional)</span><input class="in" name="due_date" type="date"></label>
        </div>
        <div class="grid2" id="cLink" hidden>
          <label class="field"><span>Lançamento</span><select class="in" name="budget_item_id">${d.items.map(i => `<option value="${esc(i.id)}">${esc(i.description)} · ${esc(money(i.amount_cents))}</option>`).join("")}</select></label>
        </div>
        ${d.categories.length ? "" : `<p class="small muted">Vocês ainda não têm categorias no orçamento. <a href="#orcamento">Criem as categorias</a> ou escolham “só marcar como contratado”.</p>`}
        <p class="error" id="cerr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Confirmar contratação</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
      </form>

      ${d.vendors.length ? `<div class="o-toolbar">
        <div class="o-seg" role="group" aria-label="Modo de visualização"><button type="button" data-mode="lista" aria-pressed="${ui.mode === "lista"}">Fornecedores</button><button type="button" data-mode="comparar" aria-pressed="${ui.mode === "comparar"}">Comparar propostas</button></div>
        ${ui.mode === "lista" ? `<div class="o-chips" role="group" aria-label="Filtrar por status"><button class="o-chip" type="button" data-filter="todos" aria-pressed="${ui.filter === "todos"}">Todos <b>${d.vendors.length}</b></button>${Object.entries(STATUS).filter(([s]) => count(s)).map(([s, l]) => `<button class="o-chip" type="button" data-filter="${s}" aria-pressed="${ui.filter === s}">${l} <b>${count(s)}</b></button>`).join("")}</div>` : ""}
      </div>` : ""}

      ${!d.vendors.length ? `<section class="panel o-empty"><h2>Comecem pela lista de quem vocês estão pesquisando</h2><p>Cadastrem o fornecedor assim que pedirem um orçamento: nome, categoria, contato e o status. Depois, guardem cada proposta recebida para comparar lado a lado antes de fechar.</p>
        <div class="row-btns"><button class="btn" type="button" data-new>Cadastrar o primeiro fornecedor</button></div></section>`
      : ui.mode === "comparar" ? compare(d, withQuotes)
      : shown.length ? `<section class="o-vendors">${shown.map(v => card(v)).join("")}</section>` : `<p class="muted">Nenhum fornecedor com este status.</p>`}</div>`;

    const root = $(".o-root", viewEl());
    wireVendorForm(d);
    const cfm = $("#cForm");
    const toggleMode = () => { const m = cfm.querySelector("[name=mode]:checked").value; $("#cNew").hidden = m !== "new"; $("#cLink").hidden = m !== "link"; cfm.amount.closest(".field").hidden = m !== "new"; };
    cfm.addEventListener("change", e => { if (e.target.name === "mode") toggleMode(); if (e.target.name === "quote_id" && e.target.value) { const q = d.vendors.flatMap(v => v.quotes).find(q => q.id === e.target.value); if (q) cfm.amount.value = reais(q.amount_cents); } });
    const openContract = (v, quoteId) => {
      $("#vForm").hidden = true; cfm.reset(); cfm.dataset.id = v.id; $("#cT").textContent = `Contratar ${v.name}`; $("#cerr").textContent = "";
      const qs = v.quotes;
      cfm.quote_id.innerHTML = `<option value="">Sem proposta</option>` + qs.map(q => `<option value="${esc(q.id)}">${esc(q.title || "Proposta")} · ${esc(money(q.amount_cents))}</option>`).join("");
      const q = qs.find(x => x.id === quoteId) || qs.find(x => x.chosen) || (qs.length === 1 ? qs[0] : null);
      if (q) { cfm.quote_id.value = q.id; cfm.amount.value = reais(q.amount_cents); }
      const guess = d.categories.find(c => v.category && (c.name.toLowerCase().includes(v.category.toLowerCase()) || v.category.toLowerCase().includes(c.name.toLowerCase().split(" ")[0])));
      if (guess) cfm.category_id.value = guess.id;
      if (v.budget_item) { cfm.querySelector("[value=link]").checked = true; cfm.budget_item_id.value = v.budget_item.id; }
      else if (!d.categories.length) cfm.querySelector("[value=none]").checked = true;
      toggleMode(); cfm.hidden = false; cfm.scrollIntoView({ block: "start", behavior: "smooth" }); cfm.querySelector("select").focus({ preventScroll: true });
    };
    cfm.addEventListener("submit", async e => {
      e.preventDefault(); const er = $("#cerr"); er.textContent = "";
      const mode = cfm.querySelector("[name=mode]:checked").value, body = { mode, quote_id: cfm.quote_id.value || null };
      if (mode === "new") {
        const a = toCents(cfm.amount.value);
        if (a == null || !cfm.amount.value.trim()) return er.textContent = "Informe o valor contratado (ex.: 12.500,00).";
        Object.assign(body, { amount_cents: a, category_id: cfm.category_id.value, due_date: cfm.due_date.value || null });
      }
      if (mode === "link") body.budget_item_id = cfm.budget_item_id.value;
      try { await api(`/api/admin/org/vendors/${cfm.dataset.id}/contract`, { method: "POST", body }); ui.open.add(cfm.dataset.id); vendors(); } catch (x) { er.textContent = x.message; }
    });
    $$("[data-cancel]").forEach(b => b.addEventListener("click", () => { $("#vForm").hidden = cfm.hidden = true; }));

    const vById = id => d.vendors.find(v => v.id === id);
    const patch = (id, body) => api(`/api/admin/org/vendors/${id}`, { method: "PATCH", body });
    root.onchange = async e => {
      const el = e.target;
      try {
        if (el.dataset.status) {
          const v = vById(el.dataset.status);
          if (el.value === "contratado" && v.status !== "contratado") { el.value = v.status; return openContract(v); }
          await patch(v.id, { status: el.value }); vendors();
        }
        if (el.dataset.ck) { const v = vById(el.dataset.ck), list = v.checklist.map((c, i) => ({ ...c, done: i === +el.dataset.i ? el.checked : c.done })); await patch(v.id, { checklist: list }); v.checklist = list; }
      } catch (x) { alert(x.message); vendors(); }
    };
    root.onsubmit = async e => {
      const f = e.target; if (!f.dataset.quote) return;
      e.preventDefault(); const er = f.querySelector(".error"); er.textContent = "";
      const a = toCents(f.amount.value);
      if (a == null || !f.amount.value.trim()) return er.textContent = "Informe o valor da proposta.";
      try { await api(`/api/admin/org/vendors/${f.dataset.quote}/quotes`, { method: "POST", body: { title: f.title.value, amount_cents: a, notes: f.notes.value, received_at: f.received_at.value || null, doc_url: f.doc_url.value } }); ui.open.add(f.dataset.quote); vendors(); }
      catch (x) { er.textContent = x.message; }
    };
    root.onclick = async e => {
      const b = e.target.closest("button"); if (!b) return;
      const ds = b.dataset;
      try {
        if (ds.mode) { ui.mode = ds.mode; return vendors(); }
        if (ds.filter) { ui.filter = ds.filter; return vendors(); }
        if (ds.new !== undefined || b.id === "addV") return openVendor(d);
        if (ds.vedit) return openVendor(d, vById(ds.vedit));
        if (ds.contract) return openContract(vById(ds.contract), ds.q);
        if (ds.vdel) { const v = vById(ds.vdel); if (confirm(`Apagar ${v.name}? As propostas também serão apagadas. Tarefas e lançamentos ligados continuam.`)) { await api(`/api/admin/org/vendors/${v.id}`, { method: "DELETE" }); vendors(); } }
        if (ds.qdel && confirm("Apagar esta proposta?")) { await api(`/api/admin/org/quotes/${ds.qdel}`, { method: "DELETE" }); vendors(); }
        if (ds.qchoose) { await api(`/api/admin/org/quotes/${ds.qchoose}`, { method: "PATCH", body: { chosen: ds.chosen !== "1" } }); vendors(); }
      } catch (x) { alert(x.message); }
    };
    $$(".o-more[data-v]").forEach(det => det.addEventListener("toggle", () => det.open ? ui.open.add(det.dataset.v) : ui.open.delete(det.dataset.v)));
  } catch (e) { fail(e); }
}

/* ---------- cartão do fornecedor ---------- */
function card(v) {
  const best = v.quotes.find(q => q.chosen) || v.quotes[0];
  const contact = [v.contact_name && `<span>${esc(v.contact_name)}</span>`,
    v.phone && `<a href="${esc(telHref(v.phone))}">${esc(v.phone)}</a>`,
    v.phone && v.whatsapp && `<a href="${esc(waHref(v.phone))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`,
    v.email && `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>`,
    v.site && `<a href="${esc(v.site)}" target="_blank" rel="noopener noreferrer">${esc(siteLabel(v.site))}</a>`].filter(Boolean);
  const doneCk = v.checklist.filter(c => c.done).length;
  return `<article class="o-vcard ${v.status === "descartado" ? "is-off" : ""}" aria-labelledby="vn-${esc(v.id)}">
    <header class="o-vh"><div>${v.category ? `<p class="o-cat">${esc(v.category)}</p>` : ""}<h3 id="vn-${esc(v.id)}">${esc(v.name)}</h3></div>
      <label class="o-status"><span class="sr">Status de ${esc(v.name)}</span><select class="in" data-status="${esc(v.id)}">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === v.status ? "selected" : ""}>${l}</option>`).join("")}</select></label></header>
    ${contact.length ? `<p class="o-contact">${contact.join("")}</p>` : `<p class="small muted">Sem contato cadastrado.</p>`}
    <dl class="o-facts">
      <dt>Status</dt><dd><span class="tag ${TAG[v.status]}">${STATUS[v.status]}</span></dd>
      ${v.owner ? `<dt>Responsável</dt><dd>${esc(v.owner)}</dd>` : ""}
      ${best ? `<dt>${v.quotes.find(q => q.chosen) ? "Proposta escolhida" : v.quotes.length > 1 ? "Menor proposta" : "Proposta"}</dt><dd class="num">${money(best.amount_cents)}${v.quotes.length > 1 ? ` <span class="muted">· ${v.quotes.length} propostas</span>` : ""}</dd>` : ""}
      ${v.budget_item ? `<dt>No orçamento</dt><dd><a href="#orcamento">${esc(v.budget_item.description)}</a> · <span class="num">${money(v.budget_item.amount_cents)}</span>${v.budget_item.paid_cents ? ` <span class="muted">(${money(v.budget_item.paid_cents)} pago)</span>` : ""}</dd>` : ""}
      ${v.status === "contratado" || v.doc_url ? `<dt>Contrato</dt><dd>${v.doc_url ? `<a href="${esc(v.doc_url)}" target="_blank" rel="noopener noreferrer">abrir documento</a>` : `<span class="over">sem contrato anexado</span>`}</dd>` : ""}
      ${v.dates.length ? `<dt>Próxima data</dt><dd>${(() => { const n = [...v.dates].sort((a, b) => a.date.localeCompare(b.date))[0]; return `${esc(n.label)} · ${esc(dBR(n.date))}`; })()}</dd>` : ""}
      ${v.open_tasks ? `<dt>Tarefas</dt><dd><a href="#tarefas">${v.open_tasks} em aberto</a></dd>` : ""}
    </dl>
    <details class="o-more" data-v="${esc(v.id)}" ${ui.open.has(v.id) ? "open" : ""}><summary>Propostas${v.quotes.length ? ` (${v.quotes.length})` : ""}, datas, checklist${v.checklist.length ? ` (${doneCk}/${v.checklist.length})` : ""} e notas</summary>
      <section class="o-sub"><h4>Propostas</h4>
        ${v.quotes.length ? `<ul class="o-quotes">${v.quotes.map(q => `<li class="${q.chosen ? "is-chosen" : ""}"><div><b>${esc(q.title || "Proposta")}</b>${q.chosen ? ` <span class="tag info">escolhida</span>` : ""}
          <p class="small muted">${[q.received_at && "recebida " + dBR(q.received_at), q.valid_until && "válida até " + dBR(q.valid_until)].filter(Boolean).map(esc).join(" · ")}${q.doc_url ? ` · <a href="${esc(q.doc_url)}" target="_blank" rel="noopener noreferrer">documento</a>` : ""}</p>
          ${q.notes ? `<p class="small o-pre">${esc(q.notes)}</p>` : ""}</div>
          <div class="it-r"><span class="num">${money(q.amount_cents)}</span><span class="it-acts"><button class="link small" type="button" data-qchoose="${esc(q.id)}" data-chosen="${q.chosen ? 1 : 0}">${q.chosen ? "Desmarcar" : "Escolher"}</button><button class="link small danger" type="button" data-qdel="${esc(q.id)}" aria-label="Apagar proposta ${esc(q.title || "")}">Apagar</button></span></div></li>`).join("")}</ul>` : `<p class="small muted">Nenhuma proposta guardada.</p>`}
        <form class="o-qform" data-quote="${esc(v.id)}" novalidate aria-label="Nova proposta de ${esc(v.name)}">
          <label class="field"><span>Nova proposta</span><input class="in" name="title" maxlength="80" placeholder="Ex.: Pacote 120 pessoas"></label>
          <label class="field"><span>Valor</span><input class="in num" name="amount" inputmode="decimal" placeholder="R$ 0,00"></label>
          <label class="field"><span>Recebida em</span><input class="in" name="received_at" type="date"></label>
          <label class="field"><span>Link da proposta</span><input class="in" name="doc_url" type="url" placeholder="https://…"></label>
          <label class="field wide"><span>Observação</span><input class="in" name="notes" maxlength="800" placeholder="O que está incluso, condições…"></label>
          <p class="error wide" role="alert"></p>
          <div class="wide"><button class="btn sm" type="submit">Guardar proposta</button></div>
        </form></section>
      ${v.dates.length ? `<section class="o-sub"><h4>Datas importantes</h4><ul class="o-clist">${[...v.dates].sort((a, b) => a.date.localeCompare(b.date)).map(x => `<li class="small">${esc(dBR(x.date))} · ${esc(x.label)}</li>`).join("")}</ul></section>` : ""}
      ${v.checklist.length ? `<section class="o-sub"><h4>Checklist</h4><ul class="o-clist">${v.checklist.map((c, i) => `<li><label class="o-check-l"><input type="checkbox" data-ck="${esc(v.id)}" data-i="${i}" ${c.done ? "checked" : ""}> ${esc(c.text)}</label></li>`).join("")}</ul></section>` : ""}
      ${v.notes ? `<section class="o-sub"><h4>Notas internas</h4><p class="small o-pre">${esc(v.notes)}</p></section>` : ""}
    </details>
    <footer class="o-acts">${v.status !== "contratado" && v.status !== "descartado" ? `<button class="btn sm" type="button" data-contract="${esc(v.id)}">Marcar como contratado</button>` : ""}
      <button class="link small" type="button" data-vedit="${esc(v.id)}">Editar</button><button class="link small danger" type="button" data-vdel="${esc(v.id)}">Apagar</button></footer>
  </article>`;
}

/* ---------- comparação lado a lado por categoria ---------- */
function compare(d, cats) {
  if (!cats.length) return `<section class="panel o-empty"><h2>Nenhuma proposta guardada ainda</h2><p>Abram um fornecedor, em “Propostas”, e guardem o valor de cada orçamento recebido. As propostas da mesma categoria aparecem aqui lado a lado.</p></section>`;
  return cats.map(cat => {
    const qs = d.vendors.filter(v => (v.category || "Sem categoria") === cat).flatMap(v => v.quotes.map(q => ({ ...q, v }))).sort((a, b) => a.amount_cents - b.amount_cents);
    const low = qs[0].amount_cents;
    return `<section class="o-cmp" aria-labelledby="cmp-${esc(cat)}"><div class="o-cmp-h"><h2 id="cmp-${esc(cat)}">${esc(cat)}</h2><p class="small muted">${qs.length} ${qs.length > 1 ? "propostas" : "proposta"} · de ${money(low)} a ${money(qs.at(-1).amount_cents)}</p></div>
      <div class="o-cmp-grid">${qs.map((q, i) => `<article class="o-q ${i === 0 && qs.length > 1 ? "best" : ""}" aria-label="${esc(q.v.name)}: ${esc(money(q.amount_cents))}">
        <p class="o-q-v">${esc(q.v.name)}</p>
        <p class="o-q-amt num">${money(q.amount_cents)}</p>
        <p class="o-q-diff">${qs.length < 2 ? "única proposta" : i === 0 ? "menor valor" : `+ ${money(q.amount_cents - low)} (${Math.round((q.amount_cents - low) / Math.max(1, low) * 100)}% acima)`}</p>
        ${q.title ? `<p><b>${esc(q.title)}</b></p>` : ""}${q.notes ? `<p class="small o-pre">${esc(q.notes)}</p>` : ""}
        <dl><dt>Status</dt><dd>${STATUS[q.v.status]}</dd>${q.received_at ? `<dt>Recebida</dt><dd>${esc(dBR(q.received_at))}</dd>` : ""}${q.valid_until ? `<dt>Válida até</dt><dd>${esc(dBR(q.valid_until))}</dd>` : ""}</dl>
        ${q.doc_url ? `<a class="o-link small" href="${esc(q.doc_url)}" target="_blank" rel="noopener noreferrer">Abrir proposta</a>` : ""}
        ${q.chosen ? `<p><span class="tag info">escolhida</span></p>` : ""}
        ${q.v.status !== "contratado" && q.v.status !== "descartado" ? `<button class="btn ghost sm" type="button" data-contract="${esc(q.v.id)}" data-q="${esc(q.id)}">Contratar com esta proposta</button>` : ""}
      </article>`).join("")}</div></section>`;
  }).join("");
}

/* ---------- formulário de fornecedor ---------- */
function vendorForm(d, cats) {
  return `<form class="panel bform" id="vForm" hidden novalidate aria-labelledby="vT">
    <h2 id="vT">Novo fornecedor</h2>
    <div class="grid2">
      <label class="field"><span>Nome</span><input class="in" name="name" maxlength="80" required placeholder="Ex.: Buffet Sabor & Arte"></label>
      <label class="field"><span>Categoria</span><input class="in" name="category" maxlength="60" list="vcats" placeholder="Ex.: Buffet"><datalist id="vcats">${cats.map(c => `<option value="${esc(c)}"></option>`).join("")}</datalist></label>
      <label class="field"><span>Pessoa de contato</span><input class="in" name="contact_name" maxlength="80" autocomplete="off"></label>
      <label class="field"><span>Telefone</span><input class="in" name="phone" type="tel" maxlength="40" placeholder="(41) 99999-0000"></label>
      <label class="field"><span>E-mail</span><input class="in" name="email" type="email" maxlength="160"></label>
      <label class="field"><span>Site ou Instagram</span><input class="in" name="site" maxlength="300" placeholder="https://… ou @perfil"></label>
      <label class="field"><span>Status</span><select class="in" name="status">${Object.entries(STATUS).filter(([k]) => k !== "contratado").map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}<option value="contratado">Contratado</option></select></label>
      <label class="field"><span>Responsável pelo contato</span><input class="in" name="owner" maxlength="60" placeholder="Ex.: noiva, noivo, mãe, cerimonialista"></label>
    </div>
    <label class="o-check-l"><input type="checkbox" name="whatsapp"> Este telefone também é WhatsApp</label>
    <label class="field"><span>Contrato ou proposta (link)</span><input class="in" name="doc_url" type="url" maxlength="500" placeholder="https://…"><small class="muted">Por enquanto um link (Drive, e-mail, assinatura digital). O envio de arquivos chega em breve.</small></label>
    <fieldset><legend>Datas importantes</legend><div class="o-rows" id="vDates"></div><button class="link small" type="button" id="vAddDate">+ data</button></fieldset>
    <fieldset><legend>Checklist deste fornecedor</legend><div class="o-rows" id="vChecks"></div><button class="link small" type="button" id="vAddCheck">+ item</button></fieldset>
    <label class="field"><span>Notas internas (só vocês veem)</span><textarea class="in" name="notes" rows="3" maxlength="2000"></textarea></label>
    <p class="error" id="verr" role="alert"></p>
    <div class="row-btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
  </form>`;
}
const dateRow = (x = {}) => `<div class="o-row"><label class="field"><span class="sr">Descrição da data</span><input class="in" data-k="label" maxlength="60" placeholder="Ex.: Degustação" value="${esc(x.label || "")}"></label>
  <label class="field"><span class="sr">Data</span><input class="in" data-k="date" type="date" value="${esc(x.date || "")}"></label><button class="link small danger" type="button" data-rm>Remover</button></div>`;
const checkRow = (x = {}) => `<div class="o-row"><label class="field"><span class="sr">Item do checklist</span><input class="in" data-k="text" maxlength="120" placeholder="Ex.: Enviar lista de músicas" value="${esc(x.text || "")}"></label>
  <label class="o-check-l"><input type="checkbox" data-k="done" ${x.done ? "checked" : ""}> feito</label><button class="link small danger" type="button" data-rm>Remover</button></div>`;
function openVendor(d, v) {
  const f = $("#vForm"); $("#cForm").hidden = true;
  f.reset(); f.dataset.id = v?.id || ""; $("#vT").textContent = v ? `Editar ${v.name}` : "Novo fornecedor"; $("#verr").textContent = "";
  for (const k of ["name", "category", "contact_name", "phone", "email", "site", "owner", "doc_url", "notes"]) f[k].value = v?.[k] || "";
  f.status.value = v?.status || "pesquisando"; f.whatsapp.checked = !!v?.whatsapp;
  $("#vDates").innerHTML = (v?.dates || []).map(dateRow).join(""); $("#vChecks").innerHTML = (v?.checklist || []).map(checkRow).join("");
  f.hidden = false; f.scrollIntoView({ block: "start", behavior: "smooth" }); f.name.focus({ preventScroll: true });
}
function wireVendorForm(d) {
  const f = $("#vForm");
  $("#vAddDate").addEventListener("click", () => { $("#vDates").insertAdjacentHTML("beforeend", dateRow()); $("#vDates").lastElementChild.querySelector("input").focus(); });
  $("#vAddCheck").addEventListener("click", () => { $("#vChecks").insertAdjacentHTML("beforeend", checkRow()); $("#vChecks").lastElementChild.querySelector("input").focus(); });
  f.addEventListener("click", e => { if (e.target.closest("[data-rm]")) e.target.closest(".o-row").remove(); });
  f.addEventListener("submit", async e => {
    e.preventDefault(); const er = $("#verr"); er.textContent = "";
    if (f.name.value.trim().length < 2) return er.textContent = "Informe o nome do fornecedor.";
    const dates = $$("#vDates .o-row").map(r => ({ label: r.querySelector("[data-k=label]").value.trim(), date: r.querySelector("[data-k=date]").value })).filter(x => x.label || x.date);
    if (dates.some(x => !x.label || !x.date)) return er.textContent = "Cada data importante precisa de descrição e data.";
    const checklist = $$("#vChecks .o-row").map(r => ({ text: r.querySelector("[data-k=text]").value.trim(), done: r.querySelector("[data-k=done]").checked })).filter(x => x.text);
    const body = { name: f.name.value, category: f.category.value, contact_name: f.contact_name.value, phone: f.phone.value, whatsapp: f.whatsapp.checked, email: f.email.value, site: f.site.value,
      status: f.status.value, owner: f.owner.value, doc_url: f.doc_url.value, notes: f.notes.value, dates, checklist };
    try {
      const id = f.dataset.id;
      const r = await api(id ? `/api/admin/org/vendors/${id}` : "/api/admin/org/vendors", { method: id ? "PATCH" : "POST", body });
      const vid = id || r.id; ui.open.add(vid);
      // marcou "contratado" aqui: oferece lançar no orçamento
      if (body.status === "contratado" && !(d.vendors.find(v => v.id === id)?.budget_item) && confirm("Fornecedor contratado. Querem lançar o valor no orçamento agora?")) {
        await vendors(); openContractFromOutside(vid); return;
      }
      vendors();
    } catch (x) { er.textContent = x.message; }
  });
}
/* abre o formulário de contratação depois de salvar um fornecedor já como "contratado" */
function openContractFromOutside(id) {
  const b = document.createElement("button"); b.type = "button"; b.dataset.contract = id; b.hidden = true; $(".o-root", viewEl()).append(b); b.click(); b.remove();
}
