/**
 * Módulo "experiencias" (contrato em src/mods/README.md).
 *
 * Público (sem login; nada pessoal):
 *   GET  /api/site/:slug/concierge?q=          concierge do site (só dados publicados)
 *   GET  /api/invite/:token/concierge?q=       concierge do convite (+ mesa e cardápio da própria família)
 *   POST /api/invite/:token/exp/quest/:id      marca/desmarca desafio feito  { done }
 *   POST /api/invite/:token/exp/checkin/:evId  "cheguei" no dia do evento (passaporte)
 *   POST /api/invite/:token/exp/segredo/:id    marca a mensagem secreta como aberta
 *   GET  /api/padrinhos/:token                 portal do padrinho (instruções, roteiro, tarefas, mural, surpresas)
 *   POST /api/padrinhos/:token/tasks/:id | /wall | /surprises | /surprises/:id/(members|posts)   ·   DELETE /wall/:id | /surprises/:id
 *   GET  /api/surpresa/:token  ·  POST /api/surpresa/:token/posts      colaborador de uma surpresa (link próprio)
 * Casal (/api/admin/exp/...): settings, concierge, padrinhos, segredos, surpresas, quest, passaporte, lugares, jornal, copilot.
 * Páginas privadas: /padrinhos/:token e /surpresa/:token (public/padrinhos.html), /c/:slug/jornal (public/jornal.html).
 */
import { json, fail, str, int, oneOf, isoDate, body, uid, sha256, rateLimit, clientIp, audit, parseJson } from "../lib.js";
import { featureOn } from "./plataforma.js";
import { ITEMS, KEYS, all, first, run, settingsRow, saveSettings, flagsFrom, flagsOf, needOn, todaySP, dateSP, norm, byToken, localUrl } from "./experiencias/util.js";
import { knowledge, ask, TOPICS } from "./experiencias/concierge.js";
import { copilot, polish, SUGGESTIONS } from "./experiencias/copilot.js";
import { KINDS, ROLES, visibleToCouple, COUPLE_VISIBLE_SQL, issuePadrinhoLink, createSurprise, addMember, addPost, surpriseDetail } from "./experiencias/surpresas.js";

const LIMIT = { concierge: 90, write: 40, portal: 150 };

export const QUEST = [
  ["infancia", "Alguém de longa data", "Encontre alguém que conhece o casal desde a infância e peça uma história dessa época."],
  ["foto", "Um momento para guardar", "Fotografe um momento da festa que você quer lembrar para sempre."],
  ["quiz", "Quiz do casal", "Responda o quiz “Quanto você conhece o casal?” no site."],
  ["surpresa_site", "A surpresa escondida", "Ache a surpresa escondida no site do casamento."],
  ["brinde", "Brinde novo", "Faça um brinde com alguém que você acabou de conhecer."],
  ["pista", "Pé na pista", "Dance uma música inteira, do começo ao fim."],
  ["recado", "Deixe um carinho", "Escreva um recado para os noivos no mural do site."],
  ["historia", "Detetive do amor", "Descubra como o casal se conheceu, perguntando a alguém da festa."],
  ["conselho", "Conselho de quem sabe", "Peça a um casal com muitos anos juntos um conselho para os noivos."],
];

/* ---------------- convite: família pelo token (mesmas regras do convite) ---------------- */
async function household(env, req, token, bucket = "exp-inv", max = LIMIT.concierge) {
  await rateLimit(env, bucket + ":" + clientIp(req), max);
  const h = await first(env, "SELECT * FROM households WHERE token_hash = ? AND revoked = 0 AND waitlist = 0", await sha256(token));
  if (!h) fail(404, "Convite não encontrado. Peça um link novo aos noivos.", "invite_not_found");
  const w = await first(env, "SELECT * FROM weddings WHERE id = ?", h.wedding_id);
  return { h, w, flags: flagsFrom(w, await settingsRow(env, w.id)) };
}
const publicW = w => ({ names: w.names, date: w.date_iso, city: w.city, slug: w.slug, theme: w.theme || "", universe: w.universe, venue_name: w.venue_name || "", is_demo: !!w.is_demo });

