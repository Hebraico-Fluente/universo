/** Painel · Fotos e memórias (módulo "midia"): moderação, galeria, telão, cápsula do tempo, memórias, legado e exportação. */
import { $, $$, esc, api } from "../ui.js";
import { viewEl, fail, css, state } from "./core.js";
import { uploadImage, uploadFile } from "../upload.js";

const TABS = [["moderacao", "Moderação"], ["galeria", "Galeria"], ["telao", "Telão ao vivo"], ["capsula", "Cápsula do tempo"], ["memorias", "Memórias"], ["legado", "Legado"], ["exportar", "Exportar"]];
const MEMORY_KINDS = [["vow", "Votos"], ["speech", "Discurso"], ["other", "Outra lembrança"]];
const LEGACY_KINDS = [["letter", "Carta"], ["vow", "Votos"], ["audio", "Áudio"], ["tradition", "Tradição de família"], ["other", "Outro"]];
let tab = "moderacao", D = null, freshLink = null;

const MB = 1024 * 1024;
const mb = n => (n / MB).toLocaleString("pt-BR", { maximumFractionDigits: n < 10 * MB ? 1 : 0 }) + " MB";
const when = s => new Date(String(s).replace(" ", "T") + (String(s).includes("Z") || String(s).includes("+") ? "" : "Z")).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const day = d => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(String(d).slice(0, 10) + "T12:00:00Z"));
const isOwner = () => state.me?.role === "owner";
const paras = t => String(t || "").split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
const say = (el, msg, bad = false) => { if (!el) return; el.textContent = msg; el.classList.toggle("error", bad); };

