/**
 * Concierge do convidado: responde SÓ com o que o casal publicou ou autorizou.
 * Determinístico: palavras-chave e sinônimos em português. Quando não sabe, diz que não sabe.
 *   knowledge(env, w, h?)  → base de conhecimento (site; + dados da própria família no convite)
 *   ask(kb, pergunta)      → { known, intent, items: [{ text, source, link?, link_label? }] }
 */
import { parseJson } from "../../lib.js";
import { all, tryAll, norm, longDateBR, timeBR, mapsLink, shortDateBR } from "./util.js";

export const TOPICS = [
  ["estacionamento", "Estacionamento"], ["transporte", "Transporte"], ["hospedagem", "Hospedagem"], ["chegada", "Como chegar"],
  ["traje", "Traje"], ["acompanhante", "Acompanhante"], ["criancas", "Crianças"], ["comida", "Comida e restrições"],
  ["presentes", "Presentes"], ["outro", "Outro assunto"],
];

/** Intenções: sinônimos (já sem acento) e peso. Palavras genéricas pesam 1; específicas pesam 3. */
const INTENTS = [
  { id: "estacionamento", w: 3, syn: ["estacionamento", "estacionar", "estaciono", "vaga", "vagas", "manobrista", "manobristas", "valet", "carro", "parar o carro"] },
  { id: "transporte", w: 3, syn: ["transporte", "van", "vans", "onibus", "uber", "taxi", "carona", "translado", "transfer", "voltar", "volta para", "buscar"] },
  { id: "hospedagem", w: 3, syn: ["hotel", "hoteis", "hospedagem", "hospedar", "hospedo", "dormir", "pousada", "airbnb", "onde ficar", "ficar hospedado", "pernoite"] },
  { id: "chegada", w: 3, syn: ["como chegar", "chegar", "chego", "rota", "caminho", "mapa", "gps", "waze", "google maps"] },
  { id: "traje", w: 3, syn: ["traje", "roupa", "roupas", "vestir", "visto", "vestimenta", "dress", "terno", "gravata", "vestido", "salto", "saltos", "sapato", "tenis", "cor", "cores", "branco", "look"] },
  { id: "acompanhante", w: 3, syn: ["acompanhante", "acompanhantes", "levar alguem", "levar outra pessoa", "namorado", "namorada", "plus one", "+1", "trazer alguem", "mais alguem", "marido", "esposa", "quantas pessoas"] },
  { id: "criancas", w: 3, syn: ["crianca", "criancas", "filho", "filhos", "filha", "filhas", "bebe", "bebes", "kids", "menor", "menores"] },
  { id: "comida", w: 3, syn: ["vegetariano", "vegetariana", "vegetarianos", "vegetarianas", "vegano", "vegana", "veganos", "vegan", "cardapio", "comida", "menu", "prato", "pratos", "gluten", "lactose", "alergia", "alergico", "restricao", "restricoes", "buffet", "comer"] },
  { id: "mesa", w: 3, syn: ["mesa", "minha mesa", "mesas", "sentar", "sento", "assento", "lugar marcado"] },
  { id: "presentes", w: 3, syn: ["presente", "presentes", "pix", "lista de presentes", "presentear"] },
  { id: "rsvp", w: 3, syn: ["confirmar", "confirmacao", "confirmo", "rsvp", "prazo", "responder", "presenca"] },
  { id: "cronograma", w: 2, syn: ["cronograma", "programacao", "roteiro", "termina", "acaba", "ate que horas", "fim da festa"] },
  { id: "horario", w: 1, syn: ["que horas", "horario", "horarios", "hora", "quando", "comeca", "inicio", "data", "dia"] },
  { id: "local", w: 1, syn: ["onde", "local", "lugar", "endereco", "fica", "localizacao", "salao", "igreja"] },
];
const STOP = new Set("a o as os um uma de da do das dos e em no na nos nas para pra por com sem que qual quais quem como onde quando eu voce voces nos ele ela eles elas meu minha seu sua tem ter vai vou sera sao esta estou isso isto ha ai la aqui pode posso devo precisa preciso noivos noivo noiva casamento festa".split(" "));
const has = (t, s) => (" " + t + " ").includes(" " + s + " ");
const words = t => norm(t).split(" ").filter(x => x.length >= 4 && !STOP.has(x));

