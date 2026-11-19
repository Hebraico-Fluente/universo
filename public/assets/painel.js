/** Painel dos noivos: entrada, visão geral, convidados (convites e respostas) e orçamento. */
import { $, $$, esc, longDate, money, daysUntil, api } from "./ui.js";

const app = $("#app");
let me, view = location.hash.slice(1) || "geral";

boot();
async function boot() {
  const setup = new URLSearchParams(location.search).get("acesso");
  if (setup) { app.removeAttribute("aria-busy"); return setupView(setup); }
  try { me = await api("/api/me"); shell(); }
  catch (e) { if (e.status === 401) loginView(); else app.innerHTML = `<p class="wrap pad">${esc(e.message)}</p>`; }
  finally { app.removeAttribute("aria-busy"); }
}

/* ---------------- entrada ---------------- */
function loginView() {
  app.innerHTML = `
  <section class="login">
    <div class="login-art" role="img" aria-label="Detalhe de flores de casamento"></div>
    <div class="login-box">
      <a class="brand" href="/">Universo</a>
      <h1>Bem-vindos de volta.</h1>
      <p class="muted">O painel do casamento de vocês: convidados, respostas e orçamento.</p>
      <form id="login" novalidate>
        <label class="field"><span>E-mail</span><input class="in" name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Senha</span><input class="in" name="password" type="password" autocomplete="current-password" required></label>
        <p class="error" id="err" role="alert"></p>
        <button class="btn" type="submit">Entrar</button>
      </form>
      <div class="demo-access"><p class="label">Acesso de demonstração</p><p>Casamento fictício de Helena &amp; Rafael.</p><button class="btn ghost sm" type="button" id="fill">Preencher acesso de demonstração</button></div>
    </div>
  </section>`;
  $("#fill").addEventListener("click", () => { const f = $("#login"); f.email.value = "demo@universo.app"; f.password.value = "casamento-demo-2027"; f.requestSubmit(); });
  $("#login").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector("button");
    $("#err").textContent = ""; b.disabled = true; b.textContent = "Entrando…";
    try { await api("/api/auth/login", { method: "POST", body: { email: f.email.value, password: f.password.value } }); me = await api("/api/me"); shell(); }
    catch (x) { $("#err").textContent = x.message; b.disabled = false; b.textContent = "Entrar"; }
  });
}

/* ---------------- criar acesso (link de uso único) ---------------- */
async function setupView(token) {
  let info;
  try { info = await api(`/api/auth/setup/${encodeURIComponent(token)}`); }
  catch (e) { app.innerHTML = `<section class="login"><div class="login-art" role="img" aria-label="Detalhe de flores de casamento"></div><div class="login-box"><a class="brand" href="/">Universo</a><h1>Link indisponível.</h1><p class="muted">${esc(e.message)}</p><a class="btn ghost" href="/painel">Ir para a entrada</a></div></section>`; return; }
  app.innerHTML = `
  <section class="login">
    <div class="login-art" role="img" aria-label="Detalhe de flores de casamento"></div>
    <div class="login-box">
      <a class="brand" href="/">Universo</a>
      <p class="label">Painel de ${esc(info.wedding)}</p>
      <h1>Crie o seu acesso.</h1>
      <p class="muted">Escolha o e-mail e a senha que vão usar para entrar. Este link funciona uma única vez.</p>
      <form id="setup" novalidate>
        <label class="field"><span>Seu nome</span><input class="in" name="name" autocomplete="name" required></label>
        <label class="field"><span>E-mail</span><input class="in" name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Senha (mínimo 10 caracteres)</span><input class="in" name="password" type="password" autocomplete="new-password" minlength="10" required></label>
        <label class="field"><span>Repita a senha</span><input class="in" name="password2" type="password" autocomplete="new-password" required></label>
        <p class="error" id="err" role="alert"></p>
        <button class="btn" type="submit">Criar acesso e entrar</button>
      </form>
    </div>
  </section>`;
  $("#setup").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector("button"), err = $("#err"); err.textContent = "";
    if (f.password.value.length < 10) return void (err.textContent = "A senha precisa ter pelo menos 10 caracteres.");
    if (f.password.value !== f.password2.value) return void (err.textContent = "As duas senhas não são iguais.");
    b.disabled = true; b.textContent = "Criando…";
    try {
      await api(`/api/auth/setup/${encodeURIComponent(token)}`, { method: "POST", body: { name: f.name.value, email: f.email.value, password: f.password.value } });
      history.replaceState(null, "", "/painel"); // tira o link usado da barra de endereço
      me = await api("/api/me"); shell();
    } catch (x) { err.textContent = x.message; b.disabled = false; b.textContent = "Criar acesso e entrar"; }
  });
}

