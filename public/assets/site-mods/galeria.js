/**
 * Site: galeria colaborativa (módulo "midia").
 * Mostra só fotos aprovadas pelos noivos. Convidados podem mandar fotos (ficam pendentes até a aprovação).
 */
import { compressImage } from "../upload.js";

export const name = "midia";
export const MAX_FILES = 10;

export function css() {
  if (document.querySelector('link[href="/assets/site-mods/midia.css"]')) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/assets/site-mods/midia.css"; document.head.append(l);
}
css();

/** Identificador aleatório do aparelho (só para limitar envios; não identifica a pessoa). */
export function deviceId() {
  try {
    let d = localStorage.getItem("universo-aparelho");
    if (!d || !/^[A-Za-z0-9_-]{8,40}$/.test(d)) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join(""); localStorage.setItem("universo-aparelho", d); }
    return d;
  } catch { return ""; }
}
/** POST multipart com erro legível. */
export async function sendForm(url, fd, headers = {}) {
  const r = await fetch(url, { method: "POST", body: fd, credentials: "same-origin", headers });
  let data = null; try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new Error(data?.error || "Não deu para enviar. Tente de novo.");
  return data;
}
const momentLabel = (g, key) => g.moments.find(m => m.key === key)?.label || "";
export const photoAlt = (g, p) => p.caption || `Foto do casamento${momentLabel(g, p.moment) ? " · " + momentLabel(g, p.moment) : ""}`;

