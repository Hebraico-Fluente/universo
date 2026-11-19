/**
 * Gera um link de acesso ao painel (uso único). Rode LOCALMENTE:
 *   node scripts/access-link.mjs petala-e-lucas [owner|planner|viewer]
 * Mostra o LINK (entregue só ao casal, em privado) e o HASH (o único dado que vai para o GitHub/banco).
 * Depois rode o workflow "Criar acesso ao painel" no GitHub com o slug, o papel e o hash.
 */
import { randomToken, sha256 } from "../src/lib.js";
const [slug = "", role = "owner"] = process.argv.slice(2);
if (!/^[a-z0-9-]{3,60}$/.test(slug) || !["owner", "planner", "viewer"].includes(role)) { console.error("uso: node scripts/access-link.mjs <slug> [owner|planner|viewer]"); process.exit(1); }
const token = randomToken(24);
console.log(JSON.stringify({ slug, role, token_hash: await sha256(token), link: `https://universo.moshikg10.workers.dev/painel?acesso=${token}` }, null, 2));
