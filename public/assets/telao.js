/**
 * Telão ao vivo: /telao/:token  (módulo "midia").
 * Mostra em loop as fotos e os recados aprovados pelos noivos, buscando novidades a cada ~20 s.
 * Teclado: espaço pausa/continua · ← → navega · F tela cheia. Com "reduzir movimento": sem zoom nem transições.
 */
import { qrcode } from "./vendor/qrcode.js";

const token = location.pathname.split("/")[2] || "";
const app = document.querySelector("#tl");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dwell = () => (reduce.matches ? 12000 : 9000);

let data = null, items = [], at = -1, paused = false, timer = 0, front = 0, idleT = 0, refreshT = 0;
const seen = new Set();

start();

async function fetchData() {
  const r = await fetch(`/api/telao/${encodeURIComponent(token)}`, { credentials: "omit", cache: "no-store" });
  if (r.status === 404) { const e = new Error("gone"); e.gone = true; throw e; }
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

async function start() {
  try { data = await fetchData(); }
  catch (e) {
    app.innerHTML = `<div class="tl-msg"><p class="label">Telão</p><h1>${e.gone ? "Este link do telão não vale mais." : "Não deu para carregar o telão."}</h1><p>${e.gone ? "Peça aos noivos um link novo, gerado no painel." : "Confira a internet e recarregue a página."}</p></div>`;
    app.removeAttribute("aria-busy");
    return;
  }
  await theme(data.wedding);
  document.title = `${data.wedding.names} · telão ao vivo`;
  shell();
  merge(data, true);
  next(1);
  refreshT = setInterval(refresh, Math.max(10, data.refresh || 20) * 1000);
  try { await navigator.wakeLock?.request("screen"); } catch { /* sem bloqueio de tela */ }
  app.removeAttribute("aria-busy");
}

async function theme(w) {
  const root = document.documentElement;
  if (["timeless", "editorial", "dreamscape"].includes(w.universe)) root.dataset.universe = w.universe;
  if (!w.theme || !/^[a-z0-9-]+$/.test(w.theme)) return;
  root.dataset.theme = w.theme;
  await new Promise(r => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `/assets/themes/${w.theme}/theme.css`; l.onload = l.onerror = r; document.head.append(l); });
}

function qrSvg(text) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = "";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) d += `M${k + 2} ${r + 2}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-hidden="true"><rect class="qbg" width="${n + 4}" height="${n + 4}"/><path d="${d}"/></svg>`;
}

function shell() {
  const w = data.wedding;
  const site = `${location.origin}/c/${w.slug}`;
  app.innerHTML = `
    <div class="tl-stage" aria-hidden="false">
      <section class="tl-slide" aria-hidden="true"></section>
      <section class="tl-slide" aria-hidden="true"></section>
    </div>
    <header class="tl-top"><p class="tl-names">${esc(w.names)}</p><p class="tl-live"><span class="dot" aria-hidden="true"></span>Ao vivo</p></header>
    <p class="tl-cap" id="tlCap" aria-live="off"></p>
    <aside class="tl-qr" aria-label="Como participar"><div class="tl-qr-code" role="img" aria-label="QR Code para o site do casamento">${qrSvg(site + "#galeria")}</div>
      <div><p class="tl-qr-t">Mande sua foto ou um recado</p><p class="tl-qr-u">${esc(site.replace(/^https?:\/\//, ""))}</p><p class="tl-qr-s">Aparece aqui depois que os noivos aprovam.</p></div></aside>
    <nav class="tl-ctl" aria-label="Controles do telão">
      <button type="button" data-a="prev" aria-label="Anterior (seta para a esquerda)">‹</button>
      <button type="button" data-a="pause" aria-label="Pausar (espaço)" aria-pressed="false"><span class="ic-pause" aria-hidden="true"></span></button>
      <button type="button" data-a="next" aria-label="Próximo (seta para a direita)">›</button>
      <button type="button" data-a="full" aria-label="Tela cheia (F)">⤢</button>
      <span class="tl-count num" id="tlCount" aria-live="off"></span>
    </nav>`;
  app.querySelector(".tl-ctl").addEventListener("click", e => { const b = e.target.closest("button"); if (b) act(b.dataset.a); });
  addEventListener("keydown", e => {
    if (e.target.closest?.("button") && (e.key === " " || e.key === "Enter")) return; // o próprio botão trata
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); act("pause"); }
    else if (k === "arrowright") act("next");
    else if (k === "arrowleft") act("prev");
    else if (k === "f") act("full");
    wake();
  });
  ["mousemove", "pointerdown", "touchstart"].forEach(ev => addEventListener(ev, wake, { passive: true }));
  wake();
}
function wake() { document.body.classList.remove("idle"); clearTimeout(idleT); idleT = setTimeout(() => { if (!app.contains(document.activeElement) || document.activeElement === document.body) document.body.classList.add("idle"); }, 3500); }

