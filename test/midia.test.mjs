/** Módulo "midia": arquivos, galeria colaborativa, telão, cápsula do tempo, memórias, aniversário e exportação. */
import zlib from "node:zlib";
import { setup, O } from "./helpers.mjs";
import { handle, runCron } from "../src/worker.js";
import midia, { addYears, todaySP, phase } from "../src/mods/midia.js";
import { CHUNK } from "../src/mods/midia/store.js";
import { DEMO } from "../scripts/seed.mjs";

const t = await setup();
const { env, ok } = t;
const db = env._db;
const SLUG = "helena-e-rafael";

/* ---------- arquivos sintéticos (nunca fotos de pessoas) ---------- */
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
function png(w = 8, h = 8, rgb = [180, 120, 90]) {
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const withHead = (head, size) => { const b = new Uint8Array(size); for (let i = 0; i < size; i++) b[i] = (i * 31 + 7) & 255; b.set(head); return b; };
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBM = withHead([0x1a, 0x45, 0xdf, 0xa3], 4000);
const MP4 = size => { const b = withHead([0, 0, 0, 0x18], size); b.set([0x66, 0x74, 0x79, 0x70], 4); return b; };

/* ---------- chamadas ---------- */
const send = (method, p, bodyInit, { type, headers = {}, origin = O, ip = "10.0.0.1", ck = t.cookie } = {}) => handle(new Request(O + p, {
  method, body: bodyInit, headers: { ...(type ? { "Content-Type": type } : {}), ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": ip, ...(ck ? { Cookie: ck } : {}), ...headers },
}), env);
const upload = (bytes, type, q = "", opts = {}) => send("POST", "/api/admin/media" + q, bytes, { type, headers: { "X-File-Name": encodeURIComponent("Foto de teste ção/<x>.png") }, ...opts });
const form = ({ __type = "image/png", __name = "foto.png", ...fields }) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) v instanceof Uint8Array ? f.append(k, new Blob([v], { type: __type }), __name) : f.append(k, v);
  return f;
};
const bytesOf = async r => new Uint8Array(await r.arrayBuffer());
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

await t.loginDemo();
const demoCk = t.cookie;
const other = (await t.login(DEMO.other.email, DEMO.other.password, "10.0.0.8")).cookie;

/* ---------- datas ---------- */
ok(addYears("2027-10-16", 1) === "2028-10-16" && addYears("2028-02-29", 1) === "2029-02-28" && addYears("2028-02-29", 4) === "2032-02-29", "aniversário: mesma data N anos depois (29/02 → 28/02)");
ok(phase({ date_iso: "2027-10-16T16:30:00-03:00" }, "2029-10-16").anniversary === 2 && !phase({ date_iso: "2027-10-16T16:30:00-03:00" }, "2027-10-16").after, "fase: aniversário e depois da data");

/* ---------- upload válido ---------- */
const img = png(16, 12);
let r = await upload(img, "image/png", "?public=1&kind=site");
let j = await r.json();
ok(r.status === 201 && /^\/m\/f_[\w-]+$/.test(j.url) && j.type === "image/png" && j.size === img.length, "upload de imagem pública devolve {id, url /m/<id>}");
ok(j.name === "x.png", "nome do arquivo higienizado (sem caminho nem <>): " + j.name);
const pubId = j.id;
r = await send("GET", "/api/media/" + pubId, undefined, { ck: "" });
ok(r.status === 200 && r.headers.get("Content-Type") === "image/png" && r.headers.get("X-Content-Type-Options") === "nosniff" && /immutable/.test(r.headers.get("Cache-Control")) && same(await bytesOf(r), img), "arquivo público: sem login, nosniff e cache longo");
ok(/^inline; filename="[^"]*"; filename\*=UTF-8''/.test(r.headers.get("Content-Disposition")), "Content-Disposition seguro (ASCII + UTF-8)");
const rawCtx = (p, ck = "") => { const req = new Request(O + p, { headers: ck ? { Cookie: ck } : {} }); return { req, env, p, m: "GET", url: new URL(req.url), session: () => { throw new Error("sem sessão"); } }; };
r = await midia.raw(rawCtx("/m/" + pubId));
ok(r && r.status === 200 && same(await bytesOf(r), img), "gancho raw(): GET /m/:id serve o arquivo");
ok((await midia.raw(rawCtx("/m/nada"))) === null && (await midia.raw(rawCtx("/painel"))) === null, "gancho raw() ignora outros caminhos");

