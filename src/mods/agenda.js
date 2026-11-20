/**
 * Módulo "agenda": "Salvar na agenda" do site do casal.
 *   GET /c/:slug/agenda.ics  → evento do casamento em formato de calendário (iPhone, Outlook, Android…)
 * O link do Google Agenda é montado no navegador (public/assets/site.js) com os mesmos dados.
 * Só usa o que já é público no site: nomes, data, local e endereço do evento principal.
 */
const HOURS = 7; // duração padrão (cerimônia + festa) quando não há horário de término

const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Linhas do .ics têm no máximo 75 bytes; as seguintes começam com espaço. */
function fold(line) {
  const out = []; let cur = "", n = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (n + b > 73) { out.push(cur); cur = " "; n = 1; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

export async function eventInfo(env, slug) {
  const w = await env.DB.prepare("SELECT id, slug, names, date_iso, city, venue_name FROM weddings WHERE slug = ?").bind(slug).first();
  if (!w) return null;
  const ev = await env.DB.prepare("SELECT name, starts_at, venue, address FROM events WHERE wedding_id = ? AND is_public = 1 ORDER BY sort, starts_at").bind(w.id).all();
  const main = ev.results.find(e => e.address) || ev.results[0] || {};
  const start = new Date(w.date_iso);
  const end = new Date(start.getTime() + HOURS * 3600e3);
  const place = [main.venue || w.venue_name, main.address || w.city].filter(Boolean).join(" · ");
  return { w, start, end, place, title: `Casamento ${w.names}` };
}

export default {
  name: "agenda",
  async raw(ctx) {
    const r = ctx.m === "GET" && ctx.p.match(/^\/c\/([a-z0-9-]{3,60})\/agenda\.ics$/);
    if (!r) return null;
    const info = await eventInfo(ctx.env, r[1]);
    if (!info) return new Response("Não encontrado", { status: 404 });
    const { w, start, end, place, title } = info;
    const site = `${ctx.url.origin}/c/${w.slug}`;
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Universo//Casamentos//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:casamento-${w.slug}@universo`,
      `DTSTAMP:${utc(new Date())}`,
      `DTSTART:${utc(start)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${esc(title)}`,
      place ? `LOCATION:${esc(place)}` : "",
      `DESCRIPTION:${esc(`Confirme presença, veja o cronograma e o traje no site: ${site}`)}`,
      `URL:${site}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean).map(fold).join("\r\n") + "\r\n";
    return new Response(ics, { headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="casamento-${w.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    } });
  },
};
