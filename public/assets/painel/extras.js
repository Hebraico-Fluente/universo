/**
 * Aba "Experiências": um interruptor por item e a configuração de cada um
 * (concierge, padrinhos, mensagens secretas, surpresas, quest, passaporte, lugares, documentário, jornal).
 * API: /api/admin/exp/... (módulo experiencias). Sem estilos inline.
 */
import { $, $$, esc, api, longDate, time } from "../ui.js";
import { viewEl, fail, css, state } from "./core.js";

const A = "/api/admin/exp";
const SECS = [["concierge", "Concierge"], ["padrinhos", "Padrinhos"], ["mensagens", "Mensagens secretas"], ["surpresas", "Surpresas"], ["quest", "Quest"],
  ["passaporte", "Passaporte"], ["lugares", "Lugares"], ["documentario", "Documentário"], ["jornal", "Jornal"]];
let sec = "concierge", X = null;
const brDate = d => d ? new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "";
const canWrite = () => ["owner", "planner"].includes(state.me?.role);
const err = (el, e) => { if (el) el.textContent = e.message || String(e); };

export default async function extras() {
  css("/assets/painel/extras.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try { X = await api(A); draw(); } catch (e) { fail(e); }
}

function draw() {
  const on = X.items.filter(i => i.on).length;
  viewEl().innerHTML = `
    <header class="vh"><div><p class="label">Experiências</p><h1>Pequenos encantos, do jeito de vocês</h1></div>
      <p class="muted xp-lead">${on} de ${X.items.length} ligadas. Tudo é opcional: desliguem o que não combinar com o casamento.</p></header>
    <section class="xs-grid" aria-label="Interruptores">${X.items.map(i => `<article class="xs${i.on ? " on" : ""}${i.blocked ? " blocked" : ""}">
      <div class="xs-top"><h2>${esc(i.label)}</h2>
        <button class="xs-sw" type="button" role="switch" aria-checked="${i.on}" data-flag="${esc(i.key)}" ${i.blocked || !canWrite() ? "disabled" : ""} aria-label="${esc(i.label)}"><span></span></button></div>
      <p>${esc(i.text)}</p>
      <p class="xs-where">${esc(i.where)}${i.blocked ? " · não incluído no plano de vocês" : ""}</p>
      ${SECS.some(s => s[0] === i.key) ? `<button class="link small" type="button" data-go="${esc(i.key)}">Configurar</button>` : ""}
    </article>`).join("")}</section>
    <nav class="xs-tabs" aria-label="Configurar experiências">${SECS.map(([k, l]) => `<button type="button" data-sec="${k}" aria-pressed="${k === sec}">${esc(l)}</button>`).join("")}</nav>
    <section class="xs-body" id="xsBody" aria-live="polite"></section>`;
  $$("[data-flag]").forEach(b => b.addEventListener("click", async () => {
    const v = b.getAttribute("aria-checked") !== "true";
    b.setAttribute("aria-checked", String(v)); b.closest(".xs").classList.toggle("on", v);
    try { await api(A + "/settings", { method: "PATCH", body: { flags: { [b.dataset.flag]: v } } }); X = await api(A); draw(); }
    catch (e) { alert(e.message); X = await api(A); draw(); }
  }));
  $$("[data-sec]").forEach(b => b.addEventListener("click", () => { sec = b.dataset.sec; $$("[data-sec]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); body(); }));
  $$("[data-go]").forEach(b => b.addEventListener("click", () => { sec = b.dataset.go; $$("[data-sec]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.sec === sec))); body(); $("#xsBody").scrollIntoView({ behavior: "smooth", block: "start" }); }));
  body();
}

async function body() {
  const el = $("#xsBody");
  el.innerHTML = `<p class="muted">Carregando…</p>`;
  const item = X.items.find(i => i.key === sec);
  const offNote = item && !item.on ? `<p class="xs-off">Esta experiência está <b>desligada</b>: vocês podem preparar tudo aqui e ligar quando quiserem.</p>` : "";
  try { el.innerHTML = offNote + await VIEWS[sec](el); BIND[sec]?.(el); }
  catch (e) { el.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
const reload = () => body();
const sel = (name, opts, v) => `<select class="in" name="${name}">${opts.map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

/* ---------- upload pela mídia (se o módulo existir) ---------- */
async function upload(file, kind = "file") {
  const r = await fetch(`/api/admin/media?public=1&kind=${kind}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file, credentials: "same-origin" });
  if (r.status === 404) throw new Error("O envio de arquivos ainda não está disponível. Por enquanto, só texto.");
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Não foi possível enviar o arquivo.");
  return { id: d.id, url: String(d.url || "").replace(/^\/m\//, "/api/media/") };
}

const VIEWS = {
  async concierge() {
    const d = await api(A + "/concierge");
    const T = Object.fromEntries(d.topics);
    return `<div class="xs-cols">
      <div class="panel"><h2>Respostas de vocês</h2>
        <p class="muted small">O concierge usa a programação, o cronograma, o traje e as dúvidas do site, e também estas respostas. Ele nunca inventa: o que não estiver aqui vira “os noivos ainda não informaram”.</p>
        <ul class="xs-list">${d.answers.map(a => `<li><span class="tag no">${esc(T[a.topic] || a.topic)}</span><b>${esc(a.question || T[a.topic])}</b><p>${esc(a.answer)}</p>${canWrite() ? `<button class="link small danger" type="button" data-del="${esc(a.id)}">Apagar</button>` : ""}</li>`).join("") || `<li class="muted">Nenhuma resposta ainda. Comecem por estacionamento, transporte e hospedagem.</li>`}</ul>
        ${canWrite() ? `<form class="xs-form" id="ccF" novalidate><div class="grid2"><label class="field"><span>Assunto</span>${sel("topic", d.topics, "estacionamento")}</label>
          <label class="field"><span>Pergunta de exemplo</span><input class="in" name="question" maxlength="160" placeholder="Ex.: Tem estacionamento?"></label></div>
          <label class="field"><span>Resposta</span><textarea class="in" name="answer" rows="3" maxlength="1200" required placeholder="Ex.: Sim, gratuito, com manobristas."></textarea></label>
          <label class="field"><span>Outras palavras que levam a esta resposta (opcional)</span><input class="in" name="keywords" maxlength="200" placeholder="Ex.: valet, garagem"></label>
          <p class="error" role="alert"></p><button class="btn" type="submit">Adicionar resposta</button></form>` : ""}
      </div>
      <div class="panel"><h2>Testar como convidado</h2><p class="muted small">Veja o que o concierge do site responderia agora.</p>
        <form class="xs-inline" id="ccT"><input class="in" name="q" placeholder="Ex.: como chego lá?" aria-label="Pergunta de teste"><button class="btn ghost" type="submit">Testar</button></form>
        <div id="ccOut" class="xs-test"></div></div></div>`;
  },
  async padrinhos() {
    const d = await api(A + "/padrinhos");
    const R = Object.fromEntries(d.roles), info = d.info || {};
    const name = id => d.padrinhos.find(p => p.id === id)?.name || "";
    return `<div class="xs-cols">
      <div class="panel"><h2>Padrinhos e madrinhas</h2>
        <p class="muted small">Cada pessoa recebe um link próprio, privado. Dá para trocar ou revogar a qualquer momento. O mural é só deles: vocês veem apenas quantas mensagens há (${d.wall_count}).</p>
        <div id="pLink"></div>
        <ul class="xs-list">${d.padrinhos.map(p => `<li class="xs-row"><div><b>${esc(p.name)}</b><span class="muted small"> · ${esc(R[p.role] || p.role)}</span><br>
          ${p.revoked ? `<span class="tag off">link revogado</span>` : p.has_link ? `<span class="tag yes">link ativo</span>` : `<span class="tag pending">sem link</span>`}</div>
          ${canWrite() ? `<span class="acts"><button class="link small" type="button" data-plink="${esc(p.id)}">Gerar link novo</button>${p.has_link ? `<button class="link small" type="button" data-prev="${esc(p.id)}">Revogar</button>` : ""}<button class="link small danger" type="button" data-pdel="${esc(p.id)}">Apagar</button></span>` : ""}</li>`).join("") || `<li class="muted">Ninguém cadastrado ainda.</li>`}</ul>
        ${canWrite() ? `<form class="xs-inline" id="pF" novalidate><input class="in" name="name" maxlength="80" placeholder="Nome" aria-label="Nome do padrinho ou madrinha">${sel("role", d.roles, "madrinha")}<button class="btn" type="submit">Cadastrar</button></form><p class="error" id="pErr" role="alert"></p>` : ""}
        <h3 class="xs-h3">Tarefas dos padrinhos</h3>
        <ul class="xs-list">${d.tasks.map(t => `<li class="xs-row"><div><b>${esc(t.title)}</b><br><span class="muted small">${t.padrinho_id ? "Para " + esc(name(t.padrinho_id)) : "Para todos"}${t.due_date ? " · até " + brDate(t.due_date) : ""}</span>
          ${t.done_at ? ` <span class="tag yes">feita${t.done_by ? " por " + esc(t.done_by) : ""}</span>` : ""}</div>${canWrite() ? `<button class="link small danger" type="button" data-tdel="${esc(t.id)}">Apagar</button>` : ""}</li>`).join("") || `<li class="muted">Nenhuma tarefa.</li>`}</ul>
        ${canWrite() ? `<form class="xs-form" id="tF" novalidate><div class="grid2"><label class="field"><span>Tarefa</span><input class="in" name="title" maxlength="140" placeholder="Ex.: Guardar as alianças"></label>
          <label class="field"><span>Para</span>${sel("padrinho_id", [["", "Todos os padrinhos"], ...d.padrinhos.map(p => [p.id, p.name])], "")}</label>
          <label class="field"><span>Prazo (opcional)</span><input class="in" type="date" name="due_date"></label><label class="field"><span>Detalhes (opcional)</span><input class="in" name="notes" maxlength="600"></label></div>
          <p class="error" role="alert"></p><button class="btn ghost" type="submit">Atribuir tarefa</button></form>` : ""}
      </div>
      <form class="panel xs-form" id="iF" novalidate><h2>O que eles veem no portal</h2>
        <label class="field"><span>Instruções</span><textarea class="in" name="instructions" rows="4" maxlength="3000" placeholder="Horário de chegada, ordem de entrada, combinados…">${esc(info.instructions || "")}</textarea></label>
        <label class="field"><span>Roteiro do dia (um por linha: horário | o quê)</span><textarea class="in" name="schedule" rows="4" placeholder="15h30 | Fotos com os noivos">${esc((info.schedule || []).map(s => `${s.time} | ${s.text}`).join("\n"))}</textarea></label>
        <label class="field"><span>Traje dos padrinhos</span><textarea class="in" name="dress" rows="2" maxlength="1200">${esc(info.dress || "")}</textarea></label>
        <label class="field"><span>Contatos combinados (um por linha: nome | telefone ou e-mail)</span><textarea class="in" name="contacts" rows="3" placeholder="Cerimonial | (41) 90000-0000">${esc((info.contacts || []).map(c => `${c.label} | ${c.value}`).join("\n"))}</textarea></label>
        <p class="error" role="alert"></p>${canWrite() ? `<button class="btn" type="submit">Salvar</button>` : ""}</form></div>`;
  },
  async mensagens() {
    const d = await api(A + "/segredos");
    return `<div class="xs-cols">
      <div class="panel"><h2>Mensagens enviadas</h2><p class="muted small">Cada mensagem aparece só no convite da família escolhida, num envelope “Uma mensagem só para vocês”.</p>
        <ul class="xs-list">${d.messages.map(m => `<li><span class="muted small">Para</span> <b>${esc(m.household)}</b>${m.title ? ` · ${esc(m.title)}` : ""}
          <p>${esc(m.body)}</p><span class="muted small">${m.show_from && m.show_from > d.today ? "Aparece a partir de " + brDate(m.show_from) : "Já visível no convite"}${m.opened_at ? " · aberta" : " · ainda não aberta"}${m.media_url ? " · com " + (m.media_type === "video" ? "vídeo" : "foto") : ""}</span>
          ${canWrite() ? `<button class="link small danger" type="button" data-sdel="${esc(m.id)}">Apagar</button>` : ""}</li>`).join("") || `<li class="muted">Nenhuma mensagem ainda.</li>`}</ul></div>
      ${canWrite() ? `<form class="panel xs-form" id="sF" novalidate><h2>Nova mensagem secreta</h2>
        <label class="field"><span>Para quem</span>${sel("household_id", d.households.map(h => [h.id, h.name]), "")}</label>
        <label class="field"><span>Título (opcional)</span><input class="in" name="title" maxlength="100" placeholder="Ex.: Para a Sofia e o Theo"></label>
        <label class="field"><span>Mensagem</span><textarea class="in" name="body" rows="5" maxlength="3000" required></textarea></label>
        <div class="grid2"><label class="field"><span>Aparece a partir de (opcional)</span><input class="in" type="date" name="show_from"></label>
        <label class="field"><span>Foto ou vídeo (opcional)</span><input class="in" type="file" name="file" accept="image/*,video/*"></label></div>
        <p class="error" role="alert"></p><button class="btn" type="submit">Guardar mensagem</button></form>` : ""}</div>`;
  },
  async surpresas() {
    const d = await api(A + "/surpresas");
    const K = Object.fromEntries(d.kinds);
    return `<div class="panel xs-secret"><h2>Como funciona o sigilo</h2>
      <p>Padrinhos (pelo portal) e vocês podem organizar surpresas. Quem é homenageado não vê: se a surpresa for para vocês dois, ela não aparece aqui, nem no copiloto, nem na exportação, até a data de revelação. Por isso esta lista pode não mostrar tudo, e é de propósito.</p></div>
      <div class="xs-cols"><div class="panel"><h2>Surpresas que vocês podem ver</h2><div id="mLink"></div>
        <ul class="xs-list">${d.surprises.map(s => `<li><span class="tag no">${esc(K[s.kind])}</span> <b>${esc(s.title)}</b><span class="muted small"> · para ${esc(s.honoree_label)}${s.reveal_at ? " · revelação " + brDate(s.reveal_at) : ""}</span>
          ${s.description ? `<p>${esc(s.description)}</p>` : ""}<p class="small"><span class="muted">Participam:</span> ${s.members.map(m => esc(m.name)).join(", ") || "ninguém ainda"}</p>
          ${s.posts.length ? `<details><summary class="small">${s.posts.length} ${s.posts.length > 1 ? "mensagens" : "mensagem"}</summary><ul class="xs-posts">${s.posts.map(p => `<li><p>${esc(p.message)}</p>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener nofollow">${esc(p.link)}</a>` : ""}<span class="muted small">${esc(p.author)}</span></li>`).join("")}</ul></details>` : ""}
          ${canWrite() ? `<form class="xs-inline" data-mem="${esc(s.id)}"><input class="in" name="name" maxlength="80" placeholder="Nome de quem vai colaborar" aria-label="Nome do colaborador"><button class="btn ghost sm" type="submit">Gerar link</button></form>
            <button class="link small danger" type="button" data-spdel="${esc(s.id)}">Apagar</button>` : ""}</li>`).join("") || `<li class="muted">Nenhuma surpresa visível para vocês.</li>`}</ul></div>
      ${canWrite() ? `<form class="panel xs-form" id="spF" novalidate><h2>Organizar uma surpresa</h2>
        <div class="grid2"><label class="field"><span>Tipo</span>${sel("kind", d.kinds, "homenagem")}</label><label class="field"><span>Nome</span><input class="in" name="title" maxlength="100"></label></div>
        <label class="field"><span>Como vai ser</span><textarea class="in" name="description" rows="3" maxlength="1200"></textarea></label>
        <div class="grid2"><label class="field"><span>Para quem</span>${sel("honoree_type", [["household", "Uma família convidada"], ...(d.padrinhos.length ? [["padrinho", "Um padrinho ou madrinha"]] : []), ["outro", "Outra pessoa"]], "household")}</label>
          <label class="field" data-h="household"><span>Família</span>${sel("hh", d.households.map(h => [h.id, h.name]), "")}</label>
          <label class="field" data-h="padrinho" hidden><span>Padrinho</span>${sel("pd", d.padrinhos.map(p => [p.id, p.name]), "")}</label>
          <label class="field" data-h="outro" hidden><span>Nome</span><input class="in" name="honoree_label" maxlength="80"></label></div>
        <label class="field"><span>Data de revelação (opcional)</span><input class="in" type="date" name="reveal_at"></label>
        <p class="error" role="alert"></p><button class="btn" type="submit">Criar surpresa</button></form>` : ""}</div>`;
  },
  async quest() {
    const d = await api(A + "/quest");
    const used = new Set(d.challenges.map(c => c.kind));
    return `<div class="xs-cols"><div class="panel"><h2>Desafios escolhidos</h2>
      <p class="muted small">O convidado marca como feito pelo convite pessoal. Não há ranking nem pontos: vocês veem só quantas famílias fizeram cada desafio.</p>
      <ul class="xs-list">${d.challenges.map(c => `<li class="xs-row"><div><b>${esc(c.title)}</b><br><span class="muted small">${esc(c.text)}</span></div><span class="acts"><span class="tag ${c.done ? "yes" : "no"}">${c.done} ${c.done === 1 ? "família" : "famílias"}</span>${canWrite() ? `<button class="link small danger" type="button" data-qdel="${esc(c.id)}">Tirar</button>` : ""}</span></li>`).join("") || `<li class="muted">Escolham desafios ao lado.</li>`}</ul></div>
      <div class="panel"><h2>Escolher da lista</h2><ul class="xs-list">${d.templates.filter(t => !used.has(t.key)).map(t => `<li class="xs-row"><div><b>${esc(t.title)}</b><br><span class="muted small">${esc(t.text)}</span></div>${canWrite() ? `<button class="btn ghost sm" type="button" data-qadd="${esc(t.key)}">Adicionar</button>` : ""}</li>`).join("") || `<li class="muted">Todos os modelos já estão na lista.</li>`}</ul>
      ${canWrite() ? `<form class="xs-form" id="qF" novalidate><h3 class="xs-h3">Ou criem um desafio</h3><input class="in" name="title" maxlength="80" placeholder="Título" aria-label="Título do desafio"><input class="in" name="text" maxlength="240" placeholder="Descrição (opcional)" aria-label="Descrição do desafio"><p class="error" role="alert"></p><button class="btn ghost" type="submit">Criar desafio</button></form>` : ""}</div></div>`;
  },
  async passaporte() {
    const d = await api(A + "/passaporte");
    const multi = d.households.filter(h => h.events.length > 1).length;
    const ck = new Set(d.checkins.map(c => c.event_id + "|" + c.household_id));
    return `<div class="panel"><h2>Check-in por evento</h2>
      <p class="muted small">O passaporte aparece no convite de quem foi chamado para mais de um evento (${multi} ${multi === 1 ? "família" : "famílias"}). No dia, o convidado toca em “Cheguei”, ou vocês marcam aqui.</p>
      <div class="table-wrap"><table class="tbl xs-pass"><thead><tr><th scope="col">Família</th>${d.events.map(e => `<th scope="col">${esc(e.name)}<br><span class="muted small">${esc(longDate(e.starts_at))}</span></th>`).join("")}</tr></thead>
      <tbody>${d.households.map(h => `<tr><th scope="row">${esc(h.name)}</th>${d.events.map(e => `<td data-label="${esc(e.name)}">${h.events.includes(e.id) ? `<label class="xs-ck"><input type="checkbox" data-ck="${esc(e.id)}|${esc(h.id)}" ${ck.has(e.id + "|" + h.id) ? "checked" : ""} ${canWrite() ? "" : "disabled"}> <span>chegou</span></label>` : `<span class="muted small">—</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  },
  async lugares() {
    const d = await api(A + "/lugares");
    return `<div class="xs-cols"><div class="panel"><h2>Nossos lugares</h2><p class="muted small">Aparecem no site numa linha ilustrada, com “abrir no mapa” (Google Maps por busca, sem mapa embutido).</p>
      <ol class="xs-list">${d.places.map(p => `<li class="xs-row"><div><b>${esc(p.name)}</b>${p.year ? ` <span class="muted">· ${esc(p.year)}</span>` : ""}<br><span class="small">${esc(p.text)}</span><br><span class="muted small">${esc(p.address)}</span></div>${canWrite() ? `<button class="link small danger" type="button" data-ldel="${esc(p.id)}">Apagar</button>` : ""}</li>`).join("") || `<li class="muted">Nenhum lugar ainda.</li>`}</ol></div>
      ${canWrite() ? `<form class="panel xs-form" id="lF" novalidate><h2>Novo lugar</h2><div class="grid2"><label class="field"><span>Lugar</span><input class="in" name="name" maxlength="80" placeholder="Ex.: O café do primeiro encontro"></label>
        <label class="field"><span>Ano</span><input class="in" name="year" maxlength="12" placeholder="2019"></label></div>
        <label class="field"><span>Por que é especial</span><textarea class="in" name="text" rows="3" maxlength="600"></textarea></label>
        <label class="field"><span>Endereço ou nome para buscar no mapa</span><input class="in" name="address" maxlength="200"></label>
        <p class="error" role="alert"></p><button class="btn" type="submit">Adicionar lugar</button></form>` : ""}</div>`;
  },
  async documentario() {
    const s = X.soundtrack || {};
    return `<div class="xs-cols"><div class="panel"><h2>Modo documentário</h2>
      <p>No site, a seção “Nossa história” ganha o botão <b>Assistir como documentário</b>: tela cheia, um capítulo por vez, com setas, teclado e toque. Quem prefere menos movimento vê sem animações.</p>
      <p class="muted small">${X.has_story >= 2 ? `A história tem ${X.has_story} capítulos.` : "Precisa de pelo menos 2 capítulos na história do site."} <a href="/c/${esc(X.slug)}#historia" target="_blank" rel="noopener">Ver no site</a></p></div>
      <form class="panel xs-form" id="dF" novalidate><h2>Trilha sonora (opcional)</h2>
        <p class="muted small">Só toca quando o visitante aperta o botão. Usem um arquivo de áudio de vocês (gravação própria ou música com licença). Músicas famosas não podem ser embutidas: informem o nome e o site mostra só links para Spotify e YouTube.</p>
        <label class="field"><span>Arquivo de áudio próprio</span><input class="in" type="file" name="file" accept="audio/*"></label>
        ${s.url ? `<p class="small">Arquivo atual: <code>${esc(s.url)}</code> <button class="link small danger" type="button" id="dRm">remover</button></p>` : ""}
        <label class="field"><span>Nome da trilha</span><input class="in" name="title" maxlength="100" value="${esc(s.title || "")}"></label>
        <label class="field"><span>Música para ouvir fora (só links)</span><input class="in" name="song" maxlength="100" value="${esc(s.song || "")}" placeholder="Ex.: Djavan - Oceano"></label>
        <p class="error" role="alert"></p>${canWrite() ? `<button class="btn" type="submit">Salvar trilha</button>` : ""}</form></div>`;
  },
  async jornal() {
    const j = await api(A + "/jornal").catch(e => { if (e.status === 404) return null; throw e; });
    if (!j) return `<div class="panel"><p>Liguem o jornal no interruptor acima para revisar e imprimir.</p></div>`;
    const c = j.config || {}, S = { historia: true, curiosidades: true, programacao: true, recados: true, cruzadas: true, ...(c.sections || {}) };
    const chosen = Array.isArray(c.messages) ? c.messages : j.messages.slice(0, 6).map(m => m.id);
    const L = [["historia", "A história"], ["curiosidades", `Curiosidades do quiz (${j.quiz.length})`], ["programacao", "Programação"], ["recados", "Recados do mural"], ["cruzadas", `Palavras-cruzadas (${j.words.length} palavras)`]];
    return `<form class="panel xs-form" id="jF" novalidate><h2>Revisar o jornal</h2>
      <p class="muted small">Uma folha A4 feita só com o que vocês publicaram. Revisem, salvem e abram para imprimir ou salvar em PDF.</p>
      <div class="grid2"><label class="field"><span>Manchete</span><input class="in" name="headline" maxlength="120" value="${esc(c.headline || "")}" placeholder="${esc(j.wedding.names.replace("&", "e"))} dizem sim"></label>
      <label class="field"><span>Nota da edição (opcional)</span><input class="in" name="note" maxlength="400" value="${esc(c.note || "")}"></label></div>
      <fieldset class="field"><legend><span>Seções</span></legend><div class="checks">${L.map(([k, l]) => `<label><input type="checkbox" name="sec" value="${k}" ${S[k] ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div></fieldset>
      ${j.messages.length ? `<fieldset class="field"><legend><span>Recados que entram (até 12)</span></legend><div class="xs-msgs">${j.messages.map(m => `<label><input type="checkbox" name="msg" value="${esc(m.id)}" ${chosen.includes(m.id) ? "checked" : ""}> <span>“${esc(m.message.slice(0, 120))}” <b>${esc(m.author)}</b></span></label>`).join("")}</div></fieldset>` : `<p class="muted small">Nenhum recado aprovado no mural ainda.</p>`}
      <p class="error" role="alert"></p>
      <div class="row-btns">${canWrite() ? `<button class="btn" type="submit">Salvar revisão</button>` : ""}<a class="btn ghost" href="/c/${esc(X.slug)}/jornal" target="_blank" rel="noopener">Abrir o jornal para imprimir</a></div></form>`;
  },
};

const lines = (v, keys) => String(v || "").split("\n").map(l => l.split("|").map(s => s.trim())).filter(p => p.join("")).map(p => p.length > 1 ? { [keys[0]]: p[0], [keys[1]]: p.slice(1).join(" | ") } : { [keys[0]]: "", [keys[1]]: p[0] });
const submit = (el, sel_, fn) => el.querySelector(sel_)?.addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, b = f.querySelector("[type=submit]"), er = f.querySelector(".error") || el.querySelector(".error");
  if (er) er.textContent = ""; if (b) b.disabled = true;
  try { await fn(f); } catch (x) { err(er, x); if (b) b.disabled = false; }
});
const clicks = (el, attr, fn, ask) => el.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener("click", async () => {
  if (ask && !confirm(ask)) return;
  try { await fn(b.getAttribute(attr), b); } catch (x) { alert(x.message); }
}));
const linkBox = (box, who, link) => {
  box.innerHTML = `<div class="xs-link"><p><b>Link de ${esc(who)}</b> (aparece só agora; guardem ou enviem já):</p><code>${esc(link)}</code>
    <div class="row-btns"><button class="btn sm" type="button" data-cp>Copiar</button><a class="btn ghost sm" href="https://wa.me/?text=${encodeURIComponent(link)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a></div></div>`;
  box.querySelector("[data-cp]").onclick = e => navigator.clipboard.writeText(link).then(() => { e.target.textContent = "Copiado!"; }).catch(() => {});
};

const BIND = {
  concierge(el) {
    submit(el, "#ccF", async f => { await api(A + "/concierge", { method: "POST", body: { topic: f.topic.value, question: f.question.value, answer: f.answer.value, keywords: f.keywords.value } }); reload(); });
    clicks(el, "data-del", async id => { await api(A + "/concierge/" + id, { method: "DELETE" }); reload(); }, "Apagar esta resposta?");
    el.querySelector("#ccT").addEventListener("submit", async e => {
      e.preventDefault(); const r = await api(A + "/concierge/test?q=" + encodeURIComponent(e.target.q.value));
      $("#ccOut").innerHTML = `<div class="xs-ans${r.known ? "" : " unk"}">${r.items.map(i => `<p>${esc(i.text)}${i.source ? `<span class="xs-src">Fonte: ${esc(i.source)}</span>` : ""}</p>`).join("")}</div>`;
    });
  },
  padrinhos(el) {
    submit(el, "#pF", async f => { const r = await api(A + "/padrinhos", { method: "POST", body: { name: f.name.value, role: f.role.value } }); const n = f.name.value; await reload(); linkBox($("#pLink"), n, r.link); });
    clicks(el, "data-plink", async (id, b) => { const r = await api(A + `/padrinhos/${id}/link`, { method: "POST" }); const n = b.closest("li").querySelector("b").textContent; await reload(); linkBox($("#pLink"), n, r.link); }, "Gerar um link novo? O link antigo deixa de funcionar.");
    clicks(el, "data-prev", async id => { await api(A + `/padrinhos/${id}/revoke`, { method: "POST" }); reload(); }, "Revogar o link? A pessoa perde o acesso ao portal.");
    clicks(el, "data-pdel", async id => { await api(A + `/padrinhos/${id}`, { method: "DELETE" }); reload(); }, "Apagar este padrinho, as tarefas e mensagens dele?");
    clicks(el, "data-tdel", async id => { await api(A + `/padrinho-tasks/${id}`, { method: "DELETE" }); reload(); }, "Apagar esta tarefa?");
    submit(el, "#tF", async f => { await api(A + "/padrinho-tasks", { method: "POST", body: { title: f.title.value, padrinho_id: f.padrinho_id.value || null, due_date: f.due_date.value || null, notes: f.notes.value } }); reload(); });
    submit(el, "#iF", async f => {
      await api(A + "/settings", { method: "PATCH", body: { padrinhos: { instructions: f.instructions.value, dress: f.dress.value, schedule: lines(f.schedule.value, ["time", "text"]), contacts: lines(f.contacts.value, ["label", "value"]) } } });
      X = await api(A); const b = f.querySelector("[type=submit]"); b.disabled = false; b.textContent = "Salvo ✓"; setTimeout(() => { b.textContent = "Salvar"; }, 1600);
    });
  },
  mensagens(el) {
    submit(el, "#sF", async f => {
      let media = {};
      if (f.file.files[0]) { const file = f.file.files[0]; const u = await upload(file); media = { media_id: u.id, media_url: u.url, media_type: file.type.startsWith("video") ? "video" : "image" }; }
      await api(A + "/segredos", { method: "POST", body: { household_id: f.household_id.value, title: f.title.value, body: f.body.value, show_from: f.show_from.value || null, ...media } });
      reload();
    });
    clicks(el, "data-sdel", async id => { await api(A + "/segredos/" + id, { method: "DELETE" }); reload(); }, "Apagar esta mensagem?");
  },
  surpresas(el) {
    const f = el.querySelector("#spF");
    if (f) { const sync = () => f.querySelectorAll("[data-h]").forEach(l => { l.hidden = l.dataset.h !== f.honoree_type.value; }); f.honoree_type.addEventListener("change", sync); sync(); }
    submit(el, "#spF", async f => {
      const t = f.honoree_type.value;
      await api(A + "/surpresas", { method: "POST", body: { kind: f.kind.value, title: f.title.value, description: f.description.value, honoree_type: t, honoree_ref: t === "household" ? f.hh.value : t === "padrinho" ? f.pd.value : null, honoree_label: f.honoree_label.value, reveal_at: f.reveal_at.value || null } });
      reload();
    });
    el.querySelectorAll("[data-mem]").forEach(fm => fm.addEventListener("submit", async e => {
      e.preventDefault(); const n = fm.name.value;
      try { const r = await api(A + `/surpresas/${fm.dataset.mem}/members`, { method: "POST", body: { name: n } }); linkBox($("#mLink"), n, r.link); $("#mLink").scrollIntoView({ block: "nearest" }); fm.reset(); } catch (x) { alert(x.message); }
    }));
    clicks(el, "data-spdel", async id => { await api(A + "/surpresas/" + id, { method: "DELETE" }); reload(); }, "Apagar a surpresa e todas as mensagens?");
  },
  quest(el) {
    clicks(el, "data-qadd", async key => { await api(A + "/quest", { method: "POST", body: { key } }); reload(); });
    clicks(el, "data-qdel", async id => { await api(A + "/quest/" + id, { method: "DELETE" }); reload(); }, "Tirar este desafio? O que os convidados marcaram nele também sai.");
    submit(el, "#qF", async f => { await api(A + "/quest", { method: "POST", body: { title: f.title.value, text: f.text.value } }); reload(); });
  },
  passaporte(el) {
    el.querySelectorAll("[data-ck]").forEach(i => i.addEventListener("change", async () => {
      const [event_id, household_id] = i.dataset.ck.split("|");
      try { await api(A + "/passaporte/checkin", { method: "POST", body: { event_id, household_id, on: i.checked } }); } catch (x) { i.checked = !i.checked; alert(x.message); }
    }));
  },
  lugares(el) {
    submit(el, "#lF", async f => { await api(A + "/lugares", { method: "POST", body: { name: f.name.value, year: f.year.value, text: f.text.value, address: f.address.value } }); reload(); });
    clicks(el, "data-ldel", async id => { await api(A + "/lugares/" + id, { method: "DELETE" }); reload(); }, "Apagar este lugar?");
  },
  documentario(el) {
    const save = async st => { await api(A + "/settings", { method: "PATCH", body: { soundtrack: st } }); X = await api(A); reload(); };
    submit(el, "#dF", async f => {
      let url = X.soundtrack?.url || "";
      if (f.file.files[0]) url = (await upload(f.file.files[0], "file")).url;
      await save({ url, title: f.title.value, song: f.song.value });
    });
    el.querySelector("#dRm")?.addEventListener("click", () => save({ ...X.soundtrack, url: "" }).catch(x => alert(x.message)));
  },
  jornal(el) {
    submit(el, "#jF", async f => {
      const sections = Object.fromEntries([...f.querySelectorAll("[name=sec]")].map(i => [i.value, i.checked]));
      const messages = [...f.querySelectorAll("[name=msg]:checked")].map(i => i.value);
      await api(A + "/settings", { method: "PATCH", body: { jornal: { headline: f.headline.value, note: f.note.value, sections, messages } } });
      const b = f.querySelector("[type=submit]"); b.disabled = false; b.textContent = "Salvo ✓"; setTimeout(() => { b.textContent = "Salvar revisão"; }, 1600);
    });
  },
};