/* ---------------- portal dos padrinhos ---------------- */
async function padrinhoCtx(env, req, token) {
  const me = await byToken(env, req, "padrinhos", token, "exp-pad", LIMIT.portal);
  const w = await first(env, "SELECT * FROM weddings WHERE id = ?", me.wedding_id);
  const flags = flagsFrom(w, await settingsRow(env, w.id));
  if (!flags.padrinhos) fail(404, "Link não encontrado. Peça um novo aos noivos.", "not_found");
  return { me, w, W: w.id, flags };
}
/** Surpresas que este padrinho pode ver: organiza ou participa, e nunca as em que é o homenageado. */
async function mySurprises(env, W, me) {
  return all(env, `SELECT s.* FROM surprises s WHERE s.wedding_id = ? AND NOT (s.honoree_type = 'padrinho' AND s.honoree_ref = ?)
    AND (s.organizer_padrinho_id = ? OR EXISTS (SELECT 1 FROM surprise_members m WHERE m.surprise_id = s.id AND m.padrinho_id = ? AND m.revoked = 0)) ORDER BY s.created_at`, W, me.id, me.id, me.id);
}
async function mySurprise(env, W, me, id) {
  const s = (await mySurprises(env, W, me)).find(x => x.id === id);
  if (!s) fail(404, "Surpresa não encontrada", "not_found");
  return s;
}
async function portal(env, c) {
  const { me, w, W, flags } = c;
  const info = parseJson((await settingsRow(env, W)).padrinhos_json, {}) || {};
  const tasks = await all(env, "SELECT id, title, notes, due_date, done_at, padrinho_id IS NULL AS everyone FROM padrinho_tasks WHERE wedding_id = ? AND (padrinho_id IS NULL OR padrinho_id = ?) ORDER BY due_date IS NULL, due_date, created_at", W, me.id);
  const wall = await all(env, "SELECT w.id, w.message, w.created_at, p.name AS author, p.role, w.padrinho_id = ? AS mine FROM padrinho_wall w LEFT JOIN padrinhos p ON p.id = w.padrinho_id WHERE w.wedding_id = ? ORDER BY w.created_at DESC, w.rowid DESC LIMIT 200", me.id, W);
  const team = await all(env, "SELECT id, name, role FROM padrinhos WHERE wedding_id = ? ORDER BY created_at, rowid", W);
  const events = await all(env, "SELECT name, starts_at, venue, address FROM events WHERE wedding_id = ? AND is_public = 1 ORDER BY sort, starts_at", W);
  const surprises = flags.surpresas ? await Promise.all((await mySurprises(env, W, me)).map(async s => ({ ...(await surpriseDetail(env, W, s)), organizer: s.organizer_padrinho_id === me.id }))) : [];
  return json({
    wedding: publicW(w), me: { id: me.id, name: me.name, role: me.role }, flags: { surpresas: flags.surpresas },
    info: { instructions: info.instructions || "", dress: info.dress || "", schedule: info.schedule || [], contacts: info.contacts || [] },
    events, tasks: tasks.map(t => ({ ...t, everyone: !!t.everyone, done: !!t.done_at })), wall: wall.map(x => ({ ...x, mine: !!x.mine })),
    team: team.map(t => ({ ...t, me: t.id === me.id })), surprises, kinds: KINDS, roles: ROLES,
  });
}
async function padrinhoRoutes(ctx, token, rest) {
  const { req, env, url, m } = ctx;
  const c = await padrinhoCtx(env, req, token);
  const { me, W, w, flags } = c;
  if (m === "GET" && !rest) return portal(env, c);
  if (m === "GET") return null;
  ctx.sameOrigin();
  await rateLimit(env, "exp-pad-w:" + clientIp(req), LIMIT.write);
  let r;
  if (m === "POST" && (r = rest.match(/^\/tasks\/([\w-]{2,40})$/))) {
    const t = await first(env, "SELECT id FROM padrinho_tasks WHERE id = ? AND wedding_id = ? AND (padrinho_id IS NULL OR padrinho_id = ?)", r[1], W, me.id);
    if (!t) fail(404, "Tarefa não encontrada", "not_found");
    const b = await body(req, 2000);
    await run(env, "UPDATE padrinho_tasks SET done_at = ?, done_by = ? WHERE id = ? AND wedding_id = ?", b.done ? new Date().toISOString() : null, b.done ? me.name : null, t.id, W);
    return json({ ok: true });
  }
  if (rest === "/wall" && m === "POST") {
    const b = await body(req, 4000);
    const id = uid("pw_");
    await run(env, "INSERT INTO padrinho_wall (id, wedding_id, padrinho_id, message) VALUES (?, ?, ?, ?)", id, W, me.id, str(b.message, { min: 2, max: 800, field: "Mensagem" }));
    return json({ id }, 201);
  }
  if (m === "DELETE" && (r = rest.match(/^\/wall\/([\w-]{2,40})$/))) {
    const done = await run(env, "DELETE FROM padrinho_wall WHERE id = ? AND wedding_id = ? AND padrinho_id = ?", r[1], W, me.id);
    if (!done.meta?.changes) fail(404, "Mensagem não encontrada", "not_found");
    return json({ ok: true });
  }
  if (!flags.surpresas) return null;
  if (rest === "/surprises" && m === "POST") return json({ id: await createSurprise(env, W, await body(req, 6000), me, w) }, 201);
  if ((r = rest.match(/^\/surprises\/([\w-]{2,40})(\/members|\/posts)?$/))) {
    const s = await mySurprise(env, W, me, r[1]);
    if (m === "POST" && r[2] === "/posts") return json({ id: await addPost(env, W, s, me.name, (await first(env, "SELECT id FROM surprise_members WHERE surprise_id = ? AND padrinho_id = ?", s.id, me.id))?.id || null, await body(req, 6000)) }, 201);
    if (s.organizer_padrinho_id !== me.id) fail(403, "Só quem organiza pode fazer isso", "forbidden");
    if (m === "POST" && r[2] === "/members") return json(await addMember(env, W, s, await body(req, 2000), url), 201);
    if (m === "DELETE" && !r[2]) { await run(env, "DELETE FROM surprises WHERE id = ? AND wedding_id = ?", s.id, W); await audit(env, W, "padrinho:" + me.id, "surprise.delete", s.id); return json({ ok: true }); }
  }
  if (m === "POST" && (r = rest.match(/^\/surprises\/([\w-]{2,40})\/members\/([\w-]{2,40})\/revoke$/))) {
    const s = await mySurprise(env, W, me, r[1]);
    if (s.organizer_padrinho_id !== me.id) fail(403, "Só quem organiza pode fazer isso", "forbidden");
    await run(env, "UPDATE surprise_members SET revoked = 1 WHERE id = ? AND surprise_id = ? AND wedding_id = ?", r[2], s.id, W);
    return json({ ok: true });
  }
  return null;
}