export default async function fotos() {
  css("/assets/painel/fotos.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try { D = await api("/api/admin/fotos"); } catch (e) { return fail(e); }
  draw();
}
async function reload() { D = await api("/api/admin/fotos"); draw(); }

function draw() {
  const pend = D.photos.filter(p => p.status === "pending").length;
  viewEl().innerHTML = `
    <header class="vh"><div><p class="label">Fotos e memórias</p><h1>${pend ? `${pend} ${pend > 1 ? "fotos esperando" : "foto esperando"} aprovação` : "Fotos, telão e lembranças"}</h1></div></header>
    <nav class="ft-tabs" aria-label="Partes de fotos e memórias">${TABS.map(([id, l]) => `<button type="button" data-tab="${id}" aria-pressed="${id === tab}">${l}${id === "moderacao" && pend ? ` <span class="ft-badge num">${pend}</span>` : ""}</button>`).join("")}</nav>
    <div id="ftPane" class="ft-pane"></div>`;
  $$(".ft-tabs [data-tab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; freshLink = tab === "telao" ? freshLink : null; draw(); }));
  $(".ft-tabs [aria-pressed=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  const pane = $("#ftPane");
  ({ moderacao, galeria, telao, capsula, memorias, legado, exportar })[tab](pane).catch(e => { pane.innerHTML = `<p class="error">${esc(e.message)}</p>`; });
}

/* ---------------- moderação ---------------- */
async function moderacao(el) {
  const s = D.settings, f = D.features;
  const pend = D.photos.filter(p => p.status === "pending");
  const sw = (k, label, hint, off) => `<label class="ft-switch${off ? " is-off" : ""}"><input type="checkbox" data-set="${k}"${s[k] ? " checked" : ""}${off ? " disabled" : ""}><span class="ft-track" aria-hidden="true"></span><span><b>${label}</b><small>${off ? "Não incluído no plano deste casamento." : hint}</small></span></label>`;
  el.innerHTML = `
    <section class="panel ft-site"><h2>No site</h2>
      <div class="ft-switches">
        ${sw("gallery_on", "Galeria de fotos", "Mostra as fotos aprovadas, organizadas por momento.", !f.galeria)}
        ${sw("uploads_on", "Convidados podem enviar fotos", "Cada foto espera a aprovação de vocês antes de aparecer.", !f.galeria)}
        ${sw("capsule_on", "Cápsula do tempo", "Mensagens lacradas até o 1º, 5º ou 10º aniversário.", !f.capsula)}
      </div><p class="ft-msg small muted" id="setMsg" role="status"></p></section>
    <section class="ft-mod">
      <div class="ft-mod-h"><h2>Esperando aprovação</h2>${pend.length ? `<div class="ft-bulk" role="group" aria-label="Ações em lote">
        <label class="ft-all"><input type="checkbox" id="selAll"> Selecionar todas</label>
        <button class="btn sm" type="button" data-bulk="approve" disabled>Aprovar selecionadas</button>
        <button class="btn ghost sm" type="button" data-bulk="delete" disabled>Apagar selecionadas</button></div>` : ""}</div>
      <p class="ft-msg small" id="modMsg" role="status"></p>
      ${pend.length ? `<ul class="ft-grid">${pend.map(p => `<li class="ft-card">
          <label class="ft-pick"><input type="checkbox" data-sel="${esc(p.id)}" aria-label="Selecionar foto enviada por ${esc(p.author || "convidado sem nome")}"><img src="${esc(p.url)}" alt="Foto enviada por ${esc(p.author || "um convidado")}" loading="lazy"></label>
          <div class="ft-meta"><b>${esc(p.author || "Sem nome")}</b><span class="small muted">${esc(when(p.created_at))}</span></div>
          <div class="row-btns"><button class="btn sm" type="button" data-one="approve" data-id="${esc(p.id)}">Aprovar</button><button class="link small danger" type="button" data-one="delete" data-id="${esc(p.id)}">Apagar</button></div>
        </li>`).join("")}</ul>` : `<p class="ft-empty muted">Nada esperando aprovação. ${s.uploads_on ? "Quando um convidado mandar uma foto pelo site, ela aparece aqui." : "Ligue “Convidados podem enviar fotos” para receber fotos pelo site."}</p>`}
    </section>`;
  $$("[data-set]", el).forEach(i => i.addEventListener("change", async () => {
    try { const r = await api("/api/admin/midia/ajustes", { method: "PATCH", body: { [i.dataset.set]: i.checked } }); D.settings = r.settings; say($("#setMsg"), "Salvo. O site atualiza em até um minuto."); }
    catch (e) { i.checked = !i.checked; say($("#setMsg"), e.message, true); }
  }));
  const picks = () => $$("[data-sel]:checked", el).map(i => i.dataset.sel);
  const sync = () => { const n = picks().length; $$("[data-bulk]", el).forEach(b => { b.disabled = !n; b.textContent = (b.dataset.bulk === "approve" ? "Aprovar" : "Apagar") + (n ? ` (${n})` : " selecionadas"); }); };
  $$("[data-sel]", el).forEach(i => i.addEventListener("change", () => { i.closest(".ft-card").classList.toggle("is-sel", i.checked); sync(); }));
  $("#selAll", el)?.addEventListener("change", e => { $$("[data-sel]", el).forEach(i => { i.checked = e.target.checked; i.closest(".ft-card").classList.toggle("is-sel", i.checked); }); sync(); });
  const run = async (action, ids) => {
    if (!ids.length) return;
    if (action === "delete" && !confirm(ids.length > 1 ? `Apagar ${ids.length} fotos? Não dá para desfazer.` : "Apagar esta foto? Não dá para desfazer.")) return;
    try { await api("/api/admin/fotos/lote", { method: "POST", body: { ids, action } }); await reload(); }
    catch (e) { say($("#modMsg"), e.message, true); }
  };
  $$("[data-bulk]", el).forEach(b => b.addEventListener("click", () => run(b.dataset.bulk, picks())));
  $$("[data-one]", el).forEach(b => b.addEventListener("click", () => run(b.dataset.one, [b.dataset.id])));
}

/* ---------------- galeria ---------------- */
async function galeria(el) {
  const ok = D.photos.filter(p => p.status === "approved");
  const opts = sel => D.moments.map(m => `<option value="${esc(m.key)}"${m.key === sel ? " selected" : ""}>${esc(m.label)}</option>`).join("");
  const groups = D.moments.map(m => ({ ...m, list: ok.filter(p => p.moment === m.key) })).filter(g => g.list.length);
  el.innerHTML = `
    <form class="panel ft-up" id="upForm" novalidate><h2>Adicionar fotos</h2>
      <div class="ft-up-row">
        <label class="field"><span>Fotos</span><input class="in" type="file" name="files" accept="image/jpeg,image/png,image/webp,image/*" multiple required></label>
        <label class="field"><span>Momento</span><select class="in" name="moment">${opts("festa")}</select></label>
        <button class="btn" type="submit">Enviar</button>
      </div>
      <p class="hint">As fotos são reduzidas no navegador (até 2000 px) antes de subir. As de vocês já entram aprovadas.</p>
      <p class="ft-msg small" id="upMsg" role="status" aria-live="polite"></p>
    </form>
    <p class="small muted ft-usage">Espaço usado: ${mb(D.storage.used)} de ${mb(D.storage.quota)} · ${D.storage.mode === "r2" ? "armazenamento de arquivos (R2)" : "guardado no banco de dados (sem R2: limite de 8 MB por arquivo)"}</p>
    ${groups.length ? groups.map(g => `<section class="ft-group"><h3>${esc(g.label)} <span class="muted num">${g.list.length}</span></h3><ul class="ft-grid">${g.list.map(p => `<li class="ft-card">
        <img src="${esc(p.url)}" alt="${esc(p.caption || "Foto de " + g.label)}" loading="lazy">
        <div class="ft-meta"><span class="small muted">${p.source === "guest" ? `Enviada por ${esc(p.author || "convidado")}` : "De vocês"}</span></div>
        <div class="ft-edit"><label class="sr" for="mo-${esc(p.id)}">Momento</label><select class="in sm" id="mo-${esc(p.id)}" data-moment="${esc(p.id)}">${opts(p.moment)}</select>
          <button class="link small danger" type="button" data-del="${esc(p.id)}">Apagar</button></div>
      </li>`).join("")}</ul></section>`).join("") : `<p class="ft-empty muted">Ainda não há fotos aprovadas.</p>`}`;
  $("#upForm", el).addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, files = [...f.files.files], msg = $("#upMsg"), btn = f.querySelector("button");
    if (!files.length) return say(msg, "Escolha pelo menos uma foto.", true);
    btn.disabled = true; let done = 0;
    for (const [i, file] of files.entries()) {
      say(msg, `Enviando ${i + 1} de ${files.length}…`);
      try { const m = await uploadImage(file, { kind: "gallery" }); await api("/api/admin/fotos", { method: "POST", body: { media_id: m.id, moment: f.moment.value } }); done++; }
      catch (x) { say(msg, `${file.name}: ${x.message}`, true); }
    }
    btn.disabled = false;
    if (done) { await reload(); say($("#upMsg"), `${done} ${done > 1 ? "fotos adicionadas" : "foto adicionada"}.`); }
  });
  $$("[data-moment]", el).forEach(s => s.addEventListener("change", async () => {
    try { await api(`/api/admin/fotos/${s.dataset.moment}`, { method: "PATCH", body: { moment: s.value } }); const p = D.photos.find(x => x.id === s.dataset.moment); if (p) p.moment = s.value; galeria(el); }
    catch (x) { alert(x.message); }
  }));
  $$("[data-del]", el).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Apagar esta foto da galeria? Não dá para desfazer.")) return;
    try { await api(`/api/admin/fotos/${b.dataset.del}`, { method: "DELETE" }); await reload(); } catch (x) { alert(x.message); }
  }));
}

