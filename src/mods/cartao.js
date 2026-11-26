/**
 * Módulo "cartao" (contrato em src/mods/README.md): presentes pagos no cartão de crédito pela InfinitePay
 * (Checkout Integrado: https://www.infinitepay.io/checkout-documentacao). O Pix do casal continua como está.
 *
 * Liga quando o casal preenche a InfiniteTag (weddings.infinitepay_tag) no painel › Site › Presentes.
 *   POST /api/site/:slug/presentes/cartao              cria o pedido e o link de pagamento → { url }
 *   POST /api/site/:slug/presentes/cartao/:id/confirmar  volta do checkout (transaction_nsu, slug) → { paid }
 *   POST /api/infinitepay/webhook                       aviso da InfinitePay (sem assinatura)
 * Nada é dado como pago pelo que o navegador ou o webhook dizem: o servidor sempre pergunta à InfinitePay
 * (payment_check) e confere o valor. Pago → vira um aviso de presente (gift_notices, via 'cartao') uma única vez.
 * Título e valor do presente vêm da lista do casal; só o "valor livre" aceita o valor informado (mínimo R$ 1).
 */
import { json, fail, str, int, body, rateLimit, clientIp, parseJson } from "../lib.js";

export const IP_API = "https://api.checkout.infinitepay.io";
const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const orderId = () => "pc_" + [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, "0")).join("");

export function cleanTag(v) {
  v = String(v ?? "").trim().replace(/^\$/, "").toLowerCase();
  if (v && !/^[a-z0-9._-]{2,40}$/.test(v)) fail(400, "InfiniteTag: só letras, números, ponto, hífen ou _ (sem o $)", "invalid");
  return v;
}

async function ipPost(path, payload) {
  const r = await fetch(IP_API + path, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, j };
}

/** Pergunta à InfinitePay se o pedido foi pago e, se foi, grava (uma vez só) o aviso de presente. */
async function settle(env, o, tag, transaction_nsu, invoice_slug) {
  if (o.status === "paid") return true;
  if (!transaction_nsu || !invoice_slug) return false;
  const r = await ipPost("/payment_check", { handle: tag, order_nsu: o.id, transaction_nsu: String(transaction_nsu).slice(0, 80), slug: String(invoice_slug).slice(0, 80) });
  const j = r.j || {};
  if (!r.ok || !j.success || !j.paid || !(Number(j.amount) >= o.cents)) return false;
  const done = await run(env, "UPDATE card_orders SET status = 'paid', transaction_nsu = ?, invoice_slug = ?, paid_cents = ?, installments = ?, paid_at = datetime('now') WHERE id = ? AND status = 'pending'",
    String(transaction_nsu).slice(0, 80), String(invoice_slug).slice(0, 80), Number(j.paid_amount) || null, Number(j.installments) || null, o.id);
  if (done.meta?.changes) await run(env, "INSERT INTO gift_notices (id, wedding_id, gift, cents, author, message, via) VALUES (?, ?, ?, ?, ?, ?, 'cartao')",
    "p_" + o.id.slice(3), o.wedding_id, o.gift, o.cents, o.author, o.message);
  return true;
}