/* ---------------- colaborador de surpresa (link próprio) ---------------- */
async function collaboratorRoutes(ctx, token, rest) {
  const { req, env, m } = ctx;
  const mem = await byToken(env, req, "surprise_members", token, "exp-sur", LIMIT.portal);
  const s = await first(env, "SELECT * FROM surprises WHERE id = ? AND wedding_id = ?", mem.surprise_id, mem.wedding_id);
  const w = await first(env, "SELECT * FROM weddings WHERE id = ?", mem.wedding_id);
  if (!s || !flagsFrom(w, await settingsRow(env, w.id)).surpresas) fail(404, "Link não encontrado.", "not_found");
  if (m === "GET" && !rest) {
    const d = await surpriseDetail(env, w.id, s);
    return json({ wedding: publicW(w), me: { name: mem.name }, surprise: { ...d, members: d.members.filter(x => !x.revoked).map(x => ({ name: x.name })), posts: d.posts.map(p => ({ ...p, mine: p.member_id === mem.id })) }, kinds: KINDS });
  }
  if (m === "POST" && rest === "/posts") {
    ctx.sameOrigin(); await rateLimit(env, "exp-sur-w:" + clientIp(req), LIMIT.write);
    return json({ id: await addPost(env, w.id, s, mem.name, mem.id, await body(req, 6000)) }, 201);
  }
  return null;
}

