/**
 * Copiloto dos noivos: núcleo determinístico de intenções sobre os dados REAIS do casamento (sempre filtrados por W).
 * Cada resposta traz os fatos usados e as citações (registros + aba do painel). Não altera dados nem envia nada:
 * mensagens saem como rascunho para o casal copiar ou abrir no WhatsApp.
 * Opcional: com o binding env.AI (Workers AI), só a redação final passa pelo modelo, a partir dos fatos já calculados;
 * se o texto do modelo trouxer número que não está nos fatos, é descartado.
 */
import { parseJson } from "../../lib.js";
import { all, first, tryAll, norm, todaySP, dateSP, longDateBR, shortDateBR, timeBR, moneyBR } from "./util.js";

export const SUGGESTIONS = [
  "Quantas pessoas ainda não confirmaram?", "Quanto ainda precisamos pagar?", "Quais fornecedores estão com contrato pendente?",
  "Que tarefas priorizar esta semana?", "Como economizar R$ 10.000?", "Há conflito no cronograma?", "Crie uma mensagem educada para quem não respondeu",
];

const INTENTS = [
  { id: "mensagem", w: 4, stems: ["mensagem", "lembrete", "escrev", "redij", "texto para", "cobrar quem"] },
  { id: "economizar", w: 4, stems: ["economiz", "economia", "cortar", "reduzir", "baratear", "poupar", "gastar menos"] },
  { id: "contratos", w: 3, stems: ["fornecedor", "contrato", "contratar", "proposta"] },
  { id: "conflito", w: 3, stems: ["conflito", "choque", "sobrepo", "mesmo horario", "cronograma", "agenda", "compromisso"] },
  { id: "tarefas", w: 3, stems: ["tarefa", "priorizar", "prioridade", "pendencias", "o que fazer", "esta semana", "essa semana"] },
  { id: "pagar", w: 2, stems: ["pagar", "pagamento", "parcela", "devendo", "a pagar", "vencimento", "vence", "boleto", "quanto falta"] },
  { id: "pendentes", w: 2, stems: ["nao confirm", "nao respond", "falta confirmar", "faltam confirmar", "pendente", "sem resposta", "nao responderam"] },
  { id: "confirmados", w: 1, stems: ["confirmad", "quantos vem", "quantas pessoas vao", "quantos vao", "presenca"] },
];

const pick = q => {
  const s = INTENTS.map(i => ({ id: i.id, s: i.stems.filter(x => q.includes(x)).length * i.w })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return s[0]?.id || null;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const list = a => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1];
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const brDate = d => d ? new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";

/** "R$ 10.000", "10 mil", "10k", "10.000,50" → centavos (ou null). */
export function parseAmount(raw) {
  const m = String(raw || "").toLowerCase().match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil\b|k\b)?/);
  if (!m) return null;
  let v = Number(m[1].replace(/[.\s]/g, "")) + (m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0);
  if (m[3]) v *= 1000;
  return v > 0 && v < 1e9 ? Math.round(v * 100) : null;
}

