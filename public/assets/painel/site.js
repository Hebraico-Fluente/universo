/** Aba "Site": o casal edita o próprio site, seção por seção (salvar por seção, desfazer, liga/desliga). Servidor: src/mods/editor.js */
import { $, $$, esc, api, longDate } from "../ui.js";
import { icon } from "../icons.js";
import { viewEl, fail, state, css } from "./core.js";

const UNIVERSES = [
  ["timeless", "Atemporal", "Clássico e simétrico: serifas elegantes, ornamentos finos e movimentos lentos. Para festas tradicionais, igreja, fazenda."],
  ["editorial", "Editorial", "Como uma revista: grade assimétrica, títulos grandes e linhas finas. Para casais urbanos e minimalistas."],
  ["dreamscape", "Sonho", "Cinematográfico: fundo de crepúsculo, fotos grandes e deriva suave. Para festas à noite, praia, destino."],
];
const ICON_NAMES = { rings: "Alianças", music: "Música", pizza: "Pizza", glass: "Taça", sweet: "Doce", icecream: "Sorvete", coffee: "Café", snack: "Lanche", moon: "Lua", shirt: "Camisa", shoe: "Sapato", palette: "Paleta", pin: "Local", clock: "Relógio", heart: "Coração" };
const SECTION_NAMES = { main: "Dados principais", look: "Aparência", images: "Fotos", music: "Música", story: "Nossa história", schedule: "Cronograma", dress: "Traje", faq: "Dúvidas", gifts: "Presentes e Pix", quiz: "Quiz", visibility: "Seções do site" };
const HIDE_NAMES = { story: "Nossa história", schedule: "Cronograma do dia", dress: "Traje", faq: "Dúvidas", gifts: "Presentes e Pix", quiz: "Quiz do casal" };
const ZONES = [["-03:00", "Brasília (−03:00)"], ["-02:00", "Fernando de Noronha (−02:00)"], ["-04:00", "Manaus, Cuiabá (−04:00)"], ["-05:00", "Acre (−05:00)"]];
const SAVED_MSG = "Salvo. Pode levar até 1 minuto para aparecer no site.";

/** Listas editáveis: campos de cada item (name, label, tipo, limite) e como aparece o título do item. */
const LISTS = {
  story: { label: "História", item: "Capítulo", add: "Adicionar capítulo", fields: [["year", "Ano ou data", "text", 12], ["title", "Título", "text", 80], ["text", "O que aconteceu", "area", 700], ["image", "Foto (opcional)", "image", 500], ["alt", "Descrição da foto ou do vídeo (para leitores de tela)", "text", 160], ["video", "", "keep"], ["poster", "", "keep"]], blank: { year: "", title: "", text: "" } },
  schedule: { label: "Cronograma", item: "Momento", add: "Adicionar momento", fields: [["time", "Horário", "text", 10], ["title", "Título", "text", 60], ["text", "Descrição curta", "text", 160], ["icon", "Ícone", "icon"]], blank: { time: "", title: "", text: "", icon: "clock" } },
  dress: { label: "Traje", item: "Orientação", add: "Adicionar orientação", fields: [["title", "Título", "text", 60], ["text", "Explicação", "area", 300], ["icon", "Ícone", "icon"]], blank: { title: "", text: "", icon: "shirt" } },
  faq: { label: "Dúvidas", item: "Pergunta", add: "Adicionar pergunta", fields: [["q", "Pergunta", "text", 160], ["a", "Resposta", "area", 600]], blank: { q: "", a: "" } },
  gifts: { label: "Presentes", item: "Presente", add: "Adicionar presente", fields: [["title", "Título", "text", 80], ["cents", "Valor (vazio = valor livre)", "money"], ["icon", "Ícone", "icon", 0, true], ["note", "Nota curta (opcional)", "text", 160]], blank: { title: "", cents: 0, icon: "heart" } },
  quiz: { label: "Quiz", item: "Pergunta", add: "Adicionar pergunta", fields: [["q", "Pergunta", "text", 160], ["options", "Opções", "options"], ["fact", "Curiosidade (aparece depois da resposta)", "area", 300]], blank: { q: "", options: ["", "", "", ""], answer: 0, fact: "" } },
};