/* ---------------- estrutura ---------------- */
function shell() {
  const w = me.wedding;
  app.innerHTML = `
  <header class="bar"><div class="wrap">
    <a class="brand" href="/">Universo</a>
    <nav class="tabs" aria-label="Seções do painel">
      <a href="#geral" data-v="geral">Visão geral</a><a href="#convidados" data-v="convidados">Convidados</a><a href="#orcamento" data-v="orcamento">Orçamento</a>
    </nav>
    <div class="who"><a class="link" href="/c/${esc(w.slug)}" target="_blank" rel="noopener">Ver o site</a><button class="link" type="button" id="logout">Sair</button></div>
  </div></header>
  ${w.is_demo ? `<p class="demo-band">Dados fictícios de demonstração. Pode testar à vontade: nada aqui é real.</p>` : ""}
  <div class="wrap pad" id="view"></div>`;
  $("#logout").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); location.hash = ""; loginView(); });
  addEventListener("hashchange", route);
  route();
}
function route() {
  view = location.hash.slice(1) || "geral";
  $$(".tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.v === view ? "page" : "false"));
  viewEl().onclick = null;
  ({ geral: overview, convidados: guests, orcamento: budget }[view] || overview)();
}
const viewEl = () => $("#view");
const fail = e => { viewEl().innerHTML = `<p class="error">${esc(e.message)}</p>`; if (e.status === 401) loginView(); };

/* ---------------- visão geral ---------------- */
async function overview() {
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const o = await api("/api/admin/overview");
    const w = o.wedding, b = o.budget;
    const pendingHH = o.households.total - o.households.responded;
    const main = o.events.find(e => e.name.toLowerCase().includes("festa")) || o.events[o.events.length - 1];
    const alerts = [];
    if (pendingHH) alerts.push(`${pendingHH} ${pendingHH > 1 ? "famílias ainda não responderam" : "família ainda não respondeu"}. <a href="#convidados">Ver quem falta</a>`);
    if (o.diets) alerts.push(`${o.diets} ${o.diets > 1 ? "pessoas informaram" : "pessoa informou"} restrição alimentar. Lembre de passar ao buffet.`);
    if (b.to_pay > 0) alerts.push(`Faltam ${money(b.to_pay)} a pagar em contratos fechados. <a href="#orcamento">Ver vencimentos</a>`);
    viewEl().innerHTML = `
      <section class="hello">
        <p class="label">${esc(longDate(w.date_iso))}</p>
        <h1>${esc(w.names)}</h1>
        <p class="big num">${daysUntil(w.date_iso)} <span>dias para o casamento</span></p>
      </section>
      <section class="grid3">
        ${o.events.map(e => `<article class="stat">
          <p class="label">${esc(e.name)}</p>
          <p class="n num">${e.yes}<span> / ${e.invited}</span></p><p class="muted">confirmados</p>
          <div class="meter" role="img" aria-label="${e.yes} sim, ${e.no} não, ${e.pending} pendentes"><i class="m-yes"></i><i class="m-no"></i></div>
          <p class="legend"><span class="tag yes">${e.yes} sim</span><span class="tag no">${e.no} não</span><span class="tag pending">${e.pending} pendentes</span></p>
        </article>`).join("")}
      </section>
      <section class="split">
        <article class="panel"><h2>Atenção agora</h2>${alerts.length ? `<ul class="alerts">${alerts.map(a => `<li>${a}</li>`).join("")}</ul>` : `<p class="muted">Nada pendente. Aproveitem.</p>`}</article>
        <article class="panel"><h2>Orçamento</h2>
          <dl class="kv"><div><dt>Planejado</dt><dd class="num">${money(b.planned)}</dd></div><div><dt>Contratado</dt><dd class="num">${money(b.committed)}</dd></div>
          <div><dt>Pago</dt><dd class="num">${money(b.paid)}</dd></div><div><dt>A pagar</dt><dd class="num strong">${money(b.to_pay)}</dd></div></dl>
          <a class="btn ghost sm" href="#orcamento">Abrir orçamento</a></article>
      </section>
      <p class="muted small">Respostas de ${o.households.responded} de ${o.households.total} convites · ${main ? `${main.pending} pessoas pendentes na ${esc(main.name.toLowerCase())}` : ""}</p>`;
    // larguras das barras via CSSOM (sem estilos inline)
    $$(".stat").forEach((el, i) => { const e = o.events[i]; const t = Math.max(1, e.invited); el.querySelector(".m-yes").style.width = (e.yes / t * 100) + "%"; el.querySelector(".m-no").style.width = (e.no / t * 100) + "%"; });
  } catch (e) { fail(e); }
}

