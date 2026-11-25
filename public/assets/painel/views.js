/**
 * Abas do painel. Cada aba é um módulo com `export default async function()` que desenha em viewEl().
 * ready:false = ainda não aparece no menu (a tela está sendo construída). when(me) = só aparece quando devolver true.
 */
export const VIEWS = [
  { id: "geral", label: "Visão geral", load: () => import("./geral.js") },
  { id: "convidados", label: "Convidados", load: () => import("./convidados.js") },
  { id: "van", label: "Van", load: () => import("./van.js"), when: me => me.wedding.features?.van !== false },
  { id: "mesas", label: "Mesas", load: () => import("./mesas.js") },
  { id: "orcamento", label: "Orçamento", load: () => import("./orcamento.js") },
  { id: "fornecedores", label: "Fornecedores", load: () => import("./fornecedores.js") },
  { id: "tarefas", label: "Tarefas", load: () => import("./tarefas.js") },
  { id: "presentes", label: "Presentes", load: () => import("./presentes.js") },
  { id: "site", label: "Site", load: () => import("./site.js") },
  { id: "fotos", label: "Fotos e memórias", load: () => import("./fotos.js") },
  { id: "extras", label: "Experiências", load: () => import("./extras.js") },
  { id: "privacidade", label: "Privacidade", load: () => import("./privacidade.js") },
];
/** Componentes carregados uma vez em todas as telas (ex.: assistente). Cada um exporta default async function(). */
export const WIDGETS = [
  () => import("./ajuda.js"), // botão "Ajuda": chamados de suporte ao Gueta Studio (módulo plataforma)
  () => import("./copilot.js"), // copiloto dos noivos (módulo experiencias)
];
