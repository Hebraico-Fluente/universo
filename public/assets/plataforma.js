/**
 * Painel da plataforma (Gueta Studio): /plataforma  — só administradores (users.platform_role = 'admin').
 * Clientes, acessos, planos e cobranças (registro manual), funcionalidades, domínios, uso/erros e suporte.
 * Tudo que vem da API passa por esc(). Sem estilos ou scripts inline (CSP).
 */
import { $, $$, esc, api, money, fmt } from "./ui.js";
const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const app = $("#app");
let me = null;
const view = () => $("#view");

/* ---------------- utilidades ---------------- */
const asDate = iso => {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso + "T12:00:00Z";
  if (/^\d{4}-\d{2}-\d{2} \d/.test(iso)) return iso.replace(" ", "T") + "Z";
  return iso;
};
const day = iso => iso ? fmt(asDate(iso), { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "") : "—";
const dayTime = iso => iso ? fmt(asDate(iso), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "") : "—";
const parseMoney = v => {
  let s = String(v ?? "").replace(/[R$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "3.200" = três mil e duzentos
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const brl = c => money(c || 0);
const bytes = b => b == null ? "—" : b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1).replace(".", ",") + " KB" : (b / 1048576).toFixed(1).replace(".", ",") + " MB";
const slugify = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " e ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const STATUS_TAG = { ativo: ["yes", "Ativo"], suspenso: ["off", "Suspenso"], realizado: ["no", "Realizado"] };
const CH_TAG = { pago: ["yes", "Pago"], pendente: ["pending", "Pendente"], atrasado: ["off", "Atrasado"] };
const METHOD = { pix: "Pix", cartao: "Cartão", transferencia: "Transferência" };
const ROLE = { owner: "Dono", planner: "Cerimonialista", viewer: "Leitura" };
const TK = { open: ["pending", "Aberto"], answered: ["yes", "Respondido"], closed: ["no", "Fechado"] };
const tag = ([c, t]) => `<span class="tag ${c}">${esc(t)}</span>`;

let toastTimer;
function toast(msg, bad = false) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.toggle("bad", bad); t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 4200);
}
const busy = async (btn, fn) => {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); if (e.status === 401) setTimeout(() => location.reload(), 900); return undefined; } finally { if (btn) btn.disabled = false; }
};
const go = h => { if (location.hash === h) route(); else location.hash = h; };

/* ---------------- entrada ---------------- */
async function start() {
  const convite = new URLSearchParams(location.search).get("convite");
  if (convite) return setupView(convite);
  try { me = await api("/api/platform/me"); shell(); }
  catch (e) { if (e.status === 401 || e.status === 403) loginView(); else app.innerHTML = `<p class="wrap pad">${esc(e.message)}</p>`; }
  finally { app.removeAttribute("aria-busy"); }
}
function loginBox(inner) {
  app.innerHTML = `<section class="pf-login"><div class="pf-login-box">
    <p class="label">Universo · plataforma</p>${inner}<p class="hint">Área restrita do Gueta Studio. Casais entram pelo <a href="/painel">painel do casal</a>.</p></div></section>`;
}
function loginView() {
  loginBox(`<h1>Entrar na plataforma.</h1>
    <form id="lf" novalidate>
      <label class="field"><span>E-mail</span><input class="in" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Senha</span><input class="in" name="password" type="password" autocomplete="current-password" required></label>
      <p class="error" id="err" role="alert"></p>
      <button class="btn" type="submit">Entrar</button>
    </form>`);
  const f = $("#lf");
  f.email.focus();
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const b = f.querySelector("button"); b.disabled = true; $("#err").textContent = "";
    try { await api("/api/platform/login", { method: "POST", body: { email: f.email.value, password: f.password.value } }); me = await api("/api/platform/me"); shell(); }
    catch (x) { $("#err").textContent = x.message; b.disabled = false; }
  });
}
async function setupView(token) {
  try { await api(`/api/platform/setup/${encodeURIComponent(token)}`); }
  catch (e) { loginBox(`<h1>Link inválido.</h1><p class="muted">${esc(e.message)}</p><a class="btn ghost" href="/plataforma">Ir para o login</a>`); app.removeAttribute("aria-busy"); return; }
  loginBox(`<h1>Criar acesso de administrador.</h1>
    <p class="muted">Este link vale uma única vez. Escolha seu e-mail e uma senha forte.</p>
    <form id="sf" novalidate>
      <label class="field"><span>Seu nome</span><input class="in" name="name" autocomplete="name" required></label>
      <label class="field"><span>E-mail</span><input class="in" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Senha (mínimo 10 caracteres)</span><input class="in" name="password" type="password" autocomplete="new-password" minlength="10" required></label>
      <label class="field"><span>Repita a senha</span><input class="in" name="password2" type="password" autocomplete="new-password" required></label>
      <p class="error" id="err" role="alert"></p>
      <button class="btn" type="submit">Criar acesso e entrar</button>
    </form>`);
  app.removeAttribute("aria-busy");
  const f = $("#sf");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#err"); err.textContent = "";
    if (f.password.value.length < 10) { err.textContent = "A senha precisa ter pelo menos 10 caracteres."; return; }
    if (f.password.value !== f.password2.value) { err.textContent = "As senhas não conferem."; return; }
    const b = f.querySelector("button"); b.disabled = true;
    try {
      await api(`/api/platform/setup/${encodeURIComponent(token)}`, { method: "POST", body: { name: f.name.value, email: f.email.value, password: f.password.value } });
      history.replaceState(null, "", "/plataforma");
      me = await api("/api/platform/me"); shell();
    } catch (x) { err.textContent = x.message; b.disabled = false; }
  });
}

