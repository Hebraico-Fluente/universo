/** Painel dos noivos: entrada, visão geral, convidados (convites e respostas) e orçamento. */
import { $, $$, esc, api } from "./ui.js";
import { state, viewEl } from "./painel/core.js";
import { VIEWS, WIDGETS } from "./painel/views.js";

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
/** Identidade visual do casal no painel: o mesmo tema do site (cores, fontes, logo) + ajustes do painel. */
async function applyTheme(w) {
  const root = document.documentElement;
  if (w.universe) root.dataset.universe = w.universe;
  if (!w.theme || !/^[a-z0-9-]+$/.test(w.theme)) return;
  root.dataset.theme = w.theme;
  const add = href => new Promise(r => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = l.onerror = r; document.head.append(l); });
  await Promise.all([add(`/assets/themes/${w.theme}/theme.css`), add(`/assets/themes/${w.theme}/painel.css`)]);
}
async function shell() {
  const w = me.wedding;
  state.me = me;
  await applyTheme(w);
  const tabs = VIEWS.filter(v => v.ready !== false && (!v.when || v.when(me)));
  app.innerHTML = `
  <header class="bar"><div class="wrap">
    ${w.theme ? `<a class="brand logo" href="/c/${esc(w.slug)}" target="_blank" rel="noopener"><img src="/assets/themes/${esc(w.theme)}/logo.png" alt="${esc(w.names)}"></a>` : `<a class="brand" href="/">Universo</a>`}
    <nav class="tabs" aria-label="Seções do painel">${tabs.map(v => `<a href="#${v.id}" data-v="${v.id}">${esc(v.label)}</a>`).join("")}</nav>
    <div class="who"><a class="link" href="/c/${esc(w.slug)}" target="_blank" rel="noopener">Ver o site</a><button class="link" type="button" id="logout">Sair</button></div>
  </div></header>
  ${w.is_demo ? `<p class="demo-band">Dados fictícios de demonstração. Pode testar à vontade: nada aqui é real.</p>` : ""}
  <div class="wrap pad" id="view"></div>
  ${w.theme ? `<p class="powered">Painel de ${esc(w.names)} · Universo · Gueta Studio</p>` : ""}`;
  $("#logout").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); location.hash = ""; location.reload(); });
  addEventListener("hashchange", route);
  route();
  for (const load of WIDGETS) load().then(m => m.default?.()).catch(e => console.error(e));
}
async function route() {
  view = location.hash.slice(1) || "geral";
  const tabs = VIEWS.filter(v => v.ready !== false && (!v.when || v.when(me)));
  const v = tabs.find(t => t.id === view) || tabs[0];
  $$(".tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.v === v.id ? "page" : "false"));
  viewEl().onclick = null;
  try { (await v.load()).default(); } catch (e) { viewEl().innerHTML = `<p class="error">Não foi possível abrir esta tela.</p>`; console.error(e); }
}
