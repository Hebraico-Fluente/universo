/**
 * Envio de e-mail pela API HTTP da Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Configuração (nunca no repositório):
 *   RESEND_API_KEY  segredo no painel da Cloudflare (Worker → Settings → Variables and Secrets → Secret)
 *   MAIL_FROM       remetente, em wrangler.jsonc → vars (ex.: "Gueta Studio <casamentos@guetastudio.com.br>")
 * O domínio do remetente precisa estar verificado na Resend (registros DNS em guetastudio.com.br).
 *
 * Nada de pixel de rastreio nem de link rastreado: a Resend só rastreia aberturas/cliques se isso for ligado
 * no domínio dela, e não ligamos. Endereços de e-mail nunca vão para o log.
 */
const ENDPOINT = "https://api.resend.com/emails";

/** Pronto para enviar? (chave e remetente configurados) */
export const mailConfigured = env => !!(env && env.RESEND_API_KEY && env.MAIL_FROM);

/**
 * Envia um e-mail. Devolve { ok: true, id } | { ok: false, skipped: true } (sem configuração) | { ok: false, status }.
 * Nunca lança erro de rede para quem chama: a rotina diária decide se tenta de novo.
 */
export async function sendMail(env, { to, subject, html, text, replyTo }) {
  if (!mailConfigured(env)) return { ok: false, skipped: true };
  const payload = { from: env.MAIL_FROM, to: [to], subject, html, text };
  if (replyTo || env.MAIL_REPLY_TO) payload.reply_to = replyTo || env.MAIL_REPLY_TO;
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json().catch(() => ({}));
    return { ok: true, id: j.id || "" };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Escapa texto para HTML de e-mail. */
export const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
