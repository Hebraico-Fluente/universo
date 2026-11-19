/**
 * Padrinhos e surpresas com sigilo.
 * Regras de sigilo (todas no servidor, nenhuma depende da tela):
 *   - surpresa para o casal (honoree_type='casal') exige data de revelação e NÃO sai em nenhuma rota do casal
 *     (lista, exportação, copiloto, visão geral) antes dessa data — nem a contagem;
 *   - surpresa para um padrinho não aparece no portal desse padrinho e ele não pode ser incluído nela;
 *   - surpresa para uma família não aparece em lugar nenhum do convite;
 *   - no portal, cada padrinho só vê as surpresas que organiza ou das quais foi chamado a participar;
 *   - colaborador de fora entra por link próprio (hash) e só vê aquela surpresa.
 */
import { fail, str, oneOf, isoDate, randomToken, uid, sha256, audit } from "../../lib.js";
import { all, first, run, todaySP, httpsUrl } from "./util.js";

export const KINDS = [["homenagem", "Homenagem"], ["video", "Vídeo coletivo"], ["presente", "Presente coletivo"], ["discurso", "Discurso"], ["outro", "Outra surpresa"]];
export const ROLES = [["madrinha", "Madrinha"], ["padrinho", "Padrinho"], ["dama", "Dama de honra"], ["pajem", "Pajem"], ["testemunha", "Testemunha"], ["outro", "Outro papel"]];

/** O casal pode ver esta surpresa hoje? */
export const visibleToCouple = (s, today = todaySP()) => s.honoree_type !== "casal" || (!!s.reveal_at && s.reveal_at <= today);
/** SQL equivalente (para listas e exportação). */
export const COUPLE_VISIBLE_SQL = "(honoree_type <> 'casal' OR (reveal_at IS NOT NULL AND reveal_at <= ?))";

export async function issuePadrinhoLink(env, W, id, url) {
  const token = randomToken(16);
  await run(env, "UPDATE padrinhos SET token_hash = ?, token_at = datetime('now'), revoked = 0 WHERE id = ? AND wedding_id = ?", await sha256(token), id, W);
  return url.origin + "/padrinhos/" + token;
}

