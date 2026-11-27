/**
 * Módulo "organizacao" (ver src/mods/README.md): fornecedores e propostas, tarefas e checklist automático,
 * compromissos, financeiro avançado (parcelas, histórico, CSV) e a central da visão geral (progresso + radar de riscos).
 *
 * API dos noivos (sessão + papel já checados pelo worker; TODA consulta filtra por wedding_id)
 *   GET    /api/admin/org/vendors                    fornecedores, propostas, categorias e lançamentos para ligar
 *   POST   /api/admin/org/vendors                    novo fornecedor   ·   PATCH|DELETE /api/admin/org/vendors/:id
 *   POST   /api/admin/org/vendors/:id/quotes         nova proposta     ·   PATCH|DELETE /api/admin/org/quotes/:id
 *   POST   /api/admin/org/vendors/:id/contract       marca contratado e cria/liga o lançamento do orçamento
 *   GET    /api/admin/org/tasks                      tarefas, compromissos, perfil do checklist
 *   POST   /api/admin/org/tasks                      nova tarefa       ·   PATCH|DELETE /api/admin/org/tasks/:id
 *   POST   /api/admin/org/checklist                  gera o checklist a partir do formulário (data, cerimônia, convidados…)
 *   POST   /api/admin/org/appointments               novo compromisso  ·   PATCH|DELETE /api/admin/org/appointments/:id
 *   POST   /api/admin/org/alerts/dismiss             descarta um alerta do radar   ·   DELETE /api/admin/org/alerts/dismissed  restaura
 *   POST   /api/admin/budget/installments/:id/pay    paga (ou desfaz) uma parcela
 *   GET    /api/admin/budget/history[?item=]         histórico de alterações dos lançamentos
 *   GET    /api/admin/budget/export.csv              relatório do orçamento para planilha
 */
import { json, fail, str, int, oneOf, isoDate, body, uid, audit, parseJson } from "../lib.js";