/* ---------- upload inválido ---------- */
r = await upload(new TextEncoder().encode("GIF89a........................"), "image/png");
ok(r.status === 415 && (await r.json()).code === "bad_signature", "tipo falso: bytes de GIF declarados como PNG → recusado pelos magic numbers");
r = await upload(img, "image/jpeg");
ok(r.status === 415, "PNG declarado como JPEG → recusado");
r = await upload(new TextEncoder().encode("<html><script>alert(1)</script></html>"), "text/html");
ok(r.status === 415 && (await r.json()).code === "bad_type", "HTML não é aceito");
r = await upload(withHead([0x3c, 0x73, 0x76, 0x67], 100), "image/svg+xml");
ok(r.status === 415, "SVG não é aceito (pode ter script)");
r = await upload(withHead([0xff, 0xd8, 0xff, 0xe0], 9 * 1024 * 1024), "image/jpeg");
ok(r.status === 413 && (await r.json()).code === "too_large", "imagem acima de 8 MB (modo D1) → 413");
r = await upload(MP4(9 * 1024 * 1024), "video/mp4");
j = await r.json();
ok(r.status === 413 && j.code === "video_too_large" && /vídeo/i.test(j.error), "vídeo grande sem R2 → mensagem clara");
r = await upload(MP4(300_000), "video/mp4", "?kind=file");
ok(r.status === 201, "vídeo MP4 pequeno é aceito no modo D1");
r = await upload(new Uint8Array(0), "image/png");
ok(r.status === 400, "arquivo vazio → 400");
r = await upload(img, "image/png", "", { origin: "https://evil.example" });
ok(r.status === 403, "upload de outra origem → 403");
r = await upload(img, "image/png", "?kind=capsule");
ok(r.status === 400, "casal não cria arquivo de cápsula pelo painel");
r = await upload(img, "image/png", "", { ck: "" });
ok(r.status === 401, "upload sem sessão → 401");

/* ---------- arquivo privado em pedaços + Range ---------- */
const big = withHead(PNG_HEAD, Math.round(CHUNK * 2.4));
r = await upload(big, "image/png", "?kind=file");
j = await r.json();
const privId = j.id;
ok(r.status === 201 && db.prepare("SELECT COUNT(*) AS n FROM media_chunks WHERE media_id = ?").get(privId).n === 3, "arquivo de 2,1 MB guardado no D1 em 3 pedaços (≤ 900 KB)");
r = await send("GET", "/api/media/" + privId, undefined, { ck: "" });
ok(r.status === 404, "privado sem sessão → 404");
r = await send("GET", "/api/media/" + privId, undefined, { ck: other });
ok(r.status === 404, "privado com sessão de OUTRO casal → 404");
r = await send("GET", "/api/media/" + privId, undefined, { ck: demoCk });
ok(r.status === 200 && /no-store/.test(r.headers.get("Cache-Control")) && same(await bytesOf(r), big), "privado com a sessão do casal dono → arquivo inteiro, sem cache");
r = await send("GET", "/api/media/" + privId, undefined, { ck: demoCk, headers: { Range: `bytes=${CHUNK - 10}-${CHUNK + 20}` } });
ok(r.status === 206 && r.headers.get("Content-Range") === `bytes ${CHUNK - 10}-${CHUNK + 20}/${big.length}` && same(await bytesOf(r), big.slice(CHUNK - 10, CHUNK + 21)), "Range atravessando pedaços → 206 com os bytes certos");
r = await send("GET", "/api/media/" + privId, undefined, { ck: demoCk, headers: { Range: `bytes=${big.length + 5}-` } });
ok(r.status === 416, "Range fora do arquivo → 416");
r = await send("DELETE", "/api/admin/media/" + privId, undefined, { ck: other });
ok(r.status === 404, "outro casal não apaga arquivo alheio");
r = await send("DELETE", "/api/admin/media/" + privId, undefined, { ck: demoCk });
ok(r.status === 200 && db.prepare("SELECT COUNT(*) AS n FROM media_chunks WHERE media_id = ?").get(privId).n === 0 && (await send("GET", "/api/media/" + privId, undefined, { ck: demoCk })).status === 404, "casal apaga o arquivo (pedaços somem)");

