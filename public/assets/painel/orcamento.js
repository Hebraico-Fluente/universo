/** Orçamento: categorias, lançamentos, pagamentos e simulação. */
import { $, $$, esc, longDate, money, daysUntil, api } from "../ui.js";
import { viewEl, fail, state } from "./core.js";

/* ---------------- orçamento ---------------- */
export default async function budget() {
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/budget"), t = d.totals;
    const cat = Object.fromEntries(d.categories.map(c => [c.id, c.name]));
    const free = t.planned - t.committed;
    const reais = c => (c / 100).toFixed(2).replace(".", ",");
    const status = i => i.paid_cents >= i.amount_cents && i.amount_cents > 0 ? `<span class="tag yes">quitado</span>`
      : i.due_date && i.due_date < new Date().toISOString().slice(0, 10) ? `<span class="tag over">vencido</span>`
      : i.paid_cents > 0 ? `<span class="tag pending">${Math.round(i.paid_cents / Math.max(1, i.amount_cents) * 100)}% pago</span>` : `<span class="tag no">a pagar</span>`;
    viewEl().innerHTML = `
      <header class="vh"><div><p class="label">Orçamento</p><h1>${d.categories.length ? `${money(t.committed)} contratados de ${money(t.planned)} planejados` : "Vamos montar o orçamento de vocês"}</h1></div>
        <div class="row-btns">${d.categories.length ? `<button class="btn" type="button" id="addItem">Novo lançamento</button><button class="btn ghost" type="button" id="addCat">Nova categoria</button>` : ""}<a class="btn ghost" href="/api/admin/export" download>Exportar dados</a></div></header>

      ${d.categories.length ? `<dl class="kv wide k5"><div><dt>Planejado</dt><dd class="num">${money(t.planned)}</dd></div><div><dt>Contratado</dt><dd class="num">${money(t.committed)}</dd></div>
        <div><dt>Pago</dt><dd class="num">${money(t.paid)}</dd></div><div><dt>A pagar</dt><dd class="num strong">${money(t.to_pay)}</dd></div>
        <div><dt>${free >= 0 ? "Ainda livre no plano" : "Acima do plano"}</dt><dd class="num ${free < 0 ? "over" : ""}">${money(Math.abs(free))}</dd></div></dl>`
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
        </div>
        <p class="error" id="ierr" role="alert"></p>
        <div class="row-btns"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-cancel>Cancelar</button></div>
      </form>

      <section class="bcats">${d.categories.map(c => { const its = d.items.filter(i => i.category_id === c.id); return `<article class="bcat" data-cat="${esc(c.id)}">
        <div class="cat-h"><h3>${esc(c.name)}</h3><p class="num small">${money(c.committed)} <span class="muted">${c.planned_cents ? "de " + money(c.planned_cents) : "· sem valor planejado"}</span></p></div>
        <div class="bars" role="img" aria-label="${esc(c.name)}: ${money(c.paid)} pago, ${money(c.committed)} contratado, ${money(c.planned_cents)} planejado"><i class="b-commit"></i><i class="b-paid"></i></div>
        ${c.planned_cents && c.committed > c.planned_cents ? `<p class="over small">Acima do planejado em ${money(c.committed - c.planned_cents)}</p>` : ""}
        ${its.length ? `<ul class="items">${its.map(i => `<li>
          <div class="it-l"><b>${esc(i.description)}</b><span class="muted small">${[i.vendor, i.due_date ? "vence " + new Date(i.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "", i.per_guest_cents ? money(i.per_guest_cents) + " por convidado" : ""].filter(Boolean).map(esc).join(" · ")}</span></div>
          <div class="it-r"><span class="num">${money(i.amount_cents)}</span>${status(i)}
            <span class="it-acts">${i.amount_cents > i.paid_cents ? `<button class="link small" type="button" data-pay="${esc(i.id)}">Pagar</button>` : ""}<button class="link small" type="button" data-edit="${esc(i.id)}">Editar</button><button class="link small danger" type="button" data-idel="${esc(i.id)}">Apagar</button></span></div>
        </li>`).join("")}</ul>` : `<p class="muted small">Nenhum lançamento ainda.</p>`}
        <div class="cat-acts"><button class="link small" type="button" data-additem="${esc(c.id)}">+ lançamento</button><button class="link small" type="button" data-ecat="${esc(c.id)}">Editar categoria</button><button class="link small danger" type="button" data-dcat="${esc(c.id)}">Apagar</button></div>
      </article>`; }).join("")}</section>
      ${d.categories.length ? `<p class="legend small"><span class="lg paid"></span>pago <span class="lg commit"></span>contratado <span class="lg plan"></span>planejado</p>
      <section class="split">
        <article class="panel"><h2>Próximos pagamentos</h2>${d.upcoming.length ? `<ul class="pay">${d.upcoming.map(i => `<li><div><b>${esc(i.description)}</b><span class="muted small">${esc(i.vendor)}${i.vendor ? " · " : ""}${esc(cat[i.category_id])}</span></div>
          <div class="r"><span class="num">${money(i.amount_cents - i.paid_cents)}</span><span class="small ${i.overdue ? "over" : "muted"}">${i.overdue ? "vencido em " : "vence "}${esc(new Date(i.due_date + "T12:00:00").toLocaleDateString("pt-BR"))}</span>
          <button class="link small" type="button" data-pay="${esc(i.id)}">Registrar pagamento</button></div></li>`).join("")}</ul>` : `<p class="muted">Nenhum pagamento pendente com data.</p>`}</article>
        <article class="panel"><h2>E se convidarmos mais gente?</h2>
          <form id="sim" class="sim"><label class="field"><span>Convidados a mais</span><input class="in" name="extra" type="number" min="1" max="1000" value="30" inputmode="numeric"></label><button class="btn sm" type="submit">Simular</button></form>
          <div id="simr" aria-live="polite"></div></article>
      </section>` : ""}`;

    $$(".bcat").forEach((el, i) => { const c = d.categories[i]; const max = Math.max(c.planned_cents, c.committed, 1);
      el.querySelector(".b-commit").style.width = (c.committed / max * 100) + "%"; el.querySelector(".b-paid").style.width = (c.paid / max * 100) + "%";
      el.querySelector(".bars").style.setProperty("--plan", (c.planned_cents ? c.planned_cents / max * 100 : 100) + "%"); });

    const cf = $("#catForm"), itf = $("#itemForm");
    const show = (f, title) => { cf.hidden = itf.hidden = true; f.hidden = false; f.querySelector("h2").textContent = title; f.querySelector(".error").textContent = ""; f.scrollIntoView({ block: "start", behavior: "smooth" }); f.querySelector("input:not([type=hidden]), select").focus({ preventScroll: true }); };
    const openCat = c => { cf.reset(); cf.dataset.id = c?.id || ""; if (c) { cf.name.value = c.name; cf.planned.value = c.planned_cents ? reais(c.planned_cents) : ""; } show(cf, c ? "Editar categoria" : "Nova categoria"); };
    const openItem = (it, catId) => { itf.reset(); itf.dataset.id = it?.id || "";
      if (it) { itf.category_id.value = it.category_id; itf.description.value = it.description; itf.vendor.value = it.vendor; itf.amount.value = reais(it.amount_cents); itf.paid.value = it.paid_cents ? reais(it.paid_cents) : ""; itf.due_date.value = it.due_date || ""; itf.per_guest.value = it.per_guest_cents ? reais(it.per_guest_cents) : ""; }
      else if (catId) itf.category_id.value = catId;
      show(itf, it ? "Editar lançamento" : "Novo lançamento"); };

    $("#addItem")?.addEventListener("click", () => openItem());
    $("#addCat")?.addEventListener("click", () => openCat());
    $("#starter")?.addEventListener("click", async e => { e.target.disabled = true; try { await api("/api/admin/budget/starter", { method: "POST" }); budget(); } catch (x) { alert(x.message); e.target.disabled = false; } });
    $$("[data-cancel]").forEach(b => b.addEventListener("click", () => { cf.hidden = itf.hidden = true; }));

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
      if (paid > amount) return er.textContent = "O valor pago não pode passar do contratado.";
      const body = { category_id: itf.category_id.value, description: itf.description.value, vendor: itf.vendor.value, amount_cents: amount, paid_cents: paid, due_date: itf.due_date.value || null, per_guest_cents: itf.per_guest.value.trim() ? pg : null };
      try { await api(itf.dataset.id ? `/api/admin/budget/items/${itf.dataset.id}` : "/api/admin/budget/items", { method: itf.dataset.id ? "PATCH" : "POST", body }); budget(); }
      catch (x) { er.textContent = x.message; }
    });

    viewEl().onclick = async e => {
      const t_ = e.target.closest("button"); if (!t_) return;
      const ds = t_.dataset, item = id => d.items.find(i => i.id === id);
      try {
        if (ds.pay) {
          const i = item(ds.pay), left = i.amount_cents - i.paid_cents;
          const v = prompt(`Quanto foi pago agora em “${i.description}”? (restam ${money(left)})`, reais(left));
          if (v == null) return; const c = toCents(v);
          if (!(c > 0)) return alert("Valor inválido.");
          await api(`/api/admin/budget/items/${i.id}`, { method: "PATCH", body: { paid_cents: Math.min(i.amount_cents, i.paid_cents + c) } }); budget();
        }
        if (ds.edit) openItem(item(ds.edit));
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
  } catch (e) { fail(e); }
}
/** "15.000,50", "15000", "R$ 1.500" → centavos; vazio → 0; inválido → null */
function toCents(v) {
  v = String(v || "").replace(/[R$\s]/g, "");
  if (!v) return 0;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) && n >= 0 && n <= 1e11 && /^\d+(\.\d{1,2})?$/.test(v) ? n : null;
}
