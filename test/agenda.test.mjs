/** "Salvar na agenda": arquivo .ics do casamento. */
import { setup } from "./helpers.mjs";
const t = await setup();
const { ok } = t;

let r = await t.call("GET", "/c/helena-e-rafael/agenda.ics");
const ics = await r.text();
ok(r.status === 200 && r.headers.get("Content-Type").startsWith("text/calendar"), "agenda.ics responde como calendário");
ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.includes("BEGIN:VEVENT") && ics.trim().endsWith("END:VCALENDAR"), "estrutura do calendário");
ok(/SUMMARY:Casamento Helena & Rafael/.test(ics), "título com os nomes do casal");
ok(/DTSTART:\d{8}T\d{6}Z/.test(ics) && /DTEND:\d{8}T\d{6}Z/.test(ics), "início e fim em UTC");
ok(ics.includes("TRIGGER:-P1D"), "lembrete um dia antes");
ok(ics.split("\r\n").every(l => new TextEncoder().encode(l).length <= 75), "linhas dentro do limite do formato");
ok(!/Andrade|Rossi|token/i.test(ics), "nada de convidados no arquivo");
r = await t.call("GET", "/c/petala-e-lucas/agenda.ics");
const pl = await r.text();
ok(pl.includes("DTSTART:20270220T190000Z") && pl.includes("Piraquara"), "Pétala & Lucas: 20/02/2027 16h (BRT) na Estância, em Piraquara");
ok((await t.call("GET", "/c/nao-existe/agenda.ics")).status === 404, "casal inexistente: 404");
t.done("agenda");
