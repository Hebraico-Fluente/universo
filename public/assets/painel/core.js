/** Estado e utilitários compartilhados pelas telas do painel (cada tela é um módulo em /assets/painel/). */
export const state = { me: null };
export const viewEl = () => document.querySelector("#view");
export const fail = e => {
  viewEl().innerHTML = `<p class="error">${String(e.message).replace(/[<>&]/g, "")}</p>`;
  if (e.status === 401) location.reload();
};
/** Carrega uma folha de estilo uma única vez (telas podem ter CSS próprio). */
export function css(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l);
}
