/**
 * Site do casal · Presença: confirmar pelo nome completo, sem precisar do link pessoal.
 * O servidor só aceita o nome completo exato (sem acento/maiúsculas/espaços extras), com limite por aparelho,
 * e devolve um acesso temporário (~30 min) ao RSVP da família. O formulário é o mesmo do convite pessoal.
 * Se o casal desligou a opção (ou o prazo passou), a seção original do site continua no lugar.
 */
import { mountRsvp, loadCss } from "../invite-mods/rsvp-form.js";

export const name = "convidados";

function addCss() {
  const href = "/assets/site-mods/presenca.css";
  if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); }
}

export function sections({ w, data, esc, longDate }) {
  if (!data?.rsvp_by_name) return [];
  addCss(); loadCss();
  return [{
    id: "presenca", replace: "presenca", label: "Presença", title: "Confirme sua <em>presença</em>", cls: "alt",
    inner: `<div class="pr rv">
      ${w.rsvp_note ? `<p class="rule-note">${esc(w.rsvp_note)}</p>` : ""}
      <form class="pr-find" id="prFind" novalidate>
        <p class="pr-lead">Digite seu nome completo, como está no convite. Você confirma por todas as pessoas do seu convite, em um minuto.</p>
        <label class="field" for="prName"><span>Seu nome completo</span></label>
        <div class="pr-row"><input class="in" id="prName" name="name" autocomplete="name" maxlength="80" required aria-describedby="prHint prErr">
          <button class="btn accent" type="submit">Encontrar meu convite</button></div>
        <p class="hint" id="prHint">Responda até ${esc(longDate(w.rsvp_deadline + "T12:00:00-03:00"))}. Recebeu um link pessoal dos noivos? Ele também funciona.</p>
        <p class="error" id="prErr" role="alert"></p>
      </form>
      <div class="pr-found" id="prFound" hidden tabindex="-1">
        <div class="pr-hi"><p class="label">Convite encontrado</p><h3 id="prHello"></h3>
          <button class="link" type="button" id="prOther">Não é você? Buscar outro nome</button></div>
        <div id="prForm"></div>
      </div>
    </div>`,
  }];
}

export function init({ data, slug, api, $ }) {
  if (!data?.rsvp_by_name) return;
  const find = $("#prFind"); if (!find) return;
  const found = $("#prFound"), err = $("#prErr"), nameIn = $("#prName");
  find.addEventListener("submit", async e => {
    e.preventDefault(); err.textContent = "";
    const name = nameIn.value.trim();
    if (name.length < 2) { err.textContent = "Digite seu nome completo, como está no convite."; nameIn.focus(); return; }
    const btn = find.querySelector("button"); btn.disabled = true; btn.textContent = "Procurando…";
    try {
      const { token } = await api(`/api/site/${slug}/presenca`, { method: "POST", body: { name } });
      const inv = await api(`/api/invite/${token}`);
      await loadCss();
      $("#prHello").textContent = `Olá, ${inv.household.greeting}!`;
      mountRsvp($("#prForm"), { token, data: inv });
      find.hidden = true; found.hidden = false;
      found.scrollIntoView({ block: "start" }); found.focus({ preventScroll: true });
    } catch (x) {
      err.textContent = x.status === 429 ? "Muitas tentativas agora. Espere um pouco e tente de novo." : x.message;
      nameIn.focus();
    } finally { btn.disabled = false; btn.textContent = "Encontrar meu convite"; }
  });
  $("#prOther").addEventListener("click", () => {
    $("#prForm").innerHTML = ""; found.hidden = true; find.hidden = false; find.reset(); nameIn.focus();
  });
}
