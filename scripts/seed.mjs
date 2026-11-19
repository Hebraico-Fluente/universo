/**
 * Dados de DEMONSTRAÇÃO (todos fictícios). Gera SQL para o D1 ou para o banco local de testes.
 *   node scripts/seed.mjs > seed.sql     →   wrangler d1 execute universo --file=seed.sql
 * Os casais, convidados, fornecedores e valores abaixo não existem. Fotos: banco de imagens (Unsplash).
 */
import { hashPassword, sha256 } from "../src/lib.js";

export const DEMO = {
  login: { email: "demo@universo.app", password: "casamento-demo-2027" },
  other: { email: "lia@universo.app", password: "outro-casal-demo-2027" },
  // links de convite de demonstração (públicos de propósito; num casamento real são aleatórios)
  tokens: { andrade: "demo-familia-andrade-2027", lucia: "demo-tia-lucia-tio-beto", rossi: "demo-famiglia-rossi-2027", marina: "demo-marina-costa-2027" },
};

const q = v => v == null ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const ins = (t, o) => `INSERT INTO ${t} (${Object.keys(o).join(", ")}) VALUES (${Object.values(o).map(q).join(", ")});`;
const U = (id, w) => `https://images.unsplash.com/photo-${id}?w=${w}&q=78&auto=format&fit=crop`;