const TZ = "America/Sao_Paulo";
const pad = n => String(n).padStart(2, "0");
/** "AAAA-MM-DDTHH:MM" no fuso do casamento (Brasil). */
export const localNow = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(" ", "T");
export const localToday = () => localNow().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const brl = c => "R$ " + (c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
async function batch(env, stmts) { if (!stmts.length) return; if (env.DB.batch) return env.DB.batch(stmts); for (const s of stmts) await s.run(); }

/* ---------------- validação própria ---------------- */
/** Texto longo: mantém quebras de linha (str() junta tudo numa linha). */
function text(v, { max = 2000, field = "Texto" } = {}) {
  if (v == null) return "";
  if (typeof v !== "string") fail(400, `${field}: texto inválido`, "invalid");
  v = v.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (v.length > max) fail(400, `${field}: no máximo ${max} caracteres`, "too_long");
  return v;
}
/** Link http(s) — nunca javascript:, data: etc. */
function link(v, field = "Link") {
  const s = str(v, { max: 500, field });
  if (!s) return "";
  if (!/^https?:\/\/[^\s<>"']+$/i.test(s)) fail(400, `${field}: use um link que comece com https://`, "invalid");
  return s;
}
/** Site ou Instagram: aceita link ou @perfil. */
function site(v) {
  const s = str(v, { max: 300, field: "Site ou Instagram" });
  if (!s) return "";
  if (/^@[\w.]{1,40}$/.test(s)) return "https://instagram.com/" + s.slice(1);
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return "https://" + s;
  return link(s, "Site ou Instagram");
}
function email(v) {
  const s = str(v, { max: 160, field: "E-mail" }).toLowerCase();
  if (s && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) fail(400, "E-mail inválido", "invalid");
  return s;
}
function phone(v) {
  const s = str(v, { max: 40, field: "Telefone" });
  if (s && !/^[\d\s()+.-]{8,40}$/.test(s)) fail(400, "Telefone: use só números, espaços, +, ( ) e -", "invalid");
  return s;
}
const bool = v => v === true || v === 1 || v === "1" || v === "true";
function list(v, max, field) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > max) fail(400, `${field}: lista inválida (máximo ${max})`, "invalid");
  return v;
}
async function ownVendorId(env, W, id) {
  if (id == null || id === "") return null;
  const v = await one(env, "SELECT id FROM vendors WHERE id = ? AND wedding_id = ?", String(id), W);
  if (!v) fail(400, "Fornecedor inválido", "invalid");
  return v.id;
}
async function own(env, table, W, id, what) {
  const row = await one(env, `SELECT * FROM ${table} WHERE id = ? AND wedding_id = ?`, id, W);
  if (!row) fail(404, `${what} não encontrado`, "not_found");
  return row;
}

/* ---------------- fornecedores ---------------- */
export const VENDOR_STATUS = ["pesquisando", "orcamento_pedido", "proposta_recebida", "contratado", "descartado"];
const vendorOut = v => ({ ...v, whatsapp: !!v.whatsapp, dates: parseJson(v.dates_json, []), checklist: parseJson(v.checklist_json, []), dates_json: undefined, checklist_json: undefined });

function vendorFields(b, cur = {}) {
  const v = k => (b[k] !== undefined ? b[k] : cur[k]);
  return {
    name: str(v("name"), { min: 2, max: 80, field: "Nome do fornecedor" }),
    category: str(v("category"), { max: 60, field: "Categoria" }),
    contact_name: str(v("contact_name"), { max: 80, field: "Pessoa de contato" }),
    phone: phone(v("phone")),
    whatsapp: bool(v("whatsapp")) ? 1 : 0,
    email: email(v("email")),
    site: site(v("site")),
    status: oneOf(v("status") ?? "pesquisando", VENDOR_STATUS, "Status"),
    owner: str(v("owner"), { max: 60, field: "Responsável" }),
    notes: text(v("notes"), { max: 2000, field: "Notas" }),
    doc_url: link(v("doc_url"), "Link do contrato ou proposta"),
    dates_json: JSON.stringify(list(v("dates"), 12, "Datas").map((d, i) => ({
      label: str(d?.label, { min: 2, max: 60, field: `Data ${i + 1}: descrição` }),
      date: isoDate(d?.date, `Data ${i + 1}`) || fail(400, `Data ${i + 1}: informe a data`, "required") }))),
    checklist_json: JSON.stringify(list(v("checklist"), 40, "Checklist").map((c, i) => ({
      text: str(c?.text, { min: 1, max: 120, field: `Item ${i + 1} do checklist` }), done: bool(c?.done) }))),
  };
}
function quoteFields(b, cur = {}) {
  const v = k => (b[k] !== undefined ? b[k] : cur[k]);
  return {
    title: str(v("title"), { max: 80, field: "Proposta" }),
    amount_cents: int(v("amount_cents"), { field: "Valor da proposta" }),
    notes: text(v("notes"), { max: 800, field: "Observação" }),
    received_at: isoDate(v("received_at") ?? null, "Recebida em"),
    valid_until: isoDate(v("valid_until") ?? null, "Válida até"),
    doc_url: link(v("doc_url"), "Link da proposta"),
  };
}

async function listVendors(env, W) {
  const vs = await all(env, "SELECT * FROM vendors WHERE wedding_id = ? ORDER BY status = 'descartado', category COLLATE NOCASE, name COLLATE NOCASE", W);
  const qs = await all(env, "SELECT * FROM vendor_quotes WHERE wedding_id = ? ORDER BY amount_cents, created_at", W);
  const items = await all(env, "SELECT id, category_id, description, vendor, amount_cents, paid_cents FROM budget_items WHERE wedding_id = ? ORDER BY description", W);
  const cats = await all(env, "SELECT id, name FROM budget_categories WHERE wedding_id = ? ORDER BY sort, rowid", W);
  const tasks = await all(env, "SELECT vendor_id, COUNT(*) AS n FROM tasks WHERE wedding_id = ? AND vendor_id IS NOT NULL AND status <> 'done' GROUP BY vendor_id", W);
  return {
    vendors: vs.map(v => ({ ...vendorOut(v), quotes: qs.filter(q => q.vendor_id === v.id).map(q => ({ ...q, chosen: !!q.chosen })),
      budget_item: items.find(i => i.id === v.budget_item_id) || null, open_tasks: tasks.find(t => t.vendor_id === v.id)?.n || 0 })),
    categories: cats, items, statuses: VENDOR_STATUS,
  };
}
async function createVendor(req, env, W) {
  const f = vendorFields(await body(req));
  const id = uid("v_");
  await run(env, `INSERT INTO vendors (id, wedding_id, name, category, contact_name, phone, whatsapp, email, site, status, owner, notes, doc_url, dates_json, checklist_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, W, f.name, f.category, f.contact_name, f.phone, f.whatsapp, f.email, f.site, f.status, f.owner, f.notes, f.doc_url, f.dates_json, f.checklist_json);
  return json({ id }, 201);
}
async function updateVendor(req, env, W, id) {
  const cur = vendorOut(await own(env, "vendors", W, id, "Fornecedor"));
  const b = await body(req);
  const f = vendorFields(b, cur);
  let item = cur.budget_item_id;
  if (b.budget_item_id !== undefined) {
    item = b.budget_item_id ? (await one(env, "SELECT id FROM budget_items WHERE id = ? AND wedding_id = ?", String(b.budget_item_id), W))?.id || fail(400, "Lançamento inválido", "invalid") : null;
  }
  await run(env, `UPDATE vendors SET name = ?, category = ?, contact_name = ?, phone = ?, whatsapp = ?, email = ?, site = ?, status = ?, owner = ?, notes = ?, doc_url = ?,
    dates_json = ?, checklist_json = ?, budget_item_id = ?, updated_at = datetime('now') WHERE id = ? AND wedding_id = ?`,
    f.name, f.category, f.contact_name, f.phone, f.whatsapp, f.email, f.site, f.status, f.owner, f.notes, f.doc_url, f.dates_json, f.checklist_json, item, id, W);
  return json({ ok: true });
}
async function deleteVendor(env, W, id, actor) {
  await own(env, "vendors", W, id, "Fornecedor");
  await batch(env, [
    env.DB.prepare("UPDATE tasks SET vendor_id = NULL WHERE vendor_id = ? AND wedding_id = ?").bind(id, W),
    env.DB.prepare("UPDATE appointments SET vendor_id = NULL WHERE vendor_id = ? AND wedding_id = ?").bind(id, W),
    env.DB.prepare("DELETE FROM vendor_quotes WHERE vendor_id = ? AND wedding_id = ?").bind(id, W),
    env.DB.prepare("DELETE FROM vendors WHERE id = ? AND wedding_id = ?").bind(id, W),
  ]);
  await audit(env, W, actor, "vendor.delete", id);
  return json({ ok: true });
}
async function createQuote(req, env, W, vendorId) {
  const v = await own(env, "vendors", W, vendorId, "Fornecedor");
  const f = quoteFields(await body(req));
  const id = uid("q_");
  await run(env, "INSERT INTO vendor_quotes (id, wedding_id, vendor_id, title, amount_cents, notes, received_at, valid_until, doc_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, W, v.id, f.title, f.amount_cents, f.notes, f.received_at, f.valid_until, f.doc_url);
  // primeira proposta: o status avança sozinho (sem voltar de "contratado" ou "descartado")
  if (["pesquisando", "orcamento_pedido"].includes(v.status)) await run(env, "UPDATE vendors SET status = 'proposta_recebida', updated_at = datetime('now') WHERE id = ? AND wedding_id = ?", v.id, W);
  return json({ id }, 201);
}
async function updateQuote(req, env, W, id) {
  const q = await own(env, "vendor_quotes", W, id, "Proposta");
  const b = await body(req);
  const f = quoteFields(b, q);
  const stmts = [env.DB.prepare("UPDATE vendor_quotes SET title = ?, amount_cents = ?, notes = ?, received_at = ?, valid_until = ?, doc_url = ? WHERE id = ? AND wedding_id = ?")
    .bind(f.title, f.amount_cents, f.notes, f.received_at, f.valid_until, f.doc_url, id, W)];
  if (b.chosen !== undefined) stmts.push(...chooseStmts(env, W, q.vendor_id, bool(b.chosen) ? id : null));
  await batch(env, stmts);
  return json({ ok: true });
}
const chooseStmts = (env, W, vendorId, quoteId) => [env.DB.prepare("UPDATE vendor_quotes SET chosen = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE vendor_id = ? AND wedding_id = ?").bind(quoteId || "", vendorId, W)];
async function deleteQuote(env, W, id, actor) {
  await own(env, "vendor_quotes", W, id, "Proposta");
  await run(env, "DELETE FROM vendor_quotes WHERE id = ? AND wedding_id = ?", id, W);
  await audit(env, W, actor, "vendor.quote.delete", id);
  return json({ ok: true });
}
/** "Contratado": marca o fornecedor e cria (ou liga) o lançamento no orçamento com o valor. */
async function contractVendor(req, env, W, id, actor) {
  const v = await own(env, "vendors", W, id, "Fornecedor");
  const b = await body(req);
  const mode = oneOf(b.mode ?? "new", ["new", "link", "none"], "Lançamento no orçamento");
  const stmts = [];
  let quote = null;
  if (b.quote_id) {
    quote = await one(env, "SELECT id, amount_cents, title FROM vendor_quotes WHERE id = ? AND vendor_id = ? AND wedding_id = ?", String(b.quote_id), v.id, W);
    if (!quote) fail(400, "Proposta inválida", "invalid");
    stmts.push(...chooseStmts(env, W, v.id, quote.id));
  }
  let itemId = v.budget_item_id;
  if (mode === "new") {
    if (itemId && await one(env, "SELECT id FROM budget_items WHERE id = ? AND wedding_id = ?", itemId, W)) fail(409, "Este fornecedor já está ligado a um lançamento do orçamento.", "already_linked");
    const cat = await one(env, "SELECT id FROM budget_categories WHERE id = ? AND wedding_id = ?", String(b.category_id || ""), W);
    if (!cat) fail(400, "Escolha a categoria do orçamento", "invalid");
    const amount = int(b.amount_cents ?? quote?.amount_cents, { field: "Valor contratado" });
    const desc = str(b.description || quote?.title || v.category || v.name, { min: 2, max: 120, field: "Descrição" });
    itemId = uid("b_");
    stmts.push(env.DB.prepare("INSERT INTO budget_items (id, wedding_id, category_id, description, vendor, amount_cents, paid_cents, due_date) VALUES (?, ?, ?, ?, ?, ?, 0, ?)")
      .bind(itemId, W, cat.id, desc, v.name.slice(0, 80), amount, isoDate(b.due_date, "Vencimento")));
    stmts.push(historyStmt(env, W, itemId, desc, actor, "create", [{ field: "amount_cents", from: null, to: amount }, { field: "vendor", from: null, to: v.name }]));
  } else if (mode === "link") {
    const it = await one(env, "SELECT id, vendor FROM budget_items WHERE id = ? AND wedding_id = ?", String(b.budget_item_id || ""), W);
    if (!it) fail(400, "Lançamento inválido", "invalid");
    itemId = it.id;
    if (!it.vendor) stmts.push(env.DB.prepare("UPDATE budget_items SET vendor = ? WHERE id = ? AND wedding_id = ?").bind(v.name.slice(0, 80), it.id, W));
  }
  stmts.push(env.DB.prepare("UPDATE vendors SET status = 'contratado', budget_item_id = ?, updated_at = datetime('now') WHERE id = ? AND wedding_id = ?").bind(itemId || null, v.id, W));
  await batch(env, stmts);
  return json({ ok: true, budget_item_id: itemId || null });
}

/* ---------------- tarefas, checklist e compromissos ---------------- */
async function taskFields(env, W, b, cur = {}) {
  const v = k => (b[k] !== undefined ? b[k] : cur[k]);
  const status = oneOf(v("status") ?? "todo", ["todo", "doing", "done"], "Status");
  return {
    title: str(v("title"), { min: 2, max: 140, field: "Tarefa" }),
    notes: text(v("notes"), { max: 1000, field: "Notas" }),
    owner: str(v("owner"), { max: 60, field: "Responsável" }),
    due_date: isoDate(v("due_date") ?? null, "Prazo"),
    status,
    done_at: status === "done" ? (cur.status === "done" && cur.done_at ? cur.done_at : localToday()) : null,
    vendor_id: b.vendor_id !== undefined ? await ownVendorId(env, W, b.vendor_id) : (cur.vendor_id ?? null),
  };
}
async function tasksData(env, W) {
  const w = await one(env, "SELECT date_iso FROM weddings WHERE id = ?", W);
  const prof = await one(env, "SELECT * FROM org_profile WHERE wedding_id = ?", W);
  const guests = (await one(env, "SELECT COUNT(*) AS n FROM guests WHERE wedding_id = ?", W)).n;
  const appts = await all(env, "SELECT * FROM appointments WHERE wedding_id = ? ORDER BY starts_at", W);
  const conflicts = conflictPairs(appts);
  return {
    today: localToday(), now: localNow(), wedding_date: w.date_iso.slice(0, 10),
    tasks: await all(env, "SELECT id, title, notes, owner, due_date, status, done_at, vendor_id, phase, template_key FROM tasks WHERE wedding_id = ? ORDER BY status = 'done', due_date IS NULL, due_date, created_at", W),
    appointments: appts.map(a => ({ ...a, conflict_with: conflicts.filter(c => c.includes(a.id)).map(c => c.find(x => x !== a.id)) })),
    vendors: await all(env, "SELECT id, name, category, status FROM vendors WHERE wedding_id = ? ORDER BY name COLLATE NOCASE", W),
    profile: prof ? { ceremony: parseJson(prof.ceremony_json, []), guests: prof.guests, venue_defined: !!prof.venue_defined, prefs: parseJson(prof.prefs_json, []), generated_at: prof.generated_at } : { ceremony: [], guests, venue_defined: false, prefs: [], generated_at: null },
    ceremonies: CEREMONIES, prefs: PREFS,
  };
}
async function createTask(req, env, W) {
  const f = await taskFields(env, W, await body(req));
  const id = uid("t_");
  await run(env, "INSERT INTO tasks (id, wedding_id, title, notes, owner, due_date, status, done_at, vendor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, W, f.title, f.notes, f.owner, f.due_date, f.status, f.done_at, f.vendor_id);
  return json({ id }, 201);
}
async function updateTask(req, env, W, id) {
  const cur = await own(env, "tasks", W, id, "Tarefa");
  const f = await taskFields(env, W, await body(req), cur);
  await run(env, "UPDATE tasks SET title = ?, notes = ?, owner = ?, due_date = ?, status = ?, done_at = ?, vendor_id = ? WHERE id = ? AND wedding_id = ?", f.title, f.notes, f.owner, f.due_date, f.status, f.done_at, f.vendor_id, id, W);
  return json({ ok: true, status: f.status });
}
async function deleteTask(env, W, id, actor) {
  await own(env, "tasks", W, id, "Tarefa");
  await run(env, "DELETE FROM tasks WHERE id = ? AND wedding_id = ?", id, W);
  await audit(env, W, actor, "task.delete", id);
  return json({ ok: true });
}

/** Opções do formulário do checklist. Nada é presumido: sem marcação, nenhuma tarefa religiosa/civil é criada. */
export const CEREMONIES = [["civil", "Civil (cartório)"], ["religiosa", "Religiosa"], ["ao_ar_livre", "Ao ar livre"], ["destination", "Destination wedding (em outra cidade ou país)"]];
export const PREFS = [["cerimonialista", "Vamos ter cerimonialista ou assessoria"], ["padrinhos", "Teremos padrinhos e madrinhas"], ["lua_de_mel", "Vamos viajar em lua de mel"],
  ["lista_presentes", "Queremos lista de presentes"], ["traje_sob_medida", "Traje ou vestido sob medida"], ["convidados_de_fora", "Muitos convidados vêm de outras cidades"], ["musica_ao_vivo", "Música ao vivo"]];
export const PHASES = { "12m": "12 meses antes", "9m": "9 meses antes", "6m": "6 meses antes", "3m": "3 meses antes", "1m": "1 mês antes", "2s": "2 semanas antes", "1s": "1 semana antes", "dia": "No dia" };
/** Prazo ideal: data do casamento menos a etapa (meses no calendário; semanas em dias). */
export function phaseDate(weddingDate, phase) {
  const [y, mo, d] = weddingDate.split("-").map(Number);
  const months = { "12m": 12, "9m": 9, "6m": 6, "3m": 3, "1m": 1 }[phase];
  if (months) {
    let ty = y, tm = mo - months; while (tm < 1) { tm += 12; ty--; }
    const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
    return `${ty}-${pad(tm)}-${pad(Math.min(d, last))}`;
  }
  return addDays(weddingDate, -({ "2s": 14, "1s": 7, dia: 0 }[phase] ?? 0));
}
const has = (p, k) => p.ceremony.includes(k) || p.prefs.includes(k);
/** Modelo do checklist: [chave, etapa, tarefa, condição?]. */
const TEMPLATE = [
  ["orcamento", "12m", "Definir o orçamento total e quem contribui com o quê"],
  ["lista_inicial", "12m", "Fazer a primeira lista de convidados"],
  ["local", "12m", "Visitar locais e reservar o da festa", p => !p.venue_defined],
  ["local_contrato", "12m", "Revisar o contrato do local (horários, multas, o que está incluso)", p => p.venue_defined],
  ["cerimonial", "12m", "Pesquisar e contratar cerimonial ou assessoria", p => has(p, "cerimonialista")],
  ["religiosa_data", "12m", "Reservar a data na igreja ou templo e conversar com quem vai celebrar", p => has(p, "religiosa")],
  ["dest_hospedagem", "12m", "Pesquisar hospedagem e transporte no destino para os convidados", p => has(p, "destination")],
  ["foto", "9m", "Contratar fotografia e vídeo"],
  ["buffet", "9m", "Fazer degustações e contratar o buffet"],
  ["musica", "9m", "Contratar a música (banda, DJ ou os dois)"],
  ["musica_vivo", "9m", "Escolher repertório e formação da música ao vivo", p => has(p, "musica_ao_vivo")],
  ["decor", "9m", "Escolher decoração e flores"],
  ["save_date", "9m", "Enviar o save the date"],
  ["site", "9m", "Publicar o site do casamento"],
  ["padrinhos", "9m", "Convidar padrinhos e madrinhas", p => has(p, "padrinhos")],
  ["traje_medida", "9m", "Encomendar o traje ou vestido sob medida", p => has(p, "traje_sob_medida")],
  ["ar_livre_plano_b", "9m", "Definir o plano B para chuva (tenda ou área coberta)", p => has(p, "ao_ar_livre")],
  ["dest_bloqueio", "9m", "Negociar bloqueio de quartos e tarifas para convidados", p => has(p, "destination")],
  ["traje", "6m", "Escolher os trajes e marcar as provas", p => !has(p, "traje_sob_medida")],
  ["convites", "6m", "Encomendar convites e papelaria"],
  ["lista_presentes", "6m", "Montar a lista de presentes", p => has(p, "lista_presentes")],
  ["lua_de_mel", "6m", "Reservar a lua de mel", p => has(p, "lua_de_mel")],
  ["hospedagem", "6m", "Indicar hotéis e transporte para quem vem de fora", p => has(p, "convidados_de_fora") && !has(p, "destination")],
  ["civil_docs", "6m", "Ver no cartório os documentos e os prazos da habilitação", p => has(p, "civil")],
  ["religiosa_docs", "6m", "Separar documentos e fazer a preparação pedida pela celebração religiosa", p => has(p, "religiosa")],
  ["ar_livre_estrutura", "6m", "Confirmar autorizações, energia, som e banheiros do espaço ao ar livre", p => has(p, "ao_ar_livre")],
  ["dest_docs", "6m", "Conferir documentos de viagem (passaporte, vistos) de vocês e da família", p => has(p, "destination")],
  ["enviar_convites", "3m", "Enviar os convites e abrir as confirmações"],
  ["civil_habilitacao", "3m", "Dar entrada na habilitação de casamento no cartório", p => has(p, "civil")],
  ["cardapio", "3m", "Fechar cardápio e bebidas com o buffet"],
  ["cronograma", "3m", "Montar o cronograma do dia com os fornecedores"],
  ["aliancas", "3m", "Comprar as alianças"],
  ["beleza", "3m", "Agendar teste de cabelo e maquiagem"],
  ["logistica", "3m", "Planejar a logística de muitos convidados (estacionamento, recepção, manobristas)", p => p.guests >= 150],
  ["confirmacoes", "1m", "Cobrar quem ainda não confirmou presença"],
  ["mesas", "1m", "Fazer o mapa de mesas", p => p.guests === 0 || p.guests >= 20],
  ["restricoes", "1m", "Passar as restrições alimentares ao buffet"],
  ["pagamentos", "1m", "Conferir os pagamentos que vencem antes do casamento"],
  ["prova_final", "1m", "Prova final dos trajes"],
  ["votos", "1m", "Escrever os votos (se quiserem ler na cerimônia)"],
  ["numero_final", "2s", "Passar o número final de convidados ao buffet e ao local"],
  ["cronograma_envio", "2s", "Enviar o cronograma final para todos os fornecedores"],
  ["ar_livre_clima", "1s", "Acompanhar a previsão do tempo e acionar o plano B se precisar", p => has(p, "ao_ar_livre")],
  ["kit", "1s", "Separar o kit do dia (documentos, alianças, kit de emergência)"],
  ["pagamentos_finais", "1s", "Separar os pagamentos finais combinados para o dia"],
  ["confirmar_fornecedores", "1s", "Confirmar o horário de chegada de cada fornecedor"],
  ["dest_chegada", "1s", "Confirmar chegada e transporte dos convidados no destino", p => has(p, "destination")],
  ["civil_dia", "dia", "Levar documentos e testemunhas ao cartório", p => has(p, "civil")],
  ["dia_pessoa", "dia", "Entregar celular, pagamentos do dia e contatos a uma pessoa de confiança"],
  ["dia_aproveitar", "dia", "Comer bem, beber água e aproveitar"],
];
/** Tarefas do modelo para um perfil. Prazo = data ideal; se já passou, hoje (para não nascer atrasada). */
export function buildChecklist(weddingDate, profile, today = localToday()) {
  return TEMPLATE.filter(([, , , cond]) => !cond || cond(profile)).map(([key, phase, title]) => {
    const ideal = phaseDate(weddingDate, phase);
    return { key: "tpl:" + key, phase, title, ideal, due_date: ideal < today && today <= weddingDate ? today : ideal };
  });
}
async function generateChecklist(req, env, W) {
  const b = await body(req);
  const profile = {
    ceremony: [...new Set(list(b.ceremony, 4, "Tipo de cerimônia").map(c => oneOf(c, CEREMONIES.map(x => x[0]), "Tipo de cerimônia")))],
    prefs: [...new Set(list(b.prefs, 12, "Preferências").map(c => oneOf(c, PREFS.map(x => x[0]), "Preferência")))],
    guests: int(b.guests ?? 0, { min: 0, max: 5000, field: "Número de convidados" }),
    venue_defined: bool(b.venue_defined),
  };
  const w = await one(env, "SELECT date_iso FROM weddings WHERE id = ?", W);
  const owner = str(b.owner, { max: 60, field: "Responsável padrão" });
  const items = buildChecklist(w.date_iso.slice(0, 10), profile);
  const existing = new Set((await all(env, "SELECT template_key FROM tasks WHERE wedding_id = ? AND template_key IS NOT NULL", W)).map(t => t.template_key));
  const fresh = items.filter(i => !existing.has(i.key));
  await batch(env, [
    ...fresh.map(i => env.DB.prepare("INSERT OR IGNORE INTO tasks (id, wedding_id, title, owner, due_date, status, phase, template_key) VALUES (?, ?, ?, ?, ?, 'todo', ?, ?)")
      .bind(uid("t_"), W, i.title, owner, i.due_date, i.phase, i.key)),
    env.DB.prepare(`INSERT INTO org_profile (wedding_id, ceremony_json, guests, venue_defined, prefs_json, generated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(wedding_id) DO UPDATE SET ceremony_json = excluded.ceremony_json, guests = excluded.guests, venue_defined = excluded.venue_defined, prefs_json = excluded.prefs_json, generated_at = excluded.generated_at`)
      .bind(W, JSON.stringify(profile.ceremony), profile.guests, profile.venue_defined ? 1 : 0, JSON.stringify(profile.prefs)),
  ]);
  return json({ created: fresh.length, skipped: items.length - fresh.length, total: items.length }, 201);
}

const minutes = s => Date.parse(s + ":00Z") / 6e4;
/** Pares de compromissos que se sobrepõem no horário. */
export function conflictPairs(appts) {
  const a = [...appts].sort((x, y) => x.starts_at.localeCompare(y.starts_at)), out = [];
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    if (minutes(a[j].starts_at) >= minutes(a[i].starts_at) + a[i].duration_min) break;
    out.push([a[i].id, a[j].id]);
  }
  return out;
}
async function apptFields(env, W, b, cur = {}) {
  const v = k => (b[k] !== undefined ? b[k] : cur[k]);
  const date = isoDate(b.date !== undefined ? b.date : cur.starts_at?.slice(0, 10), "Data") || fail(400, "Data: obrigatória", "required");
  const time = b.time !== undefined ? b.time : cur.starts_at?.slice(11, 16);
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400, "Horário: use HH:MM", "invalid");
  return {
    title: str(v("title"), { min: 2, max: 120, field: "Compromisso" }),
    kind: oneOf(v("kind") ?? "reuniao", ["degustacao", "prova", "reuniao", "visita", "outro"], "Tipo"),
    starts_at: `${date}T${time}`,
    duration_min: int(v("duration_min") ?? 60, { min: 5, max: 1440, field: "Duração" }),
    place: str(v("place"), { max: 160, field: "Local" }),
    notes: text(v("notes"), { max: 800, field: "Notas" }),
    vendor_id: b.vendor_id !== undefined ? await ownVendorId(env, W, b.vendor_id) : (cur.vendor_id ?? null),
  };
}
async function createAppt(req, env, W) {
  const f = await apptFields(env, W, await body(req));
  const id = uid("a_");
  await run(env, "INSERT INTO appointments (id, wedding_id, title, kind, starts_at, duration_min, place, notes, vendor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, W, f.title, f.kind, f.starts_at, f.duration_min, f.place, f.notes, f.vendor_id);
  return json({ id }, 201);
}
async function updateAppt(req, env, W, id) {
  const cur = await own(env, "appointments", W, id, "Compromisso");
  const f = await apptFields(env, W, await body(req), cur);
  await run(env, "UPDATE appointments SET title = ?, kind = ?, starts_at = ?, duration_min = ?, place = ?, notes = ?, vendor_id = ? WHERE id = ? AND wedding_id = ?", f.title, f.kind, f.starts_at, f.duration_min, f.place, f.notes, f.vendor_id, id, W);
  return json({ ok: true });
}
async function deleteAppt(env, W, id, actor) {
  await own(env, "appointments", W, id, "Compromisso");
  await run(env, "DELETE FROM appointments WHERE id = ? AND wedding_id = ?", id, W);
  await audit(env, W, actor, "appointment.delete", id);
  return json({ ok: true });
}

/* ---------------- financeiro: parcelas, histórico, CSV ---------------- */
export const historyStmt = (env, W, itemId, label, actor, action, changes = []) =>
  env.DB.prepare("INSERT INTO budget_history (wedding_id, item_id, item_label, actor, action, changes_json) VALUES (?, ?, ?, ?, ?, ?)").bind(W, itemId, String(label || "").slice(0, 120), actor || "sistema", action, JSON.stringify(changes));
export const HISTORY_FIELDS = ["description", "vendor", "category_id", "amount_cents", "paid_cents", "due_date", "per_guest_cents", "receipt_url"];
export function diff(before, after, fields = HISTORY_FIELDS) {
  return fields.filter(f => after[f] !== undefined && (before[f] ?? null) !== (after[f] ?? null)).map(f => ({ field: f, from: before[f] ?? null, to: after[f] ?? null }));
}
/**
 * Valida as parcelas enviadas para um lançamento. A soma precisa bater com o valor (o "pago" passa a ser a soma das parcelas pagas
 * e o vencimento do lançamento, o da próxima parcela em aberto). Lista vazia = sem parcelas.
 */
export function parseInstallments(raw, amount) {
  const rows = list(raw, 60, "Parcelas").map((x, i) => {
    const paid = bool(x?.paid);
    return { id: typeof x?.id === "string" && /^[\w-]{2,40}$/.test(x.id) ? x.id : null,
      amount_cents: int(x?.amount_cents, { field: `Parcela ${i + 1}: valor` }),
      due_date: isoDate(x?.due_date ?? null, `Parcela ${i + 1}: vencimento`),
      paid_at: paid ? (isoDate(x?.paid_at ?? null, `Parcela ${i + 1}: data do pagamento`) || localToday()) : null,
      receipt_url: link(x?.receipt_url, `Parcela ${i + 1}: comprovante`) };
  });
  if (!rows.length) return { rows, paid: null, due: undefined };
  const sum = rows.reduce((s, r) => s + r.amount_cents, 0);
  if (sum !== amount) fail(400, `A soma das parcelas (${brl(sum)}) precisa ser igual ao valor do lançamento (${brl(amount)}).`, "installments_sum");
  return { rows, paid: rows.filter(r => r.paid_at).reduce((s, r) => s + r.amount_cents, 0), due: rows.find(r => !r.paid_at)?.due_date ?? null };
}
/** Comandos que substituem as parcelas de um lançamento (mesmo casamento). */
export function installmentStmts(env, W, itemId, rows) {
  return [env.DB.prepare("DELETE FROM budget_installments WHERE item_id = ? AND wedding_id = ?").bind(itemId, W),
    ...rows.map((r, i) => env.DB.prepare("INSERT INTO budget_installments (id, wedding_id, item_id, n, amount_cents, due_date, paid_at, receipt_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(uid("p_"), W, itemId, i + 1, r.amount_cents, r.due_date, r.paid_at, r.receipt_url))];
}
export async function installmentCount(env, W, itemId) {
  return (await one(env, "SELECT COUNT(*) AS n FROM budget_installments WHERE item_id = ? AND wedding_id = ?", itemId, W)).n;
}
async function payInstallment(req, env, W, id, actor) {
  const p = await own(env, "budget_installments", W, id, "Parcela");
  const b = await body(req);
  const paid = b.paid === undefined ? true : bool(b.paid);
  const paidAt = paid ? (isoDate(b.paid_at ?? null, "Data do pagamento") || p.paid_at || localToday()) : null;
  const receipt = b.receipt_url !== undefined ? link(b.receipt_url, "Comprovante") : p.receipt_url;
  const it = await one(env, "SELECT id, description, paid_cents, due_date FROM budget_items WHERE id = ? AND wedding_id = ?", p.item_id, W);
  const rows = (await all(env, "SELECT id, amount_cents, due_date, paid_at FROM budget_installments WHERE item_id = ? AND wedding_id = ? ORDER BY n", p.item_id, W))
    .map(r => (r.id === id ? { ...r, paid_at: paidAt } : r));
  const newPaid = rows.filter(r => r.paid_at).reduce((s, r) => s + r.amount_cents, 0);
  const newDue = rows.find(r => !r.paid_at)?.due_date ?? null;
  await batch(env, [
    env.DB.prepare("UPDATE budget_installments SET paid_at = ?, receipt_url = ? WHERE id = ? AND wedding_id = ?").bind(paidAt, receipt, id, W),
    env.DB.prepare("UPDATE budget_items SET paid_cents = ?, due_date = ? WHERE id = ? AND wedding_id = ?").bind(newPaid, newDue, it.id, W),
    historyStmt(env, W, it.id, it.description, actor, paid ? "pay" : "unpay", [{ field: "installment", from: null, to: p.n }, { field: "paid_cents", from: it.paid_cents, to: newPaid }]),
  ]);
  return json({ ok: true, paid, paid_cents: newPaid });
}
/** Extras do GET /api/admin/budget: parcelas por lançamento, fornecedor ligado e próximos pagamentos (considerando parcelas). */
export async function budgetExtras(env, W, items) {
  const insts = await all(env, "SELECT id, item_id, n, amount_cents, due_date, paid_at, receipt_url FROM budget_installments WHERE wedding_id = ? ORDER BY item_id, n", W);
  const vendors = await all(env, "SELECT id, name, budget_item_id FROM vendors WHERE wedding_id = ? AND budget_item_id IS NOT NULL", W);
  const full = items.map(i => ({ ...i, installments: insts.filter(x => x.item_id === i.id), vendor_ref: vendors.find(v => v.budget_item_id === i.id) || null }));
  return { items: full, upcoming: upcomingPayments(full) };
}
export function upcomingPayments(items, today = localToday()) {
  const out = [];
  for (const i of items) {
    const its = i.installments || [];
    if (its.length) its.filter(x => !x.paid_at && x.due_date).forEach(x => out.push({ id: i.id, item_id: i.id, category_id: i.category_id, description: i.description, vendor: i.vendor,
      amount_cents: i.amount_cents, paid_cents: i.paid_cents, installment_id: x.id, n: x.n, of: its.length, due_date: x.due_date, left_cents: x.amount_cents, overdue: x.due_date < today }));
    else if (i.due_date && i.amount_cents > i.paid_cents) out.push({ id: i.id, item_id: i.id, category_id: i.category_id, description: i.description, vendor: i.vendor,
      amount_cents: i.amount_cents, paid_cents: i.paid_cents, installment_id: null, due_date: i.due_date, left_cents: i.amount_cents - i.paid_cents, overdue: i.due_date < today });
  }
  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
async function history(env, W, url) {
  const item = url.searchParams.get("item");
  const limit = int(url.searchParams.get("limit") ?? 60, { min: 1, max: 300, field: "Limite" });
  const rows = await all(env, `SELECT h.id, h.item_id, h.item_label, h.action, h.changes_json, h.at, COALESCE(u.name, h.actor) AS who
    FROM budget_history h LEFT JOIN users u ON h.actor = 'user:' || u.id
    WHERE h.wedding_id = ? ${item ? "AND h.item_id = ?" : ""} ORDER BY h.at DESC, h.id DESC LIMIT ?`, ...(item ? [W, item, limit] : [W, limit]));
  return json({ history: rows.map(r => ({ ...r, changes: parseJson(r.changes_json, []), changes_json: undefined })) });
}
/** Célula CSV segura: separador ";" (Excel em português), aspas e proteção contra fórmulas (=, +, -, @). */
const cell = v => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const dec = c => (c / 100).toFixed(2).replace(".", ",");
const br = d => (d ? d.split("-").reverse().join("/") : "");
async function exportCsv(env, W, actor) {
  const w = await one(env, "SELECT slug FROM weddings WHERE id = ?", W);
  const cats = Object.fromEntries((await all(env, "SELECT id, name FROM budget_categories WHERE wedding_id = ?", W)).map(c => [c.id, c.name]));
  const items = await all(env, "SELECT b.* FROM budget_items b JOIN budget_categories c ON c.id = b.category_id WHERE b.wedding_id = ? ORDER BY c.sort, c.rowid, b.due_date IS NULL, b.due_date", W);
  const insts = await all(env, "SELECT * FROM budget_installments WHERE wedding_id = ? ORDER BY n", W);
  const lines = [["Tipo", "Categoria", "Descrição", "Fornecedor", "Valor (R$)", "Pago (R$)", "A pagar (R$)", "Vencimento", "Pago em", "Valor por convidado (R$)", "Comprovante"]];
  for (const i of items) {
    const its = insts.filter(x => x.item_id === i.id);
    lines.push(["Lançamento", cats[i.category_id], i.description, i.vendor, dec(i.amount_cents), dec(i.paid_cents), dec(i.amount_cents - i.paid_cents), br(i.due_date), "", i.per_guest_cents == null ? "" : dec(i.per_guest_cents), i.receipt_url]);
    for (const x of its) lines.push([`Parcela ${x.n}/${its.length}`, cats[i.category_id], i.description, i.vendor, dec(x.amount_cents), x.paid_at ? dec(x.amount_cents) : "0,00", x.paid_at ? "0,00" : dec(x.amount_cents), br(x.due_date), br(x.paid_at), "", x.receipt_url]);
  }
  const t = items.reduce((s, i) => ({ a: s.a + i.amount_cents, p: s.p + i.paid_cents }), { a: 0, p: 0 });
  lines.push(["Total", "", "", "", dec(t.a), dec(t.p), dec(t.a - t.p), "", "", "", ""]);
  await audit(env, W, actor, "budget.export_csv");
  return new Response("﻿" + lines.map(l => l.map(cell).join(";")).join("\r\n") + "\r\n", { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="orcamento-${w.slug}-${localToday()}.csv"` } });
}