/* ---------------- telão ---------------- */
async function telao(el) {
  const w = D.wall;
  el.innerHTML = `
    <div class="split ft-split">
      <section class="panel"><h2>Telão ao vivo</h2>
        <p>Abra o link do telão no computador ligado à TV ou ao projetor. Ele mostra, em loop e em tela cheia, as fotos e os recados que vocês aprovaram, e busca novidades a cada 20 segundos.</p>
        <p class="ft-state">${w.active ? `<span class="tag yes">Link ativo</span> <span class="small muted">gerado em ${esc(when(w.created_at))}</span>` : `<span class="tag no">Nenhum link ativo</span>`}</p>
        ${freshLink ? `<div class="panel linkbox ft-link"><p class="label">Link do telão · aparece só agora</p><p class="url"><code>${esc(freshLink)}</code></p>
          <div class="row-btns"><button class="btn sm" type="button" id="cpLink">Copiar link</button><a class="btn ghost sm" href="${esc(freshLink)}" target="_blank" rel="noopener noreferrer">Abrir o telão</a></div>
          <p class="small muted">Guarde agora: por segurança, o link não fica salvo. Se perder, gere outro.</p></div>` : ""}
        <div class="row-btns"><button class="btn${w.active ? " ghost" : ""}" type="button" id="newWall">${w.active ? "Gerar link novo" : "Gerar link do telão"}</button>
          ${w.active ? `<button class="link danger" type="button" id="offWall">Desligar o telão</button>` : ""}</div>
        ${w.active ? `<p class="small muted ft-gap">Gerar um link novo desliga o anterior.</p>` : ""}
        <p class="ft-msg small" id="wallMsg" role="status"></p>
      </section>
      <section class="panel"><h2>Na hora da festa</h2>
        <ul class="ft-tips">
          <li>No telão, aperte <kbd>F</kbd> para tela cheia, <kbd>espaço</kbd> para pausar e as setas para navegar.</li>
          <li>O QR Code no canto leva os convidados ao site, onde eles mandam fotos e recados.</li>
          <li>Nada aparece sem a aprovação de vocês. Deixe alguém de confiança com o painel aberto no celular, na aba Moderação.</li>
          <li>O telão não toca som e respeita quem prefere menos movimento na tela.</li>
          ${!D.settings.uploads_on ? `<li><b>O envio de fotos pelo site está desligado.</b> Ligue em Moderação.</li>` : ""}
        </ul></section>
    </div>`;
  $("#newWall", el).addEventListener("click", async () => {
    if (D.wall.active && !confirm("Gerar um link novo? O link atual para de funcionar na hora.")) return;
    try { freshLink = (await api("/api/admin/telao", { method: "POST" })).link; D.wall = { active: true, created_at: new Date().toISOString() }; telao(el); }
    catch (x) { say($("#wallMsg"), x.message, true); }
  });
  $("#offWall", el)?.addEventListener("click", async () => {
    if (!confirm("Desligar o telão? O link para de funcionar na hora.")) return;
    try { await api("/api/admin/telao", { method: "DELETE" }); freshLink = null; D.wall = { active: false }; telao(el); } catch (x) { say($("#wallMsg"), x.message, true); }
  });
  $("#cpLink", el)?.addEventListener("click", async e => { try { await navigator.clipboard.writeText(freshLink); e.target.textContent = "Copiado!"; } catch { e.target.textContent = "Selecione e copie o link acima"; } });
}

