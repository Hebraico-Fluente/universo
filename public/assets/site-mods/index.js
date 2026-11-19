/**
 * Módulos do site público do casal. Cada item carrega um módulo que pode exportar:
 *   name: string (igual ao módulo do servidor; recebe data = mods[name] de /api/site/:slug)
 *   sections({ w, data, esc, icon, money, longDate }) -> [{ id, label, title, inner, cls?, before? }]
 *   init({ w, data, slug, api, $, $$, esc })  (depois de desenhar)
 */
export const SITE_MODS = [];