export function sections({ data, esc }) {
  const g = data?.gallery;
  if (!g || (!g.show && !g.uploads)) return [];
  const photos = g.show ? g.photos : [];
  const used = g.moments.filter(m => photos.some(p => p.moment === m.key));
  const grid = photos.length ? `
    ${used.length > 1 ? `<div class="gl-filter rv" role="group" aria-label="Filtrar por momento"><button type="button" class="gl-chip" data-m="" aria-pressed="true">Todas <span class="num">${photos.length}</span></button>${used.map(m => `<button type="button" class="gl-chip" data-m="${esc(m.key)}" aria-pressed="false">${esc(m.label)}</button>`).join("")}</div>` : ""}
    <ul class="gl-grid" id="glGrid">${photos.map((p, i) => `<li class="gl-item" data-moment="${esc(p.moment)}"><button type="button" class="gl-open" data-i="${i}" aria-label="Ampliar: ${esc(photoAlt(g, p))}"><img src="${esc(p.url)}" alt="${esc(photoAlt(g, p))}" loading="lazy" decoding="async"></button></li>`).join("")}</ul>`
    : g.show ? `<p class="gl-empty muted rv">As primeiras fotos aparecem aqui assim que os noivos aprovarem.</p>` : "";
  // pasta do Google Drive configurada pelo casal: no lugar do formulário, um botão que abre a pasta (nova aba)
  const drive = g.uploads && /^https:\/\/drive\.google\.com\//.test(g.drive_folder || "") ? `
    <div class="gl-send gl-drive rv">
      <div class="gl-send-h"><h3>Mande as suas fotos</h3><p class="muted">Viu um momento bonito? Compartilhe com os noivos na pasta de fotos da festa.</p></div>
      <a class="btn" href="${esc(g.drive_folder)}" target="_blank" rel="noopener">Enviar fotos no Google Drive <span aria-hidden="true">↗</span><span class="sr"> (abre em outra aba)</span></a>
      <p class="muted small">Abre a pasta de fotos da festa. É preciso estar logado numa conta Google.</p>
    </div>` : "";
  const form = drive || (g.uploads ? `
    <form class="gl-send rv" id="glForm" novalidate>
      <div class="gl-send-h"><h3>Mande as suas fotos</h3><p class="muted">Viu um momento bonito? Compartilhe com os noivos. Até ${MAX_FILES} fotos por vez.</p></div>
      <label class="gl-drop"><input type="file" name="files" accept="image/jpeg,image/png,image/webp,image/*" multiple class="sr" id="glFiles"><span class="gl-drop-in"><b>Escolher fotos</b><span class="muted small" id="glPicked">Nenhuma foto escolhida</span></span></label>
      <label class="field"><span>Seu nome (opcional)</span><input class="in" name="author" maxlength="60" autocomplete="name"></label>
      <label class="gl-consent"><input type="checkbox" name="consent" value="1" required><span>Entendo que a foto <b>só aparece no site depois que os noivos aprovarem</b>, que eles podem apagá-la quando quiserem e que ela pode passar no telão da festa. Envie só fotos que você tirou, e com cuidado com quem aparece nelas.</span></label>
      <p class="error" id="glErr" role="alert"></p>
      <p class="gl-status muted small" id="glStatus" role="status" aria-live="polite"></p>
      <button class="btn" type="submit">Enviar fotos</button>
    </form>` : "");
  return [{
    id: "galeria", label: "Fotos", title: photos.length ? "Os nossos <em>momentos</em>" : "Fotos da <em>festa</em>", before: "duvidas",
    inner: `<div class="gl${form && photos.length ? " with-form" : ""}">${grid}${form}</div>
      ${photos.length ? `<dialog class="gl-box" id="glBox" aria-label="Foto ampliada"><figure><img id="glImg" alt=""><figcaption id="glCap"></figcaption></figure>
        <button type="button" class="gl-x" id="glX" aria-label="Fechar">×</button><button type="button" class="gl-nav prev" id="glPrev" aria-label="Foto anterior">‹</button><button type="button" class="gl-nav next" id="glNext" aria-label="Próxima foto">›</button></dialog>` : ""}`,
  }];
}

export function init({ data, slug, $, $$ }) {
  const g = data?.gallery;
  if (!g) return;
  const photos = g.show ? g.photos : [];
  // filtro por momento
  $$(".gl-chip").forEach(b => b.addEventListener("click", () => {
    $$(".gl-chip").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $$(".gl-item").forEach(li => { li.hidden = !!b.dataset.m && li.dataset.moment !== b.dataset.m; });
  }));
  // foto ampliada
  const box = $("#glBox");
  if (box) {
    let i = 0;
    const visible = () => $$(".gl-item:not([hidden]) .gl-open").map(b => +b.dataset.i);
    const show = k => { i = k; const p = photos[k]; $("#glImg").src = p.url; $("#glImg").alt = photoAlt(g, p); $("#glCap").textContent = [g.moments.find(m => m.key === p.moment)?.label, p.caption].filter(Boolean).join(" · "); };
    const step = d => { const v = visible(); const at = v.indexOf(i); show(v[(at + d + v.length) % v.length]); };
    $$(".gl-open").forEach(b => b.addEventListener("click", () => { show(+b.dataset.i); box.showModal(); }));
    $("#glX").addEventListener("click", () => box.close());
    $("#glPrev").addEventListener("click", () => step(-1));
    $("#glNext").addEventListener("click", () => step(1));
    box.addEventListener("click", e => { if (e.target === box) box.close(); });
    box.addEventListener("keydown", e => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
  }
  // envio
  const f = $("#glForm");
  if (!f) return;
  const err = $("#glErr"), status = $("#glStatus"), btn = f.querySelector("button[type=submit]"), input = $("#glFiles");
  input.addEventListener("change", () => {
    const n = input.files.length;
    $("#glPicked").textContent = n ? `${n} ${n > 1 ? "fotos escolhidas" : "foto escolhida"}${n > MAX_FILES ? ` (vamos enviar as ${MAX_FILES} primeiras)` : ""}` : "Nenhuma foto escolhida";
  });
  f.addEventListener("submit", async e => {
    e.preventDefault(); err.textContent = ""; status.textContent = "";
    const files = [...input.files].slice(0, MAX_FILES);
    if (!files.length) { err.textContent = "Escolha pelo menos uma foto."; return; }
    if (!f.consent.checked) { err.textContent = "Marque que você concorda com a publicação depois da aprovação."; f.consent.focus(); return; }
    btn.disabled = true;
    let sent = 0;
    const dev = deviceId();
    for (const [k, file] of files.entries()) {
      status.textContent = `Enviando ${k + 1} de ${files.length}…`;
      try {
        const small = await compressImage(file, { maxSide: 2000, quality: 0.82 });
        const fd = new FormData();
        fd.append("file", small, small.name); fd.append("author", f.author.value); fd.append("consent", "1");
        await sendForm(`/api/site/${slug}/fotos`, fd, dev ? { "X-Device": dev } : {});
        sent++;
      } catch (x) { err.textContent = `${file.name || "Foto"}: ${x.message}`; if (/Muitas tentativas|fechado/.test(x.message)) break; }
    }
    btn.disabled = false;
    if (sent) {
      f.reset(); $("#glPicked").textContent = "Nenhuma foto escolhida";
      status.innerHTML = `<b>${sent > 1 ? `Recebemos ${sent} fotos` : "Recebemos a sua foto"}!</b> Ela${sent > 1 ? "s aparecem" : " aparece"} aqui depois que os noivos aprovarem. Obrigado.`;
    } else status.textContent = "";
  });
}