/** Valida e cria uma surpresa. by = "couple" | {padrinho}. */
export async function createSurprise(env, W, b, by, wedding) {
  const kind = oneOf(b.kind, KINDS.map(k => k[0]), "Tipo");
  const title = str(b.title, { min: 2, max: 100, field: "Nome da surpresa" });
  const description = str(b.description, { max: 1200, field: "Descrição" });
  const allowed = by === "couple" ? ["household", "padrinho", "outro"] : ["casal", "padrinho", "outro"];
  const type = oneOf(b.honoree_type, allowed, "Para quem é");
  let ref = null, label = "";
  if (type === "household") {
    const h = await first(env, "SELECT id, name FROM households WHERE id = ? AND wedding_id = ?", String(b.honoree_ref || ""), W);
    if (!h) fail(400, "Família homenageada inválida", "invalid"); ref = h.id; label = h.name;
  } else if (type === "padrinho") {
    const p = await first(env, "SELECT id, name FROM padrinhos WHERE id = ? AND wedding_id = ?", String(b.honoree_ref || ""), W);
    if (!p) fail(400, "Padrinho homenageado inválido", "invalid");
    if (by !== "couple" && p.id === by.id) fail(400, "Você não pode organizar uma surpresa para você mesmo", "invalid");
    ref = p.id; label = p.name;
  } else if (type === "casal") label = wedding.names;
  else label = str(b.honoree_label, { min: 2, max: 80, field: "Quem é homenageado" });
  let reveal = isoDate(b.reveal_at, "Data de revelação");
  if (type === "casal" && !reveal) reveal = wedding.date_iso.slice(0, 10); // sem data: revela no dia do casamento
  const id = uid("sp_");
  await run(env, `INSERT INTO surprises (id, wedding_id, kind, title, description, honoree_type, honoree_ref, honoree_label, reveal_at, organizer_padrinho_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, W, kind, title, description, type, ref, label, reveal, by === "couple" ? null : by.id, by === "couple" ? "couple" : "padrinho:" + by.id);
  if (by !== "couple") await run(env, "INSERT INTO surprise_members (id, wedding_id, surprise_id, name, padrinho_id) VALUES (?, ?, ?, ?, ?)", uid("sm_"), W, id, by.name, by.id);
  await audit(env, W, by === "couple" ? "couple" : "padrinho:" + by.id, "surprise.create", id); // sem título no registro
  return id;
}

/** Inclui um padrinho (pelo portal) ou cria um link de colaborador. Devolve { id, link? }. */
export async function addMember(env, W, s, b, url) {
  if (b.padrinho_id) {
    const p = await first(env, "SELECT id, name FROM padrinhos WHERE id = ? AND wedding_id = ?", String(b.padrinho_id), W);
    if (!p) fail(400, "Padrinho inválido", "invalid");
    if (s.honoree_type === "padrinho" && s.honoree_ref === p.id) fail(400, "Essa pessoa é a homenageada: ela não pode ver a surpresa", "honoree");
    const dup = await first(env, "SELECT id FROM surprise_members WHERE surprise_id = ? AND padrinho_id = ?", s.id, p.id);
    if (dup) return { id: dup.id };
    const id = uid("sm_");
    await run(env, "INSERT INTO surprise_members (id, wedding_id, surprise_id, name, padrinho_id) VALUES (?, ?, ?, ?, ?)", id, W, s.id, p.name, p.id);
    return { id };
  }
  const name = str(b.name, { min: 2, max: 80, field: "Nome do colaborador" });
  const n = (await first(env, "SELECT COUNT(*) AS n FROM surprise_members WHERE surprise_id = ?", s.id)).n;
  if (n >= 80) fail(409, "Esta surpresa já tem colaboradores demais", "too_many");
  const token = randomToken(16), id = uid("sm_");
  await run(env, "INSERT INTO surprise_members (id, wedding_id, surprise_id, name, token_hash) VALUES (?, ?, ?, ?, ?)", id, W, s.id, name, await sha256(token));
  return { id, link: url.origin + "/surpresa/" + token };
}

export async function addPost(env, W, s, author, memberId, b) {
  const message = str(b.message, { min: 2, max: 1500, field: "Mensagem" });
  const link = httpsUrl(b.link, "Link");
  const n = (await first(env, "SELECT COUNT(*) AS n FROM surprise_posts WHERE surprise_id = ?", s.id)).n;
  if (n >= 400) fail(409, "Esta surpresa já tem mensagens demais", "too_many");
  const id = uid("sq_");
  await run(env, "INSERT INTO surprise_posts (id, wedding_id, surprise_id, member_id, author, message, link) VALUES (?, ?, ?, ?, ?, ?, ?)", id, W, s.id, memberId, author, message, link);
  return id;
}

/** Detalhe de uma surpresa (membros + mensagens) para quem pode ver. */
export async function surpriseDetail(env, W, s) {
  const members = await all(env, "SELECT id, name, padrinho_id, token_hash IS NOT NULL AS has_link, revoked FROM surprise_members WHERE surprise_id = ? AND wedding_id = ? ORDER BY created_at, rowid", s.id, W);
  const posts = await all(env, "SELECT id, member_id, author, message, link, created_at FROM surprise_posts WHERE surprise_id = ? AND wedding_id = ? ORDER BY created_at, rowid", s.id, W);
  return { id: s.id, kind: s.kind, title: s.title, description: s.description, honoree_type: s.honoree_type, honoree_label: s.honoree_label, reveal_at: s.reveal_at,
    created_by: s.created_by.startsWith("padrinho:") ? "padrinho" : "couple", members: members.map(m => ({ ...m, has_link: !!m.has_link, revoked: !!m.revoked })), posts };
}
