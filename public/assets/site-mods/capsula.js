/**
 * Site: cápsula do tempo (módulo "midia"). O convidado escreve, junta (se quiser) uma foto ou um áudio curto
 * e escolhe quando abrir: daqui a 6 meses ou daqui a 1 ano (contados do dia do casamento). Ninguém lê antes da data — nem os noivos.
 */
import { compressImage } from "../upload.js";
import { css, sendForm } from "./galeria.js";

export const name = "midia";
css();

const MAX_SECONDS = 120;
const fmtDate = d => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
/** Microfone liberado pela política da página? (Permissions-Policy) */
function micAllowed() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return false;
  const pp = document.permissionsPolicy || document.featurePolicy;
  return pp?.allowsFeature ? pp.allowsFeature("microphone") : true;
}

export function sections({ data, esc }) {
  const c = data?.capsule;
  if (!c) return [];
  const opts = (c.options || []).map(o => ({ m: o.months, l: `Daqui a ${o.label}`, d: o.opens, past: o.opens <= c.today }));
  const first = opts.find(o => !o.past)?.m;
  return [{
    id: "capsula", label: "Cápsula do tempo", title: "Uma mensagem para <em>o futuro</em>", before: "duvidas", cls: "alt",
    inner: `<div class="cp">
      <div class="cp-about rv">
        <p class="cp-lead">Escreva para os noivos do futuro. A mensagem fica <b>lacrada</b> e só se abre na data que você escolher: 6 meses ou 1 ano depois do casamento.</p>
        <ul class="cp-points">
          <li><b>Ninguém lê antes da data</b>, nem os noivos: até lá, eles só sabem quantas cápsulas existem.</li>
          <li>Você pode juntar uma foto ou um áudio curto (até ${MAX_SECONDS / 60} minutos).</li>
          <li>Depois de enviada, a cápsula não pode ser editada.</li>
        </ul>
        <details class="cp-policy"><summary>Como a cápsula é guardada</summary>
          <p>O conteúdo fica guardado neste site <b>enquanto a conta deste casamento existir</b>. Na data, a cápsula se abre só para os noivos, que podem ler, ouvir e exportar tudo para guardar por conta própria.</p>
          <p>O lacre é feito pelo sistema, não é criptografia: a equipe técnica que mantém o serviço tem acesso ao banco de dados, como em qualquer serviço online. Se a conta for encerrada antes da data, as cápsulas lacradas são apagadas junto.</p>
          <p>Se a mensagem for muito importante para você, guarde também uma cópia.</p>
        </details>
      </div>
      <form class="cp-form rv" id="cpForm" novalidate>
        <label class="field"><span>Seu nome</span><input class="in" name="author" maxlength="60" autocomplete="name" required></label>
        <label class="field"><span>Sua mensagem</span><textarea class="in" name="message" rows="6" maxlength="3000" placeholder="Como vocês estão? Lembram do que aconteceu na festa?" required></textarea></label>
        <fieldset class="cp-when"><legend class="field-l">Quando abrir</legend>
          ${opts.map(o => `<label class="cp-opt${o.past ? " is-past" : ""}"><input type="radio" name="months" value="${o.m}"${o.m === first ? " checked" : ""}${o.past ? " disabled" : ""}><span><b>${esc(o.l)}</b><small>${esc(fmtDate(o.d))}</small></span></label>`).join("")}
        </fieldset>
        <fieldset class="cp-att"><legend class="field-l">Anexo (opcional)</legend>
          <div class="cp-att-btns" role="group" aria-label="Tipo de anexo">
            <button type="button" class="gl-chip" data-att="" aria-pressed="true">Só texto</button>
            <button type="button" class="gl-chip" data-att="foto" aria-pressed="false">Foto</button>
            <button type="button" class="gl-chip" data-att="gravar" aria-pressed="false" hidden>Gravar áudio</button>
            <button type="button" class="gl-chip" data-att="audio" aria-pressed="false">Arquivo de áudio</button>
          </div>
          <div class="cp-pane" data-pane="foto" hidden><label class="field"><span>Foto</span><input class="in" type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/*"></label></div>
          <div class="cp-pane" data-pane="audio" hidden><label class="field"><span>Áudio (MP3, M4A ou WebM, até 6 MB)</span><input class="in" type="file" name="audio" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/webm,audio/*"></label></div>
          <div class="cp-pane cp-rec" data-pane="gravar" hidden>
            <button type="button" class="btn ghost sm" id="cpRec">● Gravar</button>
            <span class="cp-timer num" id="cpTimer" aria-live="off">0:00</span>
            <button type="button" class="link small" id="cpRecDel" hidden>Apagar gravação</button>
            <audio id="cpPlay" controls hidden></audio>
            <p class="hint" id="cpRecMsg" role="status">Até ${MAX_SECONDS / 60} minutos. O navegador vai pedir acesso ao microfone.</p>
          </div>
        </fieldset>
        <label class="gl-consent"><input type="checkbox" name="consent" value="1" required><span>Entendi que a mensagem, assinada com o meu nome, fica lacrada até a data escolhida e é guardada enquanto a conta do casamento existir.</span></label>
        <p class="error" id="cpErr" role="alert"></p>
        <button class="btn accent" type="submit">Lacrar e enviar</button>
      </form>
    </div>`,
  }];
}

