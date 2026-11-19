/** Orçamento: categorias, lançamentos, parcelas, pagamentos, gráfico por categoria, histórico, simulação e relatório (CSV / impressão). */
import { $, $$, esc, money, api } from "../ui.js";
import { viewEl, fail, state, css } from "./core.js";

/* ---------- utilidades (também usadas por fornecedores.js e tarefas.js) ---------- */
/** "15.000,50", "15000", "R$ 1.500" → centavos; vazio → 0; inválido → null */
export function toCents(v) {
  v = String(v || "").replace(/[R$\s]/g, "");
  if (!v) return 0;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) && n >= 0 && n <= 1e11 && /^\d+(\.\d{1,2})?$/.test(v) ? n : null;
}
export const reais = c => (c / 100).toFixed(2).replace(".", ",");
export const dBR = iso => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "");
const todayISO = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addMonths = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10); };

const FIELD = { description: "Descrição", vendor: "Fornecedor", category_id: "Categoria", amount_cents: "Valor", paid_cents: "Pago", due_date: "Vencimento", per_guest_cents: "Valor por convidado", receipt_url: "Comprovante", installments: "Parcelas", installment: "Parcela" };
const ACTION = { create: "criou", update: "alterou", delete: "apagou", pay: "registrou pagamento em", unpay: "desfez pagamento em", installments: "parcelou" };

