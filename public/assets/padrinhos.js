/**
 * Portal dos padrinhos (/padrinhos/:token) e página do colaborador de uma surpresa (/surpresa/:token).
 * Tudo vem do servidor já filtrado para quem abriu o link (surpresas em que a pessoa é homenageada nunca chegam aqui).
 */
import { $, $$, esc, api, longDate, time, mapsLink } from "./ui.js";

const [, kind, token] = location.pathname.split("/");
const app = $("#app");
const base = kind === "surpresa" ? `/api/surpresa/${token}` : `/api/padrinhos/${token}`;
const dt = iso => new Date(String(iso).replace(" ", "T") + (/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? "" : "Z")).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
const brDate = d => d ? new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "long" }) : "";
const contactHref = v => /@/.test(v) ? "mailto:" + v : /^[+\d\s().-]{8,}$/.test(v) ? "tel:" + v.replace(/[^\d+]/g, "") : null;
let D;

async function theme(w) {
  document.documentElement.dataset.universe = w.universe;
  if (w.theme && /^[a-z0-9-]+$/.test(w.theme)) {
    document.documentElement.dataset.theme = w.theme;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `/assets/themes/${w.theme}/theme.css`; document.head.append(l);
    await new Promise(r => { l.onload = l.onerror = r; });
  }
}
const head = (w, kicker, title, sub) => `<header class="pd-hero"><div class="wrap">
  <p class="label">${esc(kicker)}</p>
  ${w.theme ? `<img class="pd-logo" src="/assets/themes/${esc(w.theme)}/logo.png" alt="${esc(w.names)}" width="742" height="338">` : `<p class="pd-names">${esc(w.names.split("&")[0].trim())} <i>&amp;</i> ${esc(w.names.split("&")[1]?.trim() || "")}</p>`}
  <h1>${title}</h1>${sub ? `<p class="pd-sub">${sub}</p>` : ""}
</div></header>`;

boot();
async function boot() {
  try { D = await api(base); await theme(D.wedding); kind === "surpresa" ? collaborator() : portal(); }
  catch (e) {
    app.innerHTML = `<section class="pd-gone wrap"><p class="label">Link privado</p><h1>${e.status === 429 ? "Muitas tentativas agora." : "Este link não vale mais."}</h1>
      <p class="muted">${e.status === 429 ? "Espere alguns minutos e tente de novo." : "Ele pode ter sido trocado. Peça um link novo a quem enviou."}</p></section>`;
  } finally { app.removeAttribute("aria-busy"); }
}