/* ---------------- estrutura ---------------- */
const TABS = [["clientes", "Clientes"], ["cobranca", "Planos e cobrança"], ["dominios", "Domínios"], ["uso", "Uso e erros"], ["suporte", "Suporte"]];
function shell() {
  app.innerHTML = `
  <header class="bar"><div class="wrap">
    <a class="brand" href="#clientes">Universo <span class="pf-sub">plataforma</span></a>
    <nav class="tabs" aria-label="Seções da plataforma">${TABS.map(([id, l]) => `<a href="#${id}" data-v="${id}">${l}</a>`).join("")}</nav>
    <div class="who"><span class="muted pf-me">${esc(me.user.name)}</span><button class="link" type="button" id="logout">Sair</button></div>
  </div></header>
  <div class="wrap pad" id="view" tabindex="-1"></div>
  <p class="pf-toast" id="toast" role="status" aria-live="polite"></p>`;
  $("#logout").addEventListener("click", async () => { await api("/api/platform/logout", { method: "POST" }).catch(() => {}); location.hash = ""; location.reload(); });
  addEventListener("hashchange", route);
  route();
}
async function route() {
  const [v, arg] = (location.hash.slice(1) || "clientes").split("/");
  const top = v === "cliente" ? "clientes" : v;
  $$(".tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.v === top ? "page" : "false"));
  const el = view();
  el.onclick = null; el.onsubmit = null; el.onchange = null; el.oninput = null;
  el.innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    if (v === "cliente" && arg) await clientView(arg);
    else if (v === "cobranca") await billingView();
    else if (v === "dominios") await domainsView();
    else if (v === "uso") await usageView();
    else if (v === "suporte") await (arg ? ticketView(arg) : ticketsView());
    else await clientsView();
  } catch (e) {
    el.innerHTML = `<p class="error">${esc(e.message)}</p>`;
    if (e.status === 401) setTimeout(() => location.reload(), 900);
  }
}

