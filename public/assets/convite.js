/** Convite pessoal: /i/:token  — envelope, mensagem, eventos da família e RSVP por pessoa e por evento. */
import { $, $$, esc, longDate, time, api, mapsLink, reduceMotion } from "./ui.js";
import { INVITE_MODS } from "./invite-mods/index.js";
import { mountRsvp, loadCss } from "./invite-mods/rsvp-form.js";

const token = location.pathname.split("/")[2];
const app = $("#app");
let data;

try {
  data = await api(`/api/invite/${token}`);
  document.documentElement.dataset.universe = data.wedding.universe;
  if (data.wedding.theme && /^[a-z0-9-]+$/.test(data.wedding.theme)) {
    document.documentElement.dataset.theme = data.wedding.theme;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `/assets/themes/${data.wedding.theme}/theme.css`; document.head.append(l);
    await new Promise(r => { l.onload = l.onerror = r; });
  }
  document.title = `Convite · ${data.wedding.names}`;
  renderEnvelope();
} catch (e) {
  app.innerHTML = `<section class="gone wrap"><p class="label">Convite</p><h1>${e.status === 429 ? "Muitas tentativas agora." : "Não encontramos este convite."}</h1>
    <p class="muted">${e.status === 429 ? "Espere alguns minutos e abra o link de novo." : "O link pode ter sido trocado pelos noivos. Peça um link novo a eles."}</p></section>`;
} finally { app.removeAttribute("aria-busy"); }

function initials(names) { return names.split("&").map(s => s.trim()[0] || "").join("&"); }

function renderEnvelope() {
  const { wedding: w, household: h } = data;
  app.innerHTML = `
  <section class="stage" aria-label="Envelope do convite">
    <p class="for label">Para</p>
    <p class="to">${esc(h.greeting)}</p>
    <div class="env" id="env">
      <div class="env-back"></div>
      <article class="card" aria-hidden="true"><p class="label">Vamos nos casar</p>${w.theme ? `<img class="card-logo" src="/assets/themes/${esc(w.theme)}/logo.png" alt="">` : `<p class="card-names">${esc(w.names)}</p>`}<p class="card-date">${esc(longDate(w.date))}</p></article>
      <div class="env-front"></div>
      <div class="env-flap"></div>
      <span class="seal">${esc(initials(w.names))}</span>
    </div>
    <button class="btn accent open" type="button" id="open">Abrir o convite</button>
    <p class="muted small">Convite pessoal. Por favor, não compartilhe este link fora da sua família.</p>
  </section>
  ${w.is_demo ? `<p class="demo" role="note">Convite fictício de demonstração · <a href="/">conheça o Universo</a></p>` : ""}`;
  $("#open").addEventListener("click", open);
}

function open() {
  const env = $("#env");
  if (reduceMotion()) return renderInvite();
  env.classList.add("opening");
  if (data.wedding.theme) import(`/assets/themes/${data.wedding.theme}/theme.js`).then(m => m.envelope?.(env)).catch(() => {});
  $("#open").disabled = true;
  setTimeout(renderInvite, 1700);
}

/** Mesa da família, quando o casal liberou ("mostrar mesas aos convidados"). */
function tableLine() {
  const t = data.mods?.convidados?.tables; if (!t || !t.length) return "";
  const byGuest = Object.fromEntries(t.map(x => [x.guest_id, x.table_name]));
  const seated = data.guests.filter(g => byGuest[g.id]);
  const names = [...new Set(seated.map(g => byGuest[g.id]))];
  return `<section class="wrap inv-table rv" aria-labelledby="tb-t"><div class="tb-card">
    <p class="label" id="tb-t">${names.length === 1 ? "Sua mesa" : "Suas mesas"}</p>
    ${names.length === 1 ? `<p class="tb-name">${esc(names[0])}</p>` : `<ul class="tb-list">${seated.map(g => `<li><span>${esc(g.name)}</span><b>${esc(byGuest[g.id])}</b></li>`).join("")}</ul>`}
  </div></section>`;
}

async function renderInvite() {
  const { wedding: w, household: h, events, responses, open: isOpen } = data;
  await loadCss();
  app.innerHTML = `
  <article class="invite">
    <header class="inv-head wrap rv">
      <p class="label">Convite para ${esc(h.greeting)}</p>
      ${w.theme ? `<h1 class="logo-h"><img src="/assets/themes/${esc(w.theme)}/logo.png" alt="${esc(w.names)}" width="742" height="338"></h1>` : `<h1>${esc(w.names.split("&")[0].trim())} <i>&amp;</i> ${esc(w.names.split("&")[1]?.trim() || "")}</h1>`}
      <p class="inv-date">${esc(longDate(w.date))} · ${esc(w.city)}</p>
      ${h.message ? `<blockquote class="msg">${esc(h.message)}</blockquote>` : ""}
    </header>

    <section class="wrap inv-events" aria-labelledby="ev-t">
      <h2 id="ev-t" class="label rv">${events.length > 1 ? `Você foi convidado para ${events.length} momentos` : "Você foi convidado para"}</h2>
      <ol class="ev-list">${events.map((e, i) => `<li class="ev rv">
        <span class="i num">${String(i + 1).padStart(2, "0")}</span>
        <div><h3>${esc(e.name)}</h3><p class="t">${esc(longDate(e.starts_at))} · ${esc(time(e.starts_at))}</p>
        <p>${esc(e.venue)}${e.dress_code ? ` · Traje: ${esc(e.dress_code)}` : ""}</p>${e.notes ? `<p class="muted">${esc(e.notes)}</p>` : ""}</div>
        ${e.address ? `<a class="btn ghost sm" href="${esc(mapsLink(e.address))}" target="_blank" rel="noopener">Mapa</a>` : ""}
      </li>`).join("")}</ol>
    </section>

    ${tableLine()}

    <section class="wrap rsvp" id="rsvp" aria-labelledby="rsvp-t">
      <header class="rv"><h2 id="rsvp-t">${responses.length ? "Suas respostas" : "Vocês vêm?"}</h2>
        ${w.rsvp_note ? `<p class="rule-note">${esc(w.rsvp_note)}</p>` : ""}
        <p class="muted">${isOpen ? `Responda até ${esc(longDate(w.rsvp_deadline + "T12:00:00-03:00"))}. Dá para mudar depois, até o prazo.` : "O prazo de confirmação terminou. Para mudar algo, fale direto com os noivos."}</p></header>
      <div id="rsvpForm" class="rv"></div>
    </section>

    <div id="invMods"></div>
    <footer class="wrap inv-foot rv">
      <a class="btn ghost" href="/c/${esc(w.slug)}">Ver o site do casamento</a>
      <a class="btn ghost" id="share" href="#" target="_blank" rel="noopener">Enviar para quem está no convite</a>
    </footer>
  </article>
  ${w.is_demo ? `<p class="demo" role="note">Convite fictício de demonstração · <a href="/">conheça o Universo</a></p>` : ""}`;

  $("#share").href = "https://wa.me/?text=" + encodeURIComponent(`Nosso convite para o casamento de ${w.names}. Este link é só da nossa família: ${location.href}`);
  mountRsvp($("#rsvpForm"), { token, data, onData: d => { data = d; $("#rsvp-t").textContent = d.responses.length ? "Suas respostas" : "Vocês vêm?"; } });
  for (const l of INVITE_MODS) l().then(m => m.init?.({ data, mods: data.mods || {}, root: $("#invMods"), token, api, esc })).catch(e => console.error(e));
  import("./ui.js").then(m => m.reveal());
}
