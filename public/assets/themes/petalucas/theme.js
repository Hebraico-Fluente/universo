/**
 * Animações da identidade de Pétala & Lucas.
 * Pétalas caindo (o nome dela é Pétala), corações no "Confirmar presença", linha do cronograma que se desenha.
 * Tudo desligado para quem prefere movimento reduzido.
 */
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#DE826A", "#F0A48F", "#C9D6BE", "#E9C89B"];
const PETAL = '<svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 0C16 6 20 13 17 20c-2 5-5 8-7 8s-5-3-7-8C0 13 4 6 10 0z" fill="currentColor"/><path d="M10 4v20" stroke="rgba(255,255,255,.45)" stroke-width="1" fill="none"/></svg>';
const HEART = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21S1.5 14.5 1.5 7.5A5.5 5.5 0 0112 4.4 5.5 5.5 0 0122.5 7.5C22.5 14.5 12 21 12 21z" fill="currentColor"/></svg>';
const rnd = (a, b) => a + Math.random() * (b - a);

/** Pétalas caindo dentro de um elemento (camada atrás do conteúdo). */
function petals(host, count, { burst = false } = {}) {
  const layer = document.createElement("div");
  layer.className = "petals";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "petal";
    p.innerHTML = PETAL;
    p.style.left = rnd(-5, 100) + "%";
    p.style.color = COLORS[i % COLORS.length];
    p.style.setProperty("--s", rnd(.6, 1.25).toFixed(2));
    p.style.setProperty("--sway", rnd(30, 90).toFixed(0) + "px");
    p.style.setProperty("--spin", (rnd(-1, 1) > 0 ? 1 : -1) * rnd(200, 520).toFixed(0) + "deg");
    p.style.animationDuration = (burst ? rnd(2.6, 4.2) : rnd(9, 16)).toFixed(1) + "s";
    p.style.animationDelay = (burst ? rnd(0, .8) : rnd(-16, 0)).toFixed(1) + "s"; // atraso negativo: já começam espalhadas
    if (burst) p.style.animationIterationCount = "1";
    layer.append(p);
  }
  host.prepend(layer);
  if (burst) setTimeout(() => layer.remove(), 6000);
  return layer;
}

/** Corações que sobem de um botão. */
function hearts(from) {
  const r = from.getBoundingClientRect();
  for (let i = 0; i < 9; i++) {
    const h = document.createElement("span");
    h.className = "heart-pop";
    h.innerHTML = HEART;
    h.style.left = r.left + r.width / 2 + rnd(-r.width / 3, r.width / 3) + "px";
    h.style.top = r.top + rnd(-4, 8) + "px";
    h.style.color = COLORS[i % 2];
    h.style.setProperty("--dx", rnd(-60, 60).toFixed(0) + "px");
    h.style.setProperty("--s", rnd(.7, 1.3).toFixed(2));
    h.style.animationDelay = (i * 40) + "ms";
    document.body.append(h);
    setTimeout(() => h.remove(), 1800);
  }
}

export function site() {
  if (reduce()) return;
  const hero = document.querySelector(".hero");
  if (hero) petals(hero, innerWidth < 640 ? 10 : 16);

  // corações no botão principal
  document.querySelectorAll(".hero-acts .btn.accent, .gb-form .btn").forEach(b => b.addEventListener("click", () => hearts(b)));

  // linha do cronograma que se desenha conforme a rolagem
  const sch = document.querySelector(".schedule");
  if (sch) {
    const line = document.createElement("span");
    line.className = "sch-line"; line.setAttribute("aria-hidden", "true");
    sch.prepend(line);
    const draw = () => {
      const r = sch.getBoundingClientRect(), vh = innerHeight;
      const p = Math.min(1, Math.max(0, (vh * .75 - r.top) / r.height));
      line.style.transform = `scaleY(${p.toFixed(3)})`;
    };
    addEventListener("scroll", draw, { passive: true }); draw();
  }
}

export function envelope(env) {
  if (reduce()) return;
  setTimeout(() => petals(document.body, 22, { burst: true }), 350);
  env.classList.add("pl-open");
}