export async function knowledge(env, w, h = null) {
  const events = h
    ? await all(env, `SELECT e.id, e.name, e.starts_at, e.venue, e.address, e.dress_code, e.notes FROM invitations i JOIN events e ON e.id = i.event_id
        WHERE i.household_id = ? AND e.wedding_id = ? ORDER BY e.sort, e.starts_at`, h.id, w.id)
    : await all(env, "SELECT id, name, starts_at, venue, address, dress_code, notes FROM events WHERE wedding_id = ? AND is_public = 1 ORDER BY sort, starts_at", w.id);
  const kb = {
    invite: !!h, names: w.names, venue_name: w.venue_name || "", city: w.city || "",
    events, schedule: parseJson(w.schedule_json, []) || [], dress: parseJson(w.dress_json, []) || [], faq: parseJson(w.faq_json, []) || [],
    rsvp_deadline: w.rsvp_deadline, rsvp_note: w.rsvp_note || "", gifts: (parseJson(w.gifts_json, []) || []).length > 0 || !!w.pix_key || !!w.gift_url,
    answers: await all(env, "SELECT topic, question, answer, keywords FROM concierge_answers WHERE wedding_id = ? ORDER BY sort, rowid", w.id),
  };
  if (h) {
    const guests = await all(env, "SELECT id, name, is_child FROM guests WHERE household_id = ? ORDER BY sort", h.id);
    kb.household = { max_guests: h.max_guests, guests };
    // mesa: só se o casal liberou "mostrar mesas" no convite (módulo convidados), e só das pessoas desta família
    kb.show_tables = !!w.show_tables;
    kb.tables = w.show_tables ? (await tryAll(env, `SELECT g.name AS guest, t.name AS table_name FROM seat_assignments s JOIN seating_tables t ON t.id = s.table_id
      JOIN guests g ON g.id = s.guest_id WHERE g.household_id = ? AND s.wedding_id = ? ORDER BY g.sort`, h.id, w.id)) || [] : [];
    kb.menus = (await tryAll(env, `SELECT m.name, m.description, e.name AS event FROM menu_options m JOIN invitations i ON i.event_id = m.event_id JOIN events e ON e.id = m.event_id
      WHERE i.household_id = ? AND m.wedding_id = ? ORDER BY e.sort, m.sort`, h.id, w.id)) || [];
  }
  return kb;
}

const SRC = { faq: "Dúvidas do site", ans: "Respostas dos noivos", prog: "Programação do site", inv: "Seu convite", dress: "Traje (site)", sched: "Cronograma do site", rsvp: "Confirmação de presença" };
const UNKNOWN = "Os noivos ainda não informaram isso por aqui.";

/** Respostas escritas pelo casal e dúvidas do site que tratam do assunto. */
function texts(kb, intent, qWords) {
  const syn = intent ? INTENTS.find(i => i.id === intent).syn : [];
  const out = [];
  for (const a of kb.answers) {
    const hay = norm([a.question, a.keywords].join(" "));
    if ((intent && a.topic === intent) || syn.some(s => s.length > 3 && has(hay, s)) || (!intent && qWords.some(x => has(hay, x))))
      out.push({ text: a.answer, source: SRC.ans });
  }
  for (const f of kb.faq) {
    const hq = norm(f.q), ha = norm(f.a);
    if (syn.some(s => s.length > 3 && (has(hq, s) || has(ha, s))) || (!intent && qWords.filter(x => has(hq, x)).length >= 1))
      out.push({ text: f.a, source: SRC.faq, q: f.q });
  }
  return out;
}

function pickEvents(kb, q) {
  const named = kb.events.filter(e => norm(e.name).split(" ").some(x => x.length >= 4 && has(q, x)));
  return named.length ? named : kb.events;
}
const evSource = kb => kb.invite ? SRC.inv : SRC.prog;

