/** Utilidades de interface compartilhadas (sem dependências). */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Escapa texto antes de inserir em HTML (tudo que vem da API passa por aqui). */
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TZ = "America/Sao_Paulo";
export const fmt = (iso, o) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...o }).format(new Date(iso));
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
export const longDate = iso => cap(fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
export const time = iso => fmt(iso, { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
export const money = c => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: c % 100 ? 2 : 0 });
export const daysUntil = iso => Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 864e5));

export function countdown(el, iso) {
  const labels = ["dias", "horas", "min", "seg"];
  el.innerHTML = labels.map(l => `<div><b class="num"></b><small>${l}</small></div>`).join("");
  const cells = [...el.querySelectorAll("b")];
  const tick = () => {
    let s = Math.max(0, Math.floor((new Date(iso) - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
    [d, h, m, s].forEach((v, i) => {
      const t = String(v).padStart(2, "0"), b = cells[i];
      if (b.textContent === t) return;
      b.textContent = t;
      b.classList.remove("tick"); void b.offsetWidth; b.classList.add("tick"); // reinicia a animação da virada
    });
  };
  tick(); return setInterval(tick, 1000);
}

/** Revela elementos .rv ao entrar na tela. */
export function reveal(root = document) {
  if (!("IntersectionObserver" in window)) return $$(".rv", root).forEach(e => e.classList.add("in-view"));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".rv:not(.in-view)", root).forEach((el, i) => { el.style.transitionDelay = (i % 3) * 90 + "ms"; io.observe(el); });
}

/** Chamada à API com tratamento de erro uniforme. */
export async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(data?.error || "Algo deu errado. Tente de novo."); e.status = r.status; e.code = data?.code; throw e; }
  return data;
}

export const mapsLink = q => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