/* ---------------- cápsula ---------------- */
async function capsula(el) {
  el.innerHTML = `<p class="muted">Carregando…</p>`;
  const c = await api("/api/admin/capsulas");
  const total = c.years.reduce((s, y) => s + y.total, 0);
  el.innerHTML = `
    <section class="ft-caps">${c.years.map(y => `<article class="ft-cap${y.sealed ? " sealed" : ""}">
      <p class="label">${y.years}º aniversário</p><p class="ft-cap-d">${esc(day(y.opens))}</p>
      <p class="ft-cap-n num">${y.total}<span> ${y.total === 1 ? "cápsula" : "cápsulas"}</span></p>
      <p class="small muted">${y.sealed ? `${y.sealed} ${y.sealed > 1 ? "lacradas" : "lacrada"}${y.opened ? ` · ${y.opened} ${y.opened > 1 ? "abertas" : "aberta"}` : ""}` : y.total ? (y.total > 1 ? "todas abertas" : "aberta") : "nenhuma ainda"}</p></article>`).join("")}</section>
    <section class="panel ft-policy"><h2>Como funciona</h2>
      <p>Convidados deixam mensagens (e, se quiserem, uma foto ou um áudio curto) pelo site, na seção Cápsula do tempo. Cada cápsula fica <b>lacrada até a data escolhida</b>: nem vocês conseguem ler antes. Aqui aparece só quantas existem.</p>
      <p>No dia, a rotina diária abre as cápsulas daquele aniversário e elas aparecem abaixo, só para vocês dois.</p>
      <p class="small muted">Guarda: o conteúdo fica guardado enquanto a conta do casamento existir. Depois de abertas, vocês podem exportar tudo (aba Exportar). O lacre é do sistema, não é criptografia: a equipe técnica do serviço tem acesso ao banco de dados, como em qualquer serviço online.</p>
      ${!D.settings.capsule_on ? `<p class="small"><b>A cápsula está desligada no site.</b> Ligue em Moderação.</p>` : ""}
    </section>
    ${!c.can_read ? `<p class="muted">Só os noivos leem as cápsulas abertas.</p>` : c.opened.length ? `<h2 class="ft-h2">Cápsulas abertas</h2><ul class="ft-opened">${c.opened.map(o => `<li class="ft-letter">
      <p class="label">${o.years}º aniversário · aberta em ${esc(when(o.opened_at))}</p>
      <div class="ft-letter-b">${paras(o.message)}</div>
      ${o.media ? (o.media.type.startsWith("audio/") ? `<audio controls preload="none" src="${esc(o.media.url)}" aria-label="Áudio de ${esc(o.author)}"></audio>` : `<img src="${esc(o.media.url)}" alt="Foto deixada por ${esc(o.author)}" loading="lazy">`) : ""}
      <p class="ft-sign">${esc(o.author)} <span class="small muted">· escrita em ${esc(when(o.created_at))}</span></p>
      <button class="link small danger" type="button" data-cdel="${esc(o.id)}">Apagar</button></li>`).join("")}</ul>` : total ? `<p class="ft-empty muted">Nenhuma cápsula aberta ainda. A primeira data é ${esc(day(c.years.find(y => y.sealed)?.opens || c.years[0].opens))}.</p>` : ""}`;
  $$("[data-cdel]", el).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Apagar esta cápsula aberta? Exporte antes se quiser guardar.")) return;
    try { await api(`/api/admin/capsulas/${b.dataset.cdel}`, { method: "DELETE" }); capsula(el); } catch (x) { alert(x.message); }
  }));
}

