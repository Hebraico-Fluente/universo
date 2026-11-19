/**
 * Gera o link de uso único para criar um ADMINISTRADOR da plataforma. Rode LOCALMENTE:
 *   node scripts/platform-link.mjs [https://universo.moshikg10.workers.dev]
 * Mostra o LINK (fica só com você; abra no navegador) e o HASH (o único dado que vai para o GitHub/banco).
 * Depois rode o workflow "Criar administrador da plataforma" no GitHub com o hash e a validade em dias.
 */
import { randomToken, sha256 } from "../src/lib.js";
const base = (process.argv[2] || "https://universo.moshikg10.workers.dev").replace(/\/+$/, "");
if (!/^https?:\/\/[a-z0-9.:-]+$/i.test(base)) { console.error("uso: node scripts/platform-link.mjs [https://endereco-da-plataforma]"); process.exit(1); }
const token = randomToken(24);
console.log(JSON.stringify({ token_hash: await sha256(token), link: `${base}/plataforma?convite=${token}` }, null, 2));