function act(a) {
  if (a === "next" || a === "prev") { document.querySelector("#tlCap").setAttribute("aria-live", "polite"); next(a === "next" ? 1 : -1); }
  if (a === "pause") {
    paused = !paused;
    const b = app.querySelector('[data-a="pause"]');
    b.setAttribute("aria-pressed", String(paused)); b.setAttribute("aria-label", paused ? "Continuar (espaço)" : "Pausar (espaço)");
    document.body.classList.toggle("paused", paused);
    document.querySelector("#tlCap").setAttribute("aria-live", paused ? "polite" : "off");
    clearTimeout(timer); if (!paused) timer = setTimeout(() => next(1), dwell());
  }
  if (a === "full") { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
}

/** Junta fotos e recados (um recado a cada três fotos). Novidades entram logo depois do item atual. */
function build(d) {
  const ph = d.photos.map(p => ({ key: "p" + p.id, type: "photo", ...p })), ms = d.messages.map(m => ({ key: "m" + m.id, type: "msg", ...m }));
  const out = []; let i = 0, j = 0;
  while (i < ph.length || j < ms.length) {
    for (let k = 0; k < 3 && i < ph.length; k++) out.push(ph[i++]);
    if (j < ms.length) out.push(ms[j++]);
  }
  return out;
}
function merge(d, first = false) {
  const all = build(d), keep = new Set(all.map(x => x.key));
  if (first) items = all;
  else {
    const cur = items[at];
    items = items.filter(x => keep.has(x.key)); // apagados pelos noivos somem
    at = cur ? items.findIndex(x => x.key === cur.key) : -1;
    const fresh = all.filter(x => !seen.has(x.key)).map(x => ({ ...x, isNew: true }));
    items.splice(at + 1, 0, ...fresh);
  }
  all.forEach(x => seen.add(x.key));
}
async function refresh() {
  try { const d = await fetchData(); data = d; const wasEmpty = !items.length; merge(d); if (wasEmpty && items.length) next(1); }
  catch (e) { if (e.gone) { clearInterval(refreshT); clearTimeout(timer); app.innerHTML = `<div class="tl-msg"><h1>Este link do telão foi desligado pelos noivos.</h1></div>`; } }
}

async function next(dir) {
  clearTimeout(timer);
  const slides = app.querySelectorAll(".tl-slide"), cap = app.querySelector("#tlCap"), count = app.querySelector("#tlCount");
  if (!items.length) { empty(slides[front]); return; }
  at = (at + dir + items.length) % items.length;
  const it = items[at];
  const back = slides[1 - front];
  back.className = "tl-slide " + (it.type === "photo" ? "is-photo" : "is-msg") + (reduce.matches ? "" : " motion");
  if (it.type === "photo") {
    const label = it.caption || `Foto do casamento${data.moments?.[it.moment] ? " · " + data.moments[it.moment] : ""}`;
    back.innerHTML = `<div class="tl-bg"></div><img class="tl-photo" alt="${esc(label)}">${it.isNew ? `<p class="tl-new">Acabou de chegar</p>` : ""}`;
    back.querySelector(".tl-bg").style.backgroundImage = `url("${it.url.replace(/"/g, "")}")`;
    const img = back.querySelector("img");
    img.src = it.url;
    try { await img.decode(); } catch { /* mostra mesmo assim */ }
    cap.textContent = [data.moments?.[it.moment], it.caption].filter(Boolean).join(" · ");
  } else {
    const long = it.message.length > 220;
    back.innerHTML = `<blockquote class="tl-quote${long ? " long" : ""}"><p>${esc(it.message)}</p><footer>${esc(it.author)}</footer></blockquote>${it.isNew ? `<p class="tl-new">Acabou de chegar</p>` : ""}`;
    cap.textContent = `Recado de ${it.author}`;
  }
  it.isNew = false;
  back.setAttribute("aria-hidden", "false");
  slides[front].setAttribute("aria-hidden", "true");
  slides[front].classList.remove("on");
  back.classList.add("on");
  front = 1 - front;
  count.textContent = `${at + 1} / ${items.length}`;
  if (!paused) timer = setTimeout(() => next(1), dwell());
}
function empty(slide) {
  slide.className = "tl-slide is-msg on";
  slide.setAttribute("aria-hidden", "false");
  slide.innerHTML = `<div class="tl-welcome"><p class="label">Bem-vindos</p><h1>${esc(data.wedding.names)}</h1><p>As fotos e os recados aprovados pelos noivos aparecem aqui. Aponte a câmera para o código e mande o seu.</p></div>`;
  app.querySelector("#tlCount").textContent = "";
}
