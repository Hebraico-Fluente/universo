/**
 * Música do casal (editor do site › Música): botão flutuante discreto no canto inferior esquerdo.
 * - O site NUNCA toca sozinho: o iframe do Spotify só é criado depois do clique, e o visitante dá play no player oficial.
 * - "Silenciar" fecha o player e REMOVE o iframe (a música para). A escolha fica no localStorage: o botão volta compacto.
 * - "Recolher" esconde o player sem parar a música.
 * Dados: w.music = { track (ID de 22 caracteres), label } vindo de /api/site/:slug (worker.publicWedding).
 */
export const name = "musica";

const KEY = "musica-silenciada";
const loadCss = href => { if (document.querySelector(`link[href="${href}"]`)) return; const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); };

export function init({ w, esc }) {
  const m = w.music;
  if (!m || !/^[A-Za-z0-9]{22}$/.test(m.track || "")) return;
  loadCss("/assets/site-mods/musica.css");
  const label = m.label || "Nossa música";
  const muted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
  const setMuted = v => { try { v ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {} };

  const root = document.createElement("div");
  root.className = "mz" + (document.querySelector(".demo") ? " mz-up" : "");
  root.innerHTML = `
    <section class="mz-panel" id="mzPanel" aria-label="Música do casal: ${esc(label)}" hidden>
      <div class="mz-head"><p class="mz-t"><span aria-hidden="true">♪</span> ${esc(label)}</p>
        <button class="mz-min" type="button" aria-label="Recolher o player (a música continua)"><span aria-hidden="true">⌄</span></button></div>
      <div class="mz-frame"></div>
      <div class="mz-foot"><p class="mz-hint">Toque no play do Spotify para ouvir.</p><button class="mz-mute" type="button">Silenciar</button></div>
    </section>
    <button class="mz-btn" type="button" aria-controls="mzPanel" aria-expanded="false"><span class="mz-ic" aria-hidden="true">♪</span><span class="mz-l">${esc(label)}</span></button>`;
  document.body.append(root); document.body.classList.add("has-mz");
  const btn = root.querySelector(".mz-btn"), panel = root.querySelector(".mz-panel"), frame = root.querySelector(".mz-frame");
  const state = () => {
    const open = !panel.hidden && !root.classList.contains("is-min"), playing = !!frame.firstChild;
    root.classList.toggle("is-open", open);
    panel.inert = root.classList.contains("is-min"); // recolhido: some da tela e do teclado, mas o iframe segue tocando
    root.classList.toggle("is-compact", !playing && muted());
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", playing && !open ? `Mostrar o player: ${label}` : `Ouvir a música do casal: ${label}`);
    btn.title = label;
  };
  const open = () => {
    if (!frame.firstChild) {
      const f = document.createElement("iframe");
      f.src = `https://open.spotify.com/embed/track/${m.track}?utm_source=generator&theme=0`;
      f.title = `Player do Spotify: ${label}`;
      f.loading = "lazy";
      f.allow = "encrypted-media; clipboard-write; fullscreen; picture-in-picture";
      f.setAttribute("allowfullscreen", "");
      f.width = "100%"; f.height = "152";
      frame.append(f);
    }
    setMuted(false);
    panel.hidden = false; root.classList.remove("is-min"); state();
    root.querySelector(".mz-mute").focus({ preventScroll: true });
  };
  const close = () => { // para a música: o iframe sai da página
    frame.replaceChildren(); panel.hidden = true; root.classList.remove("is-min");
    setMuted(true); state(); btn.focus({ preventScroll: true });
  };
  btn.addEventListener("click", () => (root.classList.contains("is-open") ? (root.classList.add("is-min"), state()) : open()));
  root.querySelector(".mz-min").addEventListener("click", () => { root.classList.add("is-min"); state(); btn.focus({ preventScroll: true }); });
  root.querySelector(".mz-mute").addEventListener("click", close);
  root.addEventListener("keydown", e => { if (e.key === "Escape" && root.classList.contains("is-open")) { root.classList.add("is-min"); state(); btn.focus(); } });
  state();
}
