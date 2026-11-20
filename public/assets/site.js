/** Site público do casal: /c/:slug  (conteúdo vem de /api/site/:slug; nada pessoal de convidados). */
import { $, $$, esc, longDate, time, countdown, reveal, api, mapsLink, money } from "./ui.js";
import { icon } from "./icons.js";
import { brcode } from "./pix.js";
import { qrcode } from "./vendor/qrcode.js";
import { SITE_MODS } from "./site-mods/index.js";

/** Frases escritas para a identidade de um casal específico (os demais recebem textos genéricos). */
const THEME_TEXT = {
  petalucas: { dress: "Esporte fino, <em>pronto para a pista</em>", quizMid: "Conhece bem o casal. Na festa, puxa a conversa sobre o Djavan." },
};


const slug = location.pathname.split("/")[2];
const app = $("#app");

try {
  const { wedding: w, events, messages, mods } = await api(`/api/site/${slug}`);
  // módulos do site (seções extras): carregados antes de desenhar
  const loaded = (await Promise.all(SITE_MODS.map(l => l().catch(e => { console.error(e); return null; })))).filter(Boolean);
  // pré-visualização de universos só em casamentos de demonstração
  const pick = new URLSearchParams(location.search).get("universo");
  const universe = w.is_demo && ["timeless", "editorial", "dreamscape"].includes(pick) ? pick : w.universe;
  document.documentElement.dataset.universe = universe;
  if (w.theme && /^[a-z0-9-]+$/.test(w.theme)) {
    document.documentElement.dataset.theme = w.theme;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `/assets/themes/${w.theme}/theme.css`; document.head.append(l);
    await new Promise(r => { l.onload = l.onerror = r; });
  }
  document.title = `${w.names} · ${longDate(w.date)}`;
  render(w, events, messages || [], universe, loaded, mods || {});
} catch (e) {
  if (e.status !== 404) console.error(e);
  app.innerHTML = e.status === 404
    ? `<main class="empty wrap"><p class="label">Site não encontrado</p><h1>Não achamos este casamento.</h1><p class="muted">Confira o endereço com os noivos.</p></main>`
    : `<main class="empty wrap"><p class="label">Ops</p><h1>Não conseguimos abrir o site agora.</h1><p class="muted">Atualize a página em alguns instantes.</p></main>`;
} finally { app.removeAttribute("aria-busy"); }