/* ---------------- central da visão geral ---------------- */
const KEY_RE = /^[\w:.-]{3,120}$/;
const seatsFrom = cv => {
  if (!cv || typeof cv !== "object") return null;
  const n = x => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null);
  if (Array.isArray(cv.tables)) { const s = cv.tables.reduce((t, x) => t + (Number(x?.seats ?? x?.capacity) || 0), 0); if (s > 0) return s; }
  return n(cv.seats) ?? n(cv.seating?.seats) ?? n(cv.tables?.seats) ?? n(cv.mesas?.seats) ?? n(cv.mesas?.lugares) ?? null;
};
/**
 * Progresso, tarefas urgentes, próximos compromissos e pagamentos, e o radar de riscos (alertas explicados e descartáveis).
 * `base` traz o que o worker já calculou (casamento, eventos, famílias, restrições) e `mods` o que os outros módulos publicaram.
 */
export async function commandCenter(env, W, base, mods = {}) {
  const today = localToday(), now = localNow(), week = addDays(today, 7);
  const tasks = await all(env, "SELECT t.id, t.title, t.owner, t.due_date, t.status, v.name AS vendor FROM tasks t LEFT JOIN vendors v ON v.id = t.vendor_id AND v.wedding_id = t.wedding_id WHERE t.wedding_id = ?", W);
  const vendors = await all(env, "SELECT id, name, status, doc_url FROM vendors WHERE wedding_id = ?", W);
  const appts = await all(env, "SELECT id, title, kind, starts_at, duration_min, place FROM appointments WHERE wedding_id = ? ORDER BY starts_at", W);
  const items = await all(env, "SELECT id, category_id, description, vendor, amount_cents, paid_cents, due_date FROM budget_items WHERE wedding_id = ?", W);
  const { upcoming } = await budgetExtras(env, W, items);
  const dismissed = new Set((await all(env, "SELECT alert_key FROM dismissed_alerts WHERE wedding_id = ?", W)).map(r => r.alert_key));

  const open = tasks.filter(t => t.status !== "done");
  const live = vendors.filter(v => v.status !== "descartado");
  const parts = [
    { key: "tasks", label: "Tarefas concluídas", done: tasks.length - open.length, total: tasks.length, href: "#tarefas" },
    { key: "guests", label: "Convites respondidos", done: base.households?.responded || 0, total: base.households?.total || 0, href: "#convidados" },
    { key: "vendors", label: "Fornecedores contratados", done: live.filter(v => v.status === "contratado").length, total: live.length, href: "#fornecedores" },
  ];
  const counted = parts.filter(p => p.total > 0);
  const pct = counted.length ? Math.round(counted.reduce((s, p) => s + p.done / p.total, 0) / counted.length * 100) : 0;

  const risks = [];
  const add = (key, level, title, why, href, action) => risks.push({ key, level, title, why, href, action });
  for (const u of upcoming.filter(u => u.overdue)) {
    add(`pay:${u.installment_id || u.item_id}:${u.due_date}`, "alto", `Pagamento atrasado: ${u.description}${u.n ? ` (parcela ${u.n}/${u.of})` : ""}`,
      `${brl(u.left_cents)} venceu em ${br(u.due_date)}${u.vendor ? ` com ${u.vendor}` : ""}. Atraso pode gerar multa ou travar a reserva.`, "#orcamento", "Registrar pagamento");
  }
  const w = base.wedding || {};
  const pendingHH = (base.households?.total || 0) - (base.households?.responded || 0);
  if (w.rsvp_deadline && pendingHH > 0) {
    const days = Math.round((Date.parse(w.rsvp_deadline + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 864e5);
    if (days <= 30) add(`rsvp:${w.rsvp_deadline}`, days < 0 ? "alto" : "medio",
      days < 0 ? `O prazo de confirmação acabou e ${pendingHH} ${pendingHH > 1 ? "convites estão" : "convite está"} sem resposta` : `${pendingHH} ${pendingHH > 1 ? "convites ainda sem resposta" : "convite ainda sem resposta"} a ${days} ${days === 1 ? "dia" : "dias"} do prazo`,
      `O prazo para confirmar é ${br(w.rsvp_deadline)}. Sem resposta, o número final para o buffet e as mesas fica no chute.`, "#convidados", "Ver quem falta");
  }
  const byId = Object.fromEntries(appts.map(a => [a.id, a]));
  for (const [x, y] of conflictPairs(appts)) {
    const a = byId[x], b = byId[y];
    if (b.starts_at.slice(0, 10) < today && a.starts_at.slice(0, 10) < today) continue;
    add(`conf:${x}:${y}`, "medio", `Compromissos no mesmo horário: ${a.title} e ${b.title}`,
      `${br(a.starts_at.slice(0, 10))}, ${a.starts_at.slice(11)} e ${b.starts_at.slice(11)}. Remarque um deles ou combine quem vai a cada um.`, "#tarefas", "Ver agenda");
  }
  const noOwner = open.filter(t => !t.owner);
  if (noOwner.length) add(`owner:${noOwner.length}`, "baixo", `${noOwner.length} ${noOwner.length > 1 ? "tarefas abertas estão" : "tarefa aberta está"} sem responsável`,
    "Tarefa sem dono costuma ficar para depois. Escolham quem cuida de cada uma (noiva, noivo, família, cerimonial…).", "#tarefas", "Distribuir tarefas");
  for (const v of vendors.filter(v => v.status === "contratado" && !v.doc_url)) {
    add(`doc:${v.id}`, "medio", `${v.name} está contratado, mas sem contrato anexado`,
      "Guardem o link do contrato assinado aqui: valores, horários e multas ficam fáceis de conferir na reta final.", "#fornecedores", "Anexar contrato");
  }
  if (base.diets > 0) add(`diet:${base.diets}`, "baixo", `${base.diets} ${base.diets > 1 ? "pessoas informaram" : "pessoa informou"} restrição alimentar`,
    "Passem a lista ao buffet antes de fechar o cardápio, para cada pessoa ter o que comer.", "#restricoes", "Ver restrições");
  const seats = seatsFrom(mods.convidados);
  if (seats) {
    const confirmed = Number(mods.convidados.confirmed ?? mods.convidados.seating?.confirmed) || Math.max(0, ...(base.events || []).map(e => e.yes || 0));
    if (confirmed > seats) add(`seats:${confirmed}:${seats}`, "alto", `${confirmed} confirmados para ${seats} lugares nas mesas`,
      `Faltam ${confirmed - seats} ${confirmed - seats > 1 ? "lugares" : "lugar"}. Acrescentem mesas ou revejam a disposição antes de fechar com o local.`, "#mesas", "Abrir mesas");
  }
  const order = { alto: 0, medio: 1, baixo: 2 };
  risks.sort((a, b) => order[a.level] - order[b.level]);
  return {
    today, progress: { pct, parts },
    urgent_tasks: open.filter(t => t.due_date && t.due_date <= week).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6).map(t => ({ ...t, overdue: t.due_date < today })),
    open_tasks: open.length,
    appointments: appts.filter(a => a.starts_at >= now.slice(0, 10)).slice(0, 5),
    payments: upcoming.slice(0, 5),
    risks: risks.filter(r => !dismissed.has(r.key)),
    dismissed: risks.filter(r => dismissed.has(r.key)).length,
  };
}
async function dismissAlert(req, env, W) {
  const b = await body(req);
  const key = typeof b.key === "string" && KEY_RE.test(b.key) ? b.key : fail(400, "Alerta inválido", "invalid");
  await run(env, "INSERT INTO dismissed_alerts (wedding_id, alert_key) VALUES (?, ?) ON CONFLICT(wedding_id, alert_key) DO NOTHING", W, key);
  return json({ ok: true });
}

/* ---------------- roteamento do módulo ---------------- */
export default {
  name: "organizacao",
  async admin({ req, env, url, p, m, W, actor }) {
    if (!p.startsWith("/api/admin/org/") && !p.startsWith("/api/admin/budget/")) return null;
    let r;
    if (p === "/api/admin/org/vendors") { if (m === "GET") return json(await listVendors(env, W)); if (m === "POST") return createVendor(req, env, W); }
    if ((r = p.match(/^\/api\/admin\/org\/vendors\/([\w-]{2,40})(\/quotes|\/contract)?$/))) {
      if (m === "PATCH" && !r[2]) return updateVendor(req, env, W, r[1]);
      if (m === "DELETE" && !r[2]) return deleteVendor(env, W, r[1], actor);
      if (m === "POST" && r[2] === "/quotes") return createQuote(req, env, W, r[1]);
      if (m === "POST" && r[2] === "/contract") return contractVendor(req, env, W, r[1], actor);
    }
    if ((r = p.match(/^\/api\/admin\/org\/quotes\/([\w-]{2,40})$/))) {
      if (m === "PATCH") return updateQuote(req, env, W, r[1]);
      if (m === "DELETE") return deleteQuote(env, W, r[1], actor);
    }
    if (p === "/api/admin/org/tasks") { if (m === "GET") return json(await tasksData(env, W)); if (m === "POST") return createTask(req, env, W); }
    if ((r = p.match(/^\/api\/admin\/org\/tasks\/([\w-]{2,40})$/))) {
      if (m === "PATCH") return updateTask(req, env, W, r[1]);
      if (m === "DELETE") return deleteTask(env, W, r[1], actor);
    }
    if (p === "/api/admin/org/checklist" && m === "POST") return generateChecklist(req, env, W);
    if (p === "/api/admin/org/appointments" && m === "POST") return createAppt(req, env, W);
    if ((r = p.match(/^\/api\/admin\/org\/appointments\/([\w-]{2,40})$/))) {
      if (m === "PATCH") return updateAppt(req, env, W, r[1]);
      if (m === "DELETE") return deleteAppt(env, W, r[1], actor);
    }
    if (p === "/api/admin/org/alerts/dismiss" && m === "POST") return dismissAlert(req, env, W);
    if (p === "/api/admin/org/alerts/dismissed" && m === "DELETE") { await run(env, "DELETE FROM dismissed_alerts WHERE wedding_id = ?", W); return json({ ok: true }); }
    if ((r = p.match(/^\/api\/admin\/budget\/installments\/([\w-]{2,40})\/pay$/)) && m === "POST") return payInstallment(req, env, W, r[1], actor);
    if (p === "/api/admin/budget/history" && m === "GET") return history(env, W, url);
    if (p === "/api/admin/budget/export.csv" && m === "GET") return exportCsv(env, W, actor);
    return null;
  },
  async exportData(env, W) {
    const q = sql => all(env, sql, W);
    return {
      vendors: await q("SELECT * FROM vendors WHERE wedding_id = ?"),
      vendor_quotes: await q("SELECT * FROM vendor_quotes WHERE wedding_id = ?"),
      tasks: await q("SELECT * FROM tasks WHERE wedding_id = ?"),
      appointments: await q("SELECT * FROM appointments WHERE wedding_id = ?"),
      budget_installments: await q("SELECT * FROM budget_installments WHERE wedding_id = ?"),
      budget_history: await q("SELECT * FROM budget_history WHERE wedding_id = ?"),
      org_profile: await q("SELECT * FROM org_profile WHERE wedding_id = ?"),
    };
  },
};
