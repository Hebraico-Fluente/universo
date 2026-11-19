/** Site público do casal: /c/:slug  (conteúdo vem de /api/site/:slug; nada pessoal de convidados). */
import { $, $$, esc, longDate, time, countdown, reveal, api, mapsLink, money } from "./ui.js";
import { icon } from "./icons.js";

const slug = location.pathname.split("/")[2];
const app = $("#app");

try {
  const { wedding: w, events, messages } = await api(`/api/site/${slug}`);
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
  render(w, events, messages || [], universe);
} catch (e) {
  app.innerHTML = `<main class="empty wrap"><p class="label">Site não encontrado</p><h1>Não achamos este casamento.</h1><p class="muted">Confira o endereço com os noivos.</p></main>`;
} finally { app.removeAttribute("aria-busy"); }

function render(w, events, messages, universe) {
  const [a, b] = w.names.split("&").map(s => s.trim());
  let n = 0;
  const nav = [];
  const sec = (id, label, title, inner, cls = "") => {
    nav.push([id, label]);
    return `<section class="sec ${cls}" id="${id}"><div class="wrap"><header class="sh rv"><p class="label"><span class="n">${String(++n).padStart(2, "0")}</span>${label}</p><h2>${title}</h2></header>${inner}</div></section>`;
  };
  const html = [];

  if (w.story.length) html.push(sec("historia", "Nossa história", "Como chegamos <em>até aqui</em>",
    `<ol class="story${w.story.some(s => s.image) ? "" : " no-img"}">${w.story.map(s => `<li class="chapter rv">${s.image ? `<figure data-bg="${esc(s.image)}"></figure>` : ""}<div class="txt"><span class="yr num">${esc(s.year)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join("")}</ol>`));

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

  if (w.dress.length) html.push(sec("traje", "Traje", "Esporte fino, <em>pronto para a pista</em>",
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
    `${w.gifts.length ? `<ul class="gifts">${w.gifts.map(g => `<li class="gift rv"><h3>${esc(g.title)}</h3><span class="v num">${g.cents ? esc(money(g.cents)) : "Valor livre"}</span></li>`).join("")}</ul>` : ""}
     ${w.gift_url ? `<p class="rv"><a class="btn ghost" href="${esc(w.gift_url)}" target="_blank" rel="noopener">Ver lista de presentes</a></p>` : ""}
     ${w.pix_key ? `<div class="pix rv"><p><span class="label">Pix dos noivos</span> <code>${esc(w.pix_key)}</code></p><button class="btn sm" type="button" id="copyPix">Copiar chave</button></div>` : ""}
     <p class="direct rv">O valor vai direto para a conta dos noivos, sem comissão de site de casamento.</p>`, "alt"));

  if (w.faq.length) html.push(sec("duvidas", "Dúvidas", "Bom <em>saber</em>",
    `<div class="faq rv">${w.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>`));

  const logo = w.theme ? `<img class="hero-logo" src="/assets/themes/${esc(w.theme)}/logo.png" alt="${esc(w.names)}" width="742" height="338">` : "";
  app.innerHTML = `
  <header class="top"><div class="wrap"><a class="mono" href="#topo">${w.theme ? esc(w.names) : `${esc(a?.[0] || "")}<i>&amp;</i>${esc(b?.[0] || "")}`}</a>
    <nav aria-label="Seções">${nav.filter(([id]) => id !== "duvidas").map(([id, l]) => `<a href="#${id}">${esc(l.replace("Nossa ", "").replace("Mural de recados", "Recados"))}</a>`).join("")}</nav></div></header>
  <main id="conteudo">
    <section class="hero${logo ? " has-logo" : ""}" id="topo">
      ${w.hero_image ? `<figure class="hero-img" data-bg="${esc(w.hero_image)}" role="img" aria-label="Foto do casal"></figure>` : ""}
      <div class="hero-txt wrap">
        <p class="label hero-k">Vamos nos casar!</p>
        ${logo ? `<h1 class="names logo-names">${logo}</h1>` : `<h1 class="names"><span>${esc(a)}</span><i>&amp;</i><span>${esc(b)}</span></h1>`}
        <p class="hero-date">${esc(longDate(w.date))}<span class="dot">·</span>${esc(w.venue_name ? w.venue_name + " · " + w.city : w.city)}</p>
        <div class="cd" id="cd" aria-label="Contagem regressiva"></div>
        <div class="hero-acts"><a class="btn accent" href="#presenca">Confirmar presença</a>${w.story.length ? `<a class="btn ghost" href="#historia">Nossa história</a>` : ""}</div>
        ${w.welcome ? `<p class="welcome">${esc(w.welcome)}</p>` : ""}
      </div>
    </section>
    ${html.join("")}
  </main>
  <footer class="foot"><div class="wrap"><p>${esc(w.names)} · ${esc(longDate(w.date))}</p><p class="muted">Site feito com Universo · Gueta Studio</p></div></footer>
  ${w.is_demo ? `<p class="demo" role="note">Casamento fictício de demonstração · universo ${esc(universe)} · <a href="/">conheça o Universo</a></p>` : ""}`;

  // imagens de fundo via CSSOM (a política de segurança bloqueia estilos inline)
  $$("[data-bg]").forEach(el => { if (el.dataset.bg) el.style.backgroundImage = `url("${el.dataset.bg.replace(/"/g, "")}")`; });
  countdown($("#cd"), w.date);
  $("#copyPix")?.addEventListener("click", async e => { try { await navigator.clipboard.writeText(w.pix_key); e.target.textContent = "Copiada!"; } catch { e.target.textContent = w.pix_key; } });
  $("#gbForm")?.addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, err = $("#gbErr"), btn = f.querySelector("button"); err.textContent = "";
    if (f.author.value.trim().length < 2 || f.message.value.trim().length < 2) { err.textContent = "Escreva seu nome e uma mensagem."; return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    try { await api(`/api/site/${slug}/recados`, { method: "POST", body: { author: f.author.value, message: f.message.value } });
      f.innerHTML = `<p class="gb-ok"><b>Recado enviado!</b><br>Ele aparece no mural assim que os noivos aprovarem. Obrigado pelo carinho.</p>`; }
    catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Enviar recado"; }
  });
  const onScroll = () => document.body.classList.toggle("scrolled", scrollY > innerHeight * .6);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  requestAnimationFrame(() => document.body.classList.add("ready"));
  reveal();
  if (w.theme) import(`/assets/themes/${w.theme}/theme.js`).then(m => m.site?.()).catch(() => {}); // animações da identidade (opcional)
}
