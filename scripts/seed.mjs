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
    universe: "editorial", hero_image: U("1519741497674-611481863552", 2000), rsvp_deadline: "2027-09-15", is_demo: 1, pix_key: "helena.rafael@exemplo.com", pix_name: "Helena e Rafael", pix_city: "Sao Paulo",
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
  out.push(...await experienciasDemo()); // módulo experiências (só w_demo)
  out.push(...organizacaoDemo());

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

/* ---------- experiências de Helena & Rafael (fictício): concierge, padrinhos, segredos, surpresa, quest, lugares ---------- */
export const DEMO_EXP = {
  padrinhos: { marina: "demo-padrinho-marina-2027", joao: "demo-padrinho-joao-2027" },
  colaborador: "demo-surpresa-colaborador-2027",
};
async function experienciasDemo() {
  const o = [], W = "w_demo";
  o.push(ins("exp_settings", { wedding_id: W, flags_json: JSON.stringify({ concierge: true, documentario: true, quest: true }),
    padrinhos_json: JSON.stringify({
      instructions: "Cheguem às 15h30 na Villa Aurora para as fotos com os noivos. Os padrinhos entram em pares, logo depois das daminhas. Celular no silencioso durante a cerimônia, por favor.",
      dress: "Madrinhas de vestido longo em tons de terracota (qualquer modelo). Padrinhos de terno azul-marinho, gravata da cor que quiserem.",
      schedule: [{ time: "15h30", text: "Fotos com os noivos no jardim" }, { time: "16h10", text: "Fila de entrada, em pares" }, { time: "16h30", text: "Cerimônia" }, { time: "18h30", text: "Entrada na festa e brinde dos padrinhos" }],
      contacts: [{ label: "Cerimonial (fictício)", value: "(41) 90000-0000" }, { label: "Helena", value: "helena@exemplo.com" }],
    }), soundtrack_json: "{}", jornal_json: "{}" }));
  [["ca_van", "transporte", "Vai ter transporte?", "Sim! Uma van sai do Batel às 15h45 e volta à meia-noite e às 2h. É só avisar no recado do convite que vai usar."],
   ["ca_veg", "comida", "Tem opção vegetariana?", "Tem: o buffet terá prato principal vegetariano e opção vegana. Avise restrições no formulário do convite."]]
    .forEach(([id, topic, question, answer], i) => o.push(ins("concierge_answers", { id, wedding_id: W, topic, question, answer, keywords: "", sort: i })));
  o.push(ins("padrinhos", { id: "pd_marina", wedding_id: W, name: "Marina Costa", role: "madrinha", token_hash: await sha256(DEMO_EXP.padrinhos.marina), token_at: "2026-11-15 10:00:00" }));
  o.push(ins("padrinhos", { id: "pd_joao", wedding_id: W, name: "João Lima", role: "padrinho", token_hash: await sha256(DEMO_EXP.padrinhos.joao), token_at: "2026-11-15 10:00:00" }));
  o.push(ins("padrinho_tasks", { id: "pt_alianca", wedding_id: W, padrinho_id: "pd_joao", title: "Guardar as alianças até a cerimônia", notes: "Elas chegam na sexta, no jantar.", due_date: "2027-10-16" }));
  o.push(ins("padrinho_tasks", { id: "pt_brinde", wedding_id: W, padrinho_id: null, title: "Ensaiar o brinde dos padrinhos (2 minutos)", notes: "", due_date: "2027-10-10" }));
  o.push(ins("padrinho_wall", { id: "pw_1", wedding_id: W, padrinho_id: "pd_marina", message: "Gente, vamos combinar o ensaio do brinde no sábado anterior?" }));
  o.push(ins("secret_messages", { id: "sg_andrade", wedding_id: W, household_id: "h_andrade", title: "Para a Sofia e o Theo",
    body: "Vocês dois vão levar as alianças até o altar. A gente escolheu vocês porque sempre foram os primeiros a correr para nos abraçar. Obrigado por isso.", show_from: null }));
  o.push(ins("surprises", { id: "sp_video", wedding_id: W, kind: "video", title: "Vídeo das amigas da faculdade", description: "Cada uma grava 20 segundos contando uma lembrança com a Helena. A Marina junta tudo.",
    honoree_type: "casal", honoree_ref: null, honoree_label: "Helena & Rafael", reveal_at: "2027-10-16", organizer_padrinho_id: "pd_marina", created_by: "padrinho:pd_marina" }));
  o.push(ins("surprise_members", { id: "sm_marina", wedding_id: W, surprise_id: "sp_video", name: "Marina Costa", padrinho_id: "pd_marina" }));
  o.push(ins("surprise_members", { id: "sm_bia", wedding_id: W, surprise_id: "sp_video", name: "Bia (colaboradora)", token_hash: await sha256(DEMO_EXP.colaborador) }));
  o.push(ins("surprise_posts", { id: "sq_1", wedding_id: W, surprise_id: "sp_video", member_id: "sm_marina", author: "Marina Costa", message: "Mandem os vídeos até o fim de setembro, na horizontal!", link: "" }));
  [["qc_inf", "infancia", "Alguém de longa data", "Encontre alguém que conhece o casal desde a infância e peça uma história dessa época."],
   ["qc_brinde", "brinde", "Brinde novo", "Faça um brinde com alguém que você acabou de conhecer."],
   ["qc_pista", "pista", "Pé na pista", "Dance uma música inteira, do começo ao fim."],
   ["qc_recado", "recado", "Deixe um carinho", "Escreva um recado para os noivos no mural do site."]]
    .forEach(([id, kind, title, text], i) => o.push(ins("quest_challenges", { id, wedding_id: W, kind, title, text, sort: i })));
  [["lp_livraria", "A livraria da primeira conversa", "2019", "Onde os dois disputaram o último exemplar do mesmo livro.", "Rua Augusta, São Paulo"],
   ["lp_curitiba", "O primeiro apartamento", "2021", "A mudança para Curitiba, com o Café dormindo em cima das caixas.", "Batel, Curitiba"],
   ["lp_pedido", "O café do pedido", "2026", "O mesmo café da primeira conversa. Ela disse sim antes de ele terminar a frase.", "Largo da Ordem, Curitiba"]]
    .forEach(([id, name, year, text, address], i) => o.push(ins("memory_places", { id, wedding_id: W, name, year, text, address, sort: i })));
  return o;
}