/* ---------------- orçamento ---------------- */
export default async function budget() {
  css("/assets/painel/organizacao.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/budget"), t = d.totals;
    const cat = Object.fromEntries(d.categories.map(c => [c.id, c.name]));
    const free = t.planned - t.committed, today = todayISO();
    const status = i => i.paid_cents >= i.amount_cents && i.amount_cents > 0 ? `<span class="tag yes">quitado</span>`
      : i.due_date && i.due_date < today ? `<span class="tag over">vencido</span>`
      : i.paid_cents > 0 ? `<span class="tag pending">${Math.round(i.paid_cents / Math.max(1, i.amount_cents) * 100)}% pago</span>` : `<span class="tag no">a pagar</span>`;
    const instLine = i => { const its = i.installments || []; if (!its.length) return ""; const paid = its.filter(x => x.paid_at).length;
      return `<details class="o-more"><summary>${paid} de ${its.length} parcelas pagas</summary><ul class="o-inst">${its.map(x => `<li>
        <span class="num ${x.paid_at ? "paid" : ""}">${x.n}/${its.length} · ${money(x.amount_cents)}</span>
        <span class="${!x.paid_at && x.due_date && x.due_date < today ? "late" : "muted"}">${x.paid_at ? `paga em ${dBR(x.paid_at)}` : x.due_date ? (x.due_date < today ? "venceu " : "vence ") + dBR(x.due_date) : "sem data"}${x.receipt_url ? ` · <a href="${esc(x.receipt_url)}" target="_blank" rel="noopener noreferrer">comprovante</a>` : ""}</span>
        <button class="link small" type="button" data-ipay="${esc(x.id)}" data-paid="${x.paid_at ? 1 : 0}">${x.paid_at ? "Desfazer" : "Pagar"}</button></li>`).join("")}</ul></details>`; };
    const sorted = [...d.categories].filter(c => c.committed || c.planned_cents).sort((a, b) => Math.max(b.committed, b.planned_cents) - Math.max(a.committed, a.planned_cents));

    viewEl().innerHTML = `
      <p class="o-print-h">Relatório do orçamento · ${esc(state.me?.wedding?.names || "")} · gerado em ${esc(new Date().toLocaleDateString("pt-BR"))}</p>
      <header class="vh"><div><p class="label">Orçamento</p><h1>${d.categories.length ? `${money(t.committed)} contratados de ${money(t.planned)} planejados` : "Vamos montar o orçamento de vocês"}</h1></div>
        <div class="row-btns">${d.categories.length ? `<button class="btn" type="button" id="addItem">Novo lançamento</button><button class="btn ghost" type="button" id="addCat">Nova categoria</button>` : ""}</div></header>

      ${d.categories.length ? `<dl class="kv wide k5"><div><dt>Planejado</dt><dd class="num">${money(t.planned)}</dd></div><div><dt>Contratado</dt><dd class="num">${money(t.committed)}</dd></div>
        <div><dt>Pago</dt><dd class="num">${money(t.paid)}</dd></div><div><dt>A pagar</dt><dd class="num strong">${money(t.to_pay)}</dd></div>
        <div><dt>${free >= 0 ? "Ainda livre no plano" : "Acima do plano"}</dt><dd class="num ${free < 0 ? "over" : ""}">${money(Math.abs(free))}</dd></div></dl>
        <div class="row-btns o-noprint o-report"><span class="muted small">Relatório:</span>
          <a class="btn ghost sm" href="/api/admin/budget/export.csv" download>Planilha (CSV)</a>
          <button class="btn ghost sm" type="button" id="print">Imprimir ou salvar PDF</button>
          <a class="btn ghost sm" href="/api/admin/export" download>Exportar todos os dados</a></div>`
      : `<section class="panel empty-b"><p>Comecem com as categorias mais comuns de um casamento (local, buffet, bebidas, decoração, foto e vídeo, música, trajes, papelaria, lembrancinhas e outros) e depois coloquem quanto querem gastar em cada uma. Dá para renomear, apagar e criar outras.</p>
        <div class="row-btns"><button class="btn" type="button" id="starter">Usar categorias sugeridas</button><button class="btn ghost" type="button" id="addCat">Criar do zero</button></div></section>`}

      <form class="panel bform" id="catForm" hidden novalidate>
        <h2 id="catT">Nova categoria</h2>
        <div class="grid2"><label class="field"><span>Nome</span><input class="in" name="name" maxlength="60" placeholder="Ex.: Buffet e comida" required></label>
        <label class="field"><span>Quanto querem gastar (planejado)</span><input class="in num" name="planned" inputmode="decimal" placeholder="R$ 0,00"></label></div>
        <p class="error" id="cerr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
      </form>

      <form class="panel bform" id="itemForm" hidden novalidate>
        <h2 id="itemT">Novo lançamento</h2>
        <div class="grid2">
          <label class="field"><span>Categoria</span><select class="in" name="category_id">${d.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label>
          <label class="field"><span>O que é</span><input class="in" name="description" maxlength="120" placeholder="Ex.: Buffet completo" required></label>
          <label class="field"><span>Fornecedor (opcional)</span><input class="in" name="vendor" maxlength="80" placeholder="Ex.: Sabor & Arte"></label>
          <label class="field"><span>Valor contratado ou orçado</span><input class="in num" name="amount" inputmode="decimal" placeholder="R$ 0,00" required></label>
          <label class="field"><span>Já pago</span><input class="in num" name="paid" inputmode="decimal" placeholder="R$ 0,00"></label>
          <label class="field"><span>Próximo vencimento (opcional)</span><input class="in" name="due_date" type="date"></label>
          <label class="field"><span>Valor por convidado (opcional)</span><input class="in num" name="per_guest" inputmode="decimal" placeholder="Ex.: 185,00"><small class="muted">Se o contrato é por pessoa. Usado na simulação de mais convidados.</small></label>
          <label class="field"><span>Comprovante (link, opcional)</span><input class="in" name="receipt_url" type="url" maxlength="500" placeholder="https://…"><small class="muted">Por enquanto um link (Drive, e-mail, banco). O envio de arquivos chega em breve.</small></label>
        </div>
        <label class="o-check-l"><input type="checkbox" name="split"> Pagamento em parcelas</label>
        <div class="o-instf" id="instBox" hidden>
          <div class="grid3f">
            <label class="field"><span>Número de parcelas</span><input class="in" name="icount" type="number" min="1" max="60" value="3" inputmode="numeric"></label>
            <label class="field"><span>1º vencimento</span><input class="in" name="ifirst" type="date"></label>
            <div class="field"><span>&nbsp;</span><button class="btn ghost" type="button" id="iSplit">Dividir em parcelas iguais</button></div>
          </div>
          <div class="o-rows" id="iRows" aria-live="polite"></div>
          <p class="o-sum" id="iSum" aria-live="polite"></p>
          <button class="link small" type="button" id="iAdd">+ parcela</button>
        </div>
        <p class="error" id="ierr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
      </form>

      ${sorted.length ? `<section class="panel o-chart" aria-labelledby="chT"><h2 id="chT">Gastos por categoria</h2>${chart(sorted)}</section>` : ""}

      <section class="bcats">${d.categories.map(c => { const its = d.items.filter(i => i.category_id === c.id); return `<article class="bcat" data-cat="${esc(c.id)}">
        <div class="cat-h"><h3>${esc(c.name)}</h3><p class="num small">${money(c.committed)} <span class="muted">${c.planned_cents ? "de " + money(c.planned_cents) : "· sem valor planejado"}</span></p></div>
        <div class="bars" role="img" aria-label="${esc(c.name)}: ${money(c.paid)} pago, ${money(c.committed)} contratado, ${money(c.planned_cents)} planejado"><i class="b-commit"></i><i class="b-paid"></i></div>
        ${c.planned_cents && c.committed > c.planned_cents ? `<p class="over small">Acima do planejado em ${money(c.committed - c.planned_cents)}</p>` : ""}
        ${its.length ? `<ul class="items">${its.map(i => `<li>
          <div class="it-l"><b>${esc(i.description)}</b><span class="muted small">${[i.vendor, i.due_date && i.paid_cents < i.amount_cents ? "vence " + dBR(i.due_date) : "", i.per_guest_cents ? money(i.per_guest_cents) + " por convidado" : ""].filter(Boolean).map(esc).join(" · ")}${i.receipt_url ? ` · <a href="${esc(i.receipt_url)}" target="_blank" rel="noopener noreferrer">comprovante</a>` : ""}${i.vendor_ref ? ` · <a href="#fornecedores">ver fornecedor</a>` : ""}</span>${instLine(i)}</div>
          <div class="it-r"><span class="num">${money(i.amount_cents)}</span>${status(i)}
            <span class="it-acts">${i.amount_cents > i.paid_cents ? `<button class="link small" type="button" data-pay="${esc(i.id)}">Pagar</button>` : ""}<button class="link small" type="button" data-edit="${esc(i.id)}">Editar</button><button class="link small" type="button" data-hist="${esc(i.id)}">Histórico</button><button class="link small danger" type="button" data-idel="${esc(i.id)}">Apagar</button></span></div>
        </li>`).join("")}</ul>` : `<p class="muted small">Nenhum lançamento ainda.</p>`}
        <div class="cat-acts"><button class="link small" type="button" data-additem="${esc(c.id)}">+ lançamento</button><button class="link small" type="button" data-ecat="${esc(c.id)}">Editar categoria</button><button class="link small danger" type="button" data-dcat="${esc(c.id)}">Apagar</button></div>
      </article>`; }).join("")}</section>
      ${d.categories.length ? `<p class="legend small"><span class="lg paid"></span>pago <span class="lg commit"></span>contratado <span class="lg plan"></span>planejado</p>
      <section class="split">
        <article class="panel"><h2>Próximos pagamentos</h2>${d.upcoming.length ? `<ul class="pay">${d.upcoming.map(u => `<li><div><b>${esc(u.description)}${u.n ? ` <span class="muted small">· parcela ${u.n}/${u.of}</span>` : ""}</b><span class="muted small">${esc(u.vendor)}${u.vendor ? " · " : ""}${esc(cat[u.category_id])}</span></div>
          <div class="r"><span class="num">${money(u.left_cents)}</span><span class="small ${u.overdue ? "over" : "muted"}">${u.overdue ? "vencido em " : "vence "}${esc(dBR(u.due_date))}</span>
          ${u.installment_id ? `<button class="link small" type="button" data-ipay="${esc(u.installment_id)}" data-paid="0">Registrar pagamento</button>` : `<button class="link small" type="button" data-pay="${esc(u.item_id)}">Registrar pagamento</button>`}</div></li>`).join("")}</ul>` : `<p class="muted">Nenhum pagamento pendente com data.</p>`}</article>
        <article class="panel o-noprint"><h2>E se convidarmos mais gente?</h2>
          <form id="sim" class="sim"><label class="field"><span>Convidados a mais</span><input class="in" name="extra" type="number" min="1" max="1000" value="30" inputmode="numeric"></label><button class="btn sm" type="submit">Simular</button></form>
          <div id="simr" aria-live="polite"></div></article>
      </section>
      <section class="panel o-noprint" id="histP" aria-labelledby="hT"><div class="o-cmp-h"><h2 id="hT">Histórico de alterações</h2>
        <label class="field"><span class="sr">Filtrar por lançamento</span><select class="in" id="histSel"><option value="">Todos os lançamentos</option>${d.items.map(i => `<option value="${esc(i.id)}">${esc(i.description)}</option>`).join("")}</select></label></div>
        <div id="hist" aria-live="polite"><p class="muted">Carregando…</p></div></section>` : ""}`;

    $$(".bcat").forEach((el, i) => { const c = d.categories[i]; const max = Math.max(c.planned_cents, c.committed, 1);
      el.querySelector(".b-commit").style.width = (c.committed / max * 100) + "%"; el.querySelector(".b-paid").style.width = (c.paid / max * 100) + "%";
      el.querySelector(".bars").style.setProperty("--plan", (c.planned_cents ? c.planned_cents / max * 100 : 100) + "%"); });

    /* ---------- formulários ---------- */
    const cf = $("#catForm"), itf = $("#itemForm"), ibox = $("#instBox"), irows = $("#iRows");
    const show = (f, title) => { cf.hidden = itf.hidden = true; f.hidden = false; f.querySelector("h2").textContent = title; f.querySelector(".error").textContent = ""; f.scrollIntoView({ block: "start", behavior: "smooth" }); f.querySelector("input:not([type=hidden]), select").focus({ preventScroll: true }); };
    const openCat = c => { cf.reset(); cf.dataset.id = c?.id || ""; if (c) { cf.name.value = c.name; cf.planned.value = c.planned_cents ? reais(c.planned_cents) : ""; } show(cf, c ? "Editar categoria" : "Nova categoria"); };

    const instRow = (x = {}, n) => `<div class="o-irow" data-iid="${esc(x.id || "")}">
      <span class="n num" aria-hidden="true">${n}</span>
      <label class="field"><span class="sr">Parcela ${n}: valor</span><input class="in num" data-k="amount" inputmode="decimal" placeholder="Valor" value="${x.amount_cents != null ? reais(x.amount_cents) : ""}"></label>
      <label class="field"><span class="sr">Parcela ${n}: vencimento</span><input class="in" data-k="due" type="date" value="${esc(x.due_date || "")}"></label>
      <label class="field rc"><span class="sr">Parcela ${n}: comprovante (link)</span><input class="in" data-k="receipt" type="url" placeholder="Comprovante (link)" value="${esc(x.receipt_url || "")}"></label>
      <label class="o-check-l"><input type="checkbox" data-k="paid" ${x.paid_at ? "checked" : ""}${x.paid_at ? ` data-at="${esc(x.paid_at)}"` : ""}> paga</label>
      <button class="link small danger" type="button" data-irm aria-label="Remover parcela ${n}">Remover</button></div>`;
    const renumber = () => $$(".o-irow", irows).forEach((r, i) => { r.querySelector(".n").textContent = i + 1; r.querySelectorAll(".sr").forEach(s => s.textContent = s.textContent.replace(/Parcela \d+/, "Parcela " + (i + 1))); });
    const readRows = () => $$(".o-irow", irows).map(r => { const pd = r.querySelector("[data-k=paid]");
      return { id: r.dataset.iid || undefined, amount_cents: toCents(r.querySelector("[data-k=amount]").value), due_date: r.querySelector("[data-k=due]").value || null, paid: pd.checked, paid_at: pd.checked ? pd.dataset.at || null : null, receipt_url: r.querySelector("[data-k=receipt]").value.trim() }; });
    const updSum = () => {
      const rows = readRows(), sum = rows.reduce((s, r) => s + (r.amount_cents || 0), 0), amount = toCents(itf.amount.value) || 0, el = $("#iSum");
      el.textContent = rows.length ? `Soma das parcelas: ${money(sum)} de ${money(amount)}${sum !== amount ? ` · ${sum < amount ? "faltam" : "sobram"} ${money(Math.abs(amount - sum))}` : " · confere"}` : "Nenhuma parcela ainda.";
      el.classList.toggle("bad", rows.length > 0 && sum !== amount);
    };
    const setSplit = on => { ibox.hidden = !on; itf.paid.disabled = itf.due_date.disabled = on; if (on && !irows.children.length) splitEqual(); updSum(); };
    const splitEqual = () => {
      const amount = toCents(itf.amount.value) || 0, n = Math.max(1, Math.min(60, parseInt(itf.icount.value, 10) || 1)), first = itf.ifirst.value || itf.due_date.value || todayISO();
      const base = Math.floor(amount / n), rest = amount - base * n;
      irows.innerHTML = Array.from({ length: n }, (_, i) => instRow({ amount_cents: base + (i < rest ? 1 : 0), due_date: addMonths(first, i) }, i + 1)).join("");
      updSum();
    };
    const openItem = (it, catId) => { itf.reset(); itf.dataset.id = it?.id || ""; irows.innerHTML = "";
      if (it) { itf.category_id.value = it.category_id; itf.description.value = it.description; itf.vendor.value = it.vendor; itf.amount.value = reais(it.amount_cents); itf.paid.value = it.paid_cents ? reais(it.paid_cents) : ""; itf.due_date.value = it.due_date || ""; itf.per_guest.value = it.per_guest_cents ? reais(it.per_guest_cents) : ""; itf.receipt_url.value = it.receipt_url || "";
        if (it.installments?.length) { irows.innerHTML = it.installments.map((x, i) => instRow(x, i + 1)).join(""); itf.split.checked = true; itf.icount.value = it.installments.length; } }
      else if (catId) itf.category_id.value = catId;
      itf.dataset.had = it?.installments?.length ? "1" : "";
      setSplit(itf.split.checked);
      show(itf, it ? "Editar lançamento" : "Novo lançamento"); };

    $("#addItem")?.addEventListener("click", () => openItem());
    $("#addCat")?.addEventListener("click", () => openCat());
    $("#print")?.addEventListener("click", () => { $$(".o-chart details, .bcat details").forEach(x => x.open = true); window.print(); });
    $("#starter")?.addEventListener("click", async e => { e.target.disabled = true; try { await api("/api/admin/budget/starter", { method: "POST" }); budget(); } catch (x) { alert(x.message); e.target.disabled = false; } });
    $$("[data-cancel]").forEach(b => b.addEventListener("click", () => { cf.hidden = itf.hidden = true; }));
    itf.split.addEventListener("change", () => setSplit(itf.split.checked));
    $("#iSplit").addEventListener("click", splitEqual);
    $("#iAdd").addEventListener("click", () => { irows.insertAdjacentHTML("beforeend", instRow({}, irows.children.length + 1)); irows.lastElementChild.querySelector("input").focus(); updSum(); });
    irows.addEventListener("click", e => { if (e.target.closest("[data-irm]")) { e.target.closest(".o-irow").remove(); renumber(); updSum(); } });
    irows.addEventListener("input", updSum);
    itf.amount.addEventListener("input", () => !ibox.hidden && updSum());

    cf.addEventListener("submit", async e => {
      e.preventDefault(); const er = $("#cerr"); er.textContent = "";
      const planned = toCents(cf.planned.value);
      if (cf.name.value.trim().length < 2) return er.textContent = "Dê um nome para a categoria.";
      if (planned == null) return er.textContent = "Valor planejado inválido. Use, por exemplo, 15000 ou 15.000,00.";
      try { await api(cf.dataset.id ? `/api/admin/budget/categories/${cf.dataset.id}` : "/api/admin/budget/categories", { method: cf.dataset.id ? "PATCH" : "POST", body: { name: cf.name.value, planned_cents: planned } }); budget(); }
      catch (x) { er.textContent = x.message; }
    });
    itf.addEventListener("submit", async e => {
      e.preventDefault(); const er = $("#ierr"); er.textContent = "";
      const amount = toCents(itf.amount.value), paid = toCents(itf.paid.value), pg = toCents(itf.per_guest.value);
      if (itf.description.value.trim().length < 2) return er.textContent = "Descreva o lançamento (ex.: Buffet completo).";
      if (amount == null || !itf.amount.value.trim()) return er.textContent = "Informe o valor contratado ou orçado.";
      if (paid == null || pg == null) return er.textContent = "Confira os valores: use, por exemplo, 1500 ou 1.500,00.";
      const body = { category_id: itf.category_id.value, description: itf.description.value, vendor: itf.vendor.value, amount_cents: amount, per_guest_cents: itf.per_guest.value.trim() ? pg : null, receipt_url: itf.receipt_url.value.trim() };
      if (itf.split.checked) {
        const rows = readRows();
        if (!rows.length) return er.textContent = "Adicione ao menos uma parcela, ou desmarque “Pagamento em parcelas”.";
        if (rows.some(r => r.amount_cents == null)) return er.textContent = "Confira o valor de cada parcela.";
        const sum = rows.reduce((s, r) => s + r.amount_cents, 0);
        if (sum !== amount) return er.textContent = `A soma das parcelas (${money(sum)}) precisa ser igual ao valor (${money(amount)}).`;
        body.installments = rows;
      } else {
        if (paid > amount) return er.textContent = "O valor pago não pode passar do contratado.";
        Object.assign(body, { paid_cents: paid, due_date: itf.due_date.value || null });
        if (itf.dataset.had) body.installments = [];
      }
      try { await api(itf.dataset.id ? `/api/admin/budget/items/${itf.dataset.id}` : "/api/admin/budget/items", { method: itf.dataset.id ? "PATCH" : "POST", body }); budget(); }
      catch (x) { er.textContent = x.message; }
    });

    /* ---------- ações nas listas ---------- */
    viewEl().onclick = async e => {
      const t_ = e.target.closest("button"); if (!t_) return;
      const ds = t_.dataset, item = id => d.items.find(i => i.id === id);
      try {
        if (ds.pay) {
          const i = item(ds.pay), next = i.installments?.find(x => !x.paid_at);
          if (next) { if (confirm(`Registrar o pagamento da parcela ${next.n}/${i.installments.length} (${money(next.amount_cents)}) de “${i.description}”?`)) { await api(`/api/admin/budget/installments/${next.id}/pay`, { method: "POST", body: { paid: true } }); budget(); } return; }
          const left = i.amount_cents - i.paid_cents;
          const v = prompt(`Quanto foi pago agora em “${i.description}”? (restam ${money(left)})`, reais(left));
          if (v == null) return; const c = toCents(v);
          if (!(c > 0)) return alert("Valor inválido.");
          await api(`/api/admin/budget/items/${i.id}`, { method: "PATCH", body: { paid_cents: Math.min(i.amount_cents, i.paid_cents + c) } }); budget();
        }
        if (ds.ipay) {
          const paid = ds.paid === "1";
          if (paid && !confirm("Desfazer o pagamento desta parcela?")) return;
          await api(`/api/admin/budget/installments/${ds.ipay}/pay`, { method: "POST", body: { paid: !paid } }); budget();
        }
        if (ds.edit) openItem(item(ds.edit));
        if (ds.hist) { $("#histSel").value = ds.hist; loadHist(ds.hist); $("#histP").scrollIntoView({ behavior: "smooth", block: "start" }); }
        if (ds.additem) openItem(null, ds.additem);
        if (ds.ecat) openCat(d.categories.find(c => c.id === ds.ecat));
        if (ds.idel && confirm(`Apagar o lançamento “${item(ds.idel).description}”?`)) { await api(`/api/admin/budget/items/${ds.idel}`, { method: "DELETE" }); budget(); }
        if (ds.dcat) { const c = d.categories.find(x => x.id === ds.dcat), n = d.items.filter(i => i.category_id === c.id).length;
          if (confirm(n ? `Apagar a categoria “${c.name}” e os ${n} lançamento(s) dela?` : `Apagar a categoria “${c.name}”?`)) { await api(`/api/admin/budget/categories/${c.id}`, { method: "DELETE" }); budget(); } }
      } catch (x) { alert(x.message); }
    };
    $("#sim")?.addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const s = await api(`/api/admin/budget/simulate?extra=${encodeURIComponent(e.target.extra.value)}`);
        $("#simr").innerHTML = s.can_estimate ? `<p class="sim-total"><span class="num">+ ${money(s.total_cents)}</span> com ${s.extra} convidados a mais</p>
          <table class="tbl mini"><tbody>${s.lines.map(l => `<tr><td>${esc(l.source)}</td><td class="num">${money(l.per_guest_cents)} × ${s.extra}</td><td class="num">${money(l.total_cents)}</td></tr>`).join("")}</tbody></table>
          <p class="label">Premissas</p><ul class="small muted">${s.assumptions.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` :
          `<p class="muted">Ainda não dá para estimar: nenhum lançamento tem valor por convidado.</p>`;
      } catch (x) { $("#simr").innerHTML = `<p class="error">${esc(x.message)}</p>`; }
    });

    /* ---------- histórico ---------- */
    const fmtVal = (f, v) => v == null || v === "" ? "—" : /_cents$/.test(f) ? money(v) : f === "due_date" ? dBR(v) : f === "category_id" ? (cat[v] || "outra categoria") : String(v);
    async function loadHist(itemId = "") {
      const box = $("#hist"); if (!box) return;
      try {
        const h = await api(`/api/admin/budget/history?limit=40${itemId ? "&item=" + encodeURIComponent(itemId) : ""}`);
        box.innerHTML = h.history.length ? `<ul class="o-hist">${h.history.map(r => `<li><time datetime="${esc(r.at.replace(" ", "T"))}Z">${esc(new Date(r.at.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))}</time>
          <div><b>${esc(r.who)}</b> ${esc(ACTION[r.action] || r.action)} <b>${esc(r.item_label)}</b>${r.changes.length ? `<ul>${r.changes.map(c => `<li>${esc(FIELD[c.field] || c.field)}: ${c.field === "installment" ? `parcela ${esc(c.to)}` : c.field === "installments" ? `${esc(c.from ?? 0)} → ${esc(c.to)} parcelas` : `${esc(fmtVal(c.field, c.from))} → ${esc(fmtVal(c.field, c.to))}`}</li>`).join("")}</ul>` : ""}</div></li>`).join("")}</ul>`
          : `<p class="muted">Nenhuma alteração registrada${itemId ? " neste lançamento" : ""} ainda.</p>`;
      } catch (x) { box.innerHTML = `<p class="error">${esc(x.message)}</p>`; }
    }
    $("#histSel")?.addEventListener("change", e => loadHist(e.target.value));
    loadHist();
  } catch (e) { fail(e); }
}