/* ---------------- memórias (site depois do casamento) ---------------- */
async function memorias(el) {
  el.innerHTML = `<p class="muted">Carregando…</p>`;
  const items = (await api("/api/admin/lembrancas?area=memory")).items;
  const s = D.settings, w = D.wedding;
  const row = (t = {}) => `<div class="ft-tl-row"><input class="in" name="tt" maxlength="12" placeholder="16h30" aria-label="Horário" value="${esc(t.time || "")}"><input class="in" name="ti" maxlength="80" placeholder="Cerimônia no jardim" aria-label="Momento" value="${esc(t.title || "")}"><input class="in" name="tx" maxlength="300" placeholder="Detalhe (opcional)" aria-label="Detalhe" value="${esc(t.text || "")}"><button class="link small danger" type="button" data-rm aria-label="Remover momento">Remover</button></div>`;
  el.innerHTML = `
    <form class="panel ft-mem" id="memForm" novalidate><h2>Site de memórias</h2>
      <p class="muted">${w.after ? "O casamento já aconteceu." : `Vale a partir do dia seguinte ao casamento (${esc(day(w.date))}). Até lá, o site continua como está.`} Com as memórias ligadas, o site mostra a galeria por momento, os votos e discursos, a playlist e a linha do tempo do grande dia, e esconde a confirmação de presença.</p>
      <div class="ft-switches">
        <label class="ft-switch"><input type="checkbox" name="memories_on"${s.memories_on ? " checked" : ""}><span class="ft-track" aria-hidden="true"></span><span><b>Transformar o site em memórias</b><small>Depois da data do casamento.</small></span></label>
        <label class="ft-switch"><input type="checkbox" name="anniversary_on"${s.anniversary_on ? " checked" : ""}><span class="ft-track" aria-hidden="true"></span><span><b>Modo aniversário</b><small>No dia do aniversário de casamento, o site abre com uma retrospectiva (“há N anos”).</small></span></label>
      </div>
      <label class="field"><span>Playlist da festa (link)</span><input class="in" name="playlist_url" type="url" inputmode="url" placeholder="https://open.spotify.com/…" value="${esc(s.playlist_url)}"></label>
      <fieldset class="field"><legend><span>Linha do tempo do grande dia</span></legend><div id="tlRows">${(s.timeline.length ? s.timeline : [{}]).map(row).join("")}</div>
        <button class="link small" type="button" id="tlAdd">+ Adicionar momento</button></fieldset>
      <label class="field"><span>Convite para renovação de votos (opcional, aparece no aniversário)</span><textarea class="in" name="renewal_text" rows="3" maxlength="800">${esc(s.renewal_text)}</textarea></label>
      <p class="ft-msg small" id="memMsg" role="status"></p>
      <button class="btn" type="submit">Salvar</button>
    </form>
    ${keepsakeBlock("memory", items, "Votos e discursos", "Textos, áudios ou vídeos que aparecem no site de memórias. Escreva o texto junto do áudio ou vídeo: ele serve de legenda para quem não pode ouvir.")}`;
  $("#tlAdd", el).addEventListener("click", () => $("#tlRows", el).insertAdjacentHTML("beforeend", row()));
  $("#tlRows", el).addEventListener("click", e => { if (e.target.closest("[data-rm]")) e.target.closest(".ft-tl-row").remove(); });
  $("#memForm", el).addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target;
    const timeline = $$(".ft-tl-row", f).map(r => ({ time: r.querySelector("[name=tt]").value, title: r.querySelector("[name=ti]").value, text: r.querySelector("[name=tx]").value })).filter(t => t.title.trim() || t.time.trim());
    try {
      const r = await api("/api/admin/midia/ajustes", { method: "PATCH", body: { memories_on: f.memories_on.checked, anniversary_on: f.anniversary_on.checked, playlist_url: f.playlist_url.value, renewal_text: f.renewal_text.value, timeline } });
      D.settings = r.settings; say($("#memMsg"), "Salvo.");
    } catch (x) { say($("#memMsg"), x.message, true); }
  });
  bindKeepsakes(el, "memory", () => memorias(el));
}