/* ---------------- convidados ---------------- */
async function guests() {
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

/* ---------------- orçamento ---------------- */
async function budget() {
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    const d = await api("/api/admin/budget"), t = d.totals;
    const cat = Object.fromEntries(d.categories.map(c => [c.id, c.name]));
    viewEl().innerHTML = `
      <header class="vh"><div><p class="label">Orçamento</p><h1>${money(t.committed)} contratados de ${money(t.planned)} planejados</h1></div>
        <a class="btn ghost" href="/api/admin/export" download>Exportar todos os dados</a></header>
      <dl class="kv wide"><div><dt>Planejado</dt><dd class="num">${money(t.planned)}</dd></div><div><dt>Contratado</dt><dd class="num">${money(t.committed)}</dd></div><div><dt>Pago</dt><dd class="num">${money(t.paid)}</dd></div><div><dt>A pagar</dt><dd class="num strong">${money(t.to_pay)}</dd></div></dl>
      <section class="cats">${d.categories.map(c => `<article class="cat"><div class="cat-h"><h3>${esc(c.name)}</h3><p class="num small">${money(c.committed)} <span class="muted">de ${money(c.planned_cents)}</span></p></div>
        <div class="bars" role="img" aria-label="${esc(c.name)}: ${money(c.paid)} pago, ${money(c.committed)} contratado, ${money(c.planned_cents)} planejado"><i class="b-commit"></i><i class="b-paid"></i></div>
        ${c.committed > c.planned_cents ? `<p class="over small">Acima do planejado em ${money(c.committed - c.planned_cents)}</p>` : ""}</article>`).join("")}</section>
      <p class="legend small"><span class="lg paid"></span>pago <span class="lg commit"></span>contratado <span class="lg plan"></span>planejado</p>
      <section class="split">
        <article class="panel"><h2>Próximos pagamentos</h2>${d.upcoming.length ? `<ul class="pay">${d.upcoming.map(i => `<li><div><b>${esc(i.description)}</b><span class="muted small">${esc(i.vendor)} · ${esc(cat[i.category_id])}</span></div>
          <div class="r"><span class="num">${money(i.amount_cents - i.paid_cents)}</span><span class="small ${i.overdue ? "over" : "muted"}">${i.overdue ? "vencido em " : "vence "}${esc(new Date(i.due_date + "T12:00:00").toLocaleDateString("pt-BR"))}</span>
          <button class="link small" data-pay="${esc(i.id)}" data-left="${i.amount_cents - i.paid_cents}" data-paid="${i.paid_cents}">Registrar pagamento</button></div></li>`).join("")}</ul>` : `<p class="muted">Nenhum pagamento pendente com data.</p>`}</article>
        <article class="panel"><h2>E se convidarmos mais gente?</h2>
          <form id="sim" class="sim"><label class="field"><span>Convidados a mais</span><input class="in" name="extra" type="number" min="1" max="1000" value="30" inputmode="numeric"></label><button class="btn sm" type="submit">Simular</button></form>
          <div id="simr" aria-live="polite"></div></article>
      </section>`;
    $$(".cat").forEach((el, i) => { const c = d.categories[i]; const max = Math.max(c.planned_cents, c.committed, 1);
      el.querySelector(".b-commit").style.width = (c.committed / max * 100) + "%"; el.querySelector(".b-paid").style.width = (c.paid / max * 100) + "%";
      el.querySelector(".bars").style.setProperty("--plan", (c.planned_cents / max * 100) + "%"); });
    viewEl().onclick = async e => {
      const b = e.target.closest("[data-pay]"); if (!b) return;
      const v = prompt(`Quanto foi pago agora? (restam ${money(+b.dataset.left)})`, (b.dataset.left / 100).toFixed(2).replace(".", ","));
      if (v == null) return;
      const cents = Math.round(parseFloat(v.replace(/\./g, "").replace(",", ".")) * 100);
      if (!(cents > 0)) return alert("Valor inválido.");
      try { await api(`/api/admin/budget/items/${b.dataset.pay}`, { method: "PATCH", body: { paid_cents: +b.dataset.paid + cents } }); budget(); } catch (x) { alert(x.message); }
    };
    $("#sim").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const s = await api(`/api/admin/budget/simulate?extra=${encodeURIComponent(e.target.extra.value)}`);
        $("#simr").innerHTML = s.can_estimate ? `<p class="sim-total"><span class="num">+ ${money(s.total_cents)}</span> com ${s.extra} convidados a mais</p>
          <table class="tbl mini"><tbody>${s.lines.map(l => `<tr><td>${esc(l.source)}</td><td class="num">${money(l.per_guest_cents)} × ${s.extra}</td><td class="num">${money(l.total_cents)}</td></tr>`).join("")}</tbody></table>
          <p class="label">Premissas</p><ul class="small muted">${s.assumptions.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` :
          `<p class="muted">Ainda não dá para estimar: nenhum contrato tem valor por convidado cadastrado.</p>`;
      } catch (x) { $("#simr").innerHTML = `<p class="error">${esc(x.message)}</p>`; }
    });
  } catch (e) { fail(e); }
}