/* ---------- galeria colaborativa ---------- */
const guestPost = (fields, opts = {}) => send("POST", `/api/site/${SLUG}/fotos`, form(fields), { ck: "", ip: opts.ip || "10.1.0.1", headers: { "X-Device": opts.dev || "aparelho-teste-01" }, origin: opts.origin ?? O });
r = await guestPost({ file: png(), consent: "1" });
ok(r.status === 403, "envio de fotos fechado até o casal ligar");
r = await t.json("PATCH", "/api/admin/midia/ajustes", { gallery_on: true, uploads_on: true }, { ck: other });
ok(r.status === 200 && db.prepare("SELECT uploads_on FROM media_settings WHERE wedding_id = 'w_demo'").get() === undefined, "ajustes de outro casal não mexem no casal demo");
r = await t.json("PATCH", "/api/admin/midia/ajustes", { gallery_on: true, uploads_on: true });
ok(r.status === 200 && r.body.settings.uploads_on === true, "casal liga a galeria e o envio de fotos");
r = await guestPost({ file: png(), consent: "1" }, { origin: "https://evil.example" });
ok(r.status === 403, "envio de foto de outra origem → 403");
r = await guestPost({ file: png(), author: "Convidada" });
ok(r.status === 400 && (await r.json()).code === "consent", "sem consentimento → 400");
r = await guestPost({ file: new TextEncoder().encode("não é imagem nenhuma, só texto......"), consent: "1" });
ok(r.status === 415, "arquivo que não é imagem → 415");
r = await guestPost({ file: png(10, 10, [90, 140, 200]), author: "Marina Convidada", consent: "1" });
ok(r.status === 201 && (await r.json()).status === "pending", "convidado envia foto (fica pendente)");
let site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(site.mods.midia.gallery.uploads === true && site.mods.midia.gallery.photos.length === 0, "site não mostra foto pendente");
let adm = (await t.json("GET", "/api/admin/fotos")).body;
const pending = adm.photos.find(p => p.status === "pending");
ok(pending && pending.author === "Marina Convidada" && pending.source === "guest", "painel lista a pendente com o nome de quem enviou");
r = await send("GET", pending.url.replace("/m/", "/api/media/"), undefined, { ck: "" });
ok(r.status === 404, "arquivo de foto pendente não abre sem sessão");
ok((await t.json("GET", "/api/admin/fotos", null, { ck: other })).body.photos.length === 0, "outro casal não vê as fotos do casal demo");
r = await t.json("POST", "/api/admin/fotos/lote", { ids: [pending.id], action: "approve" }, { ck: other });
ok(db.prepare("SELECT status FROM gallery_photos WHERE id = ?").get(pending.id).status === "pending", "outro casal não aprova foto alheia");
r = await t.json("POST", "/api/admin/fotos/lote", { ids: [pending.id], action: "approve" });
ok(r.status === 200, "casal aprova em lote");
site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(site.mods.midia.gallery.photos.length === 1 && !JSON.stringify(site.mods.midia).includes("Marina"), "site mostra a aprovada, sem o nome de quem enviou");
r = await send("GET", site.mods.midia.gallery.photos[0].url.replace("/m/", "/api/media/"), undefined, { ck: "" });
ok(r.status === 200, "foto aprovada abre publicamente");
// casal sobe a própria foto, por momento
j = await (await upload(png(12, 12, [200, 180, 150]), "image/png", "?kind=gallery")).json();
r = await t.json("POST", "/api/admin/fotos", { media_id: j.id, moment: "cerimonia", caption: "Entrada" });
ok(r.status === 201, "casal adiciona foto à galeria (momento: cerimônia)");
r = await t.json("POST", "/api/admin/fotos", { media_id: j.id, moment: "cerimonia" }, { ck: other });
ok(r.status === 400, "outro casal não usa arquivo alheio na galeria");
r = await t.json("PATCH", "/api/admin/fotos/" + pending.id, { moment: "nada" });
ok(r.status === 400, "momento inválido → 400");
r = await t.json("POST", "/api/admin/fotos/lote", { ids: [pending.id], action: "moment", moment: "festa" });
ok(r.status === 200 && db.prepare("SELECT moment FROM gallery_photos WHERE id = ?").get(pending.id).moment === "festa", "casal reorganiza por momento em lote");
// limite por aparelho
let codes = [];
for (let i = 0; i < 16; i++) codes.push((await guestPost({ file: png(), consent: "1" }, { dev: "aparelho-limite-01", ip: "10.2.0." + i })).status);
ok(codes.filter(c => c === 201).length === 15 && codes.at(-1) === 429, "limite de envios por aparelho (429)");
adm = (await t.json("GET", "/api/admin/fotos")).body;
const toDelete = adm.photos.filter(p => p.status === "pending").map(p => p.id);
r = await t.json("POST", "/api/admin/fotos/lote", { ids: toDelete, action: "delete" });
ok(r.status === 200 && r.body.deleted === toDelete.length && db.prepare("SELECT COUNT(*) AS n FROM media WHERE wedding_id = 'w_demo' AND kind = 'gallery' AND public = 0").get().n === 0, "casal apaga pendentes em lote (arquivos somem)");