export function ask(kb, raw) {
  const q = norm(String(raw || "").slice(0, 300));
  if (!q) return { known: false, intent: null, items: [{ text: "Escreva a sua dúvida, por exemplo: “tem estacionamento?”", source: null }] };
  const scored = INTENTS.map(i => ({ id: i.id, s: i.syn.filter(s => has(q, s)).length * i.w })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const intent = scored[0]?.id || null;
  const qWords = words(raw);
  const items = [];
  const evs = pickEvents(kb, q);

  switch (intent) {
    case "local": case "chegada":
      if (intent === "chegada") items.push(...texts(kb, "chegada", qWords));
      for (const e of evs) if (e.venue || e.address) items.push({ text: `${e.name}: ${[e.venue, e.address].filter(Boolean).join(" · ")}.`, source: evSource(kb), link: e.address ? mapsLink(e.address) : null, link_label: "Abrir no mapa" });
      break;
    case "horario":
      for (const e of evs) items.push({ text: `${e.name}: ${longDateBR(e.starts_at)}, às ${timeBR(e.starts_at)}${e.venue ? ", em " + e.venue : ""}.${e.notes ? " " + e.notes : ""}`, source: evSource(kb) });
      break;
    case "cronograma":
      if (kb.schedule.length) items.push({ text: kb.schedule.map(s => `${s.time} · ${s.title}`).join("  ·  "), source: SRC.sched });
      else for (const e of evs) items.push({ text: `${e.name}: ${longDateBR(e.starts_at)}, às ${timeBR(e.starts_at)}.`, source: evSource(kb) });
      break;
    case "traje": {
      for (const d of kb.dress) items.push({ text: `${d.title}: ${d.text}`, source: SRC.dress });
      if (!kb.dress.length) for (const e of evs) if (e.dress_code) items.push({ text: `${e.name}: ${e.dress_code}.`, source: evSource(kb) });
      items.push(...texts(kb, "traje", qWords));
      break;
    }
    case "acompanhante":
      if (kb.household) {
        const g = kb.household.guests, extra = Math.max(0, kb.household.max_guests - g.length);
        items.push({ text: `O seu convite vale para ${g.map(x => x.name).join(", ")}${extra ? `, com mais ${extra} ${extra > 1 ? "vagas" : "vaga"} para acompanhante (o nome vai no formulário de confirmação)` : ""}.`, source: SRC.inv });
      }
      items.push(...texts(kb, "acompanhante", qWords));
      if (kb.rsvp_note && /convite|intransfer|nome|acompanh/i.test(kb.rsvp_note)) items.push({ text: kb.rsvp_note, source: SRC.rsvp });
      break;
    case "criancas":
      items.push(...texts(kb, "criancas", qWords));
      if (kb.rsvp_note && /crian/i.test(kb.rsvp_note)) items.push({ text: kb.rsvp_note, source: SRC.rsvp });
      break;
    case "comida":
      if (kb.menus?.length) items.push({ text: "Opções de prato: " + kb.menus.map(m => `${m.name}${m.description ? " (" + m.description + ")" : ""}${kb.events.length > 1 ? " · " + m.event : ""}`).join("; ") + ". A escolha é feita no formulário de confirmação.", source: "Cardápio do seu convite" });
      items.push(...texts(kb, "comida", qWords));
      break;
    case "mesa":
      if (!kb.invite) items.push({ text: "A mesa de cada pessoa aparece só no convite pessoal da família, se os noivos já tiverem definido.", source: null, hint: true });
      else if (!kb.show_tables || !kb.tables.length) items.push({ text: "Os noivos ainda não definiram (ou ainda não mostraram) as mesas do seu convite. Quando estiver pronto, a mesa aparece aqui.", source: SRC.inv, hint: true });
      else items.push({ text: kb.tables.map(t => `${t.guest}: ${t.table_name}`).join(" · "), source: "Mapa de mesas (seu convite)" });
      break;
    case "presentes":
      items.push(...texts(kb, "presentes", qWords));
      if (kb.gifts) items.push({ text: "A lista de presentes e o Pix dos noivos estão na seção Presentes do site.", source: "Site · Presentes" });
      break;
    case "rsvp":
      items.push({ text: `A confirmação é feita pelo link pessoal do convite, até ${shortDateBR(kb.rsvp_deadline)}.`, source: SRC.rsvp });
      if (kb.rsvp_note) items.push({ text: kb.rsvp_note, source: SRC.rsvp });
      break;
    default:
      if (intent) items.push(...texts(kb, intent, qWords));
  }
  // assunto sem dado estruturado (estacionamento, transporte, hospedagem) ou sem intenção: só textos do casal
  if (!items.length && !intent) items.push(...texts(kb, null, qWords));
  const known = items.some(i => i.source && !i.hint);
  // sem duplicatas (mesma resposta vinda de duas fontes)
  const seen = new Set(), uniq = items.filter(i => { const k = norm(i.text); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  if (!known && !uniq.some(i => i.hint)) return { known: false, intent, items: [{ text: UNKNOWN + " Vale perguntar direto a eles.", source: null }] };
  return { known, intent, items: uniq.map(({ q: _q, ...x }) => x) };
}
