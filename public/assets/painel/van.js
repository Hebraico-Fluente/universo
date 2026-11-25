/** Painel · Van (módulo "van"): liga a pergunta "Quer ir de van?" no RSVP, texto, grupo, detalhes e a lista de interessados. */
import { $, $$, esc, api } from "../ui.js";
import { viewEl, fail, css, state } from "./core.js";

let D = null;
const canWrite = () => state.me?.role !== "viewer";
const fmtPhone = d => !d ? "" : d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d;
const reais = c => c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: c % 100 ? 2 : 0 });
const toCents = v => { v = String(v || "").replace(/[R$\s]/g, ""); if (!v) return null; if (v.includes(",")) v = v.replace(/\./g, "").replace(",", "."); const n = Math.round(parseFloat(v) * 100); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const say = (el, msg, bad = false) => { el.textContent = msg; el.classList.toggle("error", bad); };
async function copy(btn, text, done) { try { await navigator.clipboard.writeText(text); const t = btn.textContent; btn.textContent = done; setTimeout(() => (btn.textContent = t), 2200); } catch { prompt("Copie o texto:", text); } }

export default async function van() {
  css("/assets/painel/fotos.css"); // interruptores (.ft-switch) iguais aos de Fotos e memórias
  css("/assets/painel/van.css");
  viewEl().innerHTML = `<p class="muted">Carregando…</p>`;
  try { D = await api("/api/admin/van"); } catch (e) { return fail(e); }
  draw();
}

function draw() {
  const s = D.settings, t = D.totals, ro = !canWrite();
  const lista = D.items.filter(x => !x.espera), espera = D.items.filter(x => x.espera);
  const row = x => `<li class="vn-row${x.espera ? " is-wait" : ""}">
      <div class="vn-who"><b>${esc(x.nome)}</b> <span class="num">· ${x.pessoas} ${x.pessoas > 1 ? "pessoas" : "pessoa"}</span>${x.via_convite ? ` <span class="tag">pelo convite</span>` : ""}${x.espera ? ` <span class="tag no">espera</span>` : ""}
        ${x.celular ? `<br><span class="small">${esc(fmtPhone(x.celular))}</span> <a class="link small" href="https://wa.me/55${esc(x.celular)}" target="_blank" rel="noopener">WhatsApp ↗</a>` : ""}
        ${x.obs ? `<br><span class="small muted">${esc(x.obs)}</span>` : ""}</div>
      ${ro ? "" : `<div class="row-btns"><button class="link small" type="button" data-wait="${esc(x.id)}">${x.espera ? "Passar para a lista" : "Mover para a espera"}</button><button class="link small danger" type="button" data-del="${esc(x.id)}">Apagar</button></div>`}
    </li>`;
  viewEl().innerHTML = `
    <header class="vh"><div><p class="label">Van</p><h1>${t.respostas ? `${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"} na van${t.vagas ? ` de ${t.vagas} vagas` : ""}` : "Lista de interessados na van"}</h1></div></header>
    ${!D.feature ? `<p class="muted">A lista da van não está incluída no plano de vocês.</p>` : ""}
    <section class="panel vn-set"><h2>Na confirmação de presença</h2>
      <form id="vnForm" class="vn-form" novalidate>
        <label class="ft-switch vn-on"><input type="checkbox" name="on"${s.on ? " checked" : ""}${ro || !D.feature ? " disabled" : ""}><span class="ft-track" aria-hidden="true"></span><span><b>Perguntar “Quer ir de van?”</b><small>Aparece no RSVP (convite pessoal e confirmação pelo nome) para quem confirma presença. A lista só vocês veem.</small></span></label>
        <label class="field"><span>Texto de ajuda (aparece embaixo da pergunta)</span><textarea class="in" name="texto" rows="3" maxlength="400"${ro ? " disabled" : ""}>${esc(s.texto)}</textarea></label>
        <label class="ft-switch"><input type="checkbox" name="exige_celular"${s.exige_celular ? " checked" : ""}${ro ? " disabled" : ""}><span class="ft-track" aria-hidden="true"></span><span><b>WhatsApp obrigatório</b><small>Para colocar todo mundo no grupo da van.</small></span></label>
        <label class="field"><span>Link do grupo do WhatsApp (opcional)</span><input class="in" name="grupo_url" type="url" maxlength="120" placeholder="https://chat.whatsapp.com/…" value="${esc(s.grupo_url)}"${ro ? " disabled" : ""}><small class="hint">Só aparece para quem respondeu Sim (na confirmação e quando volta ao convite). Quem está na lista de espera não vê.</small></label>
        <details class="vn-more"${s.ponto || s.saida || s.volta || s.vagas || s.valor_cents != null ? " open" : ""}><summary>Detalhes (opcional: só aparecem na pergunta da van quando preenchidos)</summary>
          <div class="vn-grid">
            <label class="field"><span>Ponto de saída</span><input class="in" name="ponto" maxlength="120" value="${esc(s.ponto)}"${ro ? " disabled" : ""}></label>
            <label class="field"><span>Horário de saída</span><input class="in" name="saida" maxlength="40" placeholder="Ex.: 14h30" value="${esc(s.saida)}"${ro ? " disabled" : ""}></label>
            <label class="field"><span>Horário de volta</span><input class="in" name="volta" maxlength="40" placeholder="Ex.: 1h e 2h30" value="${esc(s.volta)}"${ro ? " disabled" : ""}></label>
            <label class="field"><span>Vagas</span><input class="in num" name="vagas" inputmode="numeric" maxlength="3" placeholder="sem limite" value="${s.vagas ?? ""}"${ro ? " disabled" : ""}></label>
            <label class="field"><span>Valor por pessoa</span><input class="in num" name="valor" inputmode="decimal" maxlength="10" placeholder="não mostrar" value="${esc(reais(s.valor_cents))}"${ro ? " disabled" : ""}></label>
          </div></details>
        ${ro ? "" : `<div class="row-btns"><button class="btn sm" type="submit">Salvar</button></div>`}
        <p class="ft-msg small" id="vnMsg" role="status" aria-live="polite"></p>
      </form></section>
    <section class="panel vn-list" aria-labelledby="vnL"><div class="vn-lh"><h2 id="vnL">Interessados</h2>
      ${D.items.length ? `<div class="row-btns"><button class="btn ghost sm" type="button" id="vnNums">Copiar números</button><button class="btn ghost sm" type="button" id="vnWa">Copiar lista para o WhatsApp</button><a class="btn ghost sm" href="/api/admin/van/csv" download>Baixar planilha (CSV)</a></div>` : ""}</div>
      <p class="small muted">${t.respostas ? `${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"} na lista${t.vagas ? ` · ${Math.max(0, t.vagas - t.pessoas)} ${t.vagas - t.pessoas === 1 ? "vaga livre" : "vagas livres"}` : ""}${t.espera ? ` · ${t.espera} na espera` : ""} · ${t.respostas} ${t.respostas === 1 ? "resposta" : "respostas"}` : "Ninguém se inscreveu ainda."}</p>
      ${lista.length ? `<ul class="vn-rows">${lista.map(row).join("")}</ul>` : ""}
      ${espera.length ? `<h3 class="vn-h3">Lista de espera</h3><ul class="vn-rows">${espera.map(row).join("")}</ul>` : ""}
      <p class="small muted">Nome, WhatsApp e observação são dados dos convidados: saem junto na limpeza de dados (aba Privacidade).</p>
    </section>`;

  const f = $("#vnForm");
  f?.addEventListener("submit", async e => {
    e.preventDefault(); const msg = $("#vnMsg");
    const vagas = f.vagas.value.trim(), valor = toCents(f.valor.value);
    if (vagas && !/^\d{1,3}$/.test(vagas)) return say(msg, "Vagas: só números.", true);
    if (Number.isNaN(valor)) return say(msg, "Valor: use números, ex.: 50 ou 49,90.", true);
    try {
      D = await api("/api/admin/van", { method: "PATCH", body: { on: f.on.checked, texto: f.texto.value, exige_celular: f.exige_celular.checked, grupo_url: f.grupo_url.value.trim(),
        ponto: f.ponto.value, saida: f.saida.value, volta: f.volta.value, vagas: vagas || null, valor_cents: valor } });
      draw(); say($("#vnMsg"), "Salvo. O site atualiza em até um minuto.");
    } catch (x) { say(msg, x.message, true); }
  });
  $("#vnNums")?.addEventListener("click", e => copy(e.target, D.items.filter(x => x.celular).map(x => "+55" + x.celular).join("\n"), "Números copiados!"));
  $("#vnWa")?.addEventListener("click", e => copy(e.target, [`*Van · ${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"}${t.vagas ? ` de ${t.vagas}` : ""}*`,
    ...lista.map((x, i) => `${i + 1}. ${x.nome} (${x.pessoas})${x.celular ? ` · ${fmtPhone(x.celular)}` : ""}${x.obs ? ` · ${x.obs}` : ""}`),
    ...(espera.length ? ["", "_Lista de espera_", ...espera.map((x, i) => `${i + 1}. ${x.nome} (${x.pessoas})${x.celular ? ` · ${fmtPhone(x.celular)}` : ""}`)] : [])].join("\n"), "Lista copiada!"));
  $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Apagar esta pessoa da lista da van?")) return;
    try { D = await api(`/api/admin/van/${b.dataset.del}`, { method: "DELETE" }); draw(); } catch (x) { alert(x.message); }
  }));
  $$("[data-wait]").forEach(b => b.addEventListener("click", async () => {
    const x = D.items.find(i => i.id === b.dataset.wait);
    try { D = await api(`/api/admin/van/${x.id}`, { method: "PATCH", body: { espera: !x.espera } }); draw(); } catch (e) { alert(e.message); }
  }));
}