export function init({ data, slug, $, $$ }) {
  if (!data?.capsule) return;
  const f = $("#cpForm");
  if (!f) return;
  let att = "", recorded = null, rec = null, timer = 0, started = 0, chunks = [];
  if (micAllowed()) $('[data-att="gravar"]').hidden = false;
  $$("[data-att]").forEach(b => b.addEventListener("click", () => {
    att = b.dataset.att;
    $$("[data-att]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $$(".cp-pane").forEach(p => { p.hidden = p.dataset.pane !== att; });
  }));
  const tick = () => { const s = Math.floor((Date.now() - started) / 1000); $("#cpTimer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; if (s >= MAX_SECONDS) stop(); };
  const stop = () => { if (rec && rec.state !== "inactive") rec.stop(); clearInterval(timer); };
  const play = $("#cpPlay");
  play.addEventListener("error", () => { play.hidden = true; }); // pré-escuta depende da política de mídia da página
  $("#cpRec").addEventListener("click", async () => {
    const msg = $("#cpRecMsg");
    if (rec && rec.state === "recording") return stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported?.(t)) || "";
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks = [];
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const t = (rec.mimeType || type || "audio/webm").split(";")[0];
        recorded = new File(chunks, `recado.${t.includes("mp4") ? "m4a" : "webm"}`, { type: t });
        $("#cpRec").textContent = "● Gravar de novo"; $("#cpRecDel").hidden = false;
        msg.textContent = `Áudio gravado (${$("#cpTimer").textContent}). Ele vai junto com a mensagem.`;
        try { play.src = URL.createObjectURL(recorded); play.hidden = false; } catch { play.hidden = true; }
      };
      rec.start(1000); started = Date.now(); timer = setInterval(tick, 250);
      $("#cpRec").textContent = "■ Parar"; msg.textContent = "Gravando…";
    } catch { msg.textContent = "Não deu para usar o microfone. Você pode enviar um arquivo de áudio."; }
  });
  $("#cpRecDel").addEventListener("click", () => { recorded = null; play.hidden = true; play.removeAttribute("src"); $("#cpRecDel").hidden = true; $("#cpTimer").textContent = "0:00"; $("#cpRec").textContent = "● Gravar"; $("#cpRecMsg").textContent = "Gravação apagada."; });

  f.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#cpErr"), btn = f.querySelector("button[type=submit]"); err.textContent = "";
    if (f.author.value.trim().length < 2) { err.textContent = "Escreva seu nome."; f.author.focus(); return; }
    if (f.message.value.trim().length < 2) { err.textContent = "Escreva a mensagem."; f.message.focus(); return; }
    const when = f.querySelector("input[name=months]:checked");
    if (!when) { err.textContent = "Escolha quando a cápsula deve abrir."; return; }
    if (!f.consent.checked) { err.textContent = "Confirme que entendeu como a cápsula funciona."; f.consent.focus(); return; }
    if (rec && rec.state === "recording") stop();
    btn.disabled = true; btn.textContent = "Lacrando…";
    try {
      const fd = new FormData();
      fd.append("author", f.author.value); fd.append("message", f.message.value); fd.append("months", when.value); fd.append("consent", "1");
      let file = null;
      if (att === "foto" && f.photo.files[0]) file = await compressImage(f.photo.files[0], { maxSide: 1600, quality: 0.8 });
      if (att === "audio" && f.audio.files[0]) file = f.audio.files[0];
      if (att === "gravar" && recorded) file = recorded;
      if (file) fd.append("file", file, file.name || "anexo");
      const r = await sendForm(`/api/site/${slug}/capsula`, fd);
      f.innerHTML = `<div class="cp-done" role="status"><p class="label">Cápsula lacrada</p><h3>Obrigado.</h3><p>Sua mensagem abre em <b>${fmtDate(r.opens)}</b>. Até lá, fica guardada, sem ninguém ler.</p></div>`;
    } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Lacrar e enviar"; }
  });
}