let D = null, upload = null, uid = 0;
const nid = p => `${p}-${++uid}`;
const reais = c => c ? (c / 100).toFixed(2).replace(".", ",") : "";
/** "1.500,00", "150", "R$ 80,5" → centavos; vazio → 0; inválido → null */
function toCents(v) {
  v = String(v || "").replace(/[R$\s]/g, "");
  if (!v) return 0;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Math.round(parseFloat(v) * 100);
  return n <= 10_000_000 ? n : null;
}
const imgOk = v => !v || /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s"'()<>\\]*)?$/i.test(v) || (/^\/(m|assets)\/[A-Za-z0-9._~\/-]+$/.test(v) && !v.includes(".."));
/** Mesma regra do servidor (src/mods/editor.js › spotifyTrackUrl): só link de música (faixa) do Spotify. */
const spotifyOk = v => !v || /^https:\/\/open\.spotify\.com\/(?:intl-[a-zA-Z]{2}(?:-[a-zA-Z]{2})?\/)?(?:embed\/)?track\/[A-Za-z0-9]{22}\/?(?:\?[\w.~%=&+-]*)?$/.test(v) || /^spotify:track:[A-Za-z0-9]{22}$/.test(v);
const httpsOk = v => !v || /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/[^\s"'<>\\]*)?$/i.test(v);
/** Fotos de outros sites são bloqueadas pela política de segurança (só fotos enviadas e images.unsplash.com aparecem). */
const foreign = v => /^https:/i.test(v) && !/^https:\/\/images\.unsplash\.com\//i.test(v);

export default async function siteView() {
  css("/assets/painel/editor.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try {
    [D] = await Promise.all([api("/api/admin/site"), import("/assets/upload.js").then(m => { upload = m.uploadImage; }).catch(() => { upload = null; })]);
    render();
  } catch (e) { fail(e); }
}

/* ---------------- estrutura ---------------- */
function render() {
  const v = D.values, ro = state.me?.role === "viewer";
  const secs = [
    ["main", "Quem, quando e onde", mainSec(v)],
    ["look", "Universo visual", lookSec(v)],
    ["images", "Foto de capa e mapa", imagesSec(v)],
    ["music", "A música de vocês", musicSec(v)],
    ["story", "Como chegamos até aqui", listSec("story", v, "Os capítulos aparecem em ordem, como uma linha do tempo. Use os botões para mudar a ordem.")],
    ["schedule", "O passo a passo da festa", listSec("schedule", v, "Os momentos da festa, do “sim” à saideira.")],
    ["dress", "O que vestir", listSec("dress", v, "Orientações de roupa e calçado para os convidados.")],
    ["faq", "Perguntas frequentes", listSec("faq", v, "Perguntas que os convidados costumam fazer. Só o que vocês quiserem publicar.")],
    ["gifts", "Lista de presentes", giftsSec(v)],
    ["quiz", "Quanto conhecem vocês?", quizSec(v)],
    ["visibility", "O que aparece no site", visSec(v)],
  ];
  viewEl().innerHTML = `
    <header class="vh ed-head"><div><p class="label">Site</p><h1>O site de vocês, do jeito de vocês</h1>
      <p class="ed-lead">Editem cada parte e salvem quando quiserem. As mudanças podem levar até 1 minuto para aparecer no site.</p></div>
      <div class="row-btns"><a class="btn" href="/c/${esc(D.slug)}" target="_blank" rel="noopener">Ver o site <span class="sr">(abre em nova aba)</span><span aria-hidden="true">↗</span></a></div></header>
    ${ro ? `<p class="ed-ro" role="note">Seu acesso é só de leitura: dá para ver tudo, mas só os noivos e a assessoria podem salvar.</p>` : ""}
    <div class="ed">
      <nav class="ed-nav" aria-label="Partes do site"><ol>${secs.map(([id, t], i) => `<li><a href="#ed-${id}" data-go="${id}"><span class="num">${String(i + 1).padStart(2, "0")}</span>${esc(SECTION_NAMES[id])}${hiddenTag(id, v) ? `<span class="ed-off" data-offtag="${id}">escondida</span>` : `<span class="ed-off" data-offtag="${id}" hidden>escondida</span>`}</a></li>`).join("")}</ol></nav>
      <div class="ed-main">${secs.map(([id, t, inner], i) => `
        <form class="ed-sec" id="ed-${id}" data-sec="${id}" novalidate aria-labelledby="edh-${id}">
          <header class="ed-sh"><p class="label"><span class="n">${String(i + 1).padStart(2, "0")}</span>${esc(SECTION_NAMES[id])}</p><h2 id="edh-${id}" tabindex="-1">${esc(t)}</h2></header>
          ${inner}
          <footer class="ed-foot">
            <button class="btn" type="submit"${ro ? " disabled" : ""}>Salvar ${esc(SECTION_NAMES[id].toLowerCase())}</button>
            <button class="link" type="button" data-undo="${id}"${ro || !D.history.undoable.includes(id) ? " hidden" : ""}>Desfazer última alteração</button>
            <p class="ed-status" role="status" aria-live="polite"></p>
            <p class="error ed-err" role="alert"></p>
          </footer>
        </form>`).join("")}
        <section class="ed-hist panel" aria-labelledby="edh-hist"><h2 id="edh-hist">Últimas alterações</h2><div id="edHist">${histHtml()}</div></section>
      </div>
    </div>`;
  if (D.theme) $("#ed-look button[type=submit]").hidden = true;
  if (ro) $$(".ed-main input, .ed-main textarea, .ed-main select, .ed-main button:not([type=submit])").forEach(el => { el.disabled = true; });
  bind();
  loadRank();
}
const hiddenTag = (id, v) => v.hidden.includes(id);
function histHtml() {
  const h = D.history.items;
  if (!h.length) return `<p class="muted">Nenhuma alteração feita pelo painel ainda.</p>`;
  return `<ol class="ed-hl">${h.map(x => `<li><span><b>${esc(SECTION_NAMES[x.section] || x.section)}</b>${x.undone ? ` <span class="tag no">desfeita</span>` : ""}</span>
    <span class="muted small">${esc(x.who || "Alguém do casal")} · ${esc(new Date(x.at.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))}</span></li>`).join("")}</ol>`;
}

/* ---------------- campos ---------------- */
/** Campo com rótulo, dica e mensagem de erro ligadas por aria-describedby. `lab` = nome que o servidor usa nas mensagens. */
function field({ name, label, value = "", type = "text", max, hint = "", lab = label, area = false, attrs = "", cls = "" }) {
  const id = nid("f"), hid = id + "-h", eid = id + "-e";
  const input = area
    ? `<textarea class="in" id="${id}" name="${name}" rows="3" ${max ? `maxlength="${max}"` : ""} data-lab="${esc(lab)}" aria-describedby="${hint ? hid + " " : ""}${eid}" ${attrs}>${esc(value)}</textarea>`
    : `<input class="in" id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${max ? `maxlength="${max}"` : ""} data-lab="${esc(lab)}" aria-describedby="${hint ? hid + " " : ""}${eid}" ${attrs}>`;
  return `<div class="field ed-f ${cls}"><label for="${id}"><span>${esc(label)}</span></label>${input}${hint ? `<small class="hint" id="${hid}">${hint}</small>` : ""}<small class="ed-ferr" id="${eid}"></small></div>`;
}
function imageField({ name, label, value, lab, hint = "" }) {
  const id = nid("img");
  return `<div class="ed-img" data-imgf>
    ${field({ name, label, value, lab, type: "url", max: 500, attrs: `inputmode="url" placeholder="https://… ou foto enviada" data-img`, hint: hint || "Endereço https:// de uma foto, ou envie uma do seu aparelho." })}
    <div class="ed-img-acts">${upload ? `<button class="btn ghost sm" type="button" data-up="${id}">Enviar foto</button><input class="sr" type="file" id="${id}" accept="image/*" tabindex="-1" aria-hidden="true">` : ""}
      <p class="small ed-imgnote" aria-live="polite"></p></div>
    <figure class="ed-prev"${value ? "" : " hidden"}><img alt="Pré-visualização: ${esc(label)}"${value ? ` src="${esc(value)}"` : ""}></figure>
  </div>`;
}
const iconSelect = (value, lab, optional) => {
  const id = nid("ic");
  return `<div class="field ed-f ed-icon"><label for="${id}"><span>Ícone</span></label><div class="ed-icrow"><span class="ed-icp" aria-hidden="true">${value ? icon(value) : ""}</span>
    <select class="in" id="${id}" name="icon" data-lab="${esc(lab)}">${optional ? `<option value="">Sem ícone</option>` : ""}${D.icons.map(k => `<option value="${k}"${k === value ? " selected" : ""}>${esc(ICON_NAMES[k] || k)}</option>`).join("")}</select></div></div>`;
};

function mainSec(v) {
  const m = String(v.date).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?$/) || [];
  const tz = m[3] === "Z" ? "+00:00" : m[3] || "-03:00";
  const zones = ZONES.some(z => z[0] === tz) ? ZONES : [...ZONES, [tz, tz]];
  const zid = nid("tz");
  return `<p class="ed-desc">O essencial: quem, quando e onde. Aparece no topo do site e nos convites.</p>
    <div class="grid2">
      ${field({ name: "names", label: "Nomes do casal", value: v.names, max: 80, lab: "Nomes", hint: "Os dois nomes separados por &amp;, como “Ana &amp; Bruno”.", attrs: "required autocomplete=\"off\"" })}
      ${field({ name: "city", label: "Cidade", value: v.city, max: 80, lab: "Cidade", hint: "Ex.: Curitiba · PR" })}
      ${field({ name: "venue_name", label: "Local da festa", value: v.venue_name, max: 80, lab: "Local", hint: "O nome do lugar. O endereço completo fica nos eventos." })}
      ${field({ name: "rsvp_deadline", label: "Prazo para confirmar presença", value: v.rsvp_deadline, type: "date", lab: "Prazo de confirmação", attrs: "required" })}
    </div>
    <fieldset class="ed-when"><legend><span>Data e hora da cerimônia</span></legend>
      <div class="ed-when-g">
        ${field({ name: "d_day", label: "Dia", value: m[1] || "", type: "date", lab: "Data e hora", attrs: "required" })}
        ${field({ name: "d_time", label: "Hora", value: m[2] || "16:00", type: "time", lab: "Data e hora", attrs: "required" })}
        <div class="field ed-f"><label for="${zid}"><span>Fuso horário</span></label><select class="in" id="${zid}" name="d_tz">${zones.map(([k, l]) => `<option value="${k}"${k === tz ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
      </div>
      <p class="hint ed-whenp" aria-live="polite"></p>
    </fieldset>
    ${field({ name: "welcome", label: "Mensagem de boas-vindas", value: v.welcome, area: true, max: 600, lab: "Boas-vindas", hint: "Aparece logo abaixo dos nomes. Até 600 caracteres." })}
    ${field({ name: "rsvp_note", label: "Recado sobre a confirmação", value: v.rsvp_note, area: true, max: 400, lab: "Recado da confirmação", hint: "Regras importantes: convite individual, crianças, prazo… Até 400 caracteres." })}`;
}

function lookSec(v) {
  const locked = !!D.theme;
  return `<p class="ed-desc">O universo visual muda a estrutura, as fontes, as cores e o ritmo do site inteiro.</p>
    ${locked ? `<div class="ed-theme" role="note"><span class="ed-theme-ic" aria-hidden="true">${icon("palette")}</span><div><p><b>Identidade própria ativa.</b> As cores, as fontes e o logo do site de vocês foram desenhados pelo estúdio.</p>
      <p class="muted small">Para não desmontar o tema, o universo visual fica fixo. Para mudar a identidade, falem com o Gueta Studio.</p></div></div>` : ""}
    <fieldset class="ed-unis"${locked ? " disabled" : ""}><legend class="sr">Universo visual</legend>
      ${UNIVERSES.map(([k, n, d]) => { const id = nid("u"); return `<div class="ed-uni"><input type="radio" name="universe" id="${id}" value="${k}"${v.universe === k ? " checked" : ""} aria-describedby="${id}-d">
        <label for="${id}"><span class="ed-sw ed-sw-${k}" aria-hidden="true"><i></i><i></i><i></i></span><b>${esc(n)}</b><span class="small" id="${id}-d">${esc(d)}</span></label></div>`; }).join("")}
    </fieldset>`;
}

function imagesSec(v) {
  return `<p class="ed-desc">A foto de capa ocupa o topo do site. Prefiram uma foto horizontal, com o casal à direita ou ao centro.</p>
    ${imageField({ name: "hero_image", label: "Foto de capa", value: v.hero_image, lab: "Foto de capa" })}
    ${imageField({ name: "map_image", label: "Mapa ilustrado (opcional)", value: v.map_image, lab: "Mapa ilustrado", hint: "Um mapa desenhado até o local, se vocês tiverem." })}`;
}

function musicSec(v) {
  return `<p class="ed-desc">Uma música para os convidados ouvirem no site. Aparece um botão discreto no canto da tela, e a música só toca quando o convidado aperta o play: o site nunca toca nada sozinho.</p>
    <div class="grid2">
      ${field({ name: "music_url", label: "Link da música no Spotify", value: v.music_url, type: "url", max: 300, lab: "Música", hint: "No Spotify, abram a música e toquem em ••• › Compartilhar › Copiar link. Colem aqui (fica assim: https://open.spotify.com/track/…). Vazio = sem música.", attrs: `inputmode="url" placeholder="https://open.spotify.com/track/…" autocomplete="off" spellcheck="false"` })}
      ${field({ name: "music_label", label: "Nome no botão (opcional)", value: v.music_label, max: 60, lab: "Nome da música", hint: "Ex.: Pétala — Djavan. Vazio: “Nossa música”." })}
    </div>`;
}

function listSec(key, v, desc) {
  const L = LISTS[key];
  return `<p class="ed-desc">${esc(desc)}</p>${hiddenNote(key, v)}
    <ol class="ed-list" data-list="${key}">${(v[key] || []).map((it, i, a) => itemHtml(key, it, i, a.length)).join("")}</ol>
    <p class="ed-empty muted"${(v[key] || []).length ? " hidden" : ""} data-empty="${key}">Nada aqui ainda. Esta parte não aparece no site enquanto estiver vazia.</p>
    <button class="btn ghost sm ed-add" type="button" data-add="${key}">+ ${esc(L.add)}</button>
    <span class="small muted ed-count" data-count="${key}">${(v[key] || []).length} de ${D.limits[key]}</span>`;
}
const hiddenNote = (key, v) => `<p class="ed-hidnote" data-hidnote="${key}"${v.hidden.includes(key) ? "" : " hidden"}>Esta seção está <b>escondida</b> no site. Vocês podem editar à vontade e mostrar de novo em “Seções do site”.</p>`;

function itemHtml(key, it, i, n) {
  const L = LISTS[key], pre = `${L.label} ${i + 1}`;
  const title = it.title || it.q || "";
  const inner = L.fields.map(([f, label, type, max, optional]) => {
    const lab = `${pre} · ${{ year: "ano", title: "título", text: "texto", image: "foto", time: "horário", q: "pergunta", a: "resposta", cents: "valor", note: "nota", fact: "curiosidade" }[f] || f}`;
    if (type === "icon") return iconSelect(it.icon || "", pre, optional);
    if (type === "image") return imageField({ name: f, label, value: it[f] || "", lab });
    if (type === "money") return field({ name: f, label, value: reais(it.cents), lab, attrs: `inputmode="decimal" placeholder="R$ 0,00" data-money`, cls: "ed-money" });
    if (type === "options") return optionsHtml(it, pre);
    // guardado sem campo visível (ex.: vídeo do capítulo, colocado pelo Gueta Studio): só volta igual no salvar
    if (type === "keep") return it[f] ? `<input type="hidden" name="${f}" value="${esc(it[f])}">${f === "video" ? `<p class="small muted">Este capítulo tem um vídeo. Para trocar ou tirar, fale com o Gueta Studio.</p>` : ""}` : "";
    return field({ name: f, label, value: it[f] ?? "", max, lab, area: type === "area" });
  }).join("");
  return `<li class="ed-item" data-i="${i}"><fieldset><legend><span class="num">${String(i + 1).padStart(2, "0")}</span> ${esc(L.item)}${title ? `: <span class="ed-it">${esc(title)}</span>` : ""}</legend>
    <div class="ed-ig ed-ig-${key}">${inner}</div>
    <div class="ed-iacts">
      <button class="ed-ib" type="button" data-mv="-1" aria-label="Subir ${esc(L.item.toLowerCase())} ${i + 1}"${i === 0 ? " disabled" : ""}><span aria-hidden="true">↑</span> Subir</button>
      <button class="ed-ib" type="button" data-mv="1" aria-label="Descer ${esc(L.item.toLowerCase())} ${i + 1}"${i === n - 1 ? " disabled" : ""}><span aria-hidden="true">↓</span> Descer</button>
      <button class="ed-ib danger" type="button" data-rm aria-label="Apagar ${esc(L.item.toLowerCase())} ${i + 1}">Apagar</button>
    </div></fieldset></li>`;
}
function optionsHtml(it, pre) {
  const g = nid("ans");
  return `<fieldset class="ed-opts"><legend><span>Opções · marque a certa</span></legend>${[0, 1, 2, 3].map(k => { const id = nid("o");
    return `<div class="ed-opt"><input type="radio" name="${g}" value="${k}" data-answer${(it.answer || 0) === k ? " checked" : ""} aria-label="Opção ${k + 1} é a certa">
      <label class="sr" for="${id}">Opção ${k + 1}</label><input class="in" id="${id}" data-opt="${k}" maxlength="80" value="${esc(it.options?.[k] ?? "")}" placeholder="Opção ${k + 1}" data-lab="${esc(pre)} · opção ${k + 1}"></div>`; }).join("")}<small class="ed-ferr"></small></fieldset>`;
}

function giftsSec(v) {
  return `${listSec("gifts", v, "Cotas de presente com valor (ou “valor livre”). O convidado paga por Pix direto na conta de vocês, sem comissão.")}
    <div class="ed-sub"><h3>Pix</h3>
      ${!D.features.presentes_pix ? `<p class="muted small">Presentes com Pix não estão incluídos no plano de vocês.</p>` : ""}
      <div class="grid2">
        ${field({ name: "pix_key", label: "Chave Pix", value: v.pix_key, max: 77, lab: "Chave Pix", hint: "E-mail, celular, CPF ou chave aleatória. Sem a chave, os botões de Pix somem.", attrs: `autocomplete="off" spellcheck="false"${D.features.presentes_pix ? "" : " disabled"}` })}
        ${field({ name: "pix_name", label: "Nome do recebedor", value: v.pix_name, max: 25, lab: "Nome do recebedor (Pix)", hint: "Até 25 caracteres, como aparece no QR Code. O banco mostra o titular real da chave." })}
        ${field({ name: "pix_city", label: "Cidade do recebedor", value: v.pix_city, max: 15, lab: "Cidade (Pix)", hint: "Até 15 caracteres (exigência do padrão Pix)." })}
        ${field({ name: "infinitepay_tag", label: "Cartão de crédito: InfiniteTag da InfinitePay (opcional)", value: v.infinitepay_tag, max: 41, lab: "InfiniteTag", hint: "O nome de usuário no app da InfinitePay, sem o $. Com ela, cada presente ganha “Pagar no cartão” (até 12x) e o dinheiro cai na conta dessa InfinitePay. O Pix continua igual.", attrs: `autocomplete="off" spellcheck="false" placeholder="ex.: petala-cavalcanti"` })}
        ${field({ name: "gift_url", label: "Lista de presentes externa (opcional)", value: v.gift_url, type: "url", max: 500, lab: "Lista de presentes externa", hint: "Link de uma loja, começando com https://", attrs: `inputmode="url" placeholder="https://"` })}
      </div></div>`;
}
function quizSec(v) {
  return `<div class="ed-warn" role="note"><b>Usem só fatos verdadeiros do casal.</b> Os convidados vão jogar e compartilhar o resultado: nada de inventar histórias ou expor quem não pediu.</div>
    ${!D.features.quiz ? `<p class="muted small">O quiz não está incluído no plano de vocês.</p>` : ""}
    ${field({ name: "quiz_premio", label: "Prêmio (opcional)", value: v.quiz_premio || "", max: 160, lab: "Prêmio do quiz", hint: "Aparece em destaque antes do quiz e em cima do ranking. Ex.: Quem ficar em 1º lugar ganha… Vazio: sem prêmio." })}
    ${listSec("quiz", v, "Cada pergunta tem 4 opções e uma certa. Depois da resposta, aparece a curiosidade.")}
    <div class="ed-sub ed-rank" aria-labelledby="edh-rank"><h3 id="edh-rank" tabindex="-1">Ranking dos amigos</h3>
      <p class="muted small">Quem joga escreve o nome e entra no ranking do site (mais acertos; no empate, quem respondeu mais rápido). Cada pessoa responde uma vez (o site confere o nome e o aparelho).</p>
      <div id="edRank" aria-live="polite"><p class="muted small">Carregando o ranking…</p></div></div>`;
}
/** Ranking do quiz (src/mods/quiz.js): lista completa e "Liberar nova tentativa" (só noivos e assessoria). */
const dur = s => s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s";
async function loadRank() {
  const box = $("#edRank"); if (!box) return;
  const ro = state.me?.role === "viewer";
  try {
    const { items } = await api("/api/admin/quiz");
    box.innerHTML = items.length ? `<ol class="ed-rl">${items.map(x => `<li><span class="num ed-rp">${x.position}º</span><span class="ed-rn"><b>${esc(x.name)}</b>
        <span class="muted small">${x.score} de ${x.total} · ${dur(x.seconds)}</span></span>
        ${ro ? "" : `<button class="ed-ib" type="button" data-qdel="${esc(x.id)}" data-qname="${esc(x.name)}" aria-label="Liberar nova tentativa para ${esc(x.name)}">Liberar nova tentativa</button>`}</li>`).join("")}</ol>
        <p class="muted small">${items.length} ${items.length === 1 ? "pessoa jogou" : "pessoas jogaram"}. O site mostra as 10 primeiras. Cada pessoa responde uma vez (pelo nome e pelo aparelho); “Liberar nova tentativa” tira a jogada do ranking para a pessoa jogar de novo (ex.: nome digitado errado).</p>`
      : `<p class="muted small">Ninguém jogou ainda.</p>`;
  } catch (x) { box.innerHTML = `<p class="error">${esc(x.message)}</p>`; }
}
async function delRank(b) {
  if (!confirm(`Liberar nova tentativa para “${b.dataset.qname}”? A jogada sai do ranking e a pessoa pode responder de novo.`)) return;
  b.disabled = true;
  try { await api(`/api/admin/quiz/${encodeURIComponent(b.dataset.qdel)}`, { method: "DELETE" }); await loadRank(); $("#edh-rank")?.focus({ preventScroll: true }); }
  catch (x) { b.disabled = false; alert(x.message); }
}
function visSec(v) {
  const sw = (name, label, on, desc, dis) => { const id = nid("sw");
    return `<li class="ed-swi"><input type="checkbox" role="switch" id="${id}" name="${name}"${on ? " checked" : ""}${dis ? " disabled" : ""} aria-describedby="${id}-d"><label for="${id}"><b>${esc(label)}</b><span class="small muted" id="${id}-d">${esc(desc)}</span></label></li>`; };
  return `<p class="ed-desc">Mostrem ou escondam partes do site. Esconder não apaga nada: o conteúdo fica guardado aqui.</p>
    <ul class="ed-sws">
      ${D.hideable.map(k => sw("show_" + k, HIDE_NAMES[k], !v.hidden.includes(k), k === "gifts" ? "Lista, Pix e link da loja." : (v[k] || []).length ? `${v[k].length} ${v[k].length === 1 ? "item" : "itens"}` : "Vazia: só aparece quando tiver conteúdo.", k === "quiz" && !D.features.quiz && v.hidden.includes("quiz"))).join("")}
      ${sw("guestbook", "Mural de recados", v.guestbook, D.features.mural ? "Convidados deixam recados; vocês aprovam antes de aparecer." : "Não incluído no plano de vocês.", !D.features.mural && !v.guestbook)}
    </ul>`;
}

/* ---------------- leitura dos formulários ---------------- */
function readList(key) {
  const L = LISTS[key];
  return $$(`[data-list="${key}"] > .ed-item`).map(li => {
    const o = {};
    for (const [f, , type] of L.fields) {
      if (type === "options") { o.options = $$("[data-opt]", li).map(x => x.value); o.answer = +($("[data-answer]:checked", li)?.value || 0); continue; }
      const el = li.querySelector(`[name="${f}"]`); if (!el) continue;
      if (type === "money") o.cents = toCents(el.value); else o[f] = el.value;
    }
    return o;
  });
}
/** Valores da seção para o PATCH (ou erros de campo encontrados antes de enviar). */
function collect(sec, form) {
  const g = n => form.querySelector(`[name="${n}"]`);
  const errs = [];
  const need = (el, msg) => errs.push([el, msg]);
  if (sec === "main") {
    const names = g("names").value.trim();
    if (!/^[^&]+&[^&]+$/.test(names)) need(g("names"), "Escrevam os dois nomes separados por &.");
    if (!g("d_day").value) need(g("d_day"), "Escolham o dia.");
    if (!g("d_time").value) need(g("d_time"), "Escolham a hora.");
    if (!g("rsvp_deadline").value) need(g("rsvp_deadline"), "Escolham o prazo.");
    else if (g("d_day").value && g("rsvp_deadline").value > g("d_day").value) need(g("rsvp_deadline"), "O prazo precisa ser até o dia do casamento.");
    return { errs, data: { names, date: `${g("d_day").value}T${g("d_time").value}${g("d_tz").value}`, city: g("city").value, venue_name: g("venue_name").value, rsvp_deadline: g("rsvp_deadline").value, welcome: g("welcome").value, rsvp_note: g("rsvp_note").value } };
  }
  if (sec === "look") return { errs, data: D.theme ? {} : { universe: form.querySelector("[name=universe]:checked")?.value } };
  if (sec === "images") {
    for (const n of ["hero_image", "map_image"]) if (!imgOk(g(n).value.trim())) need(g(n), "Use um endereço que comece com https:// ou envie a foto.");
    return { errs, data: { hero_image: g("hero_image").value.trim(), map_image: g("map_image").value.trim() } };
  }
  if (sec === "music") {
    const url = g("music_url").value.trim();
    if (!spotifyOk(url)) need(g("music_url"), "Colem o link de uma música do Spotify (https://open.spotify.com/track/…).");
    return { errs, data: { music_url: url, music_label: g("music_label").value } };
  }
  if (LISTS[sec] && sec !== "gifts") {
    const items = readList(sec);
    $$(`[data-list="${sec}"] > .ed-item`).forEach((li, i) => {
      const it = items[i];
      const req = sec === "story" ? ["title"] : sec === "schedule" ? ["time", "title"] : sec === "dress" ? ["title"] : sec === "faq" ? ["q", "a"] : ["q"];
      for (const f of req) if (!String(it[f] || "").trim()) need(li.querySelector(`[name="${f}"]`), "Obrigatório.");
      if (sec === "story" && !imgOk(String(it.image || "").trim())) need(li.querySelector(`[name="image"]`), "Use https:// ou envie a foto.");
      if (sec === "quiz") {
        it.options.forEach((o, k) => { if (!o.trim()) need(li.querySelector(`[data-opt="${k}"]`), "Preencham as 4 opções."); });
        if (new Set(it.options.map(o => o.trim().toLowerCase())).size !== 4 && it.options.every(o => o.trim())) need(li.querySelector(`[data-opt="0"]`), "As 4 opções precisam ser diferentes.");
      }
    });
    if (sec === "story") items.forEach(it => { it.image = String(it.image || "").trim(); if (!it.image) delete it.image; });
    return { errs, data: sec === "quiz" ? { quiz: items, quiz_premio: g("quiz_premio").value } : { [sec]: items } };
  }
  if (sec === "gifts") {
    const items = readList("gifts");
    $$(`[data-list="gifts"] > .ed-item`).forEach((li, i) => {
      if (!items[i].title.trim()) need(li.querySelector(`[name="title"]`), "Dê um nome ao presente.");
      if (items[i].cents == null) need(li.querySelector(`[name="cents"]`), "Valor inválido. Ex.: 150 ou 1.500,00.");
    });
    items.forEach(it => { if (!it.icon) delete it.icon; if (!String(it.note || "").trim()) delete it.note; });
    const key = g("pix_key").value.trim();
    if (/\s/.test(key)) need(g("pix_key"), "A chave não pode ter espaços.");
    if (!httpsOk(g("gift_url").value.trim())) need(g("gift_url"), "Use um link que comece com https://");
    const data = { gifts: items, pix_name: g("pix_name").value, pix_city: g("pix_city").value, gift_url: g("gift_url").value.trim(), infinitepay_tag: g("infinitepay_tag").value.trim().replace(/^\$/, "") };
    if (!g("pix_key").disabled) data.pix_key = key;
    return { errs, data };
  }
  if (sec === "visibility") {
    return { errs, data: { hidden: D.hideable.filter(k => !g("show_" + k).checked), guestbook: g("guestbook").checked } };
  }
  return { errs, data: {} };
}

/* ---------------- erros e estados ---------------- */
function setErr(el, msg) {
  if (!el) return;
  el.setAttribute("aria-invalid", "true");
  const box = el.closest(".ed-f, .ed-opts")?.querySelector(".ed-ferr");
  if (box) box.textContent = msg;
}
function clearErrs(form) {
  $$("[aria-invalid]", form).forEach(el => el.removeAttribute("aria-invalid"));
  $$(".ed-ferr", form).forEach(el => { el.textContent = ""; });
  $(".ed-err", form).textContent = "";
}
/** Mensagem do servidor (“Chave Pix: …”, “História 2 · título: …”) → campo correspondente. */
function serverErr(form, msg) {
  const cands = $$("[data-lab]", form).filter(el => msg.startsWith(el.dataset.lab + ":"));
  const el = cands.sort((a, b) => b.dataset.lab.length - a.dataset.lab.length)[0];
  if (el) { setErr(el, msg.slice(el.dataset.lab.length + 1).trim()); el.focus(); }
  else {
    const it = msg.match(/^(\S+) (\d+): /);
    const li = it && $$(".ed-item", form)[+it[2] - 1];
    if (li) li.querySelector("input, textarea, select")?.focus();
  }
  $(".ed-err", form).textContent = msg;
}
const status = (form, text, kind = "") => { const s = $(".ed-status", form); s.textContent = text; s.dataset.kind = kind; };
function dirty(form, on) {
  if (on) { form.dataset.dirty = "1"; status(form, "Alterações não salvas", "dirty"); }
  else delete form.dataset.dirty;
}

/* ---------------- interação ---------------- */
function bind() {
  const root = viewEl();
  $$(".ed-sec").forEach(form => {
    form.addEventListener("input", e => { dirty(form, true); if (e.target.matches("[aria-invalid]")) { e.target.removeAttribute("aria-invalid"); const b = e.target.closest(".ed-f, .ed-opts")?.querySelector(".ed-ferr"); if (b) b.textContent = ""; } live(e.target); });
    form.addEventListener("change", e => { dirty(form, true); live(e.target); });
    form.addEventListener("submit", e => { e.preventDefault(); save(form); });
  });
  root.onclick = async e => {
    const b = e.target.closest("button, a[data-go]"); if (!b) return;
    if (b.dataset.go) { e.preventDefault(); const f = $(`#ed-${b.dataset.go}`); f.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); $(`#edh-${b.dataset.go}`).focus({ preventScroll: true }); return; }
    const form = b.closest(".ed-sec");
    if (b.dataset.qdel) return delRank(b);
    if (b.dataset.add) return addItem(b.dataset.add, form);
    if (b.dataset.mv || b.dataset.rm !== undefined) return moveItem(b, form);
    if (b.dataset.undo) return undoSec(b.dataset.undo, form);
    if (b.dataset.up) return pickUpload(b);
  };
  $$("[data-imgf] input[type=file]").forEach(inp => inp.addEventListener("change", () => doUpload(inp)));
  $$("[data-imgf] img").forEach(img => { img.onerror = () => { img.closest(".ed-prev").hidden = true; }; });
  $$("[data-img]").forEach(live);
  live($(`[name="d_day"]`));
}
/** Atualizações ao vivo: prévia de ícone, foto, data por extenso, título do item. */
function live(el) {
  if (!el) return;
  if (el.name === "icon") { const p = el.closest(".ed-icrow")?.querySelector(".ed-icp"); if (p) p.innerHTML = el.value ? icon(el.value) : ""; }
  if (el.matches("[data-img]")) {
    const wrap = el.closest("[data-imgf]"), v = el.value.trim(), fig = $(".ed-prev", wrap), note = $(".ed-imgnote", wrap);
    if (v && imgOk(v)) { const img = $("img", fig); if (img.getAttribute("src") !== v) img.src = v; fig.hidden = false; } else fig.hidden = true;
    note.textContent = v && foreign(v) ? "Atenção: fotos de outros sites podem ser bloqueadas no site por segurança. Prefiram enviar a foto." : "";
  }
  if (["d_day", "d_time", "d_tz"].includes(el.name)) {
    const f = el.form, d = f.d_day.value, t = f.d_time.value || "00:00", p = $(".ed-whenp", f);
    p.textContent = d ? `No site: ${longDate(`${d}T${t}:00${f.d_tz.value}`)}, às ${t.replace(":", "h")} (horário de Brasília no site).` : "";
  }
  if (["title", "q"].includes(el.name)) { const s = el.closest(".ed-item")?.querySelector("legend .ed-it"); if (s) s.textContent = el.value; }
}
/** Redesenha a lista a partir do que está na tela (preserva o que foi digitado). */
function redrawList(key, items, focusSel) {
  const ol = $(`[data-list="${key}"]`);
  ol.innerHTML = items.map((it, i) => itemHtml(key, it, i, items.length)).join("");
  $(`[data-empty="${key}"]`).hidden = items.length > 0;
  $(`[data-count="${key}"]`).textContent = `${items.length} de ${D.limits[key]}`;
  $(`[data-add="${key}"]`).disabled = items.length >= D.limits[key];
  $$("input[type=file]", ol).forEach(inp => inp.addEventListener("change", () => doUpload(inp)));
  $$("[data-imgf] img", ol).forEach(img => { img.onerror = () => { img.closest(".ed-prev").hidden = true; }; });
  $$("[data-img]", ol).forEach(live);
  if (focusSel) (typeof focusSel === "function" ? focusSel(ol) : $(focusSel, ol))?.focus();
}
function rawItems(key) {
  // como readList, mas mantém o texto do valor (para não perder "12,5" digitado errado ao reordenar)
  return readList(key).map((it, i) => key === "gifts" ? { ...it, cents: it.cents ?? 0, _raw: $$(`[data-list="gifts"] > .ed-item`)[i].querySelector("[name=cents]").value } : it);
}
function addItem(key, form) {
  const items = rawItems(key);
  if (items.length >= D.limits[key]) return;
  items.push(structuredClone(LISTS[key].blank));
  redrawList(key, items, ol => ol.lastElementChild.querySelector("input, textarea"));
  restoreRaw(key, items);
  dirty(form, true);
}
function moveItem(b, form) {
  const li = b.closest(".ed-item"), key = li.parentElement.dataset.list, i = +li.dataset.i;
  const items = rawItems(key);
  if (b.dataset.rm !== undefined) {
    const t = items[i].title || items[i].q || "";
    if (!confirm(`Apagar ${LISTS[key].item.toLowerCase()} ${i + 1}${t ? ` “${t}”` : ""}?`)) return;
    items.splice(i, 1);
    redrawList(key, items, ol => ol.children[Math.min(i, items.length - 1)]?.querySelector("[data-rm]") || $(`[data-add="${key}"]`));
    status(form, `${LISTS[key].item} apagado. Salvem para publicar.`, "dirty");
  } else {
    const j = i + +b.dataset.mv; if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    const dir = b.dataset.mv;
    redrawList(key, items, ol => { const btn = ol.children[j].querySelector(`[data-mv="${dir}"]`); return btn.disabled ? ol.children[j].querySelector(`[data-mv="${-dir}"]`) : btn; });
    status(form, `${LISTS[key].item} movido para a posição ${j + 1}. Salvem para publicar.`, "dirty");
  }
  restoreRaw(key, items);
  form.dataset.dirty = "1";
}
function restoreRaw(key, items) {
  if (key !== "gifts") return;
  $$(`[data-list="gifts"] > .ed-item`).forEach((li, i) => { if (items[i]?._raw != null) li.querySelector("[name=cents]").value = items[i]._raw; });
}

