/**
 * Módulo "aniversario" (contrato em src/mods/README.md): e-mail aos noivos quando a cápsula do tempo abre.
 *
 * Na rotina diária, depois de abrir as cápsulas (openDue de src/mods/midia.js), cada casamento que faz hoje
 * 6 meses ou 1 ano (e, para cápsulas antigas guardadas para 5 ou 10 anos, também 60/120 meses) recebe
 * UM e-mail por pessoa com papel "owner", uma única vez por marco:
 *   • a data do marco é o dia de weddings.date_iso + N meses (fim de mês ajustado: 31/08 + 6 → 28/02 ou 29/02);
 *   • se a rotina falhou em algum dia, ainda envia até 7 dias depois do marco;
 *   • reserva antes de enviar (INSERT … ON CONFLICT DO NOTHING RETURNING em aniversarios_enviados);
 *     se ninguém recebeu (erro da Resend), a reserva é desfeita e o dia seguinte tenta de novo;
 *   • sem RESEND_API_KEY/MAIL_FROM: não envia e NÃO marca (sai quando a chave for configurada, dentro dos 7 dias);
 *   • fora: casamentos de demonstração, suspensos e com a funcionalidade "aniversario" desligada na plataforma.
 * O e-mail diz só QUANTAS mensagens abriram (nunca o conteúdo) e leva ao painel (PANEL_ORIGIN/painel).
 * Endereços de e-mail nunca vão para o log.
 *
 * Rota (administrador da plataforma)
 *   GET /api/platform/aniversarios?data=AAAA-MM-DD   simulação: quem receberia e-mail nesse dia (sem endereços)
 */
import { json, isoDate } from "../lib.js";
import { adminSession, featureOn } from "./plataforma.js";
import { openDue, todaySP, addMonths, dayOf, periodLabel, MONTHS } from "./midia.js";
import { sendMail, mailConfigured, escHtml } from "../lib/mail.js";

const WINDOW_DAYS = 7; // envia no dia do marco ou até 6 dias depois (rotina que falhou)
const DEFAULT_PANEL = "https://casamento.guetastudio.com.br";
const addDays = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const panelUrl = env => String(env.PANEL_ORIGIN || DEFAULT_PANEL).replace(/\/+$/, "") + "/painel";

/** Marcos devidos em `today` (ainda não enviados), com o número de cápsulas e de noivos. Sem dados pessoais. */
export async function dueAnniversaries(env, today) {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const weddings = (await env.DB.prepare("SELECT id, names, date_iso, features_json FROM weddings WHERE is_demo = 0 AND COALESCE(suspended, 0) = 0").all()).results
    .filter(w => featureOn(w, "aniversario"));
  if (!weddings.length) return [];
  const caps = (await env.DB.prepare("SELECT wedding_id, COALESCE(months, years * 12) AS months, COUNT(*) AS n FROM capsules GROUP BY 1, 2").all()).results;
  const sent = new Set((await env.DB.prepare("SELECT wedding_id, meses FROM aniversarios_enviados").all()).results.map(r => r.wedding_id + "|" + r.meses));
  const owners = new Map((await env.DB.prepare("SELECT wedding_id, COUNT(*) AS n FROM memberships WHERE role = 'owner' GROUP BY wedding_id").all()).results.map(r => [r.wedding_id, r.n]));
  const out = [];
  for (const w of weddings) {
    const day = dayOf(w);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const mine = caps.filter(c => c.wedding_id === w.id);
    const marks = [...new Set([...MONTHS, ...mine.map(c => c.months)])].sort((a, b) => a - b);
    for (const months of marks) {
      const date = addMonths(day, months);
      if (date > today || date < from || sent.has(w.id + "|" + months)) continue;
      out.push({ wedding_id: w.id, names: w.names, months, label: periodLabel(months), date,
        capsules: mine.find(c => c.months === months)?.n || 0, owners: owners.get(w.id) || 0 });
    }
  }
  return out;
}

