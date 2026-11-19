/**
 * Jornal do casamento (/c/:slug/jornal): página A4 para imprimir, montada só com o que o casal publicou.
 * Só o casal logado abre (GET /api/admin/exp/jornal); a revisão (manchete, seções, recados) fica no painel → Experiências.
 */
import { $, esc, api, longDate, time } from "./ui.js";

const slug = location.pathname.split("/")[2];
const app = $("#app");

/** Palavras-cruzadas: encaixe guloso (maior palavra primeiro, cruzamentos válidos, sem letras encostadas). */
export function layout(words) {
  const list = [...words].sort((a, b) => b.word.length - a.word.length);
  const cells = new Map(), placed = [];
  const at = (r, c) => cells.get(r + "," + c);
  const fits = (w, r, c, dir) => {
    const dr = dir === "down" ? 1 : 0, dc = dir === "down" ? 0 : 1;
    if (at(r - dr, c - dc) || at(r + dr * w.length, c + dc * w.length)) return -1;
    let cross = 0;
    for (let k = 0; k < w.length; k++) {
      const rr = r + dr * k, cc = c + dc * k, cur = at(rr, cc);
      if (cur) { if (cur.ch !== w[k] || cur[dir]) return -1; cross++; continue; }
      if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) return -1; // vizinhos laterais
    }
    return cross;
  };
  const put = (item, r, c, dir) => {
    const dr = dir === "down" ? 1 : 0, dc = dir === "down" ? 0 : 1;
    for (let k = 0; k < item.word.length; k++) { const key = (r + dr * k) + "," + (c + dc * k); const cell = cells.get(key) || { ch: item.word[k] }; cell[dir] = true; cells.set(key, cell); }
    placed.push({ ...item, r, c, dir });
  };
  if (!list.length) return null;
  put(list[0], 0, 0, "across");
  for (const item of list.slice(1)) {
    let best = null;
    for (const [key, cell] of cells) {
      const [r, c] = key.split(",").map(Number);
      for (let k = 0; k < item.word.length; k++) {
        if (item.word[k] !== cell.ch) continue;
        for (const dir of ["across", "down"]) {
          const r0 = dir === "down" ? r - k : r, c0 = dir === "down" ? c : c - k;
          const x = fits(item.word, r0, c0, dir);
          if (x > 0 && (!best || x > best.x)) best = { r: r0, c: c0, dir, x };
        }
      }
    }
    if (best) put(item, best.r, best.c, best.dir);
  }
  const rs = [...cells.keys()].map(k => +k.split(",")[0]), cs = [...cells.keys()].map(k => +k.split(",")[1]);
  const r0 = Math.min(...rs), c0 = Math.min(...cs);
  const starts = [...new Set(placed.map(p => (p.r - r0) + "," + (p.c - c0)))].sort((a, b) => { const [ar, ac] = a.split(",").map(Number), [br, bc] = b.split(",").map(Number); return ar - br || ac - bc; });
  const num = Object.fromEntries(starts.map((k, i) => [k, i + 1]));
  const out = placed.map(p => ({ ...p, r: p.r - r0, c: p.c - c0, n: num[(p.r - r0) + "," + (p.c - c0)] }));
  const grid = new Map([...cells].map(([k, v]) => { const [r, c] = k.split(",").map(Number); return [(r - r0) + "," + (c - c0), v.ch]; }));
  return { rows: Math.max(...rs) - r0 + 1, cols: Math.max(...cs) - c0 + 1, grid, words: out, num };
}

try {
  const me = await api("/api/me");
  if (me.wedding.slug !== slug) throw Object.assign(new Error("other"), { status: 403 });
  const d = await api("/api/admin/exp/jornal");
  const w = d.wedding;
  document.documentElement.dataset.universe = w.universe;
  if (w.theme && /^[a-z0-9-]+$/.test(w.theme)) {
    document.documentElement.dataset.theme = w.theme;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `/assets/themes/${w.theme}/theme.css`; document.head.append(l);
    await new Promise(r => { l.onload = l.onerror = r; });
  }
  document.title = `Jornal · ${w.names}`;
  render(d);
} catch (e) {
  app.innerHTML = `<section class="jn-gate"><p class="label">Jornal do casamento</p><h1>${e.status === 404 ? "O jornal está desligado." : "Só os noivos abrem o jornal."}</h1>
    <p class="muted">${e.status === 404 ? "Liguem o jornal no painel, em Experiências." : e.status === 403 ? "Este jornal é de outro casamento." : "Entrem no painel para revisar e imprimir."}</p><a class="btn" href="/painel#extras">Ir para o painel</a></section>`;
} finally { app.removeAttribute("aria-busy"); }