/* ---------------- portal ---------------- */
function portal() {
  const { wedding: w, me, info, events, tasks, wall, team, surprises, flags, kinds, roles } = D;
  const role = Object.fromEntries(roles)[me.role] || me.role;
  document.title = `Padrinhos · ${w.names}`;
  const nav = [["dia", "O dia"], ["tarefas", "Tarefas"], ["mural", "Mural"], ...(flags.surpresas ? [["surpresas", "Surpresas"]] : [])];
  const open = tasks.filter(t => !t.done).length;
  app.innerHTML = `${head(w, "Portal dos padrinhos", `Olá, ${esc(me.name.split(" ")[0])}.`, `${esc(role)} de ${esc(w.names)} · ${esc(longDate(w.date))}`)}
  <nav class="pd-nav" aria-label="Seções"><div class="wrap">${nav.map(([id, l]) => `<a href="#${id}">${l}${id === "tarefas" && open ? ` <span class="pd-count num">${open}</span>` : ""}</a>`).join("")}</div></nav>
  <div id="conteudo">
  <section class="wrap pd-sec" id="dia" aria-labelledby="diaT"><h2 id="diaT">O dia, para vocês</h2>
    <div class="pd-grid">
      <div class="pd-card pd-main">
        ${info.instructions ? `<p class="pd-lead">${esc(info.instructions)}</p>` : `<p class="muted">Os noivos ainda não escreveram as instruções.</p>`}
        ${info.schedule.length ? `<h3>Roteiro dos padrinhos</h3><ol class="pd-tl">${info.schedule.map(s => `<li><span class="num">${esc(s.time)}</span><p>${esc(s.text)}</p></li>`).join("")}</ol>` : ""}
      </div>
      <div class="pd-side">
        ${info.dress ? `<div class="pd-card"><p class="label">Traje dos padrinhos</p><p>${esc(info.dress)}</p></div>` : ""}
        ${info.contacts.length ? `<div class="pd-card"><p class="label">Contatos combinados</p><ul class="pd-contacts">${info.contacts.map(c => { const h = contactHref(c.value); return `<li><span>${esc(c.label)}</span>${h ? `<a href="${esc(h)}">${esc(c.value)}</a>` : `<b>${esc(c.value)}</b>`}</li>`; }).join("")}</ul></div>` : ""}
        ${events.length ? `<div class="pd-card"><p class="label">Onde e quando</p><ul class="pd-events">${events.map(e => `<li><b>${esc(e.name)}</b><span>${esc(longDate(e.starts_at))} · ${esc(time(e.starts_at))}</span><span class="muted">${esc(e.venue)}</span>${e.address ? `<a href="${esc(mapsLink(e.address))}" target="_blank" rel="noopener">Abrir no mapa ↗</a>` : ""}</li>`).join("")}</ul></div>` : ""}
      </div>
    </div>
  </section>

  <section class="wrap pd-sec" id="tarefas" aria-labelledby="tarT"><h2 id="tarT">Tarefas</h2>
    ${tasks.length ? `<ul class="pd-tasks">${tasks.map(t => `<li><label class="pd-task${t.done ? " done" : ""}"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? "checked" : ""}><span class="pd-box" aria-hidden="true"></span>
      <span class="pd-tt"><b>${esc(t.title)}</b>${t.notes ? `<span>${esc(t.notes)}</span>` : ""}<small class="muted">${[t.everyone ? "Para todos os padrinhos" : "Só para você", t.due_date ? "até " + brDate(t.due_date) : ""].filter(Boolean).join(" · ")}</small></span></label></li>`).join("")}</ul>`
      : `<p class="muted">Nenhuma tarefa por enquanto.</p>`}
  </section>

  <section class="wrap pd-sec" id="mural" aria-labelledby="muT"><h2 id="muT">Mural dos padrinhos</h2>
    <p class="muted pd-note">Só padrinhos e madrinhas leem este mural. Os noivos não têm acesso.</p>
    <form class="pd-post" id="wallF" novalidate><label class="sr" for="wallM">Mensagem</label><textarea class="in" id="wallM" name="message" rows="2" maxlength="800" placeholder="Combine o ensaio, a carona, o brinde…"></textarea>
      <p class="error" id="wallE" role="alert"></p><button class="btn" type="submit">Publicar</button></form>
    <ul class="pd-wall">${wall.map(m => `<li><p>${esc(m.message)}</p><span class="muted small">${esc(m.author || "Padrinho")} · ${esc(dt(m.created_at))}${m.mine ? ` · <button class="link small" type="button" data-delwall="${esc(m.id)}">apagar</button>` : ""}</span></li>`).join("") || `<li class="muted">Ninguém escreveu ainda.</li>`}</ul>
  </section>

  ${flags.surpresas ? `<section class="wrap pd-sec" id="surpresas" aria-labelledby="suT"><div class="pd-sh"><h2 id="suT">Surpresas</h2><button class="btn ghost sm" type="button" id="newS">Organizar uma surpresa</button></div>
    <p class="muted pd-note">Quem é homenageado não vê a surpresa. Se for para os noivos, ela fica escondida do painel deles até a data de revelação.</p>
    <form class="pd-card pd-form" id="sForm" hidden novalidate>
      <div class="pd-2"><label class="field"><span>Tipo</span><select class="in" name="kind">${kinds.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></label>
      <label class="field"><span>Nome da surpresa</span><input class="in" name="title" maxlength="100" required placeholder="Ex.: Vídeo dos amigos"></label></div>
      <label class="field"><span>Como vai ser</span><textarea class="in" name="description" rows="3" maxlength="1200" placeholder="O que cada pessoa precisa fazer, prazos, combinados…"></textarea></label>
      <div class="pd-2"><label class="field"><span>Para quem é</span><select class="in" name="honoree_type"><option value="casal">Os noivos</option>${team.some(t => !t.me) ? `<option value="padrinho">Um padrinho ou madrinha</option>` : ""}<option value="outro">Outra pessoa</option></select></label>
        <label class="field" id="hRef" hidden><span>Quem</span><select class="in" name="honoree_ref">${team.filter(t => !t.me).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></label>
        <label class="field" id="hLab" hidden><span>Nome de quem é homenageado</span><input class="in" name="honoree_label" maxlength="80"></label>
        <label class="field" id="hRev"><span>Revelar aos noivos em</span><input class="in" type="date" name="reveal_at" value="${esc(w.date.slice(0, 10))}"></label></div>
      <p class="error" id="sErr" role="alert"></p>
      <div class="pd-acts"><button class="btn" type="submit">Criar surpresa</button><button class="btn ghost" type="button" id="sCancel">Cancelar</button></div>
    </form>
    <div class="pd-surprises">${surprises.map(s => surpriseCard(s, true)).join("") || `<p class="muted">Você não está em nenhuma surpresa ainda.</p>`}</div>
  </section>` : ""}
  </div>
  ${w.is_demo ? `<p class="demo" role="note">Portal fictício de demonstração</p>` : ""}`;
  bindPortal();
}

function surpriseCard(s, inPortal) {
  const K = Object.fromEntries(D.kinds);
  const team = D.team || [];
  const canAdd = inPortal && s.organizer ? team.filter(t => !s.members.some(m => m.padrinho_id === t.id) && !(s.honoree_type === "padrinho" && s.honoree_label === t.name)) : [];
  return `<article class="pd-card pd-s" data-s="${esc(s.id)}">
    <header><p class="label">${esc(K[s.kind] || s.kind)} · para ${esc(s.honoree_label)}</p><h3>${esc(s.title)}</h3>
      ${s.reveal_at ? `<p class="muted small">Revelação: ${esc(brDate(s.reveal_at))}</p>` : ""}</header>
    ${s.description ? `<p class="pd-desc">${esc(s.description)}</p>` : ""}
    <p class="small"><span class="muted">Participam:</span> ${s.members.filter(m => !m.revoked).map(m => esc(m.name)).join(", ")}</p>
    <ul class="pd-posts">${s.posts.map(p => `<li><p>${esc(p.message)}</p>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener nofollow">${esc(p.link.replace(/^https:\/\//, "").slice(0, 48))} ↗</a>` : ""}<span class="muted small">${esc(p.author)} · ${esc(dt(p.created_at))}</span></li>`).join("")}</ul>
    <form class="pd-post" data-post novalidate><textarea aria-label="Mensagem" class="in" name="message" rows="2" maxlength="1500" placeholder="Sua parte, uma ideia, um recado…"></textarea>
      <input aria-label="Link (opcional)" class="in" name="link" maxlength="400" placeholder="Link do vídeo ou da foto (https://…), opcional" inputmode="url">
      <p class="error" role="alert"></p><button class="btn sm" type="submit">Enviar</button></form>
    ${inPortal && s.organizer ? `<details class="pd-org"><summary>Chamar mais gente</summary>
      ${canAdd.length ? `<form class="pd-inline" data-addp><select aria-label="Padrinho" class="in" name="padrinho_id">${canAdd.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select><button class="btn ghost sm" type="submit">Incluir padrinho</button></form>` : ""}
      <form class="pd-inline" data-addl><input aria-label="Nome de quem vai colaborar" class="in" name="name" maxlength="80" placeholder="Nome de quem vai colaborar"><button class="btn ghost sm" type="submit">Gerar link</button></form>
      <p class="pd-linkout" aria-live="polite"></p>
      <button class="link small danger" type="button" data-dels>Apagar esta surpresa</button></details>` : ""}
  </article>`;
}

function bindPortal() {
  $$("[data-task]").forEach(i => i.addEventListener("change", async () => {
    i.closest(".pd-task").classList.toggle("done", i.checked);
    try { await api(`${base}/tasks/${i.dataset.task}`, { method: "POST", body: { done: i.checked } }); }
    catch { i.checked = !i.checked; i.closest(".pd-task").classList.toggle("done", i.checked); }
  }));
  $("#wallF").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector("button");
    if (f.message.value.trim().length < 2) { $("#wallE").textContent = "Escreva uma mensagem."; return; }
    b.disabled = true;
    try { await api(`${base}/wall`, { method: "POST", body: { message: f.message.value } }); await reload("#mural"); }
    catch (x) { $("#wallE").textContent = x.message; b.disabled = false; }
  });
  $$("[data-delwall]").forEach(b => b.addEventListener("click", async () => { if (!confirm("Apagar sua mensagem?")) return; await api(`${base}/wall/${b.dataset.delwall}`, { method: "DELETE" }).catch(() => {}); reload("#mural"); }));
  const sf = $("#sForm");
  if (sf) {
    const sync = () => { const t = sf.honoree_type.value; $("#hRef").hidden = t !== "padrinho"; $("#hLab").hidden = t !== "outro"; $("#hRev").hidden = t !== "casal"; };
    sf.honoree_type.addEventListener("change", sync); sync();
    $("#newS").addEventListener("click", () => { sf.hidden = false; sf.title.focus(); });
    $("#sCancel").addEventListener("click", () => { sf.hidden = true; });
    sf.addEventListener("submit", async e => {
      e.preventDefault(); const b = sf.querySelector("[type=submit]"); $("#sErr").textContent = ""; b.disabled = true;
      const t = sf.honoree_type.value;
      try {
        await api(`${base}/surprises`, { method: "POST", body: { kind: sf.kind.value, title: sf.title.value, description: sf.description.value, honoree_type: t,
          honoree_ref: t === "padrinho" ? sf.honoree_ref.value : null, honoree_label: t === "outro" ? sf.honoree_label.value : "", reveal_at: t === "casal" ? sf.reveal_at.value : null } });
        await reload("#surpresas");
      } catch (x) { $("#sErr").textContent = x.message; b.disabled = false; }
    });
  }
  bindSurprises(true);
}
function bindSurprises(inPortal) {
  $$(".pd-s").forEach(card => {
    const id = card.dataset.s;
    const postUrl = inPortal ? `${base}/surprises/${id}/posts` : `${base}/posts`;
    card.querySelector("[data-post]").addEventListener("submit", async e => {
      e.preventDefault(); const f = e.target, err = f.querySelector(".error"), b = f.querySelector("button"); err.textContent = "";
      if (f.message.value.trim().length < 2) { err.textContent = "Escreva uma mensagem."; return; }
      b.disabled = true;
      try { await api(postUrl, { method: "POST", body: { message: f.message.value, link: f.link.value.trim() } }); await reload(inPortal ? "#surpresas" : null); }
      catch (x) { err.textContent = x.message; b.disabled = false; }
    });
    if (!inPortal) return;
    card.querySelector("[data-addp]")?.addEventListener("submit", async e => { e.preventDefault(); await api(`${base}/surprises/${id}/members`, { method: "POST", body: { padrinho_id: e.target.padrinho_id.value } }).catch(x => alert(x.message)); reload("#surpresas"); });
    card.querySelector("[data-addl]")?.addEventListener("submit", async e => {
      e.preventDefault(); const out = card.querySelector(".pd-linkout");
      try {
        const r = await api(`${base}/surprises/${id}/members`, { method: "POST", body: { name: e.target.name.value } });
        out.innerHTML = `Link de ${esc(e.target.name.value)} (aparece só agora): <code>${esc(r.link)}</code> <button class="link small" type="button">Copiar</button>`;
        out.querySelector("button").onclick = ev => navigator.clipboard.writeText(r.link).then(() => { ev.target.textContent = "Copiado!"; }).catch(() => {});
        e.target.reset();
      } catch (x) { out.textContent = x.message; }
    });
    card.querySelector("[data-dels]")?.addEventListener("click", async () => { if (!confirm("Apagar a surpresa e todas as mensagens dela?")) return; await api(`${base}/surprises/${id}`, { method: "DELETE" }).catch(x => alert(x.message)); reload("#surpresas"); });
  });
}
async function reload(anchor) {
  D = await api(base);
  kind === "surpresa" ? collaborator() : portal();
  if (anchor) $(anchor)?.scrollIntoView();
}

/* ---------------- colaborador de surpresa ---------------- */
function collaborator() {
  const { wedding: w, me, surprise: s } = D;
  document.title = `Surpresa · ${w.names}`;
  app.innerHTML = `${head(w, "Surpresa em segredo", esc(s.title), `Para ${esc(s.honoree_label)} · você entrou como ${esc(me.name)}`)}
  <div id="conteudo" class="wrap pd-sec pd-collab">
    <p class="pd-secret">Shh… quem é homenageado não vê esta página. Não compartilhe este link: ele é só seu.</p>
    ${surpriseCard({ ...s, members: s.members.map(m => ({ ...m, revoked: false })) }, false)}
  </div>
  ${w.is_demo ? `<p class="demo" role="note">Surpresa fictícia de demonstração</p>` : ""}`;
  bindSurprises(false);
}
