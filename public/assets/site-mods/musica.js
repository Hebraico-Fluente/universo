/**
 * Música do casal (editor do site › Música): player pequenino do Spotify no canto, que tenta tocar
 * no PRIMEIRO TOQUE do visitante em qualquer lugar do site, com um botão redondo para silenciar.
 * - Navegadores não deixam tocar som antes de um toque; por isso a tentativa é no primeiro toque/tecla.
 * - Usa a API oficial de embed do Spotify (o player continua visível, como o Spotify exige).
 * - Quem não está logado no Spotify ouve o trecho de 30 s que o Spotify libera; no iPhone pode ser preciso tocar no play.
 * - "Silenciar" pausa e fica lembrado (localStorage): na próxima visita não toca sozinho; o botão toca de novo.
 * Dados: w.music = { track (ID de 22 caracteres), label } vindo de /api/site/:slug (worker.publicWedding).
 */
export const name = "musica";

const KEY = "musica-silenciada";
const API = "https://open.spotify.com/embed/iframe-api/v1";
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
    <div class="mz-box" role="region" aria-label="Música do casal: ${esc(label)}">
      <div class="mz-frame"><div id="mzEmbed"></div></div>
      <button class="mz-mute" type="button"></button>
    </div>`;
  document.body.append(root); document.body.classList.add("has-mz");
  const muteBtn = root.querySelector(".mz-mute");
  let ctrl = null, ready = false, playing = false, wantPlay = !muted();

  const paint = () => {
    root.classList.toggle("is-playing", playing);
    root.classList.toggle("is-muted", !wantPlay); // o player some só quando o visitante silenciou (no iPhone ele pode precisar tocar no play)
    muteBtn.innerHTML = playing ? `<span aria-hidden="true">🔊</span>` : `<span aria-hidden="true">🔇</span>`;
    muteBtn.setAttribute("aria-label", playing ? `Silenciar a música (${label})` : `Tocar a música (${label})`);
    muteBtn.title = playing ? "Silenciar" : `Tocar: ${label}`;
  };
  const play = () => { if (ctrl && ready) { try { ctrl.play(); } catch {} } };

  // Primeiro toque/tecla em qualquer lugar: tenta tocar (se o visitante não silenciou antes)
  const first = e => {
    if (root.contains(e.target)) return; // o próprio botão cuida de si
    off();
    if (wantPlay) play();
  };
  const off = () => ["pointerdown", "keydown", "touchend"].forEach(t => document.removeEventListener(t, first, true));
  ["pointerdown", "keydown", "touchend"].forEach(t => document.addEventListener(t, first, { capture: true, passive: true }));

  muteBtn.addEventListener("click", () => {
    off();
    if (playing) { try { ctrl?.pause(); } catch {} setMuted(true); wantPlay = false; playing = false; }
    else { setMuted(false); wantPlay = true; play(); }
    paint();
  });

  // API oficial do Spotify: cria o player compacto no canto
  window.onSpotifyIframeApiReady = IFrameAPI => {
    IFrameAPI.createController(root.querySelector("#mzEmbed"), { uri: `spotify:track:${m.track}`, width: "100%", height: 80 }, c => {
      ctrl = c;
      c.addListener("ready", () => { ready = true; const f = root.querySelector("iframe"); if (f) f.title = `Player do Spotify: ${label}`; });
      c.addListener("playback_update", e => { playing = !e.data.isPaused; paint(); });
    });
  };
  const s = document.createElement("script"); s.src = API; s.async = true;
  s.onerror = () => root.remove(); // sem Spotify (rede bloqueada): nada aparece
  document.head.append(s);
  paint();
}
