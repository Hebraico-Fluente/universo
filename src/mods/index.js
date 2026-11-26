/**
 * Módulos do Universo. Cada módulo é dono das suas rotas, tabelas e telas.
 * Contrato em src/mods/README.md. A ordem importa só para rotas que se sobrepõem.
 */
import convidados from "./convidados.js";
import organizacao from "./organizacao.js";
import plataforma from "./plataforma.js";
import editor from "./editor.js";
import midia from "./midia.js";
import experiencias from "./experiencias.js";
import agenda from "./agenda.js";
import quiz from "./quiz.js";
import aniversario from "./aniversario.js";
import van from "./van.js";
import cartao from "./cartao.js";

// aniversario antes de plataforma: a rota /api/platform/aniversarios é dele (plataforma responde 404 ao resto de /api/platform/*)
export const MODS = [convidados, organizacao, aniversario, plataforma, editor, midia, experiencias, agenda, quiz, van, cartao];