/* ---------- telão ---------- */
r = await t.json("GET", "/api/telao/" + "x".repeat(32), null, { ck: "" });
ok(r.status === 404, "telão com token inexistente → 404");
db.prepare("INSERT INTO guestbook (id, wedding_id, author, message, status) VALUES ('m_t1', 'w_demo', 'Tia Lúcia', 'Felicidades!', 'approved'), ('m_t2', 'w_demo', 'Anônimo', 'pendente', 'pending')").run();
r = await t.json("POST", "/api/admin/telao");
const link1 = r.body.link, tok1 = link1.split("/telao/")[1];
ok(r.status === 201 && link1.startsWith(O + "/telao/") && !db.prepare("SELECT token_hash FROM media_walls WHERE wedding_id = 'w_demo'").get().token_hash.includes(tok1), "link do telão gerado (só o hash no banco)");
r = await t.json("GET", "/api/telao/" + tok1, null, { ck: "" });
ok(r.status === 200 && r.body.photos.length === 2 && r.body.messages.length === 1 && r.body.messages[0].author === "Tia Lúcia", "telão mostra fotos e recados aprovados (não pendentes)");
r = await send("GET", "/telao/" + tok1, undefined, { ck: "" });
ok(r.status === 200 && /noindex/.test(r.headers.get("X-Robots-Tag") || "") && /no-store/.test(r.headers.get("Cache-Control") || "") && (await r.text()).includes("telao.js"), "página /telao/:token é privada (noindex, no-store)");
const tok2 = (await t.json("POST", "/api/admin/telao")).body.link.split("/telao/")[1];
ok((await t.json("GET", "/api/telao/" + tok1, null, { ck: "" })).status === 404 && (await t.json("GET", "/api/telao/" + tok2, null, { ck: "" })).status === 200, "gerar link novo revoga o anterior");
await t.json("DELETE", "/api/admin/telao");
ok((await t.json("GET", "/api/telao/" + tok2, null, { ck: "" })).status === 404, "telão revogado → 404");

