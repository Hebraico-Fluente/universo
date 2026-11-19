/**
 * Abas do painel. Cada aba é um módulo com `export default async function()` que desenha em viewEl().
 * ready:false = ainda não aparece no menu (a tela está sendo construída).
 */
export const VIEWS = [
  { id: "geral", label: "Visão geral", load: () => import("./geral.js") },
  { id: "convidados", label: "Convidados", load: () => import("./convidados.js") },
  { id: "mesas", label: "Mesas", load: () => import("./mesas.js"), ready: false },
  { id: "orcamento", label: "Orçamento", load: () => import("./orcamento.js") },
  { id: "fornecedores", label: "Fornecedores", load: () => import("./fornecedores.js"), ready: false },
  { id: "tarefas", label: "Tarefas", load: () => import("./tarefas.js"), ready: false },
  { id: "presentes", label: "Presentes", load: () => import("./presentes.js") },
  { id: "site", label: "Site", load: () => import("./site.js"), ready: false },
  { id: "fotos", label: "Fotos e memórias", load: () => import("./fotos.js"), ready: false },
  { id: "extras", label: "Experiências", load: () => import("./extras.js"), ready: false },
  { id: "privacidade", label: "Privacidade", load: () => import("./privacidade.js"), ready: false },
];
/** Componentes carregados uma vez em todas as telas (ex.: assistente). Cada um exporta default async function(). */
export const WIDGETS = [];