export async function copilot(env, W, raw, now = new Date()) {
  const q = norm(String(raw || "").slice(0, 400));
  const intent = pick(q);
  const today = todaySP(now);
  const w = await first(env, "SELECT names, date_iso, rsvp_deadline FROM weddings WHERE id = ?", W);
  const H = { intent: intent || "ajuda", text: "", facts: [], cites: [], missing: [] };
  const cite = (label, href, detail = "") => H.cites.push({ label, href, detail });

  if (intent === "pendentes" || intent === "mensagem") {
    const hs = await all(env, `SELECT h.id, h.name, h.greeting, (SELECT COUNT(*) FROM guests g WHERE g.household_id = h.id) AS people,
      h.token_hash IS NOT NULL AND h.revoked = 0 AS has_link FROM households h WHERE h.wedding_id = ? AND h.waitlist = 0 AND h.responded_at IS NULL ORDER BY h.created_at, h.rowid`, W);
    const total = (await first(env, "SELECT COUNT(*) AS n FROM households WHERE wedding_id = ? AND waitlist = 0", W)).n;
    const people = hs.reduce((s, h) => s + h.people, 0);
    hs.forEach(h => cite(h.name, "#convidados", plural(h.people, "pessoa", "pessoas") + (h.has_link ? "" : " · sem link ativo")));
    if (intent === "pendentes") {
      H.facts.push(`${hs.length} de ${total} convites sem resposta`, `${people} pessoas nesses convites`);
      H.text = hs.length ? `${plural(hs.length, "família ainda não respondeu", "famílias ainda não responderam")} (${plural(people, "pessoa", "pessoas")}), de ${total} convites: ${list(hs.map(h => h.name))}. O prazo de confirmação é ${brDate(w.rsvp_deadline)}.`
        : `Todos os ${total} convites já têm resposta.`;
      if (hs.length) H.next = "Peça: “crie uma mensagem educada para quem não respondeu”.";
    } else {
      const tpl = `Oi, {nome}! Tudo bem? Estamos cuidando dos últimos detalhes do nosso casamento (${longDateBR(w.date_iso)}) e ainda não recebemos a confirmação de vocês. Quando puderem, respondam pelo link do convite até ${brDate(w.rsvp_deadline)}. Se o link se perdeu, é só avisar que mandamos de novo. Um abraço, ${w.names}`;
      H.facts.push(`${hs.length} convites sem resposta`, `prazo ${brDate(w.rsvp_deadline)}`);
      H.text = hs.length ? `Preparei uma mensagem para ${plural(hs.length, "família", "famílias")} sem resposta. Nada é enviado sozinho: copiem ou abram no WhatsApp e escolham o contato. O link do convite não fica guardado no Universo; se alguém perdeu, gerem um link novo na aba Convidados.`
        : `Todos os convites já têm resposta. Não há para quem mandar lembrete.`;
      if (hs.length) H.draft = { template: tpl, items: hs.map(h => { const t = tpl.replace("{nome}", h.greeting || h.name); return { name: h.name, text: t, whatsapp: "https://wa.me/?text=" + encodeURIComponent(t) }; }) };
    }
  } else if (intent === "confirmados") {
    const ev = await all(env, `SELECT e.name, (SELECT COUNT(*) FROM invitations i JOIN guests g ON g.household_id = i.household_id JOIN households h ON h.id = i.household_id WHERE i.event_id = e.id AND h.waitlist = 0) AS invited,
      (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'yes') AS yes, (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'no') AS no
      FROM events e WHERE e.wedding_id = ? ORDER BY e.sort, e.starts_at`, W);
    ev.forEach(e => { H.facts.push(`${e.name}: ${e.yes} sim, ${e.no} não, ${e.invited - e.yes - e.no} pendentes de ${e.invited}`); cite(e.name, "#convidados", `${e.yes} confirmados`); });
    H.text = ev.map(e => `${e.name}: ${plural(e.yes, "pessoa confirmada", "pessoas confirmadas")} de ${e.invited} (${e.no} não vão, ${e.invited - e.yes - e.no} sem resposta).`).join(" ");
  } else if (intent === "pagar") {
    const items = await all(env, "SELECT id, description, vendor, amount_cents, paid_cents, due_date FROM budget_items WHERE wedding_id = ? AND amount_cents > paid_cents ORDER BY due_date IS NULL, due_date", W);
    const toPay = items.reduce((s, i) => s + i.amount_cents - i.paid_cents, 0);
    const inst = await tryAll(env, `SELECT n.n, n.amount_cents, n.due_date, b.description FROM budget_installments n JOIN budget_items b ON b.id = n.item_id
      WHERE n.wedding_id = ? AND n.paid_at IS NULL ORDER BY n.due_date IS NULL, n.due_date LIMIT 5`, W);
    items.forEach(i => cite(i.description + (i.vendor ? " · " + i.vendor : ""), "#orcamento", `falta ${moneyBR(i.amount_cents - i.paid_cents)}${i.due_date ? " · vence " + brDate(i.due_date) + (i.due_date < today ? " (vencido)" : "") : ""}`));
    H.facts.push(`a pagar ${moneyBR(toPay)}`, `${items.length} lançamentos em aberto`);
    const overdue = items.filter(i => i.due_date && i.due_date < today);
    const next = (inst && inst.length ? inst.map(n => `${n.description} (parcela ${n.n}, ${moneyBR(n.amount_cents)}${n.due_date ? ", " + brDate(n.due_date) : ""})`) : items.filter(i => i.due_date && i.due_date >= today).slice(0, 3).map(i => `${i.description} (${brDate(i.due_date)})`));
    H.text = items.length ? `Faltam ${moneyBR(toPay)} a pagar em ${plural(items.length, "lançamento", "lançamentos")} do orçamento.${overdue.length ? ` ${plural(overdue.length, "está vencido", "estão vencidos")}: ${list(overdue.map(i => i.description))}.` : ""}${next.length ? ` Próximos vencimentos: ${list(next)}.` : ""}`
      : "Nada a pagar: todos os lançamentos do orçamento estão quitados.";
  } else if (intent === "contratos") {
    const v = await tryAll(env, "SELECT id, name, category, status, doc_url FROM vendors WHERE wedding_id = ? AND status <> 'descartado' ORDER BY category, name", W);
    if (v === null) { H.missing.push("fornecedores"); H.text = "Essa informação ainda não está cadastrada: a área de fornecedores ainda não está disponível no painel de vocês."; }
    else if (!v.length) { H.missing.push("fornecedores"); H.text = "Nenhum fornecedor cadastrado ainda na aba Fornecedores. Assim que cadastrarem, eu consigo dizer quais contratos estão pendentes."; }
    else {
      const label = { pesquisando: "pesquisando", orcamento_pedido: "orçamento pedido", proposta_recebida: "proposta recebida" };
      const open = v.filter(x => x.status !== "contratado"), noDoc = v.filter(x => x.status === "contratado" && !x.doc_url);
      open.forEach(x => cite(x.name, "#fornecedores", `${x.category ? x.category + " · " : ""}${label[x.status] || x.status}`));
      noDoc.forEach(x => cite(x.name, "#fornecedores", `${x.category ? x.category + " · " : ""}contratado, sem contrato anexado`));
      H.facts.push(`${open.length} fornecedores sem contrato`, `${noDoc.length} contratados sem documento anexado`, `${v.length} fornecedores ativos`);
      H.text = !open.length && !noDoc.length ? `Todos os ${v.length} fornecedores ativos estão contratados e com contrato anexado.`
        : [open.length ? `${plural(open.length, "fornecedor ainda está", "fornecedores ainda estão")} sem contrato: ${list(open.map(x => `${x.name} (${label[x.status] || x.status})`))}.` : "",
           noDoc.length ? `${plural(noDoc.length, "fornecedor contratado está", "fornecedores contratados estão")} sem o contrato anexado: ${list(noDoc.map(x => x.name))}.` : ""].filter(Boolean).join(" ");
    }
  } else if (intent === "tarefas") {
    const week = addDays(today, 7);
    const t = await tryAll(env, "SELECT id, title, owner, due_date, status FROM tasks WHERE wedding_id = ? AND status <> 'done' ORDER BY due_date IS NULL, due_date", W);
    const pays = await all(env, "SELECT description, due_date, amount_cents - paid_cents AS open FROM budget_items WHERE wedding_id = ? AND amount_cents > paid_cents AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date", W, week);
    if (t === null) H.missing.push("tarefas");
    const overdue = (t || []).filter(x => x.due_date && x.due_date < today), soon = (t || []).filter(x => x.due_date && x.due_date >= today && x.due_date <= week), doing = (t || []).filter(x => x.status === "doing" && !overdue.includes(x) && !soon.includes(x));
    const prio = [...overdue, ...soon, ...doing].slice(0, 8);
    prio.forEach(x => cite(x.title, "#tarefas", [x.due_date ? (x.due_date < today ? "atrasada · " : "") + "prazo " + brDate(x.due_date) : "em andamento", x.owner].filter(Boolean).join(" · ")));
    pays.forEach(p => cite(p.description, "#orcamento", `${moneyBR(p.open)} · vence ${brDate(p.due_date)}${p.due_date < today ? " (vencido)" : ""}`));
    H.facts.push(`${overdue.length} tarefas atrasadas`, `${soon.length} tarefas com prazo até ${brDate(week)}`, `${pays.length} pagamentos vencidos ou vencendo até ${brDate(week)}`);
    const parts = [];
    if (t === null) parts.push("As tarefas ainda não estão disponíveis no painel de vocês, então olhei só os pagamentos.");
    else if (!prio.length) parts.push(t.length ? `Nenhuma tarefa atrasada ou com prazo até ${brDate(week)}.` : "Nenhuma tarefa cadastrada na aba Tarefas ainda.");
    else parts.push(`Prioridades até ${brDate(week)}: ${list(prio.map(x => x.title + (x.due_date && x.due_date < today ? " (atrasada)" : "")))}.`);
    if (pays.length) parts.push(`Pagamentos vencidos ou vencendo nesta semana: ${list(pays.map(p => `${p.description} (${moneyBR(p.open)})`))}.`);
    H.text = parts.join(" ");
  } else if (intent === "economizar") {
    const target = parseAmount(raw);
    const cats = await all(env, `SELECT c.id, c.name, c.planned_cents, COALESCE(SUM(b.amount_cents), 0) AS committed FROM budget_categories c LEFT JOIN budget_items b ON b.category_id = c.id AND b.wedding_id = c.wedding_id
      WHERE c.wedding_id = ? GROUP BY c.id ORDER BY c.sort`, W);
    const per = await all(env, "SELECT description, vendor, per_guest_cents FROM budget_items WHERE wedding_id = ? AND per_guest_cents > 0", W);
    const over = cats.filter(c => c.planned_cents > 0 && c.committed > c.planned_cents);
    const perSum = per.reduce((s, i) => s + i.per_guest_cents, 0);
    const quotes = await tryAll(env, `SELECT v.name, v.category, q.title, q.amount_cents FROM vendor_quotes q JOIN vendors v ON v.id = q.vendor_id
      WHERE q.wedding_id = ? AND v.status NOT IN ('contratado','descartado') AND q.amount_cents > 0`, W);
    const ideas = [];
    over.forEach(c => { ideas.push({ cents: c.committed - c.planned_cents, text: `${c.name} está ${moneyBR(c.committed - c.planned_cents)} acima do planejado` }); cite(c.name, "#orcamento", `contratado ${moneyBR(c.committed)} · planejado ${moneyBR(c.planned_cents)}`); });
    if (perSum) {
      const n = target ? Math.ceil(target / perSum) : 10;
      ideas.push({ cents: n * perSum, text: `cada convidado a menos economiza ${moneyBR(perSum)} nos contratos por pessoa (${list(per.map(i => i.description))}); ${target ? `${n} convidados a menos cobririam ${moneyBR(target)}` : `10 convidados a menos = ${moneyBR(10 * perSum)}`}` });
      per.forEach(i => cite(i.description + (i.vendor ? " · " + i.vendor : ""), "#orcamento", `${moneyBR(i.per_guest_cents)} por convidado`));
    }
    if (quotes && quotes.length) {
      const byCat = {};
      quotes.forEach(x => (byCat[x.category || "Sem categoria"] ||= []).push(x));
      for (const [cat, qs] of Object.entries(byCat)) if (qs.length > 1) {
        qs.sort((a, b) => a.amount_cents - b.amount_cents);
        const d = qs[qs.length - 1].amount_cents - qs[0].amount_cents;
        if (d > 0) { ideas.push({ cents: d, text: `em ${cat}, a proposta de ${qs[0].name} (${moneyBR(qs[0].amount_cents)}) é ${moneyBR(d)} menor que a de ${qs[qs.length - 1].name}` }); qs.forEach(x => cite(x.name, "#fornecedores", `${cat} · proposta ${moneyBR(x.amount_cents)}`)); }
      }
    } else if (quotes === null) H.missing.push("propostas de fornecedores");
    const found = ideas.reduce((s, i) => s + i.cents, 0);
    if (target) H.facts.push(`meta ${moneyBR(target)}`);
    ideas.forEach(i => H.facts.push(i.text));
    H.text = !ideas.length ? "Com os dados cadastrados não encontrei onde cortar: nenhuma categoria está acima do planejado e não há contratos com valor por convidado nem propostas abertas para comparar. Eu não invento preços de mercado."
      : `${target ? `Para economizar ${moneyBR(target)}, olhando só os dados de vocês: ` : "Caminhos possíveis, olhando só os dados de vocês: "}${ideas.map(i => i.text).join("; ")}.${target && found < target && !perSum ? ` Isso soma ${moneyBR(found)}, menos do que a meta: o resto depende de renegociar ou cortar itens, e os valores teriam de vir dos fornecedores.` : ""}`;
  } else if (intent === "conflito") {
    const ev = await all(env, "SELECT id, name, starts_at FROM events WHERE wedding_id = ? ORDER BY starts_at", W);
    const ap = await tryAll(env, "SELECT id, title, starts_at, duration_min, place FROM appointments WHERE wedding_id = ? ORDER BY starts_at", W);
    const t = await tryAll(env, "SELECT title, due_date FROM tasks WHERE wedding_id = ? AND status <> 'done' AND due_date > ?", W, dateSP(w.date_iso));
    const found = [];
    for (let i = 0; i < ev.length; i++) for (let j = i + 1; j < ev.length; j++) if (Date.parse(ev[i].starts_at) === Date.parse(ev[j].starts_at)) found.push(`${ev[i].name} e ${ev[j].name} começam no mesmo horário`);
    const span = a => { const s = Date.parse(a.starts_at.length <= 16 ? a.starts_at + ":00-03:00" : a.starts_at); return [s, s + a.duration_min * 6e4]; };
    if (ap) {
      for (let i = 0; i < ap.length; i++) for (let j = i + 1; j < ap.length; j++) { const [a1, a2] = span(ap[i]), [b1, b2] = span(ap[j]); if (a1 < b2 && b1 < a2) found.push(`os compromissos “${ap[i].title}” e “${ap[j].title}” se sobrepõem (${brDate(ap[i].starts_at.slice(0, 10))})`); }
      for (const a of ap) { const [a1, a2] = span(a); for (const e of ev) { const s = Date.parse(e.starts_at); if (s >= a1 - 2 * 36e5 && s < a2) found.push(`o compromisso “${a.title}” fica em cima do evento ${e.name}`); } }
    } else H.missing.push("compromissos");
    (t || []).forEach(x => found.push(`a tarefa “${x.title}” tem prazo depois do casamento (${brDate(x.due_date)})`));
    ev.forEach(e => cite(e.name, "#geral", `${longDateBR(e.starts_at)} · ${timeBR(e.starts_at)}`));
    (ap || []).forEach(a => cite(a.title, "#tarefas", `${brDate(a.starts_at.slice(0, 10))}${a.place ? " · " + a.place : ""}`));
    H.facts.push(`${ev.length} eventos`, `${(ap || []).length} compromissos`, `${found.length} conflitos`);
    H.text = found.length ? `Encontrei ${plural(found.length, "ponto de atenção", "pontos de atenção")}: ${found.join("; ")}.`
      : `Nenhum conflito encontrado entre ${plural(ev.length, "evento", "eventos")}${ap ? ` e ${plural(ap.length, "compromisso", "compromissos")}` : ""}.${ap === null ? " (Os compromissos com fornecedores ainda não estão disponíveis no painel de vocês.)" : ""}`;
  } else {
    H.text = "Posso responder com os dados de vocês sobre confirmações, pagamentos, fornecedores, tarefas, economia e cronograma, e preparar mensagens. Experimentem uma das perguntas abaixo.";
    H.suggestions = SUGGESTIONS;
  }
  return H;
}

/** Redação opcional com Workers AI: só reescreve; números novos derrubam a versão do modelo. */
export async function polish(env, H) {
  if (!env.AI || !H.facts.length || H.intent === "ajuda") return { ...H, ai: false };
  try {
    const sys = "Você reescreve, em português do Brasil, uma resposta curta e gentil para um casal que organiza o casamento. Use SOMENTE os fatos fornecidos. Não acrescente nomes, números, datas, valores, conselhos ou fatos que não estejam na lista. No máximo 4 frases.";
    const r = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages: [{ role: "system", content: sys }, { role: "user", content: `Fatos:\n- ${H.facts.join("\n- ")}\n\nResposta-base:\n${H.text}` }], max_tokens: 300 });
    const out = String(r?.response || "").trim();
    const nums = s => (s.match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/\D/g, ""));
    const allowed = new Set(nums(H.text + " " + H.facts.join(" ") + " " + H.cites.map(c => c.label + " " + c.detail).join(" ")));
    if (!out || out.length > 1200 || nums(out).some(n => !allowed.has(n))) return { ...H, ai: false };
    return { ...H, text: out, ai: true };
  } catch { return { ...H, ai: false }; }
}