/* ---------- cápsula do tempo ---------- */
const capPost = (fields, opts = {}) => send("POST", `/api/site/${SLUG}/capsula`, form(fields), { ck: "", ip: opts.ip || "10.3.0.1", origin: opts.origin ?? O });
r = await capPost({ author: "Primo Davi", message: "Oi", years: "1", consent: "1" });
ok(r.status === 404, "cápsula fechada até o casal ligar");
await t.json("PATCH", "/api/admin/midia/ajustes", { capsule_on: true });
site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(site.mods.midia.capsule.opens[1] === "2028-10-16" && site.mods.midia.capsule.opens[10] === "2037-10-16", "site informa as datas de abertura (1º, 5º, 10º aniversário)");
r = await capPost({ author: "Primo Davi", message: "Daqui a um ano\n\nlembrem do bolo!", years: "3", consent: "1" });
ok(r.status === 400, "só 1, 5 ou 10 anos");
r = await capPost({ author: "Primo Davi", message: "Oi de novo", years: "1" });
ok(r.status === 400, "cápsula sem consentimento → 400");
r = await capPost({ author: "Primo Davi", message: "Daqui a um ano\n\nlembrem do bolo!", years: "1", consent: "1", file: WEBM, __type: "audio/webm", __name: "audio.webm" });
ok(r.status === 201 && (await r.json()).opens === "2028-10-16", "convidado deixa cápsula com áudio para o 1º aniversário");
r = await capPost({ author: "Madrinha Bia", message: "Para daqui a cinco anos.", years: "5", consent: "1", file: png(), __type: "image/png" });
ok(r.status === 201, "cápsula com foto para o 5º aniversário");
r = await capPost({ author: "Alguém", message: "arquivo errado", years: "1", consent: "1", file: withHead([0x25, 0x50, 0x44, 0x46, 0x2d], 200), __type: "application/pdf", __name: "x.pdf" });
ok(r.status === 415, "cápsula aceita só foto ou áudio");
const capMedia = db.prepare("SELECT media_id FROM capsules WHERE wedding_id = 'w_demo' AND years = 1").get().media_id;
let caps = (await t.json("GET", "/api/admin/capsulas")).body;
ok(caps.years.find(y => y.years === 1).sealed === 1 && caps.years.find(y => y.years === 5).sealed === 1 && caps.opened.length === 0 && !JSON.stringify(caps).includes("bolo"), "painel mostra só quantas cápsulas há por data (conteúdo lacrado)");
r = await send("GET", "/api/media/" + capMedia, undefined, { ck: demoCk });
ok(r.status === 404, "nem o casal abre o áudio de uma cápsula lacrada");
r = await send("DELETE", "/api/admin/media/" + capMedia, undefined, { ck: demoCk });
ok(r.status === 409, "arquivo de cápsula lacrada não pode ser apagado");
let exp = (await t.json("GET", "/api/admin/midia/export")).body;
ok(!exp.files.some(f => f.id === capMedia) && !JSON.stringify(exp).includes("bolo") && exp.capsules.sealed.length === 2, "exportação não inclui cápsulas lacradas (só a contagem)");
await runCron(env, new Date("2028-10-15T12:00:00Z"));
ok((await t.json("GET", "/api/admin/capsulas")).body.opened.length === 0, "rotina diária na véspera não abre nada");
await runCron(env, new Date("2028-10-16T12:00:00Z"));
caps = (await t.json("GET", "/api/admin/capsulas")).body;
const c1 = caps.opened[0];
ok(caps.opened.length === 1 && c1.message.includes("bolo") && c1.message.includes("\n") && c1.media?.type === "audio/webm" && caps.years.find(y => y.years === 5).sealed === 1, "rotina diária no 1º aniversário abre só as cápsulas de 1 ano");
r = await send("GET", c1.media.url.replace("/m/", "/api/media/"), undefined, { ck: demoCk });
ok(r.status === 200 && r.headers.get("Content-Type") === "audio/webm", "depois de aberta, o casal ouve o áudio");
r = await send("GET", c1.media.url.replace("/m/", "/api/media/"), undefined, { ck: other });
ok(r.status === 404, "outro casal não ouve o áudio da cápsula");
ok((await t.json("GET", "/api/admin/capsulas", null, { ck: other })).body.opened.length === 0, "outro casal não vê cápsulas alheias");
exp = (await t.json("GET", "/api/admin/midia/export")).body;
ok(exp.capsules.opened.length === 1 && exp.files.some(f => f.id === capMedia) && exp.capsules.sealed.length === 1, "exportação inclui a cápsula aberta e o arquivo dela");