/* ---------------- legado ---------------- */
async function legado(el) {
  if (!isOwner()) { el.innerHTML = `<section class="panel"><h2>Legado</h2><p class="muted">O legado é só dos noivos. Entre com o acesso de um dos dois para ver.</p></section>`; return; }
  el.innerHTML = `<p class="muted">Carregando…</p>`;
  const items = (await api("/api/admin/lembrancas?area=legacy")).items;
  el.innerHTML = `<section class="ft-legacy-h"><p class="ft-lock">Só vocês dois veem esta área. Nem cerimonial, nem convidados, nem o site.</p></section>
    ${keepsakeBlock("legacy", items, "Legado", "Cartas, votos, áudios e tradições de família para guardar. Um lugar para o que vocês querem que dure.")}`;
  bindKeepsakes(el, "legacy", () => legado(el));
}

/* ---------------- lembranças (memórias e legado) ---------------- */
function keepsakeBlock(area, items, title, intro) {
  const kinds = area === "memory" ? MEMORY_KINDS : LEGACY_KINDS;
  const label = k => kinds.find(x => x[0] === k)?.[1] || "Outro";
  return `<section class="ft-keep"><div class="ft-keep-h"><h2 class="ft-h2">${esc(title)}</h2><p class="muted">${esc(intro)}</p></div>
    <form class="panel ft-kform" id="kForm" novalidate>
      <div class="grid2"><label class="field"><span>Tipo</span><select class="in" name="kind">${kinds.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <label class="field"><span>Título</span><input class="in" name="title" maxlength="120" required placeholder="${area === "memory" ? "Os votos do Rafael" : "Carta para o nosso 10º aniversário"}"></label></div>
      <label class="field"><span>Texto</span><textarea class="in" name="body" rows="5" maxlength="20000"></textarea></label>
      <label class="field"><span>Arquivo (opcional): áudio, vídeo MP4${D.storage.mode === "d1" ? " até 8 MB" : ""}, foto ou PDF</span><input class="in" type="file" name="file" accept="audio/*,video/mp4,image/*,application/pdf"></label>
      <p class="ft-msg small" id="kMsg" role="status"></p>
      <button class="btn" type="submit">Guardar</button>
    </form>
    ${items.length ? `<ul class="ft-keeps">${items.map(k => `<li class="ft-keepi"><p class="label">${esc(label(k.kind))}</p><h3>${esc(k.title)}</h3>
      ${k.media ? (k.media.type.startsWith("audio/") ? `<audio controls preload="none" src="${esc(k.media.url)}" aria-label="Áudio: ${esc(k.title)}"></audio>` : k.media.type.startsWith("video/") ? `<video controls preload="metadata" playsinline src="${esc(k.media.url)}" aria-label="Vídeo: ${esc(k.title)}"></video>` : k.media.type.startsWith("image/") ? `<img src="${esc(k.media.url)}" alt="${esc(k.title)}" loading="lazy">` : `<a class="link" href="${esc(k.media.url)}">Baixar ${esc(k.media.name)}</a>`) : ""}
      ${k.body ? `<details class="ft-more"${k.body.length < 300 ? " open" : ""}><summary>Texto</summary>${paras(k.body)}</details>` : ""}
      <button class="link small danger" type="button" data-kdel="${esc(k.id)}">Apagar</button></li>`).join("")}</ul>` : `<p class="ft-empty muted">Nada guardado ainda.</p>`}
  </section>`;
}
function bindKeepsakes(el, area, redraw) {
  $("#kForm", el).addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, msg = $("#kMsg", el), btn = f.querySelector("button[type=submit]");
    if (f.title.value.trim().length < 2) return say(msg, "Dê um título.", true);
    btn.disabled = true;
    try {
      let media_id = null;
      const file = f.file.files[0];
      if (file) { say(msg, "Enviando o arquivo…"); media_id = (file.type.startsWith("image/") ? await uploadImage(file, { kind: area }) : await uploadFile(file, { kind: area })).id; }
      await api("/api/admin/lembrancas", { method: "POST", body: { area, kind: f.kind.value, title: f.title.value, body: f.body.value, media_id } });
      redraw();
    } catch (x) { say(msg, x.message, true); btn.disabled = false; }
  });
  $$("[data-kdel]", el).forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Apagar este item e o arquivo dele? Não dá para desfazer.")) return;
    try { await api(`/api/admin/lembrancas/${b.dataset.kdel}`, { method: "DELETE" }); redraw(); } catch (x) { alert(x.message); }
  }));
}