/**
 * Gráfico de barras horizontais (SVG à mão): contratado, pago e marca do planejado por categoria.
 * Acessível: role="img" com título e descrição + tabela equivalente logo abaixo.
 */
function chart(cats) {
  const W = 720, row = 46, top = 8, lw = 190, vw = 120, bw = W - lw - vw - 16, H = top + cats.length * row;
  const max = Math.max(1, ...cats.map(c => Math.max(c.committed, c.planned_cents)));
  const x = v => (v / max) * bw;
  const total = cats.reduce((s, c) => s + c.committed, 0);
  const desc = cats.map(c => `${c.name}: ${money(c.committed)} contratado, ${money(c.paid)} pago${c.planned_cents ? `, ${money(c.planned_cents)} planejado` : ""}`).join("; ");
  const clip = s => (s.length > 24 ? s.slice(0, 23) + "…" : s);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chTitle chDesc" preserveAspectRatio="xMinYMin meet">
    <title id="chTitle">Gastos por categoria: ${esc(money(total))} contratados no total</title><desc id="chDesc">${esc(desc)}</desc>
    ${cats.map((c, i) => { const y = top + i * row, over = c.planned_cents && c.committed > c.planned_cents;
      return `<g transform="translate(0 ${y})">
        <text class="lbl" x="0" y="22">${esc(clip(c.name))}</text>
        <rect class="track" x="${lw}" y="10" width="${bw}" height="16" rx="3"></rect>
        <rect class="${over ? "over" : "commit"}" x="${lw}" y="10" width="${x(c.committed).toFixed(1)}" height="16" rx="3"></rect>
        <rect class="paid" x="${lw}" y="10" width="${x(c.paid).toFixed(1)}" height="16" rx="3"></rect>
        ${c.planned_cents ? `<line class="plan" x1="${(lw + x(c.planned_cents)).toFixed(1)}" x2="${(lw + x(c.planned_cents)).toFixed(1)}" y1="5" y2="31"></line>` : ""}
        <text class="val" x="${W}" y="22" text-anchor="end">${esc(money(c.committed))}</text>
      </g>`; }).join("")}
  </svg>
  <p class="legend small"><span class="lg paid"></span>pago <span class="lg commit"></span>contratado <span class="lg plan"></span>planejado · em vermelho, acima do planejado</p>
  <details><summary>Ver como tabela</summary>
    <table class="tbl mini"><caption class="sr">Gastos por categoria</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Planejado</th><th scope="col">Contratado</th><th scope="col">Pago</th><th scope="col">% do total contratado</th></tr></thead>
    <tbody>${cats.map(c => `<tr><th scope="row">${esc(c.name)}</th><td class="num">${money(c.planned_cents)}</td><td class="num">${money(c.committed)}</td><td class="num">${money(c.paid)}</td><td class="num">${total ? Math.round(c.committed / total * 100) : 0}%</td></tr>`).join("")}</tbody></table>
  </details>`;
}
