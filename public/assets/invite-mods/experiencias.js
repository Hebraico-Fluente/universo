/**
 * Experiências no convite pessoal (só dados desta família, vindos de mods.experiencias):
 * mensagem secreta (envelope), passaporte multi-evento com check-in, quest sem ranking e concierge.
 */
import { mountConcierge, loadCss } from "../site-mods/concierge.js";

const TZ = "America/Sao_Paulo";
const fmt = (iso, o) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...o }).format(new Date(iso));
const day = iso => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const hour = iso => fmt(iso, { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
const maps = q => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
const media = u => String(u || "").replace(/^\/m\//, "/api/media/");
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function init({ data, mods, root, token, api, esc }) {
  const x = mods.experiencias;
  if (!x) return;
  loadCss("/assets/invite-mods/experiencias.css");
  const parts = [];
  for (const s of x.secrets || []) parts.push(`<section class="wrap xp-sec xp-secret rv" aria-label="Mensagem secreta">
    <div class="xp-env${s.opened ? " open" : ""}" data-secret="${esc(s.id)}">
      <div class="xp-env-face">
        <p class="label">Só para vocês</p>
        <h2>Uma mensagem só para vocês</h2>
        <p class="muted">Os noivos escreveram isto pensando em ${esc(data.household.greeting)}. Ninguém mais vê.</p>
        <button class="btn accent" type="button" data-open>${s.opened ? "Ler de novo" : "Abrir a mensagem"}</button>
      </div>
      <div class="xp-letter" hidden tabindex="-1">
        ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}
        <p class="xp-body">${esc(s.body)}</p>
        ${s.media_url ? (s.media_type === "video" ? `<video class="xp-media" controls preload="metadata" src="${esc(media(s.media_url))}"></video>` : `<img class="xp-media" src="${esc(media(s.media_url))}" alt="Imagem enviada pelos noivos junto com a mensagem" loading="lazy">`) : ""}
        <p class="xp-sign">${esc(data.wedding.names)}</p>
      </div>
    </div></section>`);

  if (x.passport?.length) parts.push(`<section class="wrap xp-sec rv" aria-labelledby="xpPassT">
    <header class="xp-h"><p class="label">Passaporte</p><h2 id="xpPassT">Sua programação, carimbo a carimbo</h2>
      <p class="muted">Vocês foram chamados para ${x.passport.length} momentos. No dia de cada um, toquem em “Cheguei” para carimbar.</p></header>
    <ol class="xp-pass">${x.passport.map((e, i) => `<li class="xp-stamp${e.checked_at ? " done" : ""}" data-ev="${esc(e.id)}">
      <span class="xp-n num">${String(i + 1).padStart(2, "0")}</span>
      <div class="xp-st-b"><h3>${esc(e.name)}</h3><p class="xp-when">${esc(day(e.starts_at))} · ${esc(hour(e.starts_at))}</p>
        <p class="muted">${esc(e.venue)}${e.dress_code ? ` · Traje: ${esc(e.dress_code)}` : ""}</p>
        <p class="xp-st-acts">${e.address ? `<a class="xp-link" href="${esc(maps(e.address))}" target="_blank" rel="noopener">Abrir no mapa ↗</a>` : ""}</p></div>
      <div class="xp-seal-w">${e.checked_at ? `<span class="xp-seal" role="img" aria-label="Carimbado">Carimbado</span>`
        : e.today ? `<button class="btn sm" type="button" data-checkin="${esc(e.id)}">Cheguei</button>` : `<span class="xp-wait">Check-in no dia</span>`}</div>
    </li>`).join("")}</ol></section>`);

  if (x.quest?.length) parts.push(`<section class="wrap xp-sec rv" aria-labelledby="xpQT">
    <header class="xp-h"><p class="label">Quest</p><h2 id="xpQT">Pequenas missões para a festa</h2>
      <p class="muted">Sem pontos e sem ranking: é só para a festa ficar ainda melhor. Marquem o que já fizeram.</p></header>
    <ul class="xp-quest">${x.quest.map(c => `<li><label class="xp-q${c.done ? " done" : ""}"><input type="checkbox" data-quest="${esc(c.id)}" ${c.done ? "checked" : ""}>
      <span class="xp-box" aria-hidden="true"></span><span class="xp-qt"><b>${esc(c.title)}</b>${c.text ? `<span>${esc(c.text)}</span>` : ""}</span></label></li>`).join("")}</ul>
    <p class="xp-qnote muted" aria-live="polite"></p></section>`);

  if (x.concierge) parts.push(`<section class="wrap xp-sec rv" aria-labelledby="xpCcT"><header class="xp-h"><p class="label">Pergunte aos noivos</p><h2 id="xpCcT">Alguma dúvida sobre o dia?</h2></header><div id="xpCc"></div></section>`);
  if (!parts.length) return;
  root.innerHTML = parts.join("");

  root.querySelectorAll("[data-secret]").forEach(env => {
    env.querySelector("[data-open]").addEventListener("click", async () => {
      env.classList.add("open", "reading");
      const letter = env.querySelector(".xp-letter"); letter.hidden = false;
      if (!reduce()) letter.animate?.([{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "none" }], { duration: 700, easing: "cubic-bezier(.22,1,.36,1)" });
      letter.focus({ preventScroll: true }); letter.scrollIntoView({ block: "nearest", behavior: reduce() ? "auto" : "smooth" });
      api(`/api/invite/${token}/exp/segredo/${env.dataset.secret}`, { method: "POST", body: {} }).catch(() => {});
    });
  });
  root.querySelectorAll("[data-checkin]").forEach(b => b.addEventListener("click", async () => {
    b.disabled = true; b.textContent = "Carimbando…";
    try {
      await api(`/api/invite/${token}/exp/checkin/${b.dataset.checkin}`, { method: "POST", body: {} });
      const li = b.closest(".xp-stamp"); li.classList.add("done", "just");
      b.outerHTML = `<span class="xp-seal" role="img" aria-label="Carimbado">Carimbado</span>`;
    } catch (e) { b.disabled = false; b.textContent = e.message.length < 40 ? e.message : "Tentar de novo"; }
  }));
  const note = root.querySelector(".xp-qnote");
  const count = () => { if (!note) return; const all = root.querySelectorAll("[data-quest]"), d = [...all].filter(i => i.checked).length; note.textContent = d ? (d === all.length ? "Todas feitas. Que festa!" : `${d} de ${all.length} feitas.`) : ""; };
  root.querySelectorAll("[data-quest]").forEach(i => i.addEventListener("change", async () => {
    const l = i.closest(".xp-q"); l.classList.toggle("done", i.checked); count();
    try { await api(`/api/invite/${token}/exp/quest/${i.dataset.quest}`, { method: "POST", body: { done: i.checked } }); }
    catch { i.checked = !i.checked; l.classList.toggle("done", i.checked); count(); }
  }));
  count();
  const cc = root.querySelector("#xpCc");
  if (cc) mountConcierge(cc, { endpoint: `/api/invite/${token}/concierge`, api, invite: true });
  import("../ui.js").then(m => m.reveal(root));
}