/* ---------------- exportar ---------------- */
async function exportar(el) {
  el.innerHTML = `
    <section class="panel ft-exp"><h2>Levar tudo com vocês</h2>
      <p>Baixe um arquivo <b>.zip</b> com todas as fotos, áudios, vídeos e documentos, separados em pastas (galeria por momento, memórias${isOwner() ? ", legado, cápsulas abertas" : ""}), mais os textos e uma planilha de dados (<code>dados.json</code>).</p>
      <ul class="ft-tips small">
        <li>O .zip é montado aqui no navegador, sem compressão (fotos e áudios já vêm comprimidos). Com muitos arquivos, pode levar alguns minutos: deixe esta aba aberta.</li>
        <li>Cápsulas ainda lacradas não entram: elas só podem ser exportadas depois da data de abertura.</li>
        ${isOwner() ? "" : "<li>O legado e as cápsulas só entram quando um dos noivos exporta.</li>"}
      </ul>
      <div class="row-btns"><button class="btn" type="button" id="zipBtn">Baixar tudo (.zip)</button><button class="btn ghost" type="button" id="jsonBtn">Só a lista (JSON)</button></div>
      <progress id="zipBar" max="1" value="0" hidden></progress>
      <p class="ft-msg small" id="zipMsg" role="status" aria-live="polite"></p>
    </section>`;
  $("#jsonBtn", el).addEventListener("click", async () => {
    try { const m = await api("/api/admin/midia/export"); download(new Blob([JSON.stringify(m, null, 2)], { type: "application/json" }), `midia-${m.wedding.slug}.json`); }
    catch (x) { say($("#zipMsg"), x.message, true); }
  });
  $("#zipBtn", el).addEventListener("click", async e => {
    const btn = e.target, msg = $("#zipMsg"), bar = $("#zipBar");
    btn.disabled = true;
    try {
      const m = await api("/api/admin/midia/export");
      const total = m.files.reduce((s, f) => s + f.size, 0);
      if (total > 1500 * MB && !confirm(`São ${mb(total)} de arquivos. O navegador pode ficar lento. Continuar?`)) { btn.disabled = false; return; }
      const names = new Set(), entries = [];
      const uniq = p => { let n = p, i = 2; while (names.has(n)) n = p.replace(/(\.[^./]+)?$/, ` (${i++})$1`); names.add(n); return n; };
      const clean = s => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80) || "sem-nome";
      const moment = Object.fromEntries(D.moments.map(x => [x.key, x.label]));
      const where = {};
      for (const g of m.gallery) where[g.media_id] = `galeria/${clean(moment[g.moment] || g.moment)}`;
      for (const k of m.memories) if (k.media_id) where[k.media_id] = "memorias";
      for (const k of m.legacy) if (k.media_id) where[k.media_id] = "legado";
      for (const c of m.capsules.opened) if (c.media_id) where[c.media_id] = "capsulas";
      const folder = f => where[f.id] || ({ site: "site", gallery: "galeria", memory: "memorias", legacy: "legado", capsule: "capsulas" }[f.kind] || "arquivos");
      bar.hidden = false;
      const path = {};
      for (const [i, f] of m.files.entries()) {
        say(msg, `Baixando ${i + 1} de ${m.files.length} arquivos…`); bar.value = i / Math.max(1, m.files.length);
        const r = await fetch(f.url, { credentials: "same-origin" });
        if (!r.ok) throw new Error(`Não deu para baixar ${f.name}. Tente de novo.`);
        path[f.id] = uniq(`${folder(f)}/${clean(f.name)}`);
        entries.push({ name: path[f.id], data: new Uint8Array(await r.arrayBuffer()), date: f.created_at });
      }
      const txt = (name, s) => entries.push({ name: uniq(name), data: new TextEncoder().encode(s) });
      for (const k of m.memories) txt(`memorias/${clean(k.title)}.txt`, `${k.title}\n\n${k.body || ""}${k.media_id ? `\n\nArquivo: ${path[k.media_id] || ""}` : ""}\n`);
      for (const k of m.legacy) txt(`legado/${clean(k.title)}.txt`, `${k.title}\n\n${k.body || ""}${k.media_id ? `\n\nArquivo: ${path[k.media_id] || ""}` : ""}\n`);
      for (const c of m.capsules.opened) txt(`capsulas/${c.years}-anos - ${clean(c.author)}.txt`, `De: ${c.author}\nEscrita em: ${c.created_at}\nAberta em: ${c.opened_at}\n\n${c.message}${c.media_id ? `\n\nAnexo: ${path[c.media_id] || ""}` : ""}\n`);
      if (m.settings.timeline.length) txt("memorias/linha-do-tempo.txt", m.settings.timeline.map(t => `${t.time}  ${t.title}${t.text ? " — " + t.text : ""}`).join("\n") + "\n");
      txt("dados.json", JSON.stringify(m, null, 2));
      txt("leia-me.txt", `${m.wedding.names}\nExportado em ${new Date().toLocaleString("pt-BR")} pelo Universo.\n\nPastas: galeria (por momento), memorias, legado, capsulas (só as já abertas), site e arquivos.\ndados.json tem a lista completa, com legendas, momentos, quem enviou e datas.\n${m.capsules.sealed.length ? `\nCápsulas ainda lacradas (não incluídas): ${m.capsules.sealed.map(s => `${s.count} para ${s.opens}`).join(", ")}.\n` : ""}`);
      say(msg, "Montando o .zip…"); bar.value = 1;
      download(zip(entries), `memorias-${m.wedding.slug}.zip`);
      say(msg, `Pronto: ${m.files.length} arquivos (${mb(total)}).`);
    } catch (x) { say(msg, x.message, true); }
    btn.disabled = false; bar.hidden = true;
  });
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/* ---------------- .zip sem compressão (STORE), sem biblioteca ---------------- */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dos(d) {
  const t = d ? new Date(String(d).replace(" ", "T") + (/[zZ+]/.test(String(d)) ? "" : "Z")) : new Date();
  const x = isNaN(t) ? new Date() : t;
  return { time: (x.getHours() << 11) | (x.getMinutes() << 5) | (x.getSeconds() >> 1), date: ((Math.max(1980, x.getFullYear()) - 1980) << 9) | ((x.getMonth() + 1) << 5) | x.getDate() };
}
export function zip(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), { time, date } = dos(e.date);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, e.data.length, true); h.setUint32(22, e.data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h, name, e.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, e.data.length, true); c.setUint32(24, e.data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(c, name);
    offset += 30 + name.length + e.data.length;
  }
  const size = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