function render(d) {
  const { wedding: w, config: cfg } = d;
  const S = { historia: true, curiosidades: true, programacao: true, recados: true, cruzadas: true, ...(cfg.sections || {}) };
  const msgs = Array.isArray(cfg.messages) ? d.messages.filter(m => cfg.messages.includes(m.id)) : d.messages.slice(0, 6);
  const [a, b] = w.names.split("&").map(s => s.trim());
  const headline = cfg.headline || `${a} e ${b} dizem sim`;
  const cw = S.cruzadas && d.words.length >= 3 ? layout(d.words) : null;
  const dateShort = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(new Date(w.date));
  app.innerHTML = `
  <div class="jn-bar no-print"><div><b>Jornal do casamento</b><span class="muted"> · revisem antes de imprimir: só entra o que vocês publicaram.</span></div>
    <div class="jn-acts"><a class="btn ghost sm" href="/painel#extras">Revisar no painel</a><button class="btn sm" type="button" id="print">Imprimir ou salvar PDF</button></div></div>
  <article class="jn" aria-label="Jornal do casamento">
    <header class="jn-mast">
      <p class="jn-top"><span>Edição única</span><span>${esc(w.city)}</span><span>${esc(dateShort)}</span></p>
      <h1 class="jn-name">O Jornal de ${esc(a)} <i>&amp;</i> ${esc(b)}</h1>
      <p class="jn-top jn-bottom"><span>Distribuição gratuita aos convidados</span><span>Preço: um abraço</span></p>
    </header>
    <section class="jn-lead">
      <h2 class="jn-hl">${esc(headline)}</h2>
      <p class="jn-dek">${esc(longDate(w.date))}${w.venue_name ? " · " + esc(w.venue_name) : ""} · ${esc(w.city)}</p>
      ${w.welcome ? `<p class="jn-intro">${esc(w.welcome)}</p>` : ""}
      ${cfg.note ? `<p class="jn-note">${esc(cfg.note)}</p>` : ""}
    </section>
    ${S.historia && d.story.length ? `<section class="jn-sec"><h3 class="jn-kick">A história</h3><div class="jn-cols">${d.story.map(s => `<div class="jn-story"><p class="jn-yr">${esc(s.year)}</p><h4>${esc(s.title)}</h4><p>${esc(s.text)}</p></div>`).join("")}</div></section>` : ""}
    <div class="jn-row">
      ${S.programacao && (d.events.length || d.schedule.length) ? `<section class="jn-sec jn-prog"><h3 class="jn-kick">Programação</h3>
        ${d.events.map(e => `<p class="jn-ev"><b>${esc(e.name)}</b> · ${esc(time(e.starts_at))}<br><span>${esc(e.venue)}${e.dress_code ? " · Traje: " + esc(e.dress_code) : ""}</span></p>`).join("")}
        ${d.schedule.length ? `<ol class="jn-sched">${d.schedule.map(s => `<li><span>${esc(s.time)}</span>${esc(s.title)}</li>`).join("")}</ol>` : ""}</section>` : ""}
      ${S.curiosidades && d.quiz.length ? `<section class="jn-sec jn-quiz"><h3 class="jn-kick">Curiosidades</h3>${d.quiz.map(q => `<div class="jn-q"><p class="jn-qq">${esc(q.q)}</p><p><b>${esc(q.answer)}.</b> ${esc(q.fact)}</p></div>`).join("")}</section>` : ""}
    </div>
    ${S.recados && msgs.length ? `<section class="jn-sec"><h3 class="jn-kick">Recados do mural</h3><div class="jn-msgs">${msgs.map(m => `<blockquote><p>${esc(m.message)}</p><cite>${esc(m.author)}</cite></blockquote>`).join("")}</div></section>` : ""}
    ${cw ? `<section class="jn-sec jn-cw"><h3 class="jn-kick">Palavras-cruzadas do casal</h3>
      <div class="jn-cw-in"><div class="jn-grid" role="img" aria-label="Grade de palavras-cruzadas com ${cw.words.length} palavras">${gridHtml(cw)}</div>
      <div class="jn-clues">${["across", "down"].map(dir => { const ws = cw.words.filter(x => x.dir === dir).sort((p, q) => p.n - q.n); return ws.length ? `<div><h4>${dir === "across" ? "Horizontais" : "Verticais"}</h4><ol>${ws.map(x => `<li><b>${x.n}.</b> ${esc(x.clue)} <span class="muted">(${x.word.length})</span></li>`).join("")}</ol></div>` : ""; }).join("")}</div></div>
      <p class="jn-ans">Respostas: ${cw.words.sort((p, q) => p.n - q.n).map(x => `${x.n}${x.dir === "across" ? "H" : "V"} ${esc(x.word)}`).join(" · ")}</p></section>` : ""}
    <footer class="jn-foot">Feito com carinho a partir do site de ${esc(w.names)} · Universo</footer>
  </article>`;
  $("#print").addEventListener("click", () => print());
}
function gridHtml(cw) {
  let html = "";
  for (let r = 0; r < cw.rows; r++) for (let c = 0; c < cw.cols; c++) {
    const ch = cw.grid.get(r + "," + c), n = cw.num[r + "," + c];
    html += ch ? `<span class="jn-cell">${n ? `<small>${n}</small>` : ""}</span>` : `<span class="jn-void"></span>`;
  }
  queueMicrotask(() => { const el = document.querySelector(".jn-grid"); if (el) { el.style.setProperty("--cols", cw.cols); el.style.setProperty("--rows", cw.rows); } });
  return html;
}