async function save(form) {
  const sec = form.dataset.sec, btn = $("button[type=submit]", form);
  clearErrs(form);
  const { errs, data } = collect(sec, form);
  if (errs.length) {
    errs.forEach(([el, m]) => setErr(el, m));
    $(".ed-err", form).textContent = errs.length === 1 ? "Confiram o campo marcado." : `Confiram os ${errs.length} campos marcados.`;
    errs[0][0]?.focus();
    status(form, "");
    return;
  }
  if (!Object.keys(data).length) return status(form, "Nada para salvar aqui.");
  btn.disabled = true; status(form, "Salvando…", "saving"); form.setAttribute("aria-busy", "true");
  try {
    const r = await api("/api/admin/site", { method: "PATCH", body: data });
    D.values = r.values; if (r.history) D.history = r.history;
    if (sec === "music") form.querySelector("[name=music_url]").value = r.values.music_url; // mostra o link já normalizado
    dirty(form, false);
    status(form, r.changed.length ? SAVED_MSG : "Nada mudou desde o último salvamento.", "saved");
    afterChange();
  } catch (x) {
    status(form, "Não foi salvo.", "error");
    serverErr(form, x.message);
    if (x.status === 401) location.reload();
  } finally { btn.disabled = false; form.removeAttribute("aria-busy"); }
}
async function undoSec(sec, form) {
  if (form.dataset.dirty && !confirm("Há alterações não salvas nesta seção. Desfazer mesmo assim? Elas serão perdidas.")) return;
  if (!confirm(`Desfazer a última alteração salva em “${SECTION_NAMES[sec]}”?`)) return;
  status(form, "Desfazendo…", "saving");
  try {
    const r = await api("/api/admin/site/undo", { method: "POST", body: { section: sec } });
    D.values = r.values; D.history = r.history;
    const scroll = scrollY;
    render();
    scrollTo(0, scroll);
    const f = $(`#ed-${sec}`);
    status(f, "Alteração desfeita. Pode levar até 1 minuto para aparecer no site.", "saved");
    $(`#edh-${sec}`).focus({ preventScroll: true });
  } catch (x) { status(form, "", ""); $(".ed-err", form).textContent = x.message; }
}
/** Depois de salvar: histórico, botões de desfazer e avisos de seção escondida. */
function afterChange() {
  if (!D.theme) document.documentElement.dataset.universe = D.values.universe; // o painel acompanha o universo do site
  $("#edHist").innerHTML = histHtml();
  $$("[data-undo]").forEach(b => { b.hidden = !D.history.undoable.includes(b.dataset.undo); });
  for (const k of D.hideable) {
    const h = D.values.hidden.includes(k);
    const n = $(`[data-hidnote="${k}"]`); if (n) n.hidden = !h;
    const t = $(`[data-offtag="${k}"]`); if (t) t.hidden = !h;
  }
}

/* ---------------- envio de fotos (quando o módulo de mídia existir) ---------------- */
function pickUpload(b) { $(`#${b.dataset.up}`)?.click(); }
async function doUpload(inp) {
  const file = inp.files?.[0]; if (!file || !upload) return;
  const wrap = inp.closest("[data-imgf]"), note = $(".ed-imgnote", wrap), btn = $("[data-up]", wrap), url = $("[data-img]", wrap);
  if (!file.type.startsWith("image/")) { note.textContent = "Escolham um arquivo de imagem (JPG, PNG ou WebP)."; return; }
  btn.disabled = true; note.textContent = "Enviando a foto…";
  try {
    const r = await upload(file, { public: true, maxSide: 2000 });
    url.value = r.url; live(url); dirty(inp.closest(".ed-sec"), true);
    note.textContent = "Foto enviada. Salvem a seção para publicar.";
  } catch (x) { note.textContent = "Não foi possível enviar: " + (x.message || "tente de novo."); }
  finally { btn.disabled = false; inp.value = ""; }
}

addEventListener("beforeunload", e => { if (document.querySelector(".ed-sec[data-dirty]")) { e.preventDefault(); e.returnValue = ""; } });