/* ---------- Pétala & Lucas: casal real, identidade própria (prévia do Gueta Studio) ----------
   Textos, horários e regras copiados do site atual do casal. A família convidada abaixo é um EXEMPLO. */
const PL_DATA = {"quiz": [{"q": "Como foi o primeiro contato entre os dois?", "options": ["Num show do Djavan", "Uma mensagem no Instagram", "Na mudança da Pétala", "Num samba em Curitiba"], "answer": 1, "fact": "Em 2017, o Lucas mandou uma mensagem despretensiosa para a Pétala no Instagram."}, {"q": "Sobre qual música do Djavan o Lucas perguntou?", "options": ["Oceano", "Flor de Lis", "Pétala", "Se..."], "answer": 2, "fact": "Ele perguntou se ela sabia que “Pétala” era a música mais bonita do Djavan, sem saber que o nome dela tinha vindo justamente dessa música."}, {"q": "Que filme a Pétala chamou o Lucas para assistir?", "options": ["Diário de uma Paixão", "O Diabo Veste Prada", "La La Land", "Mamma Mia!"], "answer": 1, "fact": "O Diabo Veste Prada. Detalhe: ela não tinha o filme em casa."}, {"q": "Como o Lucas entrou na mudança da Pétala, em 2019?", "options": ["Como arquiteto", "Carregando caixas", "Como vizinho", "Como corretor"], "answer": 1, "fact": "Carregando caixas! Desde então, não se desgrudaram."}, {"q": "Em que ano eles se casaram no cartório?", "options": ["2019", "2021", "2022", "2027"], "answer": 2, "fact": "Em 2022. E 2027 é o ano de comemorar com quem eles mais amam."}, {"q": "Qual é o drink da noiva?", "options": ["Caipirinha de limão sem açúcar", "Gin tônica", "Aperol spritz", "Vinho tinto"], "answer": 0, "fact": "Tanto que tem um presente na lista: 10 caipirinhas de limão sem açúcar para a noiva!"}, {"q": "Onde vai ser a festa?", "options": ["Estância Dom Raul, em Piraquara", "Um salão em Curitiba", "Uma praia em Santa Catarina", "Um sítio em Campo Largo"], "answer": 0, "fact": "Dia 20 de fevereiro de 2027, na Estância Dom Raul."}, {"q": "Qual o bicho favorito do Lucas?", "options": ["Coffee", "Pólen", "Felipe", "Miguel"], "answer": 0, "fact": "O Coffee! Tem até presente para ele na lista: “Gosto mais do Coffee”."}, {"q": "Qual o perfume que o Lucas vai usar no casamento?", "options": ["Jequiti Cebolinha", "Grand Soir", "Malbecão da Massa", "Naxos"], "answer": 1, "fact": "Grand Soir."}, {"q": "Qual a viagem favorita do casal?", "options": ["Lençóis Maranhenses", "Afropunk Salvador", "Carnaval Rio de Janeiro", "Interior do Maranhão"], "answer": 3, "fact": "O interior do Maranhão."}, {"q": "Qual a fruta favorita da Pétala?", "options": ["Limão", "Jambo", "Maracujá", "Cupuaçu"], "answer": 1, "fact": "Jambo!"}, {"q": "Qual a série favorita do casal?", "options": ["Magnatas do Crime", "As Quatro Estações", "Machos Alpha", "Attack on Titan"], "answer": 0, "fact": "Magnatas do Crime."}, {"q": "Qual o lugar favorito do casal em Curitiba?", "options": ["Il Barbuto", "Na Feira Bar", "Casa Alaafia", "Sociedade Treze de Maio"], "answer": 3, "fact": "A Sociedade Treze de Maio."}, {"q": "Qual o carro dos sonhos da Pétala?", "options": ["BYD Seal", "Honda Civic Type R", "Ferrari Testarossa", "Kombi do Scooby-Doo"], "answer": 1, "fact": "Um Honda Civic Type R."}, {"q": "Qual o anime favorito do Lucas?", "options": ["Naruto Shippuden", "Attack on Titan", "Jujutsu Kaisen", "Demon Slayer"], "answer": 1, "fact": "Attack on Titan."}, {"q": "Quantas plantas a Pétala tem?", "options": ["108", "46", "97", "85"], "answer": 1, "fact": "46 plantas!"}, {"q": "Quantos perfumes o Lucas tem?", "options": ["55", "42", "38", "61"], "answer": 0, "fact": "55 perfumes!"}, {"q": "Qual o pet mais velho do casal?", "options": ["Coffee", "Miguel", "Antônio", "Pólen"], "answer": 3, "fact": "O Pólen."}], "gifts": [{"title": "10 caipirinhas de limão sem açúcar para a noiva!", "cents": 25178, "icon": "glass", "note": "", "image": "/assets/themes/petalucas/presentes/10-caipirinhas-de-limao-sem-acucar-para-a-noiva.jpg"}, {"title": "Ajuda na próxima reforma do Lucas", "cents": 27769, "icon": "home", "note": "", "image": "/assets/themes/petalucas/presentes/ajuda-na-proxima-reforma-do-lucas.jpg"}, {"title": "Cachorros: 3 por 1", "cents": 24980, "icon": "snack", "note": "", "image": "/assets/themes/petalucas/presentes/cachorros-3-por-1.jpg"}, {"title": "Contribuição para o dia da noiva", "cents": 50025, "icon": "shirt", "note": "", "image": "/assets/themes/petalucas/presentes/contribuicao-para-o-dia-da-noiva.jpg"}, {"title": "Cota para perguntar quando vamos ter filhos", "cents": 137872, "icon": "heart", "note": "", "image": "/assets/themes/petalucas/presentes/cota-para-perguntar-quando-vamos-ter-filhos.jpg"}, {"title": "É de coração", "cents": 70761, "icon": "heart", "note": "", "image": "/assets/themes/petalucas/presentes/e-de-coracao.jpg"}, {"title": "Garrafa de tequila pro noivo", "cents": 12484, "icon": "glass", "note": "", "image": "/assets/themes/petalucas/presentes/garrafa-de-tequila-pro-noivo.jpg"}, {"title": "Gosto mais do Coffee", "cents": 21849, "icon": "cat", "note": "", "image": "/assets/themes/petalucas/presentes/gosto-mais-do-coffee.jpg"}, {"title": "Ingresso pro próximo show do Djavan COM TAXA DO SITE", "cents": 38579, "icon": "ticket", "note": "", "image": "/assets/themes/petalucas/presentes/ingresso-pro-proximo-show-do-djavan-com-taxa-do.jpg"}, {"title": "Levar quem não foi convidado", "cents": 83244, "icon": "rings", "note": "", "image": "/assets/themes/petalucas/presentes/levar-quem-nao-foi-convidado.jpg"}, {"title": "Nosso condomínio é um absurdo", "cents": 62438, "icon": "home", "note": "", "image": "/assets/themes/petalucas/presentes/nosso-condominio-e-um-absurdo.jpg"}, {"title": "Passeio de barco ao por do sol", "cents": 17666, "icon": "boat", "note": "", "image": "/assets/themes/petalucas/presentes/passeio-de-barco-ao-por-do-sol.jpg"}, {"title": "Permissão para ir de branco", "cents": 1177514, "icon": "shirt", "note": "", "image": "/assets/themes/petalucas/presentes/permissao-para-ir-de-branco.jpg"}, {"title": "Por dó do Antônio", "cents": 17697, "icon": "cat", "note": "", "image": "/assets/themes/petalucas/presentes/por-do-do-antonio.jpg"}, {"title": "Pra noiva te apresentar uma amiga", "cents": 28102, "icon": "heart", "note": "", "image": "/assets/themes/petalucas/presentes/pra-noiva-te-apresentar-uma-amiga.jpg"}, {"title": "Só pra não dizer que eu não dei nada...", "cents": 7282, "icon": "gift", "note": "", "image": "/assets/themes/petalucas/presentes/so-pra-nao-dizer-que-eu-nao-dei-nada.jpg"}, {"title": "Sou fã do Pólen", "cents": 17697, "icon": "cat", "note": "", "image": "/assets/themes/petalucas/presentes/sou-fa-do-polen.jpg"}, {"title": "Uma lembrancinha", "cents": 7272, "icon": "gift", "note": "", "image": "/assets/themes/petalucas/presentes/uma-lembrancinha.jpg"}, {"title": "Um mês de remédio de cabeça da noiva (valor real)", "cents": 72842, "icon": "heart", "note": "", "image": "/assets/themes/petalucas/presentes/um-mes-de-remedio-de-cabeca-da-noiva-valor-real.jpg"}, {"title": "Você é rico", "cents": 133207, "icon": "gift", "note": "", "image": "/assets/themes/petalucas/presentes/voce-e-rico.jpg"}]};
export const PETALUCAS = { token: "exemplo-petala-e-lucas-2027" }; // o acesso ao painel do casal é criado à parte, nunca com senha no repositório
async function petalucas() {
  const o = [], W = "w_petalucas", T = "/assets/themes/petalucas/";
  o.push(ins("weddings", {
    id: W, slug: "petala-e-lucas", names: "Pétala & Lucas", date_iso: "2027-02-20T16:00:00-03:00", city: "Piraquara · PR", universe: "timeless", theme: "petalucas",
    venue_name: "Estância Dom Raul", hero_image: "", rsvp_deadline: "2027-01-20", is_demo: 0, guestbook: 0, quiz_premio: "Quem ficar em 1º lugar no ranking ganha um cartão fura-fila para o bar da festa!", pix_key: "lucas.medeiros97@gmail.com", pix_name: "Petala e Lucas", pix_city: "Piraquara", map_image: T + "mapa.png", og_image: T + "og.jpg",
    welcome: "Casados no cartório desde 2022, decidimos que 2027 seria o ano de comemorar com as pessoas que a gente mais ama.",
    rsvp_note: "Este é um convite individual e intransferível. A festa não comportará crianças. Apenas entrará com nome na lista, ok?",
    story_json: JSON.stringify([
      { year: "2017", title: "A música mais bonita do Djavan", text: "Um dia de verão, Lucas mandou uma mensagem despretensiosa para Pétala no Instagram, perguntando se ela sabia que Pétala era a música mais bonita do Djavan, mesmo sem saber que o nome tinha vindo exatamente dessa música.", image: T + "historia/2017.jpg", alt: "Pétala e Lucas abraçados numa piscina, tirando uma selfie" },
      { year: "2019", title: "O Diabo Veste Prada", text: "O casal só foi se encontrar quando Pétala estava se mudando e o Lucas apareceu para ajudar carregando caixas. Pétala chamou ele para assistir O Diabo Veste Prada, mas ela não tinha o filme em casa. Desde então eles não se desgrudaram.", image: T + "historia/2019.jpg", alt: "Pétala e Lucas abraçados, numa selfie no espelho" },
      { year: "2026", title: "O pedido", text: "13 de junho de 2026.", video: T + "historia/pedido.mp4", poster: T + "historia/pedido.jpg", alt: "Vídeo do pedido de casamento de Lucas e Pétala" },
      { year: "2027", title: "A festa", text: "Casados no cartório desde 2022, decidiram que 2027 seria o ano de comemorar essa união com pessoas que são muito amadas por esse casal. Pétala e Lucas te esperam para esse dia tão especial!", image: T + "historia/2027.jpg", alt: "Pétala sorrindo e mostrando a aliança, com Lucas à mesa ao fundo" },
    ]),
    schedule_json: JSON.stringify([
      { time: "16h", title: "Cerimônia", text: "O “sim” mais esperado da galera.", icon: "rings" },
      { time: "17h", title: "Samba & soft drinks", text: "Recepção no ritmo para abrir a festa.", icon: "music" },
      { time: "17h45", title: "Sorvete", text: "Uma pausa geladinha pra refrescar a tarde.", icon: "icecream" },
      { time: "18h", title: "Pizza", text: "Fatia quente, conversa boa.", icon: "pizza" },
      { time: "19h", title: "Drinks", text: "Brinde ao amor e ao pôr do sol.", icon: "glass" },
      { time: "21h30", title: "Café", text: "Um cafezinho pra recarregar a energia.", icon: "coffee" },
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
  // fotos da festa direto na pasta do Drive do casal (o mesmo da migração 0079)
  o.push(ins("van_settings", { wedding_id: W, on_: 1, exige_celular: 1, texto: "Estamos organizando uma van para o casamento. Se você tem interesse em ir de van, deixe seu nome e WhatsApp que a gente te coloca no grupo com os detalhes." }));
  o.push(ins("media_settings", { wedding_id: W, uploads_on: 1, drive_pasta_url: "https://drive.google.com/drive/folders/1sFBIoYDgo728artjSkZcTZp9hmtP3EJK" }));
  return o;
}

/* ---------- organização do casal de DEMONSTRAÇÃO (w_demo): fornecedores, propostas, tarefas, compromissos e parcelas ----------
   Tudo fictício (nomes com "(fictício)", contatos e links em exemplo.com). Datas relativas ao dia em que o seed é gerado,
   para a demonstração sempre ter algo "para esta semana", um pagamento atrasado e dois compromissos no mesmo horário. */
function organizacaoDemo() {
  const W = "w_demo", o = [];
  const rel = d => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + d * 864e5));
  const V = [
    { id: "v_villa", name: "Villa Aurora (fictício)", category: "Local", contact_name: "Renata", phone: "(41) 90000-0101", whatsapp: 1, email: "eventos@exemplo.com", site: "https://exemplo.com/villa-aurora", status: "contratado", owner: "Rafael", doc_url: "https://exemplo.com/contratos/villa-aurora.pdf", budget_item_id: "b1",
      notes: "Montagem liberada a partir das 9h do dia. Gerador incluso.", dates: [{ label: "Visita técnica", date: rel(20) }], checklist: [{ text: "Enviar planta para a decoração", done: true }, { text: "Confirmar horário de som", done: false }] },
    { id: "v_sabor", name: "Sabor & Cia (fictício)", category: "Buffet", contact_name: "Marcos", phone: "(41) 90000-0102", whatsapp: 1, email: "orcamentos@exemplo.com", site: "@saborecia.exemplo", status: "contratado", owner: "Helena", doc_url: "https://exemplo.com/contratos/sabor-e-cia.pdf", budget_item_id: "b2",
      notes: "Cardápio por pessoa. Pedir opção vegana no fechamento.", dates: [{ label: "Degustação", date: rel(4) }], checklist: [{ text: "Enviar restrições alimentares", done: false }, { text: "Fechar número final", done: false }] },
    { id: "v_mesa", name: "Mesa Posta Buffet (fictício)", category: "Buffet", contact_name: "Júlia", phone: "(41) 90000-0103", email: "contato@exemplo.com", status: "proposta_recebida", owner: "Helena", notes: "Atendimento ótimo, mas valor acima do planejado." },
    { id: "v_serra", name: "Cozinha da Serra (fictício)", category: "Buffet", contact_name: "André", phone: "(41) 90000-0104", status: "descartado", owner: "Rafael", notes: "Não atende a data." },
    { id: "v_luz", name: "Luz Estúdio (fictício)", category: "Foto e vídeo", contact_name: "Bruno", phone: "(41) 90000-0105", whatsapp: 1, site: "https://exemplo.com/luz-estudio", status: "contratado", owner: "Rafael", budget_item_id: "b4", notes: "Contrato assinado no papel: falta guardar o link aqui." },
    { id: "v_jardim", name: "Ateliê Jardim (fictício)", category: "Decoração e flores", contact_name: "Lívia", phone: "(41) 90000-0106", email: "atelie@exemplo.com", status: "contratado", owner: "Helena", doc_url: "https://exemplo.com/contratos/atelie-jardim.pdf", budget_item_id: "b5" },
    { id: "v_doce", name: "Doce Encanto (fictício)", category: "Doces e bolo", contact_name: "Carol", phone: "(41) 90000-0107", whatsapp: 1, status: "orcamento_pedido", owner: "Mãe da Helena" },
    { id: "v_bela", name: "Studio Bela (fictício)", category: "Beleza", phone: "(41) 90000-0108", status: "pesquisando", owner: "Helena" },
  ];
  for (const v of V) o.push(ins("vendors", { id: v.id, wedding_id: W, name: v.name, category: v.category, contact_name: v.contact_name || "", phone: v.phone || "", whatsapp: v.whatsapp || 0, email: v.email || "",
    site: v.site?.startsWith("@") ? "https://instagram.com/" + v.site.slice(1) : v.site || "", status: v.status, owner: v.owner || "", notes: v.notes || "", doc_url: v.doc_url || "",
    dates_json: JSON.stringify(v.dates || []), checklist_json: JSON.stringify(v.checklist || []), budget_item_id: v.budget_item_id || null }));
  const Q = [
    ["q_sabor", "v_sabor", "Menu completo, 120 pessoas", 3330000, "Inclui louça, garçons e bolo de corte.", rel(-40), 1],
    ["q_mesa", "v_mesa", "Menu completo, 120 pessoas", 3580000, "Inclui bar de caipirinhas.", rel(-35), 0],
    ["q_serra", "v_serra", "Menu sem bebidas, 120 pessoas", 2990000, "Bebidas e louça à parte.", rel(-38), 0],
    ["q_luz", "v_luz", "Foto + filme (10 horas)", 1250000, "Álbum 30x30 incluso.", rel(-60), 1],
  ];
  Q.forEach(([id, vendor_id, title, amount_cents, notes, received_at, chosen]) => o.push(ins("vendor_quotes", { id, wedding_id: W, vendor_id, title, amount_cents, notes, received_at, chosen })));
  const T = [
    ["Reservar o local", "Rafael", rel(-200), "done", "v_villa"],
    ["Contratar fotografia e vídeo", "Rafael", rel(-60), "done", "v_luz"],
    ["Enviar o save the date", "Helena", rel(-5), "todo", null],
    ["Escolher o cardápio para a degustação", "Rafael", rel(3), "doing", "v_sabor"],
    ["Pedir orçamento de doces e bolo", "Mãe da Helena", rel(5), "todo", "v_doce"],
    ["Guardar o contrato da fotografia no painel", "", rel(6), "todo", "v_luz"],
    ["Montar a playlist da cerimônia", "", rel(40), "todo", null],
    ["Encomendar convites e papelaria", "Helena", rel(70), "todo", null],
    ["Comprar as alianças", "Rafael", rel(150), "todo", null],
    ["Agendar teste de cabelo e maquiagem", "Helena", rel(200), "todo", "v_bela"],
  ];
  T.forEach(([title, owner, due_date, status, vendor_id], i) => o.push(ins("tasks", { id: "t_demo_" + i, wedding_id: W, title, owner, due_date, status, done_at: status === "done" ? due_date : null, vendor_id })));
  const A = [
    ["a_degust", "Degustação do buffet", "degustacao", rel(4) + "T19:00", 90, "Sabor & Cia (fictício), Batel", "v_sabor"],
    ["a_prova", "Primeira prova do vestido", "prova", rel(9) + "T10:00", 60, "Ateliê de noivas (fictício)", null],
    ["a_flores", "Reunião sobre flores e cenografia", "reuniao", rel(9) + "T10:30", 60, "Ateliê Jardim (fictício)", "v_jardim"],
    ["a_visita", "Visita técnica com o cerimonial", "visita", rel(20) + "T15:00", 120, "Villa Aurora (fictício)", "v_villa"],
  ];
  A.forEach(([id, title, kind, starts_at, duration_min, place, vendor_id]) => o.push(ins("appointments", { id, wedding_id: W, title, kind, starts_at, duration_min, place, vendor_id })));
  // parcelas: buffet (sinal pago + 3 parcelas) e foto (uma parcela já atrasada, para o radar de riscos)
  const P = [["b2", 999000, rel(-90), rel(-90)], ["b2", 777000, "2027-02-05", null], ["b2", 777000, "2027-05-05", null], ["b2", 777000, "2027-08-05", null],
    ["b4", 625000, rel(-60), rel(-60)], ["b4", 312500, rel(-6), null], ["b4", 312500, "2027-08-01", null]];
  const n = {};
  P.forEach(([item_id, amount_cents, due_date, paid_at], i) => { n[item_id] = (n[item_id] || 0) + 1; o.push(ins("budget_installments", { id: "p_demo_" + i, wedding_id: W, item_id, n: n[item_id], amount_cents, due_date, paid_at })); });
  o.push(`UPDATE budget_items SET due_date = ${q(rel(-6))} WHERE id = 'b4' AND wedding_id = 'w_demo';`);
  o.push(ins("budget_history", { wedding_id: W, item_id: "b2", item_label: "Buffet completo", actor: "user:u_demo", action: "installments", changes_json: JSON.stringify([{ field: "installments", from: 0, to: 4 }]), at: rel(-90) + " 14:20:00" }));
  o.push(ins("budget_history", { wedding_id: W, item_id: "b4", item_label: "Fotografia + filme", actor: "user:u_demo", action: "pay", changes_json: JSON.stringify([{ field: "installment", from: null, to: 1 }, { field: "paid_cents", from: 0, to: 625000 }]), at: rel(-60) + " 10:05:00" }));
  return o;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(await seedSql());