/* ---------------- jornal (dados publicados) ---------------- */
const plain = s => norm(s).replace(/[^a-z]/g, "").toUpperCase();
/** Palavras-cruzadas: só palavras que já estão publicadas no site, com dicas tiradas do próprio conteúdo. */
export function crosswordWords(w, events) {
  const out = [], seen = new Set();
  const add = (word, clue) => { const p = plain(word); if (p.length >= 3 && p.length <= 13 && !seen.has(p)) { seen.add(p); out.push({ word: p, clue }); } };
  const longest = t => String(t || "").split(/[\s,.;:!?·–—"“”()]+/).filter(x => plain(x).length >= 4).sort((a, b) => plain(b).length - plain(a).length)[0];
  const blank = (t, wd) => String(t).replace(wd, "_".repeat(Math.min(10, plain(wd).length)));
  const names = String(w.names).split("&").map(x => x.trim().split(" ")[0]);
  names.forEach((n, i) => add(n, i === 0 ? "O primeiro nome no convite" : "O segundo nome no convite"));
  const city = String(w.city || "").split("·")[0].trim();
  if (city && !/\s/.test(city)) add(city, "A cidade do casamento");
  for (const s of parseJson(w.story_json, []) || []) { const wd = longest(s.title); if (wd) add(wd, `“${blank(s.title, wd)}” (${s.year})`); }
  for (const q of parseJson(w.quiz_json, []) || []) { const a = q.options?.[q.answer]; if (a && !/\s/.test(a.trim())) add(a.trim(), q.q); }
  for (const e of events) { const wd = longest(e.venue); if (wd) add(wd, `${blank(e.venue, wd)} (${e.name.toLowerCase()})`); }
  if (w.venue_name) { const wd = longest(w.venue_name); if (wd) add(wd, `Onde é a festa: ${blank(w.venue_name, wd)}`); }
  return out.slice(0, 12);
}
async function jornal(env, W) {
  const w = await first(env, "SELECT * FROM weddings WHERE id = ?", W);
  const events = await all(env, "SELECT name, starts_at, venue, address, dress_code FROM events WHERE wedding_id = ? AND is_public = 1 ORDER BY sort, starts_at", W);
  const messages = w.guestbook ? await all(env, "SELECT id, author, message, created_at FROM guestbook WHERE wedding_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 60", W) : [];
  const quiz = (parseJson(w.quiz_json, []) || []).map(q => ({ q: q.q, answer: q.options?.[q.answer] || "", fact: q.fact || "" }));
  return json({
    wedding: { ...publicW(w), welcome: w.welcome || "" }, story: (parseJson(w.story_json, []) || []).map(s => ({ year: s.year, title: s.title, text: s.text })),
    quiz, events, schedule: parseJson(w.schedule_json, []) || [], messages, words: crosswordWords(w, events),
    config: parseJson((await settingsRow(env, W)).jornal_json, {}) || {},
  });
}

/* ---------------- painel do casal ---------------- */
const cleanList = (v, max, map) => (Array.isArray(v) ? v : []).slice(0, max).map(map).filter(Boolean);
async function own(env, table, id, W, label = "Registro") {
  const row = await first(env, `SELECT * FROM ${table} WHERE id = ? AND wedding_id = ?`, id, W);
  if (!row) fail(404, `${label} não encontrado`, "not_found");
  return row;
}

async function admin(ctx) {
  const { req, env, url, p, m, W, actor } = ctx;
  if (!p.startsWith("/api/admin/exp")) return null;
  const sub = p.slice("/api/admin/exp".length) || "/";
  const w = await first(env, "SELECT * FROM weddings WHERE id = ?", W);
  const settings = await settingsRow(env, W);
  const flags = flagsFrom(w, settings);
  const today = todaySP();
  let r;

  /* interruptores e configurações */
  if (sub === "/" && m === "GET") {
    const mine = parseJson(settings.flags_json, {}) || {};
    return json({ flags, items: ITEMS.map(i => ({ key: i.key, label: i.label, text: i.text, where: i.where, on: flags[i.key], couple: typeof mine[i.key] === "boolean" ? mine[i.key] : i.on, blocked: !!i.platform && !featureOn(w, i.platform) })),
      padrinhos: parseJson(settings.padrinhos_json, {}) || {}, soundtrack: parseJson(settings.soundtrack_json, {}) || {}, jornal: parseJson(settings.jornal_json, {}) || {},
      slug: w.slug, has_story: (parseJson(w.story_json, []) || []).length, topics: TOPICS, kinds: KINDS, roles: ROLES, quest_templates: QUEST.map(([key, title, text]) => ({ key, title, text })) });
  }
  if (sub === "/settings" && m === "PATCH") {
    const b = await body(req, 20000), patch = {};
    if (b.flags && typeof b.flags === "object") {
      const cur = parseJson(settings.flags_json, {}) || {};
      for (const [k, v] of Object.entries(b.flags)) { oneOf(k, KEYS, "Experiência"); if (typeof v !== "boolean") fail(400, "Interruptor: valor inválido", "invalid"); cur[k] = v; }
      patch.flags_json = JSON.stringify(cur);
      await audit(env, W, actor, "exp.flags", Object.entries(b.flags).map(([k, v]) => k + "=" + (v ? "on" : "off")).join(","));
    }
    if (b.padrinhos) {
      const x = b.padrinhos;
      patch.padrinhos_json = JSON.stringify({ instructions: str(x.instructions, { max: 3000, field: "Instruções" }), dress: str(x.dress, { max: 1200, field: "Traje dos padrinhos" }),
        schedule: cleanList(x.schedule, 30, s => s && (s.text || s.time) ? { time: str(s.time, { max: 12, field: "Horário" }), text: str(s.text, { max: 200, field: "Roteiro" }) } : null),
        contacts: cleanList(x.contacts, 20, c => c && (c.label || c.value) ? { label: str(c.label, { max: 60, field: "Contato" }), value: str(c.value, { max: 80, field: "Telefone ou e-mail" }) } : null) });
    }
    if (b.soundtrack) patch.soundtrack_json = JSON.stringify({ url: localUrl(b.soundtrack.url, "Arquivo de áudio"), title: str(b.soundtrack.title, { max: 100, field: "Nome da trilha" }), song: str(b.soundtrack.song, { max: 100, field: "Música para ouvir fora" }) });
    if (b.jornal) {
      const x = b.jornal, secs = {};
      for (const k of ["historia", "curiosidades", "programacao", "recados", "cruzadas"]) secs[k] = x.sections?.[k] !== false;
      const ids = (await all(env, "SELECT id FROM guestbook WHERE wedding_id = ? AND status = 'approved'", W)).map(g => g.id);
      patch.jornal_json = JSON.stringify({ headline: str(x.headline, { max: 120, field: "Manchete" }), note: str(x.note, { max: 400, field: "Nota da edição" }), sections: secs,
        messages: Array.isArray(x.messages) ? x.messages.filter(id => ids.includes(id)).slice(0, 12) : null });
    }
    await saveSettings(env, W, patch);
    return json({ ok: true, flags: flagsFrom(w, await settingsRow(env, W)) });
  }

  /* copiloto (GET: também para quem tem acesso só de leitura) */
  if (sub === "/copilot" && m === "GET") {
    needOn(flags, "copilot");
    await rateLimit(env, "exp-copilot:" + W, 400);
    const q = url.searchParams.get("q") || "";
    return json({ ...(await polish(env, await copilot(env, W, q))), suggestions: SUGGESTIONS });
  }

  /* concierge: respostas do casal + teste */
  if (sub === "/concierge" && m === "GET") return json({ answers: await all(env, "SELECT id, topic, question, answer, keywords, sort FROM concierge_answers WHERE wedding_id = ? ORDER BY sort, rowid", W), topics: TOPICS });
  if (sub === "/concierge/test" && m === "GET") return json(ask(await knowledge(env, w), url.searchParams.get("q") || ""));
  if (sub === "/concierge" && m === "POST") {
    const b = await body(req, 8000), id = uid("ca_");
    const n = (await first(env, "SELECT COUNT(*) AS n FROM concierge_answers WHERE wedding_id = ?", W)).n;
    if (n >= 60) fail(409, "Limite de 60 respostas", "too_many");
    await run(env, "INSERT INTO concierge_answers (id, wedding_id, topic, question, answer, keywords, sort) VALUES (?, ?, ?, ?, ?, ?, ?)", id, W,
      oneOf(b.topic, TOPICS.map(t => t[0]), "Assunto"), str(b.question, { max: 160, field: "Pergunta" }), str(b.answer, { min: 2, max: 1200, field: "Resposta" }), str(b.keywords, { max: 200, field: "Palavras-chave" }), n);
    return json({ id }, 201);
  }
  if ((r = sub.match(/^\/concierge\/([\w-]{2,40})$/))) {
    const a = await own(env, "concierge_answers", r[1], W, "Resposta");
    if (m === "PATCH") {
      const b = await body(req, 8000);
      await run(env, "UPDATE concierge_answers SET topic = ?, question = ?, answer = ?, keywords = ? WHERE id = ? AND wedding_id = ?",
        b.topic !== undefined ? oneOf(b.topic, TOPICS.map(t => t[0]), "Assunto") : a.topic, b.question !== undefined ? str(b.question, { max: 160, field: "Pergunta" }) : a.question,
        b.answer !== undefined ? str(b.answer, { min: 2, max: 1200, field: "Resposta" }) : a.answer, b.keywords !== undefined ? str(b.keywords, { max: 200, field: "Palavras-chave" }) : a.keywords, a.id, W);
      return json({ ok: true });
    }
    if (m === "DELETE") { await run(env, "DELETE FROM concierge_answers WHERE id = ? AND wedding_id = ?", a.id, W); return json({ ok: true }); }
  }

  /* padrinhos */
  if (sub === "/padrinhos" && m === "GET") {
    const list = await all(env, "SELECT id, name, role, token_hash IS NOT NULL AS has_link, token_at, revoked FROM padrinhos WHERE wedding_id = ? ORDER BY created_at, rowid", W);
    const tasks = await all(env, "SELECT id, padrinho_id, title, notes, due_date, done_at, done_by FROM padrinho_tasks WHERE wedding_id = ? ORDER BY due_date IS NULL, due_date, created_at", W);
    const wall = (await first(env, "SELECT COUNT(*) AS n FROM padrinho_wall WHERE wedding_id = ?", W)).n;
    return json({ padrinhos: list.map(x => ({ ...x, has_link: !!x.has_link && !x.revoked, revoked: !!x.revoked })), tasks, wall_count: wall, info: parseJson(settings.padrinhos_json, {}) || {}, roles: ROLES });
  }
  if (sub === "/padrinhos" && m === "POST") {
    const b = await body(req, 4000), id = uid("pd_");
    if ((await first(env, "SELECT COUNT(*) AS n FROM padrinhos WHERE wedding_id = ?", W)).n >= 60) fail(409, "Limite de 60 padrinhos", "too_many");
    await run(env, "INSERT INTO padrinhos (id, wedding_id, name, role) VALUES (?, ?, ?, ?)", id, W, str(b.name, { min: 2, max: 80, field: "Nome" }), oneOf(b.role || "padrinho", ROLES.map(x => x[0]), "Papel"));
    return json({ id, link: await issuePadrinhoLink(env, W, id, url) }, 201);
  }
  if ((r = sub.match(/^\/padrinhos\/([\w-]{2,40})(\/link|\/revoke)?$/))) {
    const pd = await own(env, "padrinhos", r[1], W, "Padrinho");
    if (m === "POST" && r[2] === "/link") { const link = await issuePadrinhoLink(env, W, pd.id, url); await audit(env, W, actor, "padrinho.link", pd.id); return json({ link }); }
    if (m === "POST" && r[2] === "/revoke") { await run(env, "UPDATE padrinhos SET revoked = 1 WHERE id = ? AND wedding_id = ?", pd.id, W); await audit(env, W, actor, "padrinho.revoke", pd.id); return json({ ok: true }); }
    if (m === "PATCH" && !r[2]) { const b = await body(req, 4000); await run(env, "UPDATE padrinhos SET name = ?, role = ? WHERE id = ? AND wedding_id = ?", b.name !== undefined ? str(b.name, { min: 2, max: 80, field: "Nome" }) : pd.name, b.role !== undefined ? oneOf(b.role, ROLES.map(x => x[0]), "Papel") : pd.role, pd.id, W); return json({ ok: true }); }
    if (m === "DELETE" && !r[2]) { await run(env, "DELETE FROM padrinhos WHERE id = ? AND wedding_id = ?", pd.id, W); await audit(env, W, actor, "padrinho.delete", pd.id); return json({ ok: true }); }
  }
  if (sub === "/padrinho-tasks" && m === "POST") {
    const b = await body(req, 4000);
    let pid = null;
    if (b.padrinho_id) pid = (await own(env, "padrinhos", String(b.padrinho_id), W, "Padrinho")).id;
    const id = uid("pt_");
    await run(env, "INSERT INTO padrinho_tasks (id, wedding_id, padrinho_id, title, notes, due_date) VALUES (?, ?, ?, ?, ?, ?)", id, W, pid,
      str(b.title, { min: 2, max: 140, field: "Tarefa" }), str(b.notes, { max: 600, field: "Detalhes" }), isoDate(b.due_date, "Prazo"));
    return json({ id }, 201);
  }
  if ((r = sub.match(/^\/padrinho-tasks\/([\w-]{2,40})$/)) && m === "DELETE") {
    const t = await own(env, "padrinho_tasks", r[1], W, "Tarefa");
    await run(env, "DELETE FROM padrinho_tasks WHERE id = ? AND wedding_id = ?", t.id, W); return json({ ok: true });
  }

  /* mensagens secretas */
  if (sub === "/segredos" && m === "GET") {
    const hs = await all(env, "SELECT id, name, greeting FROM households WHERE wedding_id = ? AND waitlist = 0 ORDER BY name", W);
    const msgs = await all(env, "SELECT s.id, s.household_id, h.name AS household, s.title, s.body, s.media_url, s.media_type, s.show_from, s.opened_at, s.created_at FROM secret_messages s JOIN households h ON h.id = s.household_id WHERE s.wedding_id = ? ORDER BY s.created_at DESC", W);
    return json({ households: hs, messages: msgs, today });
  }
  if (sub === "/segredos" && m === "POST") {
    const b = await body(req, 8000);
    const h = await own(env, "households", String(b.household_id || ""), W, "Família");
    const id = uid("sg_");
    const mediaUrl = localUrl(b.media_url, "Foto ou vídeo");
    await run(env, "INSERT INTO secret_messages (id, wedding_id, household_id, title, body, media_id, media_url, media_type, show_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, W, h.id,
      str(b.title, { max: 100, field: "Título" }), str(b.body, { min: 2, max: 3000, field: "Mensagem" }), b.media_id ? str(String(b.media_id), { max: 60, field: "Mídia" }) : null,
      mediaUrl, mediaUrl ? oneOf(b.media_type, ["image", "video"], "Tipo de mídia") : "", isoDate(b.show_from, "Aparece a partir de"));
    await audit(env, W, actor, "secret.create", id);
    return json({ id }, 201);
  }
  if ((r = sub.match(/^\/segredos\/([\w-]{2,40})$/))) {
    const s = await own(env, "secret_messages", r[1], W, "Mensagem");
    if (m === "PATCH") {
      const b = await body(req, 8000);
      await run(env, "UPDATE secret_messages SET title = ?, body = ?, show_from = ? WHERE id = ? AND wedding_id = ?", b.title !== undefined ? str(b.title, { max: 100, field: "Título" }) : s.title,
        b.body !== undefined ? str(b.body, { min: 2, max: 3000, field: "Mensagem" }) : s.body, b.show_from !== undefined ? isoDate(b.show_from, "Aparece a partir de") : s.show_from, s.id, W);
      return json({ ok: true });
    }
    if (m === "DELETE") { await run(env, "DELETE FROM secret_messages WHERE id = ? AND wedding_id = ?", s.id, W); await audit(env, W, actor, "secret.delete", s.id); return json({ ok: true }); }
  }

  /* surpresas (o casal nunca recebe as que são para o casal antes da data) */
  if (sub === "/surpresas" && m === "GET") {
    const list = await all(env, `SELECT * FROM surprises WHERE wedding_id = ? AND ${COUPLE_VISIBLE_SQL} ORDER BY created_at DESC`, W, today);
    return json({ surprises: await Promise.all(list.map(s => surpriseDetail(env, W, s))),
      households: await all(env, "SELECT id, name FROM households WHERE wedding_id = ? AND waitlist = 0 ORDER BY name", W),
      padrinhos: await all(env, "SELECT id, name, role FROM padrinhos WHERE wedding_id = ? ORDER BY created_at, rowid", W), kinds: KINDS });
  }
  if (sub === "/surpresas" && m === "POST") return json({ id: await createSurprise(env, W, await body(req, 6000), "couple", w) }, 201);
  if ((r = sub.match(/^\/surpresas\/([\w-]{2,40})(\/members)?$/))) {
    const s = await first(env, "SELECT * FROM surprises WHERE id = ? AND wedding_id = ?", r[1], W);
    if (!s || !visibleToCouple(s, today)) fail(404, "Surpresa não encontrada", "not_found"); // mesma resposta para "não existe" e "é segredo"
    if (m === "POST" && r[2]) return json(await addMember(env, W, s, await body(req, 2000), url), 201);
    if (m === "DELETE" && !r[2]) { await run(env, "DELETE FROM surprises WHERE id = ? AND wedding_id = ?", s.id, W); await audit(env, W, actor, "surprise.delete", s.id); return json({ ok: true }); }
  }

  /* quest */
  if (sub === "/quest" && m === "GET") {
    const ch = await all(env, `SELECT c.id, c.kind, c.title, c.text, (SELECT COUNT(*) FROM quest_done d WHERE d.challenge_id = c.id) AS done FROM quest_challenges c WHERE c.wedding_id = ? ORDER BY c.sort, c.rowid`, W);
    return json({ challenges: ch, templates: QUEST.map(([key, title, text]) => ({ key, title, text })) });
  }
  if (sub === "/quest" && m === "POST") {
    const b = await body(req, 4000);
    const n = (await first(env, "SELECT COUNT(*) AS n FROM quest_challenges WHERE wedding_id = ?", W)).n;
    if (n >= 20) fail(409, "Limite de 20 desafios", "too_many");
    let kind = "custom", title, text;
    if (b.key) { const t = QUEST.find(q => q[0] === b.key) || fail(400, "Desafio inválido", "invalid"); [kind, title, text] = t;
      if (await first(env, "SELECT id FROM quest_challenges WHERE wedding_id = ? AND kind = ?", W, kind)) fail(409, "Esse desafio já está na lista", "exists"); }
    else { title = str(b.title, { min: 2, max: 80, field: "Desafio" }); text = str(b.text, { max: 240, field: "Descrição" }); }
    const id = uid("qc_");
    await run(env, "INSERT INTO quest_challenges (id, wedding_id, kind, title, text, sort) VALUES (?, ?, ?, ?, ?, ?)", id, W, kind, title, text, n);
    return json({ id }, 201);
  }
  if ((r = sub.match(/^\/quest\/([\w-]{2,40})$/)) && m === "DELETE") {
    const c = await own(env, "quest_challenges", r[1], W, "Desafio");
    await run(env, "DELETE FROM quest_challenges WHERE id = ? AND wedding_id = ?", c.id, W); return json({ ok: true });
  }

  /* passaporte: check-in pelo casal */
  if (sub === "/passaporte" && m === "GET") {
    const events = await all(env, "SELECT id, name, starts_at, venue FROM events WHERE wedding_id = ? ORDER BY sort, starts_at", W);
    const hs = await all(env, "SELECT id, name FROM households WHERE wedding_id = ? AND waitlist = 0 ORDER BY name", W);
    const inv = await all(env, "SELECT i.household_id, i.event_id FROM invitations i JOIN households h ON h.id = i.household_id WHERE h.wedding_id = ?", W);
    const ck = await all(env, "SELECT event_id, household_id, by, at FROM passport_checkins WHERE wedding_id = ?", W);
    return json({ events, households: hs.map(h => ({ ...h, events: inv.filter(i => i.household_id === h.id).map(i => i.event_id) })), checkins: ck });
  }
  if (sub === "/passaporte/checkin" && m === "POST") {
    const b = await body(req, 2000);
    const ok = await first(env, "SELECT 1 AS x FROM invitations i JOIN households h ON h.id = i.household_id JOIN events e ON e.id = i.event_id WHERE i.household_id = ? AND i.event_id = ? AND h.wedding_id = ? AND e.wedding_id = ? AND h.waitlist = 0", String(b.household_id || ""), String(b.event_id || ""), W, W);
    if (!ok) fail(400, "Família ou evento inválido", "invalid");
    if (b.on === false) await run(env, "DELETE FROM passport_checkins WHERE event_id = ? AND household_id = ? AND wedding_id = ?", b.event_id, b.household_id, W);
    else await run(env, "INSERT INTO passport_checkins (wedding_id, event_id, household_id, by) VALUES (?, ?, ?, 'couple') ON CONFLICT(event_id, household_id) DO NOTHING", W, b.event_id, b.household_id);
    return json({ ok: true });
  }

  /* lugares */
  if (sub === "/lugares" && m === "GET") return json({ places: await all(env, "SELECT id, name, year, text, address, sort FROM memory_places WHERE wedding_id = ? ORDER BY sort, rowid", W) });
  if (sub === "/lugares" && m === "POST") {
    const b = await body(req, 6000);
    const n = (await first(env, "SELECT COUNT(*) AS n FROM memory_places WHERE wedding_id = ?", W)).n;
    if (n >= 30) fail(409, "Limite de 30 lugares", "too_many");
    const id = uid("lp_");
    await run(env, "INSERT INTO memory_places (id, wedding_id, name, year, text, address, sort) VALUES (?, ?, ?, ?, ?, ?, ?)", id, W, str(b.name, { min: 2, max: 80, field: "Lugar" }),
      str(b.year, { max: 12, field: "Ano" }), str(b.text, { max: 600, field: "Texto" }), str(b.address, { max: 200, field: "Endereço" }), n);
    return json({ id }, 201);
  }
  if ((r = sub.match(/^\/lugares\/([\w-]{2,40})$/))) {
    const pl = await own(env, "memory_places", r[1], W, "Lugar");
    if (m === "PATCH") {
      const b = await body(req, 6000);
      const sort = b.sort !== undefined ? int(b.sort, { min: 0, max: 100, field: "Ordem" }) : pl.sort;
      await run(env, "UPDATE memory_places SET name = ?, year = ?, text = ?, address = ?, sort = ? WHERE id = ? AND wedding_id = ?", b.name !== undefined ? str(b.name, { min: 2, max: 80, field: "Lugar" }) : pl.name,
        b.year !== undefined ? str(b.year, { max: 12, field: "Ano" }) : pl.year, b.text !== undefined ? str(b.text, { max: 600, field: "Texto" }) : pl.text, b.address !== undefined ? str(b.address, { max: 200, field: "Endereço" }) : pl.address, sort, pl.id, W);
      return json({ ok: true });
    }
    if (m === "DELETE") { await run(env, "DELETE FROM memory_places WHERE id = ? AND wedding_id = ?", pl.id, W); return json({ ok: true }); }
  }

  /* jornal */
  if (sub === "/jornal" && m === "GET") { needOn(flags, "jornal"); return jornal(env, W); }
  return null;
}

/* ---------------- rotas públicas ---------------- */
async function pub(ctx) {
  const { req, env, url, p, m } = ctx;
  let r;
  if (m === "GET" && (r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/concierge$/))) {
    await rateLimit(env, "exp-cc:" + clientIp(req), LIMIT.concierge);
    const w = await first(env, "SELECT * FROM weddings WHERE slug = ?", r[1]);
    if (!w || !flagsFrom(w, await settingsRow(env, w.id)).concierge) fail(404, "Não encontrado", "not_found");
    return json(ask(await knowledge(env, w), url.searchParams.get("q") || ""));
  }
  if ((r = p.match(/^\/api\/invite\/([A-Za-z0-9_-]{16,64})\/(concierge|exp\/quest\/([\w-]{2,40})|exp\/checkin\/([\w-]{2,40})|exp\/segredo\/([\w-]{2,40}))$/))) {
    if (r[2] === "concierge" && m === "GET") {
      const { h, w, flags } = await household(env, req, r[1]);
      needOn(flags, "concierge");
      return json(ask(await knowledge(env, w, h), url.searchParams.get("q") || ""));
    }
    if (m !== "POST") return null;
    ctx.sameOrigin();
    const { h, w, flags } = await household(env, req, r[1], "exp-inv-w", LIMIT.write);
    const W = w.id;
    if (r[3]) {
      needOn(flags, "quest");
      const c = await own(env, "quest_challenges", r[3], W, "Desafio");
      const b = await body(req, 1000);
      if (b.done === false) await run(env, "DELETE FROM quest_done WHERE challenge_id = ? AND household_id = ?", c.id, h.id);
      else await run(env, "INSERT INTO quest_done (wedding_id, challenge_id, household_id) VALUES (?, ?, ?) ON CONFLICT(challenge_id, household_id) DO NOTHING", W, c.id, h.id);
      return json({ ok: true });
    }
    if (r[4]) {
      needOn(flags, "passaporte");
      const e = await first(env, "SELECT e.id, e.starts_at FROM invitations i JOIN events e ON e.id = i.event_id WHERE i.household_id = ? AND e.id = ? AND e.wedding_id = ?", h.id, r[4], W);
      if (!e) fail(404, "Evento não encontrado neste convite", "not_found");
      if (dateSP(e.starts_at) !== todaySP()) fail(409, "O check-in abre no dia do evento.", "not_today");
      await run(env, "INSERT INTO passport_checkins (wedding_id, event_id, household_id, by) VALUES (?, ?, ?, 'guest') ON CONFLICT(event_id, household_id) DO NOTHING", W, e.id, h.id);
      return json({ ok: true }, 201);
    }
    if (r[5]) {
      needOn(flags, "mensagens");
      const done = await run(env, "UPDATE secret_messages SET opened_at = COALESCE(opened_at, datetime('now')) WHERE id = ? AND household_id = ? AND wedding_id = ? AND (show_from IS NULL OR show_from <= ?)", r[5], h.id, W, todaySP());
      if (!done.meta?.changes) fail(404, "Mensagem não encontrada", "not_found");
      return json({ ok: true });
    }
  }
  if ((r = p.match(/^\/api\/padrinhos\/([\w-]{16,64})(\/.*)?$/))) return padrinhoRoutes(ctx, r[1], r[2] || "");
  if ((r = p.match(/^\/api\/surpresa\/([\w-]{16,64})(\/.*)?$/))) return collaboratorRoutes(ctx, r[1], r[2] || "");
  return null;
}

export default {
  name: "experiencias",
  pages: [
    [/^\/padrinhos\/[\w-]{16,64}\/?$/, "/padrinhos.html", true],
    [/^\/surpresa\/[\w-]{16,64}\/?$/, "/padrinhos.html", true],
    [/^\/c\/[a-z0-9-]{3,60}\/jornal\/?$/, "/jornal.html", true],
  ],
  public: pub,
  admin,

  /** Só conteúdo que o casal publicou: interruptores do site, lugares e a trilha própria. Nada de convidados. */
  async site(env, w) {
    const st = await settingsRow(env, w.id), flags = flagsFrom(w, st);
    const out = { concierge: flags.concierge, documentario: flags.documentario, lugares: [] };
    if (flags.lugares) out.lugares = await all(env, "SELECT name, year, text, address FROM memory_places WHERE wedding_id = ? ORDER BY sort, rowid", w.id);
    if (flags.documentario) { const s = parseJson(st.soundtrack_json, {}) || {}; out.soundtrack = { url: s.url || "", title: s.title || "", song: s.song || "" }; }
    return out;
  },

  /** Só da família h: mensagens secretas já liberadas, desafios, passaporte dos eventos dela. */
  async invite(env, w, h) {
    const flags = flagsFrom(w, await settingsRow(env, w.id)), today = todaySP();
    const out = { concierge: flags.concierge };
    if (flags.mensagens) out.secrets = await all(env, "SELECT id, title, body, media_url, media_type, opened_at IS NOT NULL AS opened FROM secret_messages WHERE wedding_id = ? AND household_id = ? AND (show_from IS NULL OR show_from <= ?) ORDER BY created_at", w.id, h.id, today);
    if (flags.quest) {
      const ch = await all(env, "SELECT id, title, text FROM quest_challenges WHERE wedding_id = ? ORDER BY sort, rowid", w.id);
      const done = (await all(env, "SELECT challenge_id FROM quest_done WHERE household_id = ? AND wedding_id = ?", h.id, w.id)).map(d => d.challenge_id);
      if (ch.length) out.quest = ch.map(c => ({ ...c, done: done.includes(c.id) }));
    }
    if (flags.passaporte) {
      const evs = await all(env, `SELECT e.id, e.name, e.starts_at, e.venue, e.address, e.dress_code, c.at AS checked_at, c.by AS checked_by FROM invitations i JOIN events e ON e.id = i.event_id
        LEFT JOIN passport_checkins c ON c.event_id = e.id AND c.household_id = i.household_id WHERE i.household_id = ? ORDER BY e.starts_at`, h.id);
      if (evs.length > 1) out.passport = evs.map(e => ({ ...e, today: dateSP(e.starts_at) === today }));
    }
    return out;
  },

  /** Limpeza LGPD (chamada pelo módulo convidados): apaga o que liga pessoas e famílias às experiências. */
  async purgeGuests(env, W) {
    const P = sql => env.DB.prepare(sql).bind(W);
    const stmts = ["DELETE FROM passport_checkins WHERE wedding_id = ?", "DELETE FROM quest_done WHERE wedding_id = ?", "DELETE FROM secret_messages WHERE wedding_id = ?",
      "DELETE FROM surprise_posts WHERE wedding_id = ?", "DELETE FROM surprise_members WHERE wedding_id = ?", "DELETE FROM surprises WHERE wedding_id = ?",
      "DELETE FROM padrinho_wall WHERE wedding_id = ?", "DELETE FROM padrinho_tasks WHERE wedding_id = ?", "DELETE FROM padrinhos WHERE wedding_id = ?"].map(P);
    if (env.DB.batch) await env.DB.batch(stmts); else for (const s of stmts) await s.run();
    // contatos combinados com os padrinhos podem ser telefones pessoais: saem também
    const st = await settingsRow(env, W), info = parseJson(st.padrinhos_json, {}) || {};
    if (info.contacts?.length) await saveSettings(env, W, { padrinhos_json: JSON.stringify({ ...info, contacts: [] }) });
  },

  async overview(env, W) {
    const flags = await flagsOf(env, W);
    const alerts = [];
    if (flags.padrinhos) {
      const t = await first(env, "SELECT COUNT(*) AS n FROM padrinho_tasks WHERE wedding_id = ? AND done_at IS NULL AND due_date IS NOT NULL AND due_date < ?", W, todaySP());
      if (t.n) alerts.push({ text: `${t.n} ${t.n > 1 ? "tarefas dos padrinhos passaram" : "tarefa dos padrinhos passou"} do prazo sem estar feita.`, href: "#extras" });
    }
    return { alerts };
  },

  /** Exportação (LGPD): dados do casal. Ficam de fora tokens, o mural privado dos padrinhos e surpresas ainda secretas para o casal. */
  async exportData(env, W) {
    const today = todaySP();
    const st = await settingsRow(env, W);
    const sp = await all(env, `SELECT id, kind, title, description, honoree_type, honoree_label, reveal_at, created_at FROM surprises WHERE wedding_id = ? AND ${COUPLE_VISIBLE_SQL}`, W, today);
    const ids = new Set(sp.map(s => s.id));
    return { experiencias: {
      settings: { flags: parseJson(st.flags_json, {}), padrinhos: parseJson(st.padrinhos_json, {}), soundtrack: parseJson(st.soundtrack_json, {}), jornal: parseJson(st.jornal_json, {}) },
      concierge_answers: await all(env, "SELECT topic, question, answer, keywords FROM concierge_answers WHERE wedding_id = ?", W),
      padrinhos: await all(env, "SELECT id, name, role, revoked, created_at FROM padrinhos WHERE wedding_id = ?", W),
      padrinho_tasks: await all(env, "SELECT * FROM padrinho_tasks WHERE wedding_id = ?", W),
      secret_messages: await all(env, "SELECT id, household_id, title, body, media_url, show_from, opened_at, created_at FROM secret_messages WHERE wedding_id = ?", W),
      surprises: sp,
      surprise_posts: (await all(env, "SELECT surprise_id, author, message, link, created_at FROM surprise_posts WHERE wedding_id = ?", W)).filter(x => ids.has(x.surprise_id)),
      quest_challenges: await all(env, "SELECT id, title, text FROM quest_challenges WHERE wedding_id = ?", W),
      quest_done: await all(env, "SELECT challenge_id, household_id, done_at FROM quest_done WHERE wedding_id = ?", W),
      passport_checkins: await all(env, "SELECT event_id, household_id, by, at FROM passport_checkins WHERE wedding_id = ?", W),
      memory_places: await all(env, "SELECT name, year, text, address FROM memory_places WHERE wedding_id = ?", W),
    } };
  },
};
