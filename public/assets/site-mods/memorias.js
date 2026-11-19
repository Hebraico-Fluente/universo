/**
 * Site: memórias pós-casamento e modo aniversário (módulo "midia").
 *  • Memórias (o casal liga no painel; só depois da data): votos e discursos, playlist, linha do tempo do grande dia.
 *    A galeria por momento vem de galeria.js.
 *  • Aniversário (no dia): retrospectiva "há N anos" com fotos aprovadas e, se o casal quiser, convite de renovação de votos.
 */
import { css, photoAlt } from "./galeria.js";

export const name = "midia";
css();

const KIND = { vow: "Votos", speech: "Discurso", other: "Lembrança" };
const paras = (esc, t) => String(t || "").split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

export function sections({ data, esc, w }) {
  const out = [];
  const a = data?.anniversary, m = data?.memories;
  if (a) out.push({
    id: "aniversario", label: "Aniversário", before: "historia", cls: "an-sec",
    title: `Há ${a.years} ${a.years > 1 ? "anos" : "ano"}, <em>a gente dizia sim</em>`,
    inner: `<div class="an rv">
      <p class="an-lead">Hoje faz ${a.years} ${a.years > 1 ? "anos" : "ano"} do casamento de ${esc(w.names)}. Obrigado por fazer parte dessa história.</p>
      ${a.photos.length ? `<ul class="an-strip">${a.photos.map(p => `<li><img src="${esc(p.url)}" alt="${esc(photoAlt(data.gallery || { moments: [] }, p))}" loading="lazy" decoding="async"></li>`).join("")}</ul>` : ""}
      ${a.renewal_text ? `<aside class="an-renew"><p class="label">Renovação dos votos</p>${paras(esc, a.renewal_text)}</aside>` : ""}
      ${data.gallery?.photos?.length ? `<a class="btn ghost" href="#galeria">Ver todas as fotos</a>` : ""}
    </div>`,
  });
  if (m && (m.items.length || m.timeline.length || m.playlist_url)) out.push({
    id: "memorias", label: "Memórias", before: "historia",
    title: "O nosso dia, <em>para sempre</em>",
    inner: `<div class="mm">
      ${m.items.length ? `<div class="mm-items">${m.items.map(k => `<article class="mm-card rv">
        <p class="label">${esc(KIND[k.kind] || KIND.other)}</p><h3>${esc(k.title)}</h3>
        ${k.media ? media(esc, k) : ""}
        ${k.body ? (k.body.length > 420 ? `<details class="mm-more"><summary>Ler o texto</summary>${paras(esc, k.body)}</details>` : `<div class="mm-body">${paras(esc, k.body)}</div>`) : ""}
      </article>`).join("")}</div>` : ""}
      <div class="mm-side">
        ${m.timeline.length ? `<section class="mm-tl rv" aria-labelledby="mmTl"><h3 id="mmTl">Linha do tempo do grande dia</h3><ol>${m.timeline.map(t => `<li><span class="num">${esc(t.time)}</span><div><b>${esc(t.title)}</b>${t.text ? `<p>${esc(t.text)}</p>` : ""}</div></li>`).join("")}</ol></section>` : ""}
        ${m.playlist_url ? `<p class="mm-pl rv"><span class="label">Trilha sonora</span><a class="btn ghost" href="${esc(m.playlist_url)}" target="_blank" rel="noopener noreferrer">Ouvir a playlist da festa</a></p>` : ""}
      </div>
    </div>`,
  });
  return out;
}
function media(esc, k) {
  const t = k.media.type || "";
  if (t.startsWith("audio/")) return `<audio class="mm-audio" controls preload="none" src="${esc(k.media.url)}" aria-label="Áudio: ${esc(k.title)}"></audio>`;
  if (t.startsWith("video/")) return `<video class="mm-video" controls preload="metadata" playsinline src="${esc(k.media.url)}" aria-label="Vídeo: ${esc(k.title)}"></video>${k.body ? "" : `<p class="hint">Sem legenda escrita.</p>`}`;
  if (t.startsWith("image/")) return `<img class="mm-img" src="${esc(k.media.url)}" alt="${esc(k.title)}" loading="lazy">`;
  return `<a class="link" href="${esc(k.media.url)}" download>Baixar o arquivo</a>`;
}

export function init({ data }) {
  // depois do casamento, a confirmação de presença sai de cena
  if (data?.memories) document.body.classList.add("is-memories");
  if (data?.anniversary) document.body.classList.add("is-anniversary");
}