/* ---------------- clientes ---------------- */
let clientFilter = { q: "", st: "" };
async function clientsView() {
  const [{ weddings }, { plans }] = await Promise.all([api("/api/platform/weddings"), api("/api/platform/plans")]);
  const el = view();
  el.innerHTML = `
  <div class="vh"><div><p class="label">Clientes</p><h1>Casamentos na plataforma</h1></div>
    <button class="btn" type="button" data-act="new" aria-expanded="false" aria-controls="nw">Novo casamento</button></div>
  <form class="panel pf-form" id="nw" hidden novalidate>
    <h2>Novo casamento</h2>
    <div class="pf-grid">
      <label class="field"><span>Nomes do casal</span><input class="in" name="names" required maxlength="80" placeholder="Ana & Bruno"></label>
      <label class="field"><span>Endereço do site</span><input class="in" name="slug" required maxlength="60" pattern="[a-z0-9-]+" placeholder="ana-e-bruno" aria-describedby="slugh"><small class="hint" id="slugh">/c/<b id="slugv">…</b> · minúsculas, números e hífens</small></label>
      <label class="field"><span>Data</span><input class="in" name="date" type="date" required></label>
      <label class="field"><span>Horário da cerimônia</span><input class="in" name="time" type="time" value="16:00" required></label>
      <label class="field"><span>Fuso</span><select class="in" name="tz">
        <option value="-03:00">Brasília (−03:00)</option><option value="-04:00">Manaus (−04:00)</option><option value="-05:00">Acre (−05:00)</option><option value="-02:00">Noronha (−02:00)</option></select></label>
      <label class="field"><span>Cidade</span><input class="in" name="city" maxlength="80" placeholder="Curitiba · Paraná"></label>
      <label class="field"><span>Universo visual</span><select class="in" name="universe"><option value="editorial">Editorial</option><option value="timeless">Timeless</option><option value="dreamscape">Dreamscape</option></select></label>
      <label class="field"><span>Tema sob medida (opcional)</span><input class="in" name="theme" maxlength="40" placeholder="ex.: petalucas"></label>
      <label class="field"><span>Plano</span><select class="in" name="plan_id"><option value="">Sem plano por enquanto</option>${plans.filter(p => p.active).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
    </div>
    <label class="pf-check"><input type="checkbox" name="is_demo"> Casamento de demonstração</label>
    <p class="error" id="nwerr" role="alert"></p>
    <div class="row-btns"><button class="btn" type="submit">Criar e gerar link de dono</button><button class="btn ghost" type="button" data-act="cancel">Cancelar</button></div>
  </form>
  <div id="once"></div>
  <div class="pf-filters">
    <label class="field"><span>Buscar</span><input class="in" id="fq" type="search" placeholder="Nome ou endereço" value="${esc(clientFilter.q)}"></label>
    <label class="field"><span>Situação</span><select class="in" id="fs">
      ${[["", "Todas"], ["ativo", "Ativos"], ["suspenso", "Suspensos"], ["realizado", "Realizados"], ["demo", "Demonstração"]].map(([v, l]) => `<option value="${v}"${clientFilter.st === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    <p class="muted small pf-count" id="fcount" aria-live="polite"></p>
  </div>
  <div class="pt-wrap"><table class="pt">
    <thead><tr><th scope="col">Casal</th><th scope="col">Situação</th><th scope="col">Plano</th><th scope="col">Data</th><th scope="col">Uso</th><th scope="col">Último acesso</th><th scope="col" class="r">Em aberto</th></tr></thead>
    <tbody id="rows"></tbody></table></div>`;
  const draw = () => {
    const q = clientFilter.q.toLowerCase();
    const list = weddings.filter(w => (!q || (w.names + " " + w.slug).toLowerCase().includes(q))
      && (!clientFilter.st || (clientFilter.st === "demo" ? w.is_demo : w.status === clientFilter.st)));
    $("#fcount").textContent = `${list.length} de ${weddings.length}`;
    $("#rows").innerHTML = list.map(w => `<tr>
      <th scope="row" data-l="Casal"><a class="pf-name" href="#cliente/${esc(w.id)}">${esc(w.names)}</a><small class="muted">/c/${esc(w.slug)}${w.domain ? " · " + esc(w.domain) : ""}</small></th>
      <td data-l="Situação">${tag(STATUS_TAG[w.status])}${w.is_demo ? ` <span class="tag no">Demo</span>` : ""}</td>
      <td data-l="Plano">${w.plan_name ? esc(w.plan_name) : `<span class="muted">—</span>`}</td>
      <td data-l="Data" class="num">${day(w.date_iso)}</td>
      <td data-l="Uso" class="num">${pl(w.guests, "convidado", "convidados")} · ${pl(w.households, "família", "famílias")} · ${pl(w.gift_notices, "presente", "presentes")}</td>
      <td data-l="Último acesso" class="num">${w.last_access ? dayTime(w.last_access) : `<span class="muted">nunca</span>`}</td>
      <td data-l="Em aberto" class="num r">${w.open_cents ? `<b>${brl(w.open_cents)}</b>` : `<span class="muted">—</span>`}</td></tr>`).join("")
      || `<tr><td colspan="7" class="muted">Nenhum casamento com esse filtro.</td></tr>`;
  };
  draw();
  $("#fq").addEventListener("input", e => { clientFilter.q = e.target.value; draw(); });
  $("#fs").addEventListener("change", e => { clientFilter.st = e.target.value; draw(); });
  const f = $("#nw"), toggle = $("[data-act=new]");
  let slugTouched = false;
  f.slug.addEventListener("input", () => { slugTouched = true; $("#slugv").textContent = f.slug.value || "…"; });
  f.names.addEventListener("input", () => { if (!slugTouched) { f.slug.value = slugify(f.names.value); $("#slugv").textContent = f.slug.value || "…"; } });
  el.onclick = e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    if (a.dataset.act === "new" || a.dataset.act === "cancel") {
      f.hidden = !f.hidden; toggle.setAttribute("aria-expanded", String(!f.hidden));
      if (!f.hidden) f.names.focus(); else toggle.focus();
    }
    if (a.dataset.act === "copy") copy(a);
  };
  f.addEventListener("submit", e => {
    e.preventDefault();
    $("#nwerr").textContent = "";
    if (!f.date.value || !f.time.value) { $("#nwerr").textContent = "Informe data e horário."; return; }
    busy(f.querySelector("[type=submit]"), async () => {
      try {
        const r = await api("/api/platform/weddings", { method: "POST", body: {
          names: f.names.value, slug: f.slug.value, date_iso: `${f.date.value}T${f.time.value}:00${f.tz.value}`, city: f.city.value,
          universe: f.universe.value, theme: f.theme.value, plan_id: f.plan_id.value || null, is_demo: f.is_demo.checked } });
        const names = f.names.value;
        f.reset(); f.hidden = true; toggle.setAttribute("aria-expanded", "false");
        const fresh = await api("/api/platform/weddings");
        weddings.splice(0, weddings.length, ...fresh.weddings); draw();
        $("#once").innerHTML = linkOnce(r.access, `${names} foi criado.`, r.id);
        $("#once .pf-once").focus();
      } catch (x) { $("#nwerr").textContent = x.message; }
    });
  });
}
/** Caixa do link de acesso: aparece UMA vez (só o hash fica no banco). */
function linkOnce(access, title, id) {
  return `<section class="panel pf-once" tabindex="-1" aria-labelledby="oncet">
    <p class="label">Link de acesso · ${esc(ROLE[access.role] || access.role)}</p>
    <h2 id="oncet">${esc(title)}</h2>
    <p class="muted">Este link aparece só agora e vale uma única vez, até ${day(access.expires_at)}. Copie e envie ao casal em privado (WhatsApp ou e-mail). Se perder, gere outro.</p>
    <div class="pf-copy"><input class="in" readonly value="${esc(access.link)}" aria-label="Link de acesso"><button class="btn sm" type="button" data-act="copy">Copiar</button></div>
    ${id ? `<a class="link" href="#cliente/${esc(id)}">Abrir o cliente</a>` : ""}
  </section>`;
}
async function copy(btn) {
  const input = btn.parentElement.querySelector("input");
  try { await navigator.clipboard.writeText(input.value); btn.textContent = "Copiado"; }
  catch { input.select(); btn.textContent = "Selecione e copie"; }
}

/* ---------------- cliente (detalhe) ---------------- */
async function clientView(id) {
  const [d, { plans }] = await Promise.all([api("/api/platform/weddings/" + encodeURIComponent(id)), api("/api/platform/plans")]);
  const w = d.wedding, u = d.usage, b = d.balance;
  const status = w.suspended ? "suspenso" : w.date_iso < new Date().toISOString() ? "realizado" : "ativo";
  const el = view();
  el.innerHTML = `
  <p><a class="link small" href="#clientes">← Clientes</a></p>
  <div class="vh"><div><p class="label">${tag(STATUS_TAG[status])}${w.is_demo ? ` <span class="tag no">Demonstração</span>` : ""}</p><h1>${esc(w.names)}</h1>
    <p class="muted">${day(w.date_iso)} · ${esc(w.city || "cidade não informada")} · universo ${esc(w.universe)}${w.theme ? " · tema " + esc(w.theme) : ""}</p></div>
    <div class="row-btns">
      <a class="btn ghost sm" href="/c/${esc(w.slug)}" target="_blank" rel="noopener">Ver site</a>
      <button class="btn ghost sm" type="button" data-act="demo">${w.is_demo ? "Desmarcar demonstração" : "Marcar como demonstração"}</button>
      <button class="btn sm ${w.suspended ? "accent" : "pf-danger"}" type="button" data-act="suspend">${w.suspended ? "Reativar" : "Suspender"}</button>
    </div></div>
  ${w.suspended ? `<p class="pf-note bad">Suspenso desde ${dayTime(w.suspended_at)}. O site, os convites e o painel do casal mostram um aviso de pausa.</p>` : ""}
  <dl class="kv wide"><div><dt>Convidados</dt><dd class="num">${u.guests}</dd></div><div><dt>Famílias</dt><dd class="num">${u.households}<small class="muted"> · ${u.responded} responderam</small></dd></div>
    <div><dt>Avisos de presente</dt><dd class="num">${u.gift_notices}</dd></div><div><dt>Recados</dt><dd class="num">${u.messages}</dd></div></dl>
  <div id="once"></div>
  <div class="split">
    <section class="panel" aria-labelledby="h-acc"><h2 id="h-acc">Acesso do casal</h2>
      ${d.members.length ? `<ul class="pf-list">${d.members.map(m => `<li><div><b>${esc(m.name)}</b> <span class="muted small">${esc(ROLE[m.role] || m.role)}</span><br><small class="muted">${esc(m.email)} · último acesso ${m.last_access ? dayTime(m.last_access) : "—"}</small></div>
        <button class="link pf-danger-l" type="button" data-act="rm-member" data-id="${esc(m.user_id)}" data-name="${esc(m.name)}">Revogar</button></li>`).join("")}</ul>` : `<p class="muted">Ninguém entrou ainda.</p>`}
      ${d.invites.length ? `<h3 class="pf-h3">Links enviados</h3><ul class="pf-list">${d.invites.map(i => `<li><div>${esc(ROLE[i.role] || i.role)} · <span class="muted small">criado ${dayTime(i.created_at)} · ${i.state === "usado" ? "usado " + dayTime(i.used_at) : i.state === "expirado" ? "expirou" : "vale até " + day(i.expires_at)}</span></div>
        ${i.state === "pendente" ? `<button class="link pf-danger-l" type="button" data-act="rm-invite" data-ref="${esc(i.ref)}">Revogar</button>` : `<span class="tag no">${esc(i.state)}</span>`}</li>`).join("")}</ul>` : ""}
      <form class="pf-inline" id="acc" novalidate>
        <label class="field"><span>Papel</span><select class="in" name="role"><option value="owner">Dono</option><option value="planner">Cerimonialista</option><option value="viewer">Só leitura</option></select></label>
        <label class="field"><span>Validade (dias)</span><input class="in" name="days" type="number" min="1" max="60" value="14" inputmode="numeric"></label>
        <button class="btn sm" type="submit">Gerar link</button>
      </form>
    </section>
    <section class="panel" aria-labelledby="h-plan"><h2 id="h-plan">Plano e funcionalidades</h2>
      <form class="pf-inline" id="plan">
        <label class="field"><span>Plano</span><select class="in" name="plan_id"><option value="">Sem plano</option>${plans.map(p => `<option value="${esc(p.id)}"${p.id === w.plan_id ? " selected" : ""}>${esc(p.name)}${p.active ? "" : " (inativo)"}</option>`).join("")}</select></label>
        <button class="btn sm ghost" type="submit">Salvar plano</button>
      </form>
      ${w.plan_id ? `<p><button class="link small" type="button" data-act="apply-plan">Ligar só as funcionalidades incluídas no plano</button></p>` : ""}
      <form id="feat"><fieldset class="pf-feats"><legend class="sr">Funcionalidades</legend>
        ${me.features.map(f => `<label class="pf-check"><input type="checkbox" name="${esc(f.key)}"${d.features[f.key] ? " checked" : ""}> ${esc(f.label)}</label>`).join("")}
      </fieldset><button class="btn sm ghost" type="submit">Salvar funcionalidades</button></form>
    </section>
  </div>
  <section class="panel pf-sec" aria-labelledby="h-ch"><h2 id="h-ch">Cobranças</h2>
    <p class="pf-note">Registro manual: nada aqui cobra o cliente nem processa pagamento.</p>
    <dl class="kv wide"><div><dt>Faturado</dt><dd class="num">${brl(b.billed)}</dd></div><div><dt>Recebido</dt><dd class="num">${brl(b.paid)}</dd></div>
      <div><dt>Em aberto</dt><dd class="num strong">${brl(b.open)}</dd></div><div><dt>Vencido</dt><dd class="num${b.overdue ? " pf-bad" : ""}">${brl(b.overdue)}</dd></div></dl>
    ${chargesTable(d.charges)}
    ${chargeForm()}
  </section>
  <div class="split">
    <section class="panel" aria-labelledby="h-dom"><h2 id="h-dom">Domínio próprio</h2>
      ${d.domains.length ? `<ul class="pf-list">${d.domains.map(x => domainItem(x)).join("")}</ul>` : `<p class="muted">Nenhum domínio. O site fica em /c/${esc(w.slug)}.</p>`}
      <form class="pf-inline" id="dom" novalidate>
        <label class="field"><span>Domínio</span><input class="in" name="host" placeholder="anaebruno.com.br" autocapitalize="off" spellcheck="false" required></label>
        <button class="btn sm" type="submit">Registrar</button>
      </form>
      <p class="hint"><a class="link" href="#dominios">Passo a passo de DNS na Cloudflare</a></p>
    </section>
    <section class="panel" aria-labelledby="h-note"><h2 id="h-note">Observação interna</h2>
      <form id="note"><label class="field"><span class="sr">Observação</span><textarea class="in pf-ta" name="note" maxlength="1000" placeholder="Só a equipe vê. Ex.: combinado entrada + 2 parcelas.">${esc(w.platform_note || "")}</textarea></label>
      <button class="btn sm ghost" type="submit">Salvar observação</button></form>
    </section>
  </div>`;
  const patch = (body, msg) => api("/api/platform/weddings/" + encodeURIComponent(w.id), { method: "PATCH", body }).then(() => { toast(msg); });
  el.onclick = e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "copy") return copy(a);
    if (act === "suspend") {
      if (!w.suspended && !confirm(`Suspender ${w.names}? O site, os convites e o painel do casal vão mostrar um aviso de pausa.`)) return;
      return busy(a, async () => { await patch({ suspended: !w.suspended }, w.suspended ? "Casamento reativado." : "Casamento suspenso."); route(); });
    }
    if (act === "demo") return busy(a, async () => { await patch({ is_demo: !w.is_demo }, "Atualizado."); route(); });
    if (act === "apply-plan") return busy(a, async () => { await api(`/api/platform/weddings/${encodeURIComponent(w.id)}/apply-plan`, { method: "POST" }); toast("Funcionalidades do plano aplicadas."); route(); });
    if (act === "rm-member") {
      if (!confirm(`Revogar o acesso de ${a.dataset.name}? A pessoa sai do painel na hora.`)) return;
      return busy(a, async () => { await api(`/api/platform/weddings/${encodeURIComponent(w.id)}/access/revoke`, { method: "POST", body: { user_id: a.dataset.id } }); toast("Acesso revogado."); route(); });
    }
    if (act === "rm-invite") {
      if (!confirm("Revogar este link? Ele deixa de funcionar.")) return;
      return busy(a, async () => { await api(`/api/platform/weddings/${encodeURIComponent(w.id)}/access/revoke`, { method: "POST", body: { token_ref: a.dataset.ref } }); toast("Link revogado."); route(); });
    }
    if (act === "dom-on" || act === "dom-off") return busy(a, async () => { await api("/api/platform/domains/" + encodeURIComponent(a.dataset.host), { method: "PATCH", body: { status: act === "dom-on" ? "active" : "pending" } }); toast(act === "dom-on" ? "Domínio ativo." : "Domínio voltou para pendente."); route(); });
    if (act === "dom-rm") { if (!confirm(`Remover ${a.dataset.host}?`)) return; return busy(a, async () => { await api("/api/platform/domains/" + encodeURIComponent(a.dataset.host), { method: "DELETE" }); toast("Domínio removido."); route(); }); }
    if (act === "ch-paid") return busy(a, async () => { await api("/api/platform/charges/" + encodeURIComponent(a.dataset.id), { method: "PATCH", body: { status: "pago" } }); toast("Marcado como pago."); route(); });
    if (act === "ch-rm") { if (!confirm("Apagar este lançamento?")) return; return busy(a, async () => { await api("/api/platform/charges/" + encodeURIComponent(a.dataset.id), { method: "DELETE" }); toast("Lançamento apagado."); route(); }); }
  };
  $("#acc").addEventListener("submit", e => { e.preventDefault(); const f = e.target; busy(f.querySelector("button"), async () => {
    const r = await api(`/api/platform/weddings/${encodeURIComponent(w.id)}/access`, { method: "POST", body: { role: f.role.value, days: Number(f.days.value) } });
    $("#once").innerHTML = linkOnce(r.access, `Novo link para ${w.names}`); $("#once .pf-once").focus();
  }); });
  $("#plan").addEventListener("submit", e => { e.preventDefault(); busy(e.target.querySelector("button"), async () => { await patch({ plan_id: e.target.plan_id.value || null }, "Plano salvo."); route(); }); });
  $("#feat").addEventListener("submit", e => { e.preventDefault(); const f = e.target;
    busy(f.querySelector("button[type=submit]"), () => patch({ features: Object.fromEntries(me.features.map(x => [x.key, f[x.key].checked])) }, "Funcionalidades salvas.")); });
  $("#note").addEventListener("submit", e => { e.preventDefault(); busy(e.target.querySelector("button"), () => patch({ platform_note: e.target.note.value }, "Observação salva.")); });
  $("#dom").addEventListener("submit", e => { e.preventDefault(); const f = e.target; busy(f.querySelector("button"), async () => {
    await api(`/api/platform/weddings/${encodeURIComponent(w.id)}/domains`, { method: "POST", body: { host: f.host.value } }); toast("Domínio registrado como pendente."); route(); }); });
  bindChargeForm($("#chf"), async body => { await api(`/api/platform/weddings/${encodeURIComponent(w.id)}/charges`, { method: "POST", body }); toast("Lançamento registrado."); route(); });
}
function domainItem(x) {
  return `<li><div><b>${esc(x.host)}</b> ${x.status === "active" ? `<span class="tag yes">Ativo</span>` : `<span class="tag pending">Pendente DNS</span>`}<br>
    <small class="muted">registrado ${day(x.created_at)}${x.activated_at ? " · ativo desde " + day(x.activated_at) : ""}</small></div>
    <span class="pf-acts">${x.status === "active" ? `<a class="link" href="https://${esc(x.host)}" target="_blank" rel="noopener">Abrir</a><button class="link" type="button" data-act="dom-off" data-host="${esc(x.host)}">Desativar</button>`
      : `<button class="link" type="button" data-act="dom-on" data-host="${esc(x.host)}">Marcar como ativo</button>`}
    <button class="link pf-danger-l" type="button" data-act="dom-rm" data-host="${esc(x.host)}">Remover</button></span></li>`;
}
function chargesTable(list, withClient = false) {
  if (!list.length) return `<p class="muted">Nenhum lançamento ainda.</p>`;
  const t = new Date().toISOString().slice(0, 10);
  return `<div class="pt-wrap"><table class="pt">
    <thead><tr>${withClient ? `<th scope="col">Cliente</th>` : ""}<th scope="col">Descrição</th><th scope="col">Vencimento</th><th scope="col">Método</th><th scope="col">Situação</th><th scope="col" class="r">Valor</th><th scope="col"><span class="sr">Ações</span></th></tr></thead>
    <tbody>${list.map(c => {
      const late = c.status === "atrasado" || (c.status === "pendente" && c.due_date < t);
      return `<tr>${withClient ? `<th scope="row" data-l="Cliente"><a class="link" href="#cliente/${esc(c.wedding_id)}">${esc(c.names)}</a></th>` : ""}
      <td data-l="Descrição">${esc(c.description)}${c.note ? `<br><small class="muted">${esc(c.note)}</small>` : ""}</td>
      <td data-l="Vencimento" class="num">${day(c.due_date)}${c.paid_at ? `<br><small class="muted">pago ${day(c.paid_at)}</small>` : ""}</td>
      <td data-l="Método">${esc(METHOD[c.method] || c.method)}</td>
      <td data-l="Situação">${tag(c.status === "pendente" && late ? ["off", "Vencido"] : CH_TAG[c.status])}</td>
      <td data-l="Valor" class="num r">${brl(c.cents)}</td>
      <td class="pf-acts">${c.status !== "pago" ? `<button class="link" type="button" data-act="ch-paid" data-id="${esc(c.id)}">Marcar pago</button>` : ""}<button class="link pf-danger-l" type="button" data-act="ch-rm" data-id="${esc(c.id)}">Apagar</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
}
function chargeForm() {
  const t = new Date().toISOString().slice(0, 10);
  return `<form class="pf-form pf-ch" id="chf" novalidate><h3 class="pf-h3">Registrar cobrança ou pagamento</h3>
    <div class="pf-grid">
      <label class="field"><span>Descrição</span><input class="in" name="description" required maxlength="120" placeholder="Entrada do projeto"></label>
      <label class="field"><span>Valor (R$)</span><input class="in" name="value" inputmode="decimal" required placeholder="1.500,00"></label>
      <label class="field"><span>Vencimento</span><input class="in" name="due_date" type="date" value="${t}" required></label>
      <label class="field"><span>Método</span><select class="in" name="method"><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option></select></label>
      <label class="field"><span>Situação</span><select class="in" name="status"><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="atrasado">Atrasado</option></select></label>
      <label class="field"><span>Observação</span><input class="in" name="note" maxlength="300" placeholder="opcional"></label>
    </div>
    <p class="error" role="alert"></p>
    <button class="btn sm" type="submit">Registrar</button></form>`;
}
function bindChargeForm(f, send) {
  f.addEventListener("submit", e => {
    e.preventDefault();
    const err = f.querySelector(".error"); err.textContent = "";
    const cents = parseMoney(f.value.value);
    if (!cents || Number.isNaN(cents)) { err.textContent = "Informe um valor maior que zero (ex.: 1.500,00)."; f.value.focus(); return; }
    busy(f.querySelector("button"), async () => {
      try { await send({ description: f.description.value, cents, due_date: f.due_date.value, method: f.method.value, status: f.status.value, note: f.note.value }); }
      catch (x) { err.textContent = x.message; }
    });
  });
}

/* ---------------- planos e cobrança ---------------- */
async function billingView() {
  const [{ plans }, bill] = await Promise.all([api("/api/platform/plans"), api("/api/platform/billing")]);
  const T = bill.totals;
  const el = view();
  el.innerHTML = `
  <div class="vh"><div><p class="label">Planos e cobrança</p><h1>O que cada cliente contratou e pagou</h1></div></div>
  <p class="pf-note">Registro manual. Nenhum pagamento é processado aqui e não há gateway integrado: anote o que foi combinado e recebido por Pix, cartão ou transferência, e confira no extrato.</p>
  <dl class="kv wide"><div><dt>Faturado</dt><dd class="num">${brl(T.billed)}</dd></div><div><dt>Recebido</dt><dd class="num">${brl(T.paid)}</dd></div>
    <div><dt>Em aberto</dt><dd class="num strong">${brl(T.open)}</dd></div><div><dt>Vencido</dt><dd class="num${T.overdue ? " pf-bad" : ""}">${brl(T.overdue)}</dd></div></dl>
  <section class="pf-sec" aria-labelledby="h-plans">
    <div class="vh pf-vh2"><h2 id="h-plans">Planos</h2><button class="btn sm" type="button" data-act="new-plan" aria-expanded="false" aria-controls="pf">Novo plano</button></div>
    <form class="panel pf-form" id="pf" hidden novalidate><h3 class="pf-h3">Novo plano</h3>
      <div class="pf-grid">
        <label class="field"><span>Nome</span><input class="in" name="name" required maxlength="60" placeholder="Essencial"></label>
        <label class="field"><span>Preço por projeto (R$)</span><input class="in" name="project" inputmode="decimal" placeholder="0,00"></label>
        <label class="field"><span>Mensalidade (R$)</span><input class="in" name="monthly" inputmode="decimal" placeholder="0,00"></label>
        <label class="field pf-span2"><span>Descrição</span><input class="in" name="description" maxlength="300" placeholder="Para quem quer site + RSVP"></label>
      </div>
      <fieldset class="pf-feats"><legend>Funcionalidades incluídas</legend>
        ${me.features.map(f => `<label class="pf-check"><input type="checkbox" name="${esc(f.key)}"> ${esc(f.label)}</label>`).join("")}</fieldset>
      <p class="error" role="alert"></p>
      <div class="row-btns"><button class="btn sm" type="submit">Criar plano</button><button class="btn ghost sm" type="button" data-act="new-plan">Cancelar</button></div>
    </form>
    ${plans.length ? `<div class="pf-plans">${plans.map(p => `<article class="panel pf-plan${p.active ? "" : " off"}">
      <p class="label">${p.active ? "Ativo" : "Inativo"} · ${p.weddings} ${p.weddings === 1 ? "cliente" : "clientes"}</p>
      <h3>${esc(p.name)}</h3>
      <p class="pf-price num">${p.project_cents ? brl(p.project_cents) + "<small> por projeto</small>" : ""}${p.project_cents && p.monthly_cents ? "<br>" : ""}${p.monthly_cents ? brl(p.monthly_cents) + "<small> por mês</small>" : ""}</p>
      ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ""}
      <p class="small">${p.features.length ? p.features.map(k => esc((me.features.find(f => f.key === k) || {}).label || k)).join(" · ") : `<span class="muted">Nenhuma funcionalidade marcada</span>`}</p>
      <p class="pf-acts"><button class="link" type="button" data-act="plan-toggle" data-id="${esc(p.id)}" data-on="${p.active ? 1 : 0}">${p.active ? "Desativar" : "Reativar"}</button>
        <button class="link pf-danger-l" type="button" data-act="plan-rm" data-id="${esc(p.id)}" data-name="${esc(p.name)}">Apagar</button></p>
    </article>`).join("")}</div>` : `<p class="muted">Nenhum plano ainda. Crie o primeiro para atribuir aos clientes.</p>`}
  </section>
  <section class="pf-sec" aria-labelledby="h-bal"><h2 id="h-bal">Saldo por cliente</h2>
    <div class="pt-wrap"><table class="pt"><thead><tr><th scope="col">Cliente</th><th scope="col">Plano</th><th scope="col" class="r">Faturado</th><th scope="col" class="r">Recebido</th><th scope="col" class="r">Em aberto</th><th scope="col" class="r">Vencido</th></tr></thead>
    <tbody>${bill.clients.map(c => `<tr><th scope="row" data-l="Cliente"><a class="link" href="#cliente/${esc(c.id)}">${esc(c.names)}</a></th>
      <td data-l="Plano">${c.plan_name ? esc(c.plan_name) + `<br><small class="muted">${[c.project_cents ? brl(c.project_cents) + " projeto" : "", c.monthly_cents ? brl(c.monthly_cents) + "/mês" : ""].filter(Boolean).join(" · ")}</small>` : `<span class="muted">—</span>`}</td>
      <td data-l="Faturado" class="num r">${brl(c.billed)}</td><td data-l="Recebido" class="num r">${brl(c.paid)}</td>
      <td data-l="Em aberto" class="num r">${c.open ? `<b>${brl(c.open)}</b>` : "—"}</td><td data-l="Vencido" class="num r${c.overdue ? " pf-bad" : ""}">${c.overdue ? brl(c.overdue) : "—"}</td></tr>`).join("")}</tbody></table></div>
  </section>
  <section class="pf-sec" aria-labelledby="h-last"><h2 id="h-last">Últimos lançamentos</h2>
    <p class="hint">Para registrar um lançamento, abra o cliente.</p>
    ${chargesTable(bill.charges, true)}
  </section>`;
  const f = $("#pf"), tg = $("[data-act=new-plan]");
  el.onclick = e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "new-plan") { f.hidden = !f.hidden; tg.setAttribute("aria-expanded", String(!f.hidden)); if (!f.hidden) f.name.focus(); return; }
    if (act === "plan-toggle") return busy(a, async () => { await api("/api/platform/plans/" + encodeURIComponent(a.dataset.id), { method: "PATCH", body: { active: a.dataset.on !== "1" } }); route(); });
    if (act === "plan-rm") { if (!confirm(`Apagar o plano ${a.dataset.name}? Os clientes nele ficam sem plano.`)) return; return busy(a, async () => { await api("/api/platform/plans/" + encodeURIComponent(a.dataset.id), { method: "DELETE" }); toast("Plano apagado."); route(); }); }
    if (act === "ch-paid") return busy(a, async () => { await api("/api/platform/charges/" + encodeURIComponent(a.dataset.id), { method: "PATCH", body: { status: "pago" } }); toast("Marcado como pago."); route(); });
    if (act === "ch-rm") { if (!confirm("Apagar este lançamento?")) return; return busy(a, async () => { await api("/api/platform/charges/" + encodeURIComponent(a.dataset.id), { method: "DELETE" }); toast("Lançamento apagado."); route(); }); }
  };
  f.addEventListener("submit", e => {
    e.preventDefault();
    const err = f.querySelector(".error"); err.textContent = "";
    const project = parseMoney(f.project.value), monthly = parseMoney(f.monthly.value);
    if (Number.isNaN(project) || Number.isNaN(monthly)) { err.textContent = "Valores inválidos (ex.: 1.500,00)."; return; }
    busy(f.querySelector("[type=submit]"), async () => {
      try {
        await api("/api/platform/plans", { method: "POST", body: { name: f.name.value, project_cents: project, monthly_cents: monthly, description: f.description.value,
          features: me.features.filter(x => f[x.key].checked).map(x => x.key) } });
        toast("Plano criado."); route();
      } catch (x) { err.textContent = x.message; }
    });
  });
}

/* ---------------- domínios ---------------- */
async function domainsView() {
  const { domains } = await api("/api/platform/domains");
  const el = view();
  el.innerHTML = `
  <div class="vh"><div><p class="label">Domínios</p><h1>Endereço próprio para o site do casal</h1></div></div>
  <div class="split">
    <section class="panel" aria-labelledby="h-steps"><h2 id="h-steps">Passo a passo</h2>
      <ol class="pf-steps">
        <li><b>Registre o domínio aqui.</b> Abra o cliente e informe o domínio (ex.: <code>anaebruno.com.br</code>). Ele entra como <em>pendente DNS</em> e ainda não é servido.</li>
        <li><b>Adicione o domínio à Cloudflare.</b> No painel da Cloudflare do estúdio: <em>Add a domain</em> → digite o domínio → plano Free. A Cloudflare mostra dois <em>nameservers</em>.</li>
        <li><b>Troque os nameservers no registro.</b> No Registro.br (ou onde o domínio foi comprado): <em>DNS → Alterar servidores DNS</em> e cole os dois nameservers da Cloudflare. A propagação leva de minutos a 24 horas; a Cloudflare avisa por e-mail quando o domínio ficar <em>Active</em>.</li>
        <li><b>Ligue o domínio ao Worker.</b> Em <em>Workers &amp; Pages → universo → Settings → Domains &amp; Routes → Add → Custom domain</em>, adicione <code>anaebruno.com.br</code> e também <code>www.anaebruno.com.br</code>. A Cloudflare cria o registro DNS e o certificado HTTPS sozinha.</li>
        <li><b>Teste e ative.</b> Quando <code>https://anaebruno.com.br</code> abrir (vai mostrar a página do Universo), volte aqui e clique em <em>Marcar como ativo</em>. A partir daí a página inicial do domínio passa a ser o site do casal.</li>
      </ol>
      <p class="hint">O domínio só serve o site público do casal. O painel do casal e esta plataforma continuam no endereço principal. Se o DNS precisar ficar em outro provedor, fale com o desenvolvedor: é outro tipo de configuração (Cloudflare for SaaS).</p>
    </section>
    <section class="panel" aria-labelledby="h-doms"><h2 id="h-doms">Domínios registrados</h2>
      ${domains.length ? `<ul class="pf-list">${domains.map(x => domainItem(x).replace("<div>", `<div><a class="link small" href="#cliente/${esc(x.wedding_id)}">${esc(x.names)}</a><br>`)).join("")}</ul>` : `<p class="muted">Nenhum domínio registrado ainda.</p>`}
    </section>
  </div>`;
  el.onclick = e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "dom-on" || act === "dom-off") return busy(a, async () => { await api("/api/platform/domains/" + encodeURIComponent(a.dataset.host), { method: "PATCH", body: { status: act === "dom-on" ? "active" : "pending" } }); route(); });
    if (act === "dom-rm") { if (!confirm(`Remover ${a.dataset.host}?`)) return; return busy(a, async () => { await api("/api/platform/domains/" + encodeURIComponent(a.dataset.host), { method: "DELETE" }); route(); }); }
  };
}

/* ---------------- uso, custos e erros ---------------- */
const ACTIVITY = { rsvp: "Respostas de RSVP", "access.setup": "Acessos criados", export: "Exportações", "household.create": "Convites criados", "ticket.create": "Chamados abertos", "platform.login": "Entradas na plataforma" };
const REQ = { invite: "Convites abertos", rsvp: "Envios de RSVP", login: "Tentativas de login", "login-ip": "Logins por IP", gb: "Recados no mural", gift: "Avisos de presente", setup: "Links de acesso", ticket: "Chamados", "plat-setup": "Convites de admin", "plat-login": "Logins na plataforma", "plat-login-ip": "Logins na plataforma (IP)" };
const actLabel = a => ACTIVITY[a] || a.replace(/^platform\./, "plataforma · ");
async function usageView() {
  const [u, { errors }, { entries }] = await Promise.all([api("/api/platform/usage"), api("/api/platform/errors"), api("/api/platform/audit")]);
  const T = u.totals;
  const el = view();
  el.innerHTML = `
  <div class="vh"><div><p class="label">Uso e erros</p><h1>Como a plataforma está</h1></div></div>
  <section class="grid3 pf-stats">
    <article class="stat"><p class="label">Casamentos</p><p class="n num">${T.weddings}</p><p class="muted">${T.suspended} suspensos · ${T.demo} demonstração</p></article>
    <article class="stat"><p class="label">Convidados</p><p class="n num">${T.guests}</p><p class="muted">${pl(T.households, "família", "famílias")} · ${pl(T.users, "conta", "contas")}</p></article>
    <article class="stat"><p class="label">Atenção</p><p class="n num">${T.tickets_open}<span> chamados</span></p><p class="muted">${T.errors_7d} erros nos últimos 7 dias</p></article>
  </section>
  <div class="split">
    <section class="panel" aria-labelledby="h-db"><h2 id="h-db">Armazenamento</h2>
      <p class="muted small">${u.db_bytes != null ? `Banco D1: <b>${bytes(u.db_bytes)}</b>. ` : ""}Estimativa pelo conteúdo das tabelas: <b>${bytes(u.est_bytes)}</b> (o plano gratuito do D1 cobre 5 GB).</p>
      <div class="pt-wrap"><table class="pt pt-mini"><thead><tr><th scope="col">Tabela</th><th scope="col" class="r">Linhas</th><th scope="col" class="r">Tamanho estimado</th></tr></thead>
      <tbody>${u.tables.filter(t => t.rows > 0).sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).map(t => `<tr><th scope="row" data-l="Tabela"><code>${esc(t.name)}</code></th><td data-l="Linhas" class="num r">${t.rows.toLocaleString("pt-BR")}</td><td data-l="Tamanho" class="num r">${bytes(t.bytes)}</td></tr>`).join("")}</tbody></table></div>
      ${u.tables.some(t => !t.rows) ? `<p class="hint">Mais ${u.tables.filter(t => !t.rows).length} tabelas ainda vazias.</p>` : ""}
    </section>
    <section class="panel" aria-labelledby="h-act"><h2 id="h-act">Movimento recente</h2>
      <p class="muted small">Ações registradas: <b>${u.audit.d1}</b> nas últimas 24 horas · <b>${u.audit.d7}</b> em 7 dias.</p>
      ${u.requests_24h.length ? `<h3 class="pf-h3">Requisições controladas (24 h)</h3><ul class="pf-bars">${u.requests_24h.map(r => `<li><span>${esc(REQ[r.kind] || r.kind)}</span><b class="num">${r.hits}</b></li>`).join("")}</ul>` : ""}
      ${u.activity.length ? `<h3 class="pf-h3">Ações (7 dias)</h3><ul class="pf-bars">${u.activity.map(a => `<li><span>${esc(actLabel(a.action))}</span><b class="num">${a.n}</b></li>`).join("")}</ul>` : `<p class="muted">Sem movimento nos últimos 7 dias.</p>`}
      <p class="hint">Requisições totais e CPU ficam no painel da Cloudflare (Workers → universo → Metrics).</p>
    </section>
  </div>
  <section class="pf-sec" aria-labelledby="h-err"><div class="vh pf-vh2"><h2 id="h-err">Erros do servidor</h2>${errors.length ? `<button class="btn ghost sm" type="button" data-act="clear">Limpar registro</button>` : ""}</div>
    <p class="hint">Só a rota (sem tokens), o tipo e uma mensagem higienizada. Nenhum dado de convidado, e-mail ou IP é guardado. Registros com mais de 90 dias são apagados.</p>
    ${errors.length ? `<div class="pt-wrap"><table class="pt pt-mini"><thead><tr><th scope="col">Quando</th><th scope="col">Rota</th><th scope="col">Erro</th></tr></thead>
      <tbody>${errors.map(x => `<tr><td data-l="Quando" class="num">${dayTime(x.at)}</td><td data-l="Rota"><code>${esc(x.method)} ${esc(x.route)}</code></td><td data-l="Erro"><b>${esc(x.kind)}</b> <span class="muted">${esc(x.message)}</span></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">Nenhum erro registrado. Ótimo sinal.</p>`}
  </section>
  <section class="pf-sec" aria-labelledby="h-aud"><h2 id="h-aud">Ações na plataforma</h2>
    ${entries.length ? `<ul class="pf-list pf-audit">${entries.map(a => `<li><div><code>${esc(a.action.replace(/^platform\./, ""))}</code> ${a.names ? `· <a class="link" href="#cliente/${esc(a.wedding_id)}">${esc(a.names)}</a>` : ""}</div><small class="muted num">${dayTime(a.at)}</small></li>`).join("")}</ul>` : `<p class="muted">Nada ainda.</p>`}
  </section>`;
  el.onclick = e => {
    const a = e.target.closest("[data-act=clear]"); if (!a) return;
    if (!confirm("Limpar todo o registro de erros?")) return;
    busy(a, async () => { await api("/api/platform/errors", { method: "DELETE" }); toast("Registro limpo."); route(); });
  };
}

/* ---------------- suporte ---------------- */
let ticketFilter = "open";
async function ticketsView() {
  const { tickets } = await api("/api/platform/tickets?status=" + ticketFilter);
  const el = view();
  el.innerHTML = `
  <div class="vh"><div><p class="label">Suporte</p><h1>Chamados dos casais</h1></div>
    <div class="seg" role="radiogroup" aria-label="Filtrar chamados">${[["open", "Em aberto"], ["closed", "Fechados"], ["all", "Todos"]].map(([v, l]) =>
      `<label><input type="radio" name="tf" value="${v}"${ticketFilter === v ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
  ${tickets.length ? `<ul class="pf-list pf-tickets">${tickets.map(t => `<li><div><a class="pf-name" href="#suporte/${esc(t.id)}">${esc(t.subject)}</a><br>
    <small class="muted">${esc(t.names)} · ${t.messages} ${t.messages === 1 ? "mensagem" : "mensagens"} · atualizado ${dayTime(t.updated_at)}</small></div>${tag(TK[t.status])}</li>`).join("")}</ul>`
    : `<p class="muted">Nenhum chamado ${ticketFilter === "open" ? "em aberto" : ticketFilter === "closed" ? "fechado" : ""}.</p>`}`;
  el.onchange = e => { if (e.target.name === "tf") { ticketFilter = e.target.value; route(); } };
}
async function ticketView(id) {
  const { ticket: t } = await api("/api/platform/tickets/" + encodeURIComponent(id));
  const el = view();
  el.innerHTML = `
  <p><a class="link small" href="#suporte">← Chamados</a></p>
  <div class="vh"><div><p class="label">${tag(TK[t.status])} · <a class="link" href="#cliente/${esc(t.wedding_id)}">${esc(t.names)}</a></p><h1>${esc(t.subject)}</h1></div>
    <button class="btn ghost sm" type="button" data-act="st" data-st="${t.status === "closed" ? "open" : "closed"}">${t.status === "closed" ? "Reabrir" : "Fechar chamado"}</button></div>
  <ol class="pf-thread">${t.messages.map(m => `<li class="${m.author === "plataforma" ? "us" : "them"}"><p class="label">${m.author === "plataforma" ? "Gueta Studio" : esc(m.author_name || "Casal")} · <span class="num">${dayTime(m.created_at)}</span></p><p class="pf-msg">${esc(m.body)}</p></li>`).join("")}</ol>
  <form class="pf-form" id="rp" novalidate>
    <label class="field"><span>Responder</span><textarea class="in pf-ta" name="body" required maxlength="3000" placeholder="Escreva com calma: o casal vê esta resposta no botão Ajuda do painel."></textarea></label>
    <label class="pf-check"><input type="checkbox" name="close"> Fechar o chamado ao responder</label>
    <p class="error" role="alert"></p>
    <button class="btn sm" type="submit">Enviar resposta</button>
  </form>`;
  el.onclick = e => {
    const a = e.target.closest("[data-act=st]"); if (!a) return;
    busy(a, async () => { await api(`/api/platform/tickets/${encodeURIComponent(t.id)}/status`, { method: "POST", body: { status: a.dataset.st } }); toast(a.dataset.st === "closed" ? "Chamado fechado." : "Chamado reaberto."); route(); });
  };
  const f = $("#rp");
  f.addEventListener("submit", e => {
    e.preventDefault();
    const err = f.querySelector(".error"); err.textContent = "";
    busy(f.querySelector("button"), async () => {
      try { await api(`/api/platform/tickets/${encodeURIComponent(t.id)}/reply`, { method: "POST", body: { body: f.body.value, close: f.close.checked } }); toast("Resposta enviada."); route(); }
      catch (x) { err.textContent = x.message; }
    });
  });
}

start();