export async function seedSql() {
  const out = [];
  const pw1 = await hashPassword(DEMO.login.password), pw2 = await hashPassword(DEMO.other.password);

  /* ---------- casamento principal: Helena & Rafael (universo Editorial) ---------- */
  out.push(ins("weddings", {
    id: "w_demo", slug: "helena-e-rafael", names: "Helena & Rafael", date_iso: "2027-10-16T16:30:00-03:00", city: "Curitiba · Paraná",
    universe: "editorial", hero_image: U("1519741497674-611481863552", 2000), rsvp_deadline: "2027-09-15", is_demo: 1, pix_key: "helena.rafael@exemplo.com",
    welcome: "Depois de oito anos, uma mudança de cidade e um cachorro chamado Café, decidimos fazer a festa que a gente sempre imaginou. Queremos você lá.",
    story_json: JSON.stringify([
      { year: "2019", title: "Uma livraria em São Paulo", text: "Os dois foram atrás do último exemplar do mesmo livro. Ninguém levou o livro; saíram com um café marcado.", image: U("1520854221256-17451cc331bf", 1000) },
      { year: "2021", title: "Curitiba, com Café", text: "Mudamos de cidade, adotamos um vira-lata e descobrimos que ele odeia frio tanto quanto a Helena.", image: U("1546032996-6dfacbacbf3f", 1000) },
      { year: "2026", title: "O pedido", text: "Num domingo comum, no mesmo café da primeira conversa. Ela respondeu antes de ele terminar a frase.", image: U("1591604466107-ec97de577aff", 1000) },
    ]),
    gifts_json: JSON.stringify([{ title: "Jantar na lua de mel", cents: 30000 }, { title: "Passeio de barco", cents: 45000 }, { title: "Uma noite a mais no hotel", cents: 60000 }, { title: "Valor livre", cents: 0 }]),
    faq_json: JSON.stringify([
      { q: "Qual é o traje?", a: "Passeio completo. A cerimônia é no jardim: prefira salto bloco." },
      { q: "Crianças são bem-vindas?", a: "Sim! Haverá espaço kids com monitoras durante a festa." },
      { q: "Tem estacionamento?", a: "Sim, com manobristas no local." },
      { q: "Onde ficar?", a: "Para quem vem de fora, o Batel fica a 15 minutos e tem boas opções de hotel." },
    ]),
  }));
  const ev = [
    { id: "e_jantar", wedding_id: "w_demo", name: "Jantar de boas-vindas", starts_at: "2027-10-15T20:00:00-03:00", venue: "Restaurante Varanda", address: "Rua das Flores, 100, Curitiba", dress_code: "Esporte fino", notes: "Só para quem vem de fora e para as famílias.", is_public: 0, sort: 0 },
    { id: "e_cerimonia", wedding_id: "w_demo", name: "Cerimônia", starts_at: "2027-10-16T16:30:00-03:00", venue: "Jardim da Villa Aurora", address: "Estrada da Graciosa, km 8, Quatro Barras", dress_code: "Passeio completo", notes: "Ao ar livre. Chegue 20 minutos antes.", is_public: 1, sort: 1 },
    { id: "e_festa", wedding_id: "w_demo", name: "Festa", starts_at: "2027-10-16T18:30:00-03:00", venue: "Salão da Villa Aurora", address: "Estrada da Graciosa, km 8, Quatro Barras", dress_code: "Passeio completo", notes: "Jantar, pista e muita alegria até tarde.", is_public: 1, sort: 2 },
  ];
  ev.forEach(e => out.push(ins("events", e)));

  const H = [
    { key: "andrade", id: "h_andrade", name: "Família Andrade", greeting: "Carla, Paulo, Sofia e Theo", message: "Vocês estiveram em cada capítulo dessa história. Não seria o mesmo dia sem vocês.", events: ["e_cerimonia", "e_festa"],
      guests: [["Carla Andrade", 0], ["Paulo Andrade", 0], ["Sofia Andrade", 1], ["Theo Andrade", 1]], answers: { e_cerimonia: "yes", e_festa: "yes" }, diet: { 0: "Vegetariana" } },
    { key: "lucia", id: "h_lucia", name: "Tia Lúcia e Tio Beto", greeting: "Tia Lúcia e Tio Beto", message: "Guardamos um lugar perto da pista. A gente sabe que vocês vão dançar.", events: ["e_jantar", "e_cerimonia", "e_festa"],
      guests: [["Lúcia Mendes", 0], ["Roberto Mendes", 0]], answers: null },
    { key: "rossi", id: "h_rossi", name: "Famiglia Rossi", greeting: "Giulia, Marco e Luca", message: "Grazie per attraversare l'oceano per noi. Obrigado por atravessarem o oceano.", events: ["e_jantar", "e_cerimonia", "e_festa"],
      guests: [["Giulia Rossi", 0], ["Marco Rossi", 0], ["Luca Rossi", 1]], answers: { e_jantar: "yes", e_cerimonia: "yes", e_festa: "yes" }, access: { 1: "Cadeira de rodas" } },
    { key: "marina", id: "h_marina", name: "Marina Costa", greeting: "Marina", message: "Madrinha, amiga e testemunha de tudo. Te esperamos!", events: ["e_cerimonia", "e_festa"],
      guests: [["Marina Costa", 0]], answers: { e_cerimonia: "yes", e_festa: "no" } },
    { key: null, id: "h_lucas", name: "Lucas e Bia", greeting: "Lucas e Bia", message: "", events: ["e_cerimonia", "e_festa"], guests: [["Lucas Prado", 0], ["Beatriz Prado", 0]], answers: null },
  ];
  for (const h of H) {
    const token = h.key ? DEMO.tokens[h.key] : null;
    out.push(ins("households", { id: h.id, wedding_id: "w_demo", name: h.name, greeting: h.greeting, message: h.message, max_guests: h.guests.length,
      token_hash: token ? await sha256(token) : null, token_at: token ? "2026-11-01 12:00:00" : null, responded_at: h.answers ? "2026-11-10 21:14:00" : null }));
    h.guests.forEach(([name, child], i) => {
      const gid = `${h.id}_g${i}`;
      out.push(ins("guests", { id: gid, wedding_id: "w_demo", household_id: h.id, name, is_child: child, sort: i, diet: h.diet?.[i] || "", accessibility: h.access?.[i] || "" }));
      if (h.answers) for (const [e, st] of Object.entries(h.answers)) out.push(ins("rsvps", { guest_id: gid, event_id: e, status: st }));
    });
    h.events.forEach(e => out.push(ins("invitations", { household_id: h.id, event_id: e })));
  }

  const C = [["c_local", "Local e cerimônia", 2200000], ["c_buffet", "Buffet e bebidas", 4800000], ["c_foto", "Foto e vídeo", 1400000], ["c_decor", "Decoração e flores", 1600000], ["c_musica", "Música", 900000], ["c_papel", "Papelaria e site", 500000]];
  C.forEach(([id, name, planned], i) => out.push(ins("budget_categories", { id, wedding_id: "w_demo", name, planned_cents: planned, sort: i })));
  const I = [
    ["b1", "c_local", "Villa Aurora (diária)", "Villa Aurora (fictício)", 2100000, 1050000, "2027-03-10", null],
    ["b2", "c_buffet", "Buffet completo", "Sabor & Cia (fictício)", 3330000, 999000, "2027-02-05", 18500],
    ["b3", "c_buffet", "Bar e bebidas", "Bar do Lago (fictício)", 810000, 0, "2027-06-20", 4500],
    ["b4", "c_foto", "Fotografia + filme", "Luz Estúdio (fictício)", 1250000, 625000, "2027-08-01", null],
    ["b5", "c_decor", "Flores e cenografia", "Ateliê Jardim (fictício)", 1480000, 300000, "2027-04-15", null],
    ["b6", "c_musica", "Banda + DJ", "Noite Clara (fictício)", 880000, 880000, null, null],
    ["b7", "c_papel", "Identidade, convites e site", "Estúdio de papelaria (fictício)", 420000, 420000, null, null],
  ];
  I.forEach(([id, category_id, description, vendor, amount_cents, paid_cents, due_date, per_guest_cents]) =>
    out.push(ins("budget_items", { id, wedding_id: "w_demo", category_id, description, vendor, amount_cents, paid_cents, due_date, per_guest_cents })));

  out.push(ins("users", { id: "u_demo", email: DEMO.login.email, name: "Helena (demonstração)", pass_hash: pw1.hash, pass_salt: pw1.salt }));
  out.push(ins("memberships", { user_id: "u_demo", wedding_id: "w_demo", role: "owner" }));

  /* ---------- outros universos (para mostrar Timeless e Dreamscape e testar isolamento) ---------- */
  const others = [
    { id: "w_lia", slug: "lia-e-tomas", names: "Lia & Tomás", universe: "dreamscape", date_iso: "2027-12-04T17:00:00-03:00", city: "Trancoso · Bahia", hero: "1465495976277-4387d4b0b4c6",
      welcome: "Pé na areia, céu laranja e as pessoas que a gente ama. Vem com a gente para o fim do mundo." },
    { id: "w_clara", slug: "clara-e-davi", names: "Clara & Davi", universe: "timeless", date_iso: "2028-04-22T11:00:00-03:00", city: "Ouro Preto · Minas Gerais", hero: "1583939003579-730e3918a45a",
      welcome: "Uma cerimônia pela manhã, um almoço longo e muitas histórias para contar." },
  ];
  for (const o of others) {
    out.push(ins("weddings", { id: o.id, slug: o.slug, names: o.names, date_iso: o.date_iso, city: o.city, universe: o.universe, hero_image: U(o.hero, 2000),
      welcome: o.welcome, rsvp_deadline: o.date_iso.slice(0, 10), is_demo: 1, story_json: "[]", gifts_json: "[]", faq_json: "[]" }));
    out.push(ins("events", { id: "e_" + o.id, wedding_id: o.id, name: "Cerimônia e festa", starts_at: o.date_iso, venue: o.city.split(" · ")[0], address: "", dress_code: "", notes: "", is_public: 1, sort: 0 }));
    out.push(ins("households", { id: "h_" + o.id, wedding_id: o.id, name: "Convidado de outro casal", greeting: "", message: "", max_guests: 1 }));
    out.push(ins("guests", { id: "g_" + o.id, wedding_id: o.id, household_id: "h_" + o.id, name: "Pessoa de outro casamento", is_child: 0, sort: 0 }));
  }
  out.push(ins("users", { id: "u_lia", email: DEMO.other.email, name: "Lia (demonstração)", pass_hash: pw2.hash, pass_salt: pw2.salt }));
  out.push(ins("memberships", { user_id: "u_lia", wedding_id: "w_lia", role: "owner" }));
  out.push(...await petalucas());
  return out.join("\n") + "\n";
}