/** Assunto, HTML e texto do e-mail (exportado para o teste e para a prévia). */
export function anniversaryEmail({ names, label, capsules, panel, ownerName = "" }) {
  const opened = capsules > 0;
  const subject = opened ? `Hoje faz ${label}: a cápsula do tempo de vocês abriu` : `Hoje faz ${label} do casamento de vocês`;
  const hello = ownerName ? `Oi, ${ownerName.split(" ")[0]}!` : "Oi!";
  const lead = opened
    ? `Hoje faz ${label} do casamento de ${names}. As mensagens que os convidados deixaram na cápsula do tempo para esta data acabaram de abrir: ${capsules === 1 ? "<b>1 mensagem</b> está esperando" : `<b>${capsules} mensagens</b> estão esperando`} por vocês no painel.`
    : `Hoje faz ${label} do casamento de ${names}. Que tal um café e um passeio pelas fotos e lembranças do grande dia? Está tudo guardado no painel de vocês.`;
  const leadText = lead.replace(/<\/?b>/g, "");
  const more = opened ? "Só vocês dois conseguem ler. Separem um momento com calma: algumas vêm com foto ou áudio." : "As fotos da festa, os recados e as memórias continuam lá, do jeitinho que ficaram.";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f1ea;font-family:Georgia,'Times New Roman',serif;color:#2b2620">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1ea;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e8dfd3">
<tr><td style="padding:36px 36px 8px;text-align:center">
<p style="margin:0 0 6px;font:600 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a0765a">${opened ? "Cápsula do tempo" : "Aniversário de casamento"}</p>
<h1 style="margin:0;font:400 30px/1.25 Georgia,'Times New Roman',serif;color:#2b2620">Hoje faz ${escHtml(label)}</h1>
<p style="margin:8px 0 0;font:italic 18px/1.4 Georgia,'Times New Roman',serif;color:#6b5f52">${escHtml(names)}</p>
</td></tr>
<tr><td style="padding:20px 36px 4px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#3a332b">
<p style="margin:0 0 14px">${escHtml(hello)}</p>
<p style="margin:0 0 14px">${lead.replace(names, escHtml(names))}</p>
<p style="margin:0 0 22px;color:#6b5f52">${more}</p>
</td></tr>
<tr><td align="center" style="padding:0 36px 30px"><a href="${escHtml(panel)}" style="display:inline-block;background:#2b2620;color:#ffffff;text-decoration:none;font:600 16px/1 Arial,Helvetica,sans-serif;padding:16px 28px;border-radius:999px">Abrir o painel</a>
<p style="margin:12px 0 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#8a7e70">ou copie: ${escHtml(panel)}</p></td></tr>
<tr><td style="padding:18px 36px 26px;border-top:1px solid #efe7dc;font:12px/1.6 Arial,Helvetica,sans-serif;color:#8a7e70;text-align:center">
Enviado pelo Gueta Studio. Vocês recebem este e-mail porque cuidam do painel deste casamento.<br>Não querem mais receber? É só responder este e-mail pedindo.
</td></tr></table></td></tr></table></body></html>`;
  const text = `${hello}

${leadText}

${more}

Abrir o painel: ${panel}

--
Enviado pelo Gueta Studio. Vocês recebem este e-mail porque cuidam do painel deste casamento.
Não querem mais receber? É só responder este e-mail pedindo.`;
  return { subject, html, text };
}

/** Rotina diária: abre as cápsulas devidas e manda os e-mails dos marcos de hoje (ou dos últimos 7 dias). */
export async function runAnniversaries(env, now = new Date()) {
  const today = todaySP(now);
  await openDue(env, today); // não depende da ordem dos módulos: abrir de novo não faz nada
  const due = await dueAnniversaries(env, today);
  if (!due.length) return { sent: 0, pending: 0 };
  if (!mailConfigured(env)) {
    console.log(`aniversario: e-mail não configurado (RESEND_API_KEY/MAIL_FROM); ${due.length} envio(s) aguardando`);
    return { sent: 0, pending: due.length };
  }
  const panel = panelUrl(env);
  let sent = 0;
  for (const a of due) {
    const owners = (await env.DB.prepare("SELECT u.email, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.wedding_id = ? AND m.role = 'owner'").bind(a.wedding_id).all()).results;
    if (!owners.length) continue; // sem noivos com acesso ainda: tenta nos próximos dias da janela
    // reserva antes de enviar: duas rotinas ao mesmo tempo nunca mandam em dobro
    const got = await env.DB.prepare("INSERT INTO aniversarios_enviados (wedding_id, meses) VALUES (?, ?) ON CONFLICT(wedding_id, meses) DO NOTHING RETURNING wedding_id").bind(a.wedding_id, a.months).first();
    if (!got) continue;
    let ok = 0;
    for (const o of owners) {
      const mail = anniversaryEmail({ names: a.names, label: a.label, capsules: a.capsules, panel, ownerName: o.name || "" });
      if ((await sendMail(env, { to: o.email, ...mail })).ok) ok++;
    }
    if (!ok) {
      await env.DB.prepare("DELETE FROM aniversarios_enviados WHERE wedding_id = ? AND meses = ?").bind(a.wedding_id, a.months).run();
      console.log(`aniversario: envio falhou (${a.wedding_id}, ${a.months} meses); nova tentativa amanhã`);
    } else sent += ok;
  }
  return { sent, pending: 0 };
}

export default {
  name: "aniversario",
  async root(ctx) {
    const { req, env, url, p, m } = ctx;
    if (p !== "/api/platform/aniversarios" || m !== "GET") return null;
    await adminSession(req, env);
    const day = isoDate(url.searchParams.get("data") || "", "data") || todaySP();
    const list = await dueAnniversaries(env, day);
    return json({ data: day, email_configurado: mailConfigured(env),
      envios: list.map(({ names, months, label, date, capsules, owners }) => ({ casamento: names, meses: months, marco: label, data_do_marco: date, capsulas: capsules, noivos: owners })) });
  },
  async cron(env, now) { await runAnniversaries(env, now); },
};
