/**
 * História em modo documentário: tela cheia, um capítulo por vez (setas, teclado, toque), transições suaves
 * desligadas com prefers-reduced-motion. Trilha sonora opcional, só quando o visitante aperta o botão,
 * e só com arquivo próprio do casal (mesmo site). Músicas famosas: apenas links de busca (Spotify/YouTube).
 */
import { loadCss } from "./concierge.js";
export const name = "experiencias";

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const media = u => String(u || "").replace(/^\/m\//, "/api/media/");

export function init({ w, data, $, esc }) {
  if (!data?.documentario || (w.story || []).length < 2) return;
  const head = $("#historia .sh");
  if (!head) return;
  loadCss("/assets/site-mods/documentario.css");
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "btn ghost sm doc-open";
  btn.innerHTML = `<span class="doc-play" aria-hidden="true"></span>Assistir como documentário`;
  head.append(btn);
  btn.addEventListener("click", () => open(w, data.soundtrack || {}, esc, btn));
}

function open(w, sound, esc, opener) {
  const [a, b] = w.names.split("&").map(s => s.trim());
  const chapters = [
    { kind: "intro", k: "Um documentário de", title: `${esc(a)} <i>&amp;</i> ${esc(b)}`, text: `${w.story.length} capítulos até o “sim”.` },
    ...w.story.map(s => ({ kind: "ch", k: s.year, title: esc(s.title), text: s.text, image: s.image, video: s.video || "", poster: s.poster || "", alt: s.alt || "" })),
    { kind: "end", k: "Próximo capítulo", title: esc(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(new Date(w.date))), text: w.venue_name ? `${w.venue_name} · ${w.city}` : w.city },
  ];
  const dlg = document.createElement("dialog");
  dlg.className = "doc" + (reduce() ? " still" : "");
  dlg.setAttribute("aria-label", `A história de ${w.names} em modo documentário`);
  dlg.innerHTML = `
    <div class="doc-stage">${chapters.map((c, i) => `<section class="doc-ch doc-${c.kind}${c.image || c.video ? " has-img" : ""}" data-i="${i}" aria-hidden="true">
      ${c.video ? `<div class="doc-img doc-vid"><video muted playsinline loop preload="metadata" src="${esc(c.video)}"${c.poster ? ` poster="${esc(c.poster)}"` : ""}${c.alt ? ` aria-label="${esc(c.alt)}"` : ""}></video>
          <div class="doc-vtools"><button class="doc-btn doc-vplay" type="button" hidden>▶ Assistir</button><button class="doc-btn doc-vsound" type="button" aria-pressed="false">🔇 Ativar som</button></div></div>`
      : c.image ? `<div class="doc-img" data-bg="${esc(c.image)}"${c.alt ? ` role="img" aria-label="${esc(c.alt)}"` : ""}></div>` : `<div class="doc-img doc-noimg"></div>`}
      <div class="doc-txt">${c.k ? `<p class="doc-k">${esc(c.k)}</p>` : ""}<h2 class="doc-t">${c.title}</h2>${c.text ? `<p class="doc-p">${esc(c.text)}</p>` : ""}
      ${c.kind === "end" ? `<button class="doc-cta doc-back" type="button">Voltar ao site</button>` : ""}</div></section>`).join("")}</div>
    <div class="doc-top">
      <ol class="doc-prog" aria-hidden="true">${chapters.map(() => "<li><i></i></li>").join("")}</ol>
      <div class="doc-tools">
        ${sound.url ? `<button class="doc-btn doc-sound" type="button" aria-pressed="false"><span class="doc-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="doc-sl">Ligar trilha</span></button>` : ""}
        <button class="doc-btn doc-x" type="button" aria-label="Fechar o documentário">×</button>
      </div>
    </div>
    <div class="doc-nav">
      <button class="doc-arrow doc-prev" type="button" aria-label="Capítulo anterior">‹</button>
      <p class="doc-count num" aria-live="polite"></p>
      <button class="doc-arrow doc-next" type="button" aria-label="Próximo capítulo">›</button>
    </div>
    ${sound.song ? `<p class="doc-song">Para ouvir junto: ${esc(sound.song)} · <a href="https://open.spotify.com/search/${encodeURIComponent(sound.song)}" target="_blank" rel="noopener">Spotify</a> · <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(sound.song)}" target="_blank" rel="noopener">YouTube</a></p>` : ""}`;
  document.body.append(dlg);
  dlg.querySelectorAll("[data-bg]").forEach(el => { el.style.backgroundImage = `url("${el.dataset.bg.replace(/"/g, "")}")`; });
  const secs = [...dlg.querySelectorAll(".doc-ch")], bars = [...dlg.querySelectorAll(".doc-prog li")];
  let i = 0, audio = null;
  const show = n => {
    i = Math.max(0, Math.min(chapters.length - 1, n));
    secs.forEach((s, k) => { s.classList.toggle("on", k === i); s.classList.toggle("past", k < i); s.setAttribute("aria-hidden", k === i ? "false" : "true"); });
    bars.forEach((b, k) => b.classList.toggle("done", k <= i));
    dlg.querySelector(".doc-count").textContent = `${i + 1} de ${chapters.length}`;
    // vídeo do capítulo: toca (sem som) só no capítulo ativo; com "reduzir movimento", espera o toque em "Assistir"
    secs.forEach((s, k) => { const v = s.querySelector("video"); if (!v) return;
      if (k !== i) { v.pause(); return; }
      if (reduce()) s.querySelector(".doc-vplay").hidden = false; else v.play().catch(() => { s.querySelector(".doc-vplay").hidden = false; }); });
    dlg.querySelector(".doc-prev").disabled = i === 0;
    dlg.querySelector(".doc-next").disabled = i === chapters.length - 1;
  };
  const close = () => { audio?.pause(); dlg.close(); };
  dlg.querySelectorAll(".doc-vid").forEach(box => {
    const v = box.querySelector("video"), snd = box.querySelector(".doc-vsound"), pl = box.querySelector(".doc-vplay");
    const paint = () => { const on = !v.muted; snd.setAttribute("aria-pressed", String(on)); snd.textContent = on ? "🔊 Som ligado" : "🔇 Ativar som"; };
    snd.addEventListener("click", () => {
      v.muted = !v.muted; paint();
      if (!v.muted) { audio?.pause(); const sb = dlg.querySelector(".doc-sound"); if (sb) { sb.setAttribute("aria-pressed", "false"); sb.querySelector(".doc-sl").textContent = "Ligar trilha"; } v.play().catch(() => {}); }
    });
    pl.addEventListener("click", () => { pl.hidden = true; v.play().catch(() => { pl.hidden = false; }); });
    v.addEventListener("playing", () => { pl.hidden = true; });
    paint();
  });
  dlg.addEventListener("close", () => { dlg.querySelectorAll("video").forEach(v => v.pause()); audio?.pause(); dlg.remove(); document.documentElement.classList.remove("doc-lock"); opener.focus(); });
  dlg.querySelector(".doc-x").addEventListener("click", close);
  dlg.querySelector(".doc-prev").addEventListener("click", () => show(i - 1));
  dlg.querySelector(".doc-next").addEventListener("click", () => show(i + 1));
  dlg.querySelector(".doc-cta")?.addEventListener("click", close);
  dlg.addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); show(i + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(i - 1); }
  });
  let x0 = null;
  dlg.addEventListener("pointerdown", e => { if (!e.target.closest("button,a")) x0 = e.clientX; });
  dlg.addEventListener("pointerup", e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 45) show(i + (dx < 0 ? 1 : -1)); });
  const sb = dlg.querySelector(".doc-sound");
  sb?.addEventListener("click", () => {
    if (!audio) { audio = new Audio(media(sound.url)); audio.loop = true; audio.volume = .7; audio.addEventListener("error", () => { sb.disabled = true; sb.querySelector(".doc-sl").textContent = "Trilha indisponível"; }); }
    const on = sb.getAttribute("aria-pressed") !== "true";
    if (on) audio.play().catch(() => {}); else audio.pause();
    sb.setAttribute("aria-pressed", String(on)); sb.querySelector(".doc-sl").textContent = on ? "Pausar trilha" : "Ligar trilha";
  });
  document.documentElement.classList.add("doc-lock");
  dlg.showModal(); show(0);
  dlg.querySelector(".doc-next").focus();
}
