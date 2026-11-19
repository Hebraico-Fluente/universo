/** Convite pessoal: /i/:token  — envelope, mensagem, eventos da família e RSVP por pessoa e por evento. */
import { $, $$, esc, longDate, time, api, mapsLink, reduceMotion } from "./ui.js";

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
  $("#open").disabled = true;
  setTimeout(renderInvite, 1700);
}

function renderInvite(scrollTo) {
  const { wedding: w, household: h, events, guests, responses, open: isOpen } = data;
  const resp = (g, e) => responses.find(r => r.guest_id === g && r.event_id === e)?.status || "";
  const answered = responses.length > 0;
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

    <section class="wrap rsvp" id="rsvp" aria-labelledby="rsvp-t">
      <header class="rv"><h2 id="rsvp-t">${answered ? "Suas respostas" : "Vocês vêm?"}</h2>
        ${w.rsvp_note ? `<p class="rule-note">${esc(w.rsvp_note)}</p>` : ""}
        <p class="muted">${isOpen ? `Responda até ${esc(longDate(w.rsvp_deadline + "T12:00:00-03:00"))}. Dá para mudar depois, até o prazo.` : "O prazo de confirmação terminou. Para mudar algo, fale direto com os noivos."}</p></header>
      <form id="form" class="rv" novalidate>
        ${guests.map(g => `<fieldset class="person">
          <legend><span class="pname">${esc(g.name)}</span>${g.is_child ? `<span class="tag no">criança</span>` : ""}</legend>
          ${events.map(e => `<div class="row"><span class="ename">${esc(e.name)}</span>
            <div class="seg" role="radiogroup" aria-label="${esc(g.name)} · ${esc(e.name)}">
              <label><input type="radio" name="r_${g.id}_${e.id}" value="yes" ${resp(g.id, e.id) === "yes" ? "checked" : ""} ${isOpen ? "" : "disabled"}><span>Vou</span></label>
              <label><input type="radio" name="r_${g.id}_${e.id}" value="no" ${resp(g.id, e.id) === "no" ? "checked" : ""} ${isOpen ? "" : "disabled"}><span>Não vou</span></label>
            </div></div>`).join("")}
          <details class="more"${g.diet || g.accessibility ? " open" : ""}><summary>Restrição alimentar ou acessibilidade <span class="muted">(opcional)</span></summary>
            <div class="grid2">
              <label class="field"><span>Restrição alimentar</span><input class="in" name="diet_${g.id}" maxlength="160" value="${esc(g.diet)}" placeholder="Ex.: vegetariana, sem glúten" ${isOpen ? "" : "disabled"}></label>
              <label class="field"><span>Acessibilidade</span><input class="in" name="acc_${g.id}" maxlength="160" value="${esc(g.accessibility)}" placeholder="Ex.: cadeira de rodas" ${isOpen ? "" : "disabled"}></label>
            </div></details>
        </fieldset>`).join("")}
        <label class="field note"><span>Recado para os noivos <span class="muted">(opcional)</span></span><textarea class="in" name="note" rows="3" maxlength="600" ${isOpen ? "" : "disabled"}>${esc(h.note)}</textarea></label>
        <p class="priv">🔒 Seus dados servem só para organizar o casamento, ficam visíveis apenas para os noivos e são apagados depois da festa.</p>
        <p class="error" id="err" role="alert"></p>
        ${isOpen ? `<button class="btn accent" type="submit" id="send">${answered ? "Atualizar respostas" : "Enviar confirmação"}</button>` : ""}
      </form>
      <div class="done" id="done" hidden tabindex="-1"><p class="label">Recebido</p><h2 id="doneT"></h2><p class="muted">Você pode voltar a este link para mudar as respostas até o prazo.</p><button class="link" type="button" id="edit">Ver ou alterar respostas</button></div>
    </section>

    <footer class="wrap inv-foot rv">
      <a class="btn ghost" href="/c/${esc(w.slug)}">Ver o site do casamento</a>
      <a class="btn ghost" id="share" href="#" target="_blank" rel="noopener">Enviar para quem está no convite</a>
    </footer>
  </article>
  ${w.is_demo ? `<p class="demo" role="note">Convite fictício de demonstração · <a href="/">conheça o Universo</a></p>` : ""}`;

  $("#share").href = "https://wa.me/?text=" + encodeURIComponent(`Nosso convite para o casamento de ${w.names}. Este link é só da nossa família: ${location.href}`);
  $("#form").addEventListener("submit", submit);
  $("#edit").addEventListener("click", () => { $("#done").hidden = true; $("#form").hidden = false; });
  import("./ui.js").then(m => m.reveal());
  if (scrollTo) $(scrollTo)?.scrollIntoView();
}

async function submit(e) {
  e.preventDefault();
  const f = e.target, err = $("#err");
  err.textContent = "";
  const responses = [], details = [];
  for (const g of data.guests) {
    for (const ev of data.events) {
      const v = f[`r_${g.id}_${ev.id}`]?.value;
      if (v) responses.push({ guest_id: g.id, event_id: ev.id, status: v });
    }
    details.push({ guest_id: g.id, diet: f[`diet_${g.id}`].value, accessibility: f[`acc_${g.id}`].value });
  }
  const missing = data.guests.length * data.events.length - responses.length;
  if (missing > 0) { err.textContent = `Falta responder ${missing} ${missing > 1 ? "itens" : "item"}. Marque “Vou” ou “Não vou” em cada evento.`; return; }
  const btn = $("#send"); btn.disabled = true; btn.textContent = "Enviando…";
  try {
    await api(`/api/invite/${token}/rsvp`, { method: "POST", body: { responses, details, note: f.note.value } });
    data = await api(`/api/invite/${token}`);
    const yes = responses.filter(r => r.status === "yes").length;
    renderInvite();
    $("#form").hidden = true; const done = $("#done"); done.hidden = false;
    $("#doneT").textContent = yes ? "Que alegria! Está confirmado." : "Que pena. Obrigado por avisar.";
    done.scrollIntoView({ block: "center" }); done.focus({ preventScroll: true });
  } catch (x) {
    err.textContent = x.message; btn.disabled = false; btn.textContent = "Tentar de novo";
  }
}
