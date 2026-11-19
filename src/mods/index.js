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

export const MODS = [convidados, organizacao, plataforma, editor, midia, experiencias];