async function create(ctx, slug) {
  const { req, env, url } = ctx;
  const w = await first(env, "SELECT id, slug, names, gifts_json, infinitepay_tag FROM weddings WHERE slug = ?", slug);
  if (!w || !w.infinitepay_tag) fail(404, "Pagamento no cartão indisponível", "not_found");
  await rateLimit(env, "card:" + clientIp(req), 10);
  const b = await body(req, 4000);
  const gifts = parseJson(w.gifts_json, []);
  const g = b.gift == null ? { title: "Presente (valor livre)", cents: 0 } : gifts[int(b.gift, { min: 0, max: Math.max(0, gifts.length - 1), field: "Presente" })];
  if (!g) fail(400, "Presente: valor inválido", "invalid");
  const cents = g.cents > 0 ? g.cents : int(b.cents, { min: 100, max: 10_000_000, field: "Valor (mínimo R$ 1,00)" });
  const author = str(b.author, { min: 2, max: 60, field: "Seu nome" }), message = str(b.message, { max: 400, field: "Mensagem" });
  const id = orderId(), title = String(g.title || "Presente").slice(0, 80);
  // volta para o mesmo endereço por onde o convidado entrou (domínio próprio → "/", plataforma → "/c/:slug")
  const back = new URL(String(b.back || ""), url.origin);
  const path = back.origin === url.origin && (back.pathname === "/" || back.pathname === "/c/" + slug) ? back.pathname : "/c/" + slug;
  await run(env, "INSERT INTO card_orders (id, wedding_id, gift, cents, author, message) VALUES (?, ?, ?, ?, ?, ?)", id, w.id, title, cents, author, message);
  const r = await ipPost("/links", {
    handle: w.infinitepay_tag, order_nsu: id,
    redirect_url: `${url.origin}${path}?cartao=${id}`,
    webhook_url: `${url.origin}/api/infinitepay/webhook`,
    items: [{ quantity: 1, price: cents, description: `Presente para ${w.names}: ${title}`.slice(0, 120) }],
  });
  const link = r.j && (r.j.url || r.j.link);
  if (!r.ok || !/^https:\/\//.test(String(link || ""))) {
    console.error("infinitepay links", r.status);
    await run(env, "DELETE FROM card_orders WHERE id = ?", id);
    fail(502, "Não conseguimos abrir o pagamento no cartão agora. Tente de novo em instantes ou use o Pix.", "provider");
  }
  return json({ url: link, order: id }, 201);
}

async function confirm(ctx, slug, id) {
  const { req, env } = ctx;
  await rateLimit(env, "cardok:" + clientIp(req), 30);
  const o = await first(env, "SELECT o.*, w.infinitepay_tag AS tag FROM card_orders o JOIN weddings w ON w.id = o.wedding_id WHERE o.id = ? AND w.slug = ?", id, slug);
  if (!o) fail(404, "Pedido não encontrado", "not_found");
  const b = await body(req, 2000);
  const paid = await settle(env, o, o.tag, b.transaction_nsu, b.slug);
  return json({ paid, gift: o.gift, cents: o.cents });
}

async function webhook(ctx) {
  const { req, env } = ctx;
  await rateLimit(env, "ipwh:" + clientIp(req), 120);
  let b = {}; try { b = await req.json(); } catch {}
  const id = String(b.order_nsu || "");
  if (!/^pc_[0-9a-f]{24}$/.test(id)) return json({ ok: true }); // não é nosso: nada a fazer
  const o = await first(env, "SELECT o.*, w.infinitepay_tag AS tag FROM card_orders o JOIN weddings w ON w.id = o.wedding_id WHERE o.id = ?", id);
  if (!o) return json({ ok: true });
  const paid = await settle(env, o, o.tag, b.transaction_nsu, b.invoice_slug || b.slug);
  return paid ? json({ ok: true }) : json({ ok: false }, 400); // 400 = a InfinitePay tenta de novo
}

export default {
  name: "cartao",
  async public(ctx) {
    const { p, m } = ctx; let r;
    if (m !== "POST") return null;
    if (p === "/api/infinitepay/webhook") return webhook(ctx);
    if ((r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/presentes\/cartao$/))) { ctx.sameOrigin(); return create(ctx, r[1]); }
    if ((r = p.match(/^\/api\/site\/([a-z0-9-]{3,60})\/presentes\/cartao\/(pc_[0-9a-f]{24})\/confirmar$/))) { ctx.sameOrigin(); return confirm(ctx, r[1], r[2]); }
    return null;
  },
  async site(env, w) { return { on: !!w.infinitepay_tag }; },
  async exportData(env, W) { return { card_orders: (await env.DB.prepare("SELECT * FROM card_orders WHERE wedding_id = ?").bind(W).all()).results }; },
  async purgeGuests(env, W) { await run(env, "UPDATE card_orders SET author = '', message = '' WHERE wedding_id = ?", W); },
};
