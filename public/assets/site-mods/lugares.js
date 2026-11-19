/** "Nossos lugares": os lugares marcantes do casal, numa linha ilustrada, com link para abrir no mapa (sem mapa embutido). */
import { loadCss } from "./concierge.js";
export const name = "experiencias";

const maps = q => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

export function sections({ data, esc, icon }) {
  const L = data?.lugares || [];
  if (!L.length) return [];
  loadCss("/assets/site-mods/lugares.css");
  return [{ id: "lugares", label: "Nossos lugares", title: "Os lugares <em>da nossa história</em>", before: "dia",
    inner: `<ol class="lg-route" aria-label="Lugares marcantes do casal">${L.map((p, i) => `<li class="lg-stop rv">
      <span class="lg-pin" aria-hidden="true">${icon("pin")}</span>
      <article class="lg-card">
        <p class="lg-yr num">${esc(p.year || String(i + 1).padStart(2, "0"))}</p>
        <h3>${esc(p.name)}</h3>
        ${p.text ? `<p class="lg-txt">${esc(p.text)}</p>` : ""}
        ${p.address ? `<p class="lg-addr">${esc(p.address)}</p><a class="lg-map" href="${esc(maps(p.address))}" target="_blank" rel="noopener">Abrir no mapa <span aria-hidden="true">↗</span><span class="sr"> (abre o Google Maps)</span></a>` : ""}
      </article></li>`).join("")}</ol>` }];
}