/* ---------- Pétala & Lucas: casal real, identidade própria (prévia do Gueta Studio) ----------
   Textos, horários e regras copiados do site atual do casal. A família convidada abaixo é um EXEMPLO. */
const PL_DATA = {"quiz": [{"q": "Como foi o primeiro contato entre os dois?", "options": ["Num show do Djavan", "Uma mensagem no Instagram", "Na mudança da Pétala", "Num samba em Curitiba"], "answer": 1, "fact": "Em 2017, o Lucas mandou uma mensagem despretensiosa para a Pétala no Instagram."}, {"q": "Sobre qual música do Djavan o Lucas perguntou?", "options": ["Oceano", "Flor de Lis", "Pétala", "Se..."], "answer": 2, "fact": "Ele perguntou se ela sabia que “Pétala” era a música mais bonita do Djavan, sem saber que o nome dela tinha vindo justamente dessa música."}, {"q": "Que filme a Pétala chamou o Lucas para assistir?", "options": ["Diário de uma Paixão", "O Diabo Veste Prada", "La La Land", "Mamma Mia!"], "answer": 1, "fact": "O Diabo Veste Prada. Detalhe: ela não tinha o filme em casa."}, {"q": "Como o Lucas entrou na mudança da Pétala, em 2019?", "options": ["Como arquiteto", "Carregando caixas", "Como vizinho", "Como corretor"], "answer": 0, "fact": "Ele ofereceu seus serviços como arquiteto. Desde então, não se desgrudaram."}, {"q": "Em que ano eles se casaram no cartório?", "options": ["2019", "2021", "2022", "2027"], "answer": 2, "fact": "Em 2022. E 2027 é o ano de comemorar com quem eles mais amam."}], "gifts": [{"title": "Uma rodada de pizza", "cents": 15000, "icon": "pizza", "note": "Fatia quente, conversa boa."}, {"title": "Drinks no pôr do sol", "cents": 12000, "icon": "glass", "note": "Um brinde ao amor."}, {"title": "A caixinha de docinhos", "cents": 9000, "icon": "sweet", "note": "A tradição que ninguém pula."}, {"title": "O lanche da madrugada", "cents": 10000, "icon": "snack", "note": "Combustível pra dançar até o fim."}, {"title": "Uma noite de samba", "cents": 20000, "icon": "music", "note": "Para a roda não parar."}, {"title": "Ajuda na lua de mel", "cents": 30000, "icon": "heart", "note": "Para a próxima viagem dos dois."}, {"title": "Do seu jeito", "cents": 0, "icon": "heart", "note": "Qualquer valor, com todo carinho."}]};
export const PETALUCAS = { token: "exemplo-petala-e-lucas-2027" }; // o acesso ao painel do casal é criado à parte, nunca com senha no repositório
async function petalucas() {
  const o = [], W = "w_petalucas", T = "/assets/themes/petalucas/";
  o.push(ins("weddings", {
    id: W, slug: "petala-e-lucas", names: "Pétala & Lucas", date_iso: "2027-02-20T16:00:00-03:00", city: "Piraquara · PR", universe: "timeless", theme: "petalucas",
    venue_name: "Estância Dom Raul", hero_image: "", rsvp_deadline: "2027-01-20", is_demo: 0, pix_key: "lucas.medeiros97@gmail.com", map_image: T + "mapa.png",
    welcome: "Casados no cartório desde 2022, decidimos que 2027 seria o ano de comemorar com as pessoas que a gente mais ama.",
    rsvp_note: "Este é um convite individual e intransferível. A festa não comportará crianças. Apenas entrará com nome na lista, ok?",
    story_json: JSON.stringify([
      { year: "2017", title: "A música mais bonita do Djavan", text: "Um dia de verão, Lucas mandou uma mensagem despretensiosa para Pétala no Instagram, perguntando se ela sabia que Pétala era a música mais bonita do Djavan, mesmo sem saber que o nome tinha vindo exatamente dessa música." },
      { year: "2019", title: "O Diabo Veste Prada", text: "O casal só foi se encontrar quando Pétala estava se mudando e o Lucas ofereceu seus serviços como arquiteto. Pétala chamou ele para assistir O Diabo Veste Prada, mas ela não tinha o filme em casa. Desde então eles não se desgrudaram." },
      { year: "2027", title: "A festa", text: "Casados no cartório desde 2022, decidiram que 2027 seria o ano de comemorar essa união com pessoas que são muito amadas por esse casal. Pétala e Lucas te esperam para esse dia tão especial!" },
    ]),
    schedule_json: JSON.stringify([
      { time: "16h", title: "Cerimônia", text: "O “sim” mais esperado da galera.", icon: "rings" },
      { time: "17h", title: "Samba & soft drinks", text: "Recepção no ritmo para abrir a festa.", icon: "music" },
      { time: "18h", title: "Pizza", text: "Fatia quente, conversa boa.", icon: "pizza" },
      { time: "19h", title: "Drinks", text: "Brinde ao amor e ao pôr do sol.", icon: "glass" },
      { time: "22h", title: "Docinhos", text: "A tradição que ninguém pula.", icon: "sweet" },
      { time: "00h", title: "Lanche da madrugada", text: "Combustível pra dançar até o fim.", icon: "snack" },
      { time: "01h45", title: "Fim da festa", text: "Mas o samba continua na memória.", icon: "moon" },
    ]),
    dress_json: JSON.stringify([
      { title: "Esporte fino", text: "Elegante, mas sem gravata obrigatória. Vestido leve, camisa social, terno opcional.", icon: "shirt" },
      { title: "Pés no chão", text: "Pedimos a gentileza de não usar tênis. O salão tem área externa gramada: saltos finos podem sofrer, e não serão fornecidas sandálias para dança.", icon: "shoe" },
      { title: "Cores livres", text: "Evitem apenas o branco, reservado para a noiva. As madrinhas estarão de verde-oliva, mas não há restrição para essa cor.", icon: "palette" },
    ]),
    gifts_json: JSON.stringify(PL_DATA.gifts),
    quiz_json: JSON.stringify(PL_DATA.quiz),
    gift_url: "",
    faq_json: JSON.stringify([
      { q: "Posso levar acompanhante?", a: "O convite é individual e intransferível: vale para as pessoas com nome no seu convite." },
      { q: "Crianças podem ir?", a: "A festa não comportará crianças." },
      { q: "E se eu me atrasar?", a: "Atrasos após o início da cerimônia terão que aguardar até a festa para entrar." },
      { q: "Como chego lá?", a: "Rua Eduardo Luiz Piana, 351, Piraquara (PR). Tem o mapa desenhado à mão e o botão para abrir a rota no Google Maps." },
    ]),
  }));
  o.push(ins("events", { id: "e_pl", wedding_id: W, name: "Cerimônia e festa", starts_at: "2027-02-20T16:00:00-03:00", venue: "Estância Dom Raul", address: "Rua Eduardo Luiz Piana, 351 - Piraquara, PR", dress_code: "Esporte fino", notes: "Atrasos após o início da cerimônia terão que aguardar até a festa para entrar.", is_public: 1, sort: 0 }));
  o.push(ins("households", { id: "h_pl_ex", wedding_id: W, name: "Exemplo · Marina e João", greeting: "Marina e João", message: "Vocês fazem parte dessa história. Contamos com vocês na pista!", max_guests: 2, token_hash: await sha256(PETALUCAS.token), token_at: "2026-11-19 12:00:00" }));
  [["Marina (exemplo)", 0], ["João (exemplo)", 1]].forEach(([n, i]) => o.push(ins("guests", { id: "g_pl_" + i, wedding_id: W, household_id: "h_pl_ex", name: n, is_child: 0, sort: i })));
  o.push(ins("invitations", { household_id: "h_pl_ex", event_id: "e_pl" }));
  o.push(ins("guestbook", { id: "m_pl_1", wedding_id: W, author: "Recado de exemplo", message: "Que venha a pista, o samba e a pizza! Amamos vocês.", status: "approved" }));
  return o;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(await seedSql());