/* ---------- memórias, legado e aniversário ---------- */
const setDate = d => db.prepare("UPDATE weddings SET date_iso = ? WHERE id = 'w_demo'").run(d + "T16:30:00-03:00");
const today = todaySP();
const back = (y, dd = 0) => { const d = new Date(today + "T12:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() - y); d.setUTCDate(d.getUTCDate() + dd); return d.toISOString().slice(0, 10); };
const memA = await (await upload(MP4(5000), "audio/mp4", "?kind=memory")).json();
r = await t.json("POST", "/api/admin/lembrancas", { area: "memory", kind: "vow", title: "Os votos da Helena", body: "Prometo…", media_id: memA.id });
ok(r.status === 201, "casal guarda votos com áudio (memórias)");
r = await t.json("POST", "/api/admin/lembrancas", { area: "memory", kind: "vow", title: "x", media_id: pubId });
ok(r.status === 400, "arquivo de outra área não entra nas memórias");
await t.json("PATCH", "/api/admin/midia/ajustes", { memories_on: true, playlist_url: "https://open.spotify.com/playlist/exemplo", timeline: [{ time: "16h30", title: "Cerimônia", text: "No jardim" }] });
ok((await t.json("PATCH", "/api/admin/midia/ajustes", { playlist_url: "javascript:alert(1)" })).status === 400, "playlist só com https://");
site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(!site.mods.midia.memories && !site.mods.midia.anniversary, "antes da data do casamento: sem modo memórias (mesmo ligado)");
ok((await send("GET", "/api/media/" + memA.id, undefined, { ck: "" })).status === 404, "áudio dos votos é privado antes do modo memórias");
setDate(back(0, -3));
site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(site.mods.midia.memories?.items[0].title === "Os votos da Helena" && site.mods.midia.memories.playlist_url.startsWith("https://") && site.mods.midia.memories.timeline.length === 1 && !site.mods.midia.anniversary, "depois da data: site vira memórias (votos, playlist, linha do tempo)");
ok(site.mods.midia.gallery.show === true, "no modo memórias a galeria aparece");
ok((await send("GET", "/api/media/" + memA.id, undefined, { ck: "" })).status === 200, "áudio dos votos abre no modo memórias");
setDate(back(2));
site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(site.mods.midia.anniversary?.years === 2 && site.mods.midia.anniversary.photos.length >= 1, "no dia do aniversário: retrospectiva \"há 2 anos\"");
await t.json("PATCH", "/api/admin/midia/ajustes", { anniversary_on: false, renewal_text: "Renovação dos votos\nno jardim" });
site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(!site.mods.midia.anniversary, "modo aniversário pode ser desligado");
await t.json("PATCH", "/api/admin/midia/ajustes", { anniversary_on: true });
setDate(back(2, 1));
site = await (await send("GET", `/api/site/${SLUG}`, undefined, { ck: "" })).json();
ok(!site.mods.midia.anniversary && site.mods.midia.memories, "fora do dia: sem retrospectiva");
setDate("2027-10-16");
// legado: só o casal
const leg = await (await upload(png(), "image/png", "?kind=legacy&public=1")).json();
ok(db.prepare("SELECT public FROM media WHERE id = ?").get(leg.id).public === 0, "arquivo do legado é sempre privado");
r = await t.json("POST", "/api/admin/lembrancas", { area: "legacy", kind: "letter", title: "Carta para os nossos filhos", body: "Querida família,\n\n…", media_id: leg.id });
ok(r.status === 201, "legado: carta guardada");
ok((await t.json("GET", "/api/admin/lembrancas?area=legacy", null, { ck: other })).body.items.length === 0, "outro casal não vê o legado");
ok((await send("GET", "/api/media/" + leg.id, undefined, { ck: "" })).status === 404 && (await send("GET", "/api/media/" + leg.id, undefined, { ck: demoCk })).status === 200, "arquivo do legado só com a sessão do casal");
db.prepare("UPDATE memberships SET role = 'planner' WHERE user_id = 'u_demo'").run();
ok((await t.json("GET", "/api/admin/lembrancas?area=legacy")).status === 403 && (await send("GET", "/api/media/" + leg.id, undefined, { ck: demoCk })).status === 404, "cerimonial (planner) não vê o legado");
db.prepare("UPDATE memberships SET role = 'owner' WHERE user_id = 'u_demo'").run();

/* ---------- exportação ---------- */
exp = (await t.json("GET", "/api/admin/midia/export")).body;
ok(exp.files.length >= 5 && exp.files.every(f => f.url === "/m/" + f.id && f.type && f.size > 0) && exp.legacy.length === 1 && exp.memories.length === 1 && exp.gallery.length === 2, "exportação: lista de arquivos com URL e metadados, galeria, memórias e legado");
const full = (await t.json("GET", "/api/admin/export")).body;
ok(full.midia && full.midia.files.length >= 4 && full.midia.legacy.length === 0 && full.midia.legacy_count === 1, "exportação completa (LGPD) inclui a mídia (legado só pela aba)");
ok((await t.json("GET", "/api/admin/midia/export", null, { ck: other })).body.files.every(f => !exp.files.some(x => x.id === f.id)), "exportação de outro casal não lista arquivos do casal demo");

/* ---------- visão geral ---------- */
await guestPost({ file: png(), consent: "1" }, { dev: "aparelho-outro-02", ip: "10.9.9.9" });
const ov = (await t.json("GET", "/api/admin/overview")).body;
ok(ov.mods.midia.pending_photos === 1 && ov.mods.midia.alerts[0].href === "#fotos", "visão geral avisa fotos pendentes");

/* ---------- limpeza LGPD dos convidados ---------- */
db.prepare("UPDATE gallery_photos SET author = 'Nome Guardado' WHERE wedding_id = 'w_demo' AND source = 'guest' AND status = 'approved'").run();
const pendMedia = db.prepare("SELECT media_id FROM gallery_photos WHERE wedding_id = 'w_demo' AND status = 'pending'").get().media_id;
const capsBefore = db.prepare("SELECT COUNT(*) AS n FROM capsules WHERE wedding_id = 'w_demo'").get().n;
const approvedBefore = db.prepare("SELECT COUNT(*) AS n FROM gallery_photos WHERE wedding_id = 'w_demo' AND status = 'approved'").get().n;
const otherPend = (await t.json("PATCH", "/api/admin/midia/ajustes", { gallery_on: true, uploads_on: true }, { ck: other }), await send("POST", "/api/site/lia-e-tomas/fotos", form({ file: png(), consent: "1", author: "Convidado da Lia" }), { ck: "", ip: "10.7.0.1" })).status;
const pr = await midia.purgeGuests(env, "w_demo");
ok(pr.pending_photos_deleted === 1 && !db.prepare("SELECT id FROM media WHERE id = ?").get(pendMedia), "limpeza: fotos pendentes de convidados apagadas (com o arquivo)");
ok(db.prepare("SELECT COUNT(*) AS n FROM gallery_photos WHERE wedding_id = 'w_demo' AND status = 'approved'").get().n === approvedBefore && db.prepare("SELECT COUNT(*) AS n FROM gallery_photos WHERE wedding_id = 'w_demo' AND author <> ''").get().n === 0, "limpeza: fotos aprovadas ficam, sem o nome de quem enviou");
ok(db.prepare("SELECT COUNT(*) AS n FROM capsules WHERE wedding_id = 'w_demo' AND author <> ''").get().n === capsBefore, "limpeza: cápsulas do tempo ficam inteiras (promessa de longo prazo)");
ok(otherPend === 201 && db.prepare("SELECT COUNT(*) AS n FROM gallery_photos WHERE wedding_id = 'w_lia' AND status = 'pending' AND author = 'Convidado da Lia'").get().n === 1, "limpeza de um casal não mexe nos dados de outro");

t.done("midia");
