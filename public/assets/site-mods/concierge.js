/**
 * Concierge do convidado ("Pergunte aos noivos"): site público e convite pessoal.
 * As respostas vêm do servidor e usam só o que o casal publicou; cada resposta mostra a fonte.
 */
export const name = "experiencias";

export function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l);
}
const escH = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const BASE_CHIPS = ["Onde é?", "Que horas começa?", "Como chegar?", "Tem estacionamento?", "Qual é o traje?", "Posso levar acompanhante?"];

/** Desenha o concierge dentro de `host`. endpoint = "/api/site/:slug/concierge" ou "/api/invite/:token/concierge". */
export function mountConcierge(host, { endpoint, api, invite = false }) {
  loadCss("/assets/site-mods/concierge.css");
  const chips = invite ? [...BASE_CHIPS.slice(0, 4), "Qual é a minha mesa?", "Tem opção vegetariana?"] : BASE_CHIPS;
  host.innerHTML = `<div class="cc">
    <div class="cc-intro">
      <p class="cc-lead">Respondemos só com o que os noivos já contaram${invite ? " neste convite e no site" : " por aqui"}. Se ainda não souberem, a gente diz.</p>
      <form class="cc-form" novalidate>
        <label class="sr" for="ccQ">Sua pergunta</label>
        <input class="in cc-in" id="ccQ" name="q" maxlength="200" autocomplete="off" placeholder="Ex.: tem estacionamento?" enterkeyhint="send">
        <button class="btn accent cc-go" type="submit">Perguntar</button>
      </form>
      <div class="cc-chips" role="list" aria-label="Perguntas frequentes">${chips.map(c => `<button class="cc-chip" type="button" role="listitem">${escH(c)}</button>`).join("")}</div>
    </div>
    <ol class="cc-log" aria-live="polite" aria-label="Respostas"></ol>
  </div>`;
  const form = host.querySelector(".cc-form"), input = form.q, log = host.querySelector(".cc-log"), go = form.querySelector("button");
  const askQ = async q => {
    q = q.trim(); if (!q) { input.focus(); return; }
    const li = document.createElement("li"); li.className = "cc-turn";
    li.innerHTML = `<p class="cc-q">${escH(q)}</p><div class="cc-a is-wait"><span class="cc-dots" aria-label="Procurando"><i></i><i></i><i></i></span></div>`;
    log.prepend(li); while (log.children.length > 4) log.lastElementChild.remove();
    go.disabled = true; input.value = "";
    try {
      const r = await api(`${endpoint}?q=${encodeURIComponent(q)}`);
      li.querySelector(".cc-a").outerHTML = `<div class="cc-a${r.known ? "" : " is-unknown"}">${r.items.map(i => `<div class="cc-item">
        <p>${escH(i.text)}</p>
        <p class="cc-meta">${i.source ? `<span class="cc-src">Fonte: ${escH(i.source)}</span>` : ""}${i.link ? `<a class="cc-link" href="${escH(i.link)}" target="_blank" rel="noopener">${escH(i.link_label || "Abrir")} <span aria-hidden="true">↗</span></a>` : ""}</p>
      </div>`).join("")}${r.known ? "" : `<p class="cc-meta cc-ask">${invite ? `Pergunte direto aos noivos, ou deixe um recado no <a href="#rsvp">formulário de confirmação</a>.` : "Pergunte direto aos noivos: eles vão adorar ajudar."}</p>`}</div>`;
    } catch (e) {
      li.querySelector(".cc-a").outerHTML = `<div class="cc-a is-unknown"><p>${e.status === 429 ? "Muitas perguntas seguidas. Tente de novo em alguns minutos." : "Não consegui responder agora. Tente de novo."}</p></div>`;
    }
    go.disabled = false;
  };
  form.addEventListener("submit", e => { e.preventDefault(); askQ(input.value); });
  host.querySelectorAll(".cc-chip").forEach(b => b.addEventListener("click", () => askQ(b.textContent)));
}

/** Site público: seção "Pergunte aos noivos" no fim (depois das dúvidas). */
export function sections({ data }) {
  if (!data?.concierge) return [];
  return [{ id: "pergunte", label: "Pergunte", title: "Ainda com <em>dúvida?</em>", inner: `<div class="rv" id="ccHost"></div>`, cls: "alt cc-sec" }];
}
export function init({ data, slug, api, $ }) {
  if (!data?.concierge) return;
  const host = $("#ccHost");
  if (host) mountConcierge(host, { endpoint: `/api/site/${slug}/concierge`, api });
}
