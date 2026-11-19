/**
 * Widget "Ajuda" do painel do casal: botão discreto na barra que abre os chamados de suporte ao Gueta Studio.
 * API: GET|POST /api/admin/suporte · POST /api/admin/suporte/:id  (módulo plataforma). Sem estilos inline.
 */
import { $, esc, api, fmt } from "../ui.js";
import { css } from "./core.js";

const when = iso => fmt(String(iso).replace(" ", "T") + (/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? "" : "Z"), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
const ST = { open: ["pending", "Aguardando o estúdio"], answered: ["yes", "Respondido"], closed: ["no", "Encerrado"] };

export default async function ajuda() {
  css("/assets/painel/ajuda.css");
  const who = $(".bar .who");
  if (!who || $("#aj-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.id = "aj-btn"; btn.className = "link aj-btn"; btn.textContent = "Ajuda";
  btn.setAttribute("aria-haspopup", "dialog");
  who.prepend(btn);
  const dlg = document.createElement("dialog");
  dlg.className = "aj"; dlg.setAttribute("aria-labelledby", "aj-t");
  document.body.append(dlg);
  let tickets = [];
  const load = async () => { tickets = (await api("/api/admin/suporte")).tickets; mark(); };
  const mark = () => {
    const news = tickets.some(t => t.status === "answered");
    btn.classList.toggle("news", news);
    btn.setAttribute("aria-label", news ? "Ajuda: há resposta nova do estúdio" : "Ajuda");
  };
  const draw = () => {
    dlg.innerHTML = `<div class="aj-in">
      <div class="aj-h"><div><p class="label">Suporte · Gueta Studio</p><h2 id="aj-t">Precisa de ajuda?</h2></div>
        <button class="link aj-x" type="button" data-a="close" aria-label="Fechar">Fechar</button></div>
      <p class="muted small">Conte o que aconteceu. A equipe responde por aqui, normalmente em até um dia útil.</p>
      <form class="aj-f" id="aj-new" novalidate>
        <label class="field"><span>Assunto</span><input class="in" name="subject" maxlength="120" required placeholder="Ex.: mudar o prazo de confirmação"></label>
        <label class="field"><span>Mensagem</span><textarea class="in aj-ta" name="body" maxlength="3000" required></textarea></label>
        <p class="error" role="alert"></p>
        <button class="btn sm" type="submit">Enviar ao estúdio</button>
      </form>
      ${tickets.length ? `<h3 class="aj-h3">Seus chamados</h3><ul class="aj-list">${tickets.map(t => `<li>
        <details${t.status === "answered" ? " open" : ""}><summary><span class="aj-s">${esc(t.subject)}</span><span class="tag ${ST[t.status][0]}">${ST[t.status][1]}</span></summary>
          <ol class="aj-thread">${t.messages.map(m => `<li class="${m.author === "plataforma" ? "us" : ""}"><p class="label">${m.author === "plataforma" ? "Gueta Studio" : esc(m.author_name || "Vocês")} · ${when(m.created_at)}</p><p class="aj-msg">${esc(m.body)}</p></li>`).join("")}</ol>
          ${t.status !== "closed" ? `<form class="aj-f aj-reply" data-id="${esc(t.id)}" novalidate><label class="field"><span>Responder</span><textarea class="in aj-ta" name="body" maxlength="3000" required></textarea></label><p class="error" role="alert"></p><button class="btn ghost sm" type="submit">Enviar</button></form>` : ""}
        </details></li>`).join("")}</ul>` : ""}
    </div>`;
  };
  const submit = async (f, path, data) => {
    const err = f.querySelector(".error"), b = f.querySelector("button");
    err.textContent = ""; b.disabled = true;
    try { await api(path, { method: "POST", body: data }); await load(); draw(); $("#aj-t", dlg)?.focus(); }
    catch (x) { err.textContent = x.message; b.disabled = false; }
  };
  dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-a=close]")) dlg.close(); });
  dlg.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target;
    if (f.id === "aj-new") submit(f, "/api/admin/suporte", { subject: f.subject.value, body: f.body.value });
    else if (f.classList.contains("aj-reply")) submit(f, "/api/admin/suporte/" + encodeURIComponent(f.dataset.id), { body: f.body.value });
  });
  dlg.addEventListener("close", () => btn.focus());
  btn.addEventListener("click", async () => {
    try { await load(); } catch { /* sem conexão: abre o formulário mesmo assim */ }
    draw(); dlg.showModal(); dlg.querySelector("[name=subject]")?.focus();
  });
  load().catch(() => {});
}