function render(w, events, messages, universe, loaded = [], mods = {}) {
  const [a, b] = w.names.split("&").map(s => s.trim());
  let n = 0;
  const nav = [];
  // seções são montadas como objetos; módulos podem inserir as suas antes de uma seção existente (before: id)
  const sec = (id, label, title, inner, cls = "") => ({ id, label, title, inner, cls });
  const draw = ({ id, label, title, inner, cls = "" }) => {
    nav.push([id, label]);
    return `<section class="sec ${cls}" id="${id}"><div class="wrap"><header class="sh rv"><p class="label"><span class="n">${String(++n).padStart(2, "0")}</span>${label}</p><h2>${title}</h2></header>${inner}</div></section>`;
  };
  const html = [];

  if (w.story.length) html.push(sec("historia", "Nossa história", "Como chegamos <em>até aqui</em>",
    `<ol class="story${w.story.some(s => s.image) ? "" : " no-img"}">${w.story.map(s => `<li class="chapter rv">${s.image ? `<figure data-bg="${esc(s.image)}"></figure>` : ""}<div class="txt"><span class="yr num">${esc(s.year)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join("")}</ol>`));

  if (w.quiz.length) html.push(sec("quiz", "Quiz", "Quanto você conhece <em>o casal?</em>",
    `<div class="quiz rv" id="quizBox" aria-live="polite"></div>`));

  const ev = events.map(e => `<article class="event rv">
      <p class="when"><span class="num">${esc(time(e.starts_at))}</span><span>${esc(longDate(e.starts_at))}</span></p>
      <h3>${esc(e.name)}</h3><p class="venue">${esc(e.venue)}</p>${e.address ? `<p class="addr">${esc(e.address)}</p>` : ""}
      ${e.notes ? `<p class="note">${esc(e.notes)}</p>` : ""}
      ${e.dress_code && !w.dress.length ? `<p class="dress"><span class="label">Traje</span> ${esc(e.dress_code)}</p>` : ""}
      ${e.address ? `<a class="btn ghost sm" href="${esc(mapsLink(e.address))}" target="_blank" rel="noopener">${icon("pin")} Abrir rota no mapa</a>` : ""}
    </article>`).join("");
  const map = w.map_image ? `<figure class="map rv"><img src="${esc(w.map_image)}" alt="Mapa desenhado à mão com o caminho até ${esc(w.venue_name || "o local")}" loading="lazy" width="1920" height="1357"><figcaption>Mapa desenhado à mão · use o botão para abrir a rota</figcaption></figure>` : "";
  const schedule = w.schedule.length ? `<ol class="schedule">${w.schedule.map(s => `<li class="step rv"><span class="t num">${esc(s.time)}</span><span class="dot">${icon(s.icon)}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join("")}</ol>` : "";
  html.push(sec("dia", "O grande dia", "Onde e <em>quando</em>", `<div class="day${map ? " with-map" : ""}"><div class="events">${ev}</div>${map}</div>${schedule ? `<h3 class="sub rv">Cronograma da festa</h3>${schedule}` : ""}`, "alt"));

  if (w.dress.length) html.push(sec("traje", "Traje", (THEME_TEXT[w.theme] || {}).dress || "O que <em>vestir</em>",
    `<div class="dresses">${w.dress.map(d => `<article class="dcard rv"><span class="dico">${icon(d.icon)}</span><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p></article>`).join("")}</div>`));

  html.push(sec("presenca", "Presença", "Confirme pelo <em>seu convite</em>",
    `<div class="rsvp-note rv">${w.rsvp_note ? `<p class="rule-note">${esc(w.rsvp_note)}</p>` : ""}
     <p>Cada convite tem um link pessoal, com o nome de quem foi convidado. É por ele que você confirma, em um minuto, sem preencher nada duas vezes.</p>
     <p class="muted">Responda até ${esc(longDate(w.rsvp_deadline + "T12:00:00-03:00"))}. Não encontrou o seu link? Fale com os noivos.</p></div>`, "alt"));

  if (w.guestbook) html.push(sec("recados", "Mural de recados", "Deixe um <em>carinho</em>",
    `<div class="gb"><form class="gb-form rv" id="gbForm" novalidate>
        <label class="field"><span>Seu nome</span><input class="in" name="author" maxlength="60" autocomplete="name" required></label>
        <label class="field"><span>Mensagem</span><textarea class="in" name="message" rows="4" maxlength="600" placeholder="Um recado, uma memória ou um conselho de casamento…" required></textarea></label>
        <p class="error" id="gbErr" role="alert"></p><button class="btn" type="submit">Enviar recado</button>
        <p class="hint">Os recados aparecem no mural depois que os noivos aprovam.</p></form>
      <ul class="gb-list" aria-live="polite">${messages.map(m => `<li class="gb-item rv"><p>${esc(m.message)}</p><span>${esc(m.author)}</span></li>`).join("") || `<li class="gb-empty muted">Seja a primeira pessoa a deixar um recado.</li>`}</ul></div>`));

  if (w.gifts.length || w.pix_key || w.gift_url) html.push(sec("presentes", "Presentes", "Sua presença é <em>o melhor presente</em>",
    `${w.gifts.length ? `<ul class="gifts${w.gifts.some(g => g.image) ? " photo" : w.gifts.some(g => g.icon) ? " rich" : ""}">${w.gifts.map((g, i) => `<li class="gift rv">${g.image ? `<img class="gimg" src="${esc(g.image)}" alt="" loading="lazy" decoding="async" width="640" height="640">` : g.icon ? `<span class="gico">${icon(g.icon)}</span>` : ""}<div class="gtxt"><h3>${esc(g.title)}</h3>${g.note ? `<p>${esc(g.note)}</p>` : ""}</div><span class="v num">${g.cents ? esc(money(g.cents)) : "Valor livre"}</span>${w.pix_key ? `<button class="btn ghost sm" type="button" data-gift="${i}">Presentear</button>` : ""}</li>`).join("")}</ul>` : ""}
     ${w.gift_url ? `<p class="rv"><a class="btn ghost" href="${esc(w.gift_url)}" target="_blank" rel="noopener">Ver lista de presentes</a></p>` : ""}
     ${w.pix_key ? `<div class="pix rv"><p><span class="label">Pix dos noivos</span> <code>${esc(w.pix_key)}</code></p><span class="pix-acts"><button class="btn sm" type="button" id="pixAny">QR Code</button><button class="btn ghost sm" type="button" id="copyPix">Copiar chave</button></span></div>` : ""}
     <p class="direct rv">O valor vai direto para a conta dos noivos, sem comissão de site de casamento.</p>`, "alt"));

  if (w.faq.length) html.push(sec("duvidas", "Dúvidas", "Bom <em>saber</em>",
    `<div class="faq rv">${w.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>`));

  for (const m of loaded) for (const x of m.sections?.({ w, data: mods[m.name], esc, icon, money, longDate }) || []) {
    const rep = x.replace ? html.findIndex(h => h.id === x.replace) : -1; // replace: id → troca uma seção existente
    if (rep >= 0) { html[rep] = x; continue; }
    const at = x.before ? html.findIndex(h => h.id === x.before) : -1;
    html.splice(at < 0 ? html.length : at, 0, x);
  }
  const sections = html.map(draw);
  const logo = w.theme ? `<img class="hero-logo" src="/assets/themes/${esc(w.theme)}/logo.png" alt="${esc(w.names)}" width="742" height="338">` : "";
  app.innerHTML = `
  <header class="top"><div class="wrap"><a class="mono" href="#topo">${w.theme ? esc(w.names) : `${esc(a?.[0] || "")}<i>&amp;</i>${esc(b?.[0] || "")}`}</a>
    <nav aria-label="Seções">${nav.filter(([id]) => id !== "duvidas").map(([id, l]) => `<a href="#${id}">${esc(l.replace("Nossa história", "História").replace("Mural de recados", "Recados"))}</a>`).join("")}</nav></div></header>
  <main id="conteudo">
    <section class="hero${logo ? " has-logo" : ""}" id="topo">
      ${w.hero_image ? `<figure class="hero-img" data-bg="${esc(w.hero_image)}" role="img" aria-label="Foto do casal"></figure>` : ""}
      <div class="hero-txt wrap">
        <p class="label hero-k">Vamos nos casar!</p>
        ${logo ? `<h1 class="names logo-names">${logo}</h1>` : `<h1 class="names"><span>${esc(a)}</span><i>&amp;</i><span>${esc(b)}</span></h1>`}
        <p class="hero-date">${esc(longDate(w.date))}<span class="dot">·</span>${esc(w.venue_name ? w.venue_name + " · " + w.city : w.city)}</p>
        <div class="cd" id="cd" aria-label="Contagem regressiva"></div>
        <div class="hero-acts"><a class="btn accent" href="#presenca">Confirmar presença</a>${w.story.length ? `<a class="btn ghost" href="#historia">Nossa história</a>` : ""}
          <details class="addcal"><summary class="btn ghost">${icon("calendar")}Salvar na agenda</summary>
            <div class="addcal-menu"><a href="${esc(googleCal(w, events))}" target="_blank" rel="noopener">Google Agenda</a><a href="/c/${esc(w.slug)}/agenda.ics">iPhone, Outlook e outros</a></div></details></div>
        ${w.welcome ? `<p class="welcome">${esc(w.welcome)}</p>` : ""}
      </div>
    </section>
    ${sections.join("")}
  </main>
  <footer class="foot"><div class="wrap"><p>${esc(w.names)} · ${esc(longDate(w.date))}</p><p class="muted">Site feito por <a class="credit" href="https://guetastudio.com.br/?utm_source=casamento&amp;utm_medium=rodape" target="_blank" rel="noopener">Gueta Studio</a></p></div></footer>
  ${w.pix_key ? `<dialog class="pixdlg" id="pixDlg" aria-labelledby="pixT"><div class="dlg-in">
    <button class="x" type="button" id="pixX" aria-label="Fechar">×</button>
    <p class="label">Presente</p><h3 id="pixT"></h3><p class="pv num" id="pixV"></p>
    <label class="field amt" id="pixAmtF" hidden><span>Quanto você quer presentear?</span><input class="in num" id="pixAmt" inputmode="decimal" autocomplete="off" placeholder="R$ 0,00" maxlength="12"></label>
    <div class="qr" id="pixQr" role="img" aria-label="QR Code do Pix"></div>
    <p class="muted small how">No app do banco: <b>Pix › Ler QR Code</b>. Pelo celular, copie o código e use <b>Pix copia e cola</b>.</p>
    <button class="btn accent" type="button" id="pixCode">Copiar código Pix</button>
    <details class="keyalt"><summary>Prefere usar a chave?</summary><div class="pixkey"><code>${esc(w.pix_key)}</code><button class="btn sm" type="button" id="pixCopy">Copiar chave</button></div></details>
    <form class="gave" id="gave" novalidate>
      <p><b>Já fez o Pix?</b> Conte para os noivos que o presente é seu.</p>
      <input class="in" name="author" maxlength="60" placeholder="Seu nome" autocomplete="name" aria-label="Seu nome">
      <textarea class="in" name="message" rows="2" maxlength="400" placeholder="Um recadinho junto com o presente (opcional)" aria-label="Recado (opcional)"></textarea>
      <p class="error" id="gaveErr" role="alert"></p>
      <button class="btn ghost" type="submit">Já presenteei</button>
    </form>
    <p class="gave-ok" id="gaveOk" role="status" hidden><b>Obrigado pelo carinho!</b> Os noivos vão receber o seu aviso.</p>
    <p class="direct">O valor vai direto para a conta dos noivos, sem intermediário e sem comissão.</p>
  </div></dialog>` : ""}
  ${w.is_demo ? `<p class="demo" role="note">Casamento fictício de demonstração · universo ${esc(universe)} · <a href="/">conheça o Universo</a></p>` : ""}`;

  // imagens de fundo via CSSOM (a política de segurança bloqueia estilos inline)
  $$("[data-bg]").forEach(el => { if (el.dataset.bg) el.style.backgroundImage = `url("${el.dataset.bg.replace(/"/g, "")}")`; });
  countdown($("#cd"), w.date);
  $("#gbForm")?.addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, err = $("#gbErr"), btn = f.querySelector("button"); err.textContent = "";
    if (f.author.value.trim().length < 2 || f.message.value.trim().length < 2) { err.textContent = "Escreva seu nome e uma mensagem."; return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    try { await api(`/api/site/${slug}/recados`, { method: "POST", body: { author: f.author.value, message: f.message.value } });
      f.innerHTML = `<p class="gb-ok"><b>Recado enviado!</b><br>Ele aparece no mural assim que os noivos aprovarem. Obrigado pelo carinho.</p>`; }
    catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Enviar recado"; }
  });
  if (w.pix_key) gifts(w);
  if (w.quiz.length) quiz($("#quizBox"), w);

  const onScroll = () => document.body.classList.toggle("scrolled", scrollY > innerHeight * .6);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  requestAnimationFrame(() => document.body.classList.add("ready"));
  for (const m of loaded) try { m.init?.({ w, data: mods[m.name], slug, api, $, $$, esc }); } catch (e) { console.error(e); }
  reveal();
  if (w.theme) import(`/assets/themes/${w.theme}/theme.js`).then(m => m.site?.()).catch(() => {}); // animações da identidade (opcional)
}

/** Link "adicionar ao Google Agenda" com os mesmos dados do .ics (só dados públicos do site). */
function googleCal(w, events) {
  const start = new Date(w.date), end = new Date(start.getTime() + 7 * 3600e3);
  const f = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const main = events.find(e => e.address) || events[0] || {};
  const place = [main.venue || w.venue_name, main.address || w.city].filter(Boolean).join(" · ");
  const q = new URLSearchParams({ action: "TEMPLATE", text: `Casamento ${w.names}`, dates: `${f(start)}/${f(end)}`,
    details: `Confirme presença, veja o cronograma e o traje no site: ${location.origin}/c/${w.slug}`, location: place });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}

/** Presentes: QR Code e "copia e cola" do Pix com o valor do presente, e o aviso "Já presenteei" para os noivos. */
function gifts(w) {
  const dlg = $("#pixDlg"), amt = $("#pixAmt"), gave = $("#gave");
  let gift = -1, code = "";
  const cents = () => { const g = w.gifts[gift]; return g?.cents > 0 ? g.cents : parseCents(amt.value); };
  const draw = () => {
    const c = cents(), g = w.gifts[gift];
    code = brcode({ key: w.pix_key, name: w.pix_name, city: w.pix_city, cents: c, description: g ? "Presente " + g.title : "Presente" });
    const q = qrcode(0, "M"); q.addData(code); q.make();
    const n = q.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) d += `M${k + 4} ${r + 4}h1v1h-1z`;
    $("#pixQr").innerHTML = `<svg viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" aria-hidden="true"><rect class="qbg" width="${n + 8}" height="${n + 8}"/><path d="${d}"/></svg>`;
    if (!(g?.cents > 0)) $("#pixV").textContent = c ? money(c) : "Valor livre";
    $("#pixCode").textContent = "Copiar código Pix";
  };
  const copy = async (btn, text, done) => { try { await navigator.clipboard.writeText(text); btn.textContent = done; } catch { btn.textContent = "Não deu para copiar. Use a chave abaixo."; } };
  const openGift = i => {
    gift = i; const g = w.gifts[i];
    $("#pixT").textContent = g ? g.title : "Pix dos noivos";
    $("#pixV").textContent = g?.cents ? money(g.cents) : "Valor livre";
    $("#pixAmtF").hidden = g?.cents > 0; amt.value = "";
    $("#pixCopy").textContent = "Copiar chave";
    gave.hidden = false; $("#gaveOk").hidden = true; $("#gaveErr").textContent = "";
    draw(); dlg.showModal();
  };
  $$("[data-gift]").forEach(b => b.addEventListener("click", () => openGift(+b.dataset.gift)));
  $("#pixAny")?.addEventListener("click", () => openGift(-1));
  $("#copyPix")?.addEventListener("click", e => copy(e.target, w.pix_key, "Copiada!"));
  $("#pixCopy").addEventListener("click", e => copy(e.target, w.pix_key, "Copiada!"));
  $("#pixCode").addEventListener("click", e => copy(e.target, code, "Código copiado! Cole no app do banco"));
  amt.addEventListener("input", draw);
  $("#pixX").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  gave.addEventListener("submit", async e => {
    e.preventDefault(); const err = $("#gaveErr"), btn = gave.querySelector("button"); err.textContent = "";
    if (gave.author.value.trim().length < 2) { err.textContent = "Escreva seu nome para os noivos saberem quem presenteou."; gave.author.focus(); return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      await api(`/api/site/${slug}/presentes`, { method: "POST", body: { gift: gift >= 0 ? gift : null, cents: cents() || null, author: gave.author.value, message: gave.message.value } });
      gave.hidden = true; gave.reset(); $("#gaveOk").hidden = false;
    } catch (x) { err.textContent = x.message; }
    btn.disabled = false; btn.textContent = "Já presenteei";
  });
}
/** "1.234,56", "50", "R$ 80,5" → centavos */
function parseCents(v) {
  v = String(v || "").replace(/[R$\s]/g, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) && n > 0 && n <= 10000000 ? n : 0;
}

/** Quiz "Quanto você conhece o casal?" — uma pergunta por vez, com a curiosidade depois de cada resposta. */
function quiz(box, w) {
  const Q = w.quiz; let i = 0, score = 0;
  const band = n => n === Q.length ? ["Testemunha oficial dessa história!", "Você sabe tudo. Já pode contar essa história no brinde."]
    : n >= Q.length - 2 ? ["Quase da família!", (THEME_TEXT[w.theme] || {}).quizMid || "Conhece bem o casal. Na festa, puxa assunto sobre essa história."]
    : ["Vem com a gente na pista!", "Ainda dá tempo de conhecer melhor: senta perto deles e pede a história completa."];
  const draw = () => {
    if (i >= Q.length) {
      const [t, d] = band(score);
      const msg = `Fiz ${score}/${Q.length} no quiz de ${w.names}! E você, quanto conhece o casal? ${location.origin}${location.pathname}#quiz`;
      box.innerHTML = `<div class="qend"><p class="qscore num">${score}<span>/${Q.length}</span></p><h3>${esc(t)}</h3><p>${esc(d)}</p>
        <div class="qacts"><a class="btn" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Desafiar no WhatsApp</a><button class="btn ghost" type="button" id="qAgain">Jogar de novo</button></div></div>`;
      $("#qAgain").onclick = () => { i = 0; score = 0; draw(); };
      return;
    }
    const q = Q[i];
    box.innerHTML = `<div class="qhead"><span class="num">${i + 1} de ${Q.length}</span><span class="qbar"><i></i></span></div>
      <h3 class="qq">${esc(q.q)}</h3><div class="qopts">${q.options.map((o, k) => `<button class="qopt" type="button" data-k="${k}">${esc(o)}</button>`).join("")}</div><div class="qfact" hidden></div>`;
    box.querySelector(".qbar i").style.width = (i / Q.length * 100) + "%";
    box.querySelectorAll(".qopt").forEach(b => b.onclick = () => {
      const k = +b.dataset.k, right = k === q.answer;
      if (right) score++;
      box.querySelectorAll(".qopt").forEach(x => { x.disabled = true; if (+x.dataset.k === q.answer) x.classList.add("right"); });
      if (!right) b.classList.add("wrong");
      const f = box.querySelector(".qfact"); f.hidden = false;
      f.innerHTML = `<p><b>${right ? "Acertou!" : "Quase!"}</b> ${esc(q.fact)}</p><button class="btn sm" type="button">${i + 1 < Q.length ? "Próxima" : "Ver resultado"}</button>`;
      f.querySelector("button").onclick = () => { i++; draw(); };
      f.querySelector("button").focus();
    });
  };
  draw();
}
