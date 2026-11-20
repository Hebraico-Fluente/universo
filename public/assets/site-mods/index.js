/**
 * Módulos do site público do casal. Cada item carrega um módulo que pode exportar:
 *   name: string (igual ao módulo do servidor; recebe data = mods[name] de /api/site/:slug)
 *   sections({ w, data, esc, icon, money, longDate }) -> [{ id, label, title, inner, cls?, before? }]
 *   init({ w, data, slug, api, $, $$, esc })  (depois de desenhar)
 */
export const SITE_MODS = [
  () => import("./presenca.js"), // convidados: confirmar presença pelo nome (substitui a seção "presenca")
  () => import("./memorias.js"), // midia: memórias pós-casamento e modo aniversário
  () => import("./galeria.js"), // midia: galeria colaborativa (fotos aprovadas + envio dos convidados)
  () => import("./capsula.js"), // midia: cápsula do tempo
  () => import("./lugares.js"), // experiencias: "Nossos lugares" (antes de "O grande dia")
  () => import("./documentario.js"), // experiencias: história em modo documentário (botão na seção História)
  () => import("./concierge.js"), // experiencias: "Pergunte aos noivos"
  () => import("./musica.js"), // editor: música do casal (botão flutuante + player do Spotify só depois do clique)
];
