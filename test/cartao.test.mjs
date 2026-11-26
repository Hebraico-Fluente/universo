/** Presentes no cartão pela InfinitePay: pedido, link, confirmação só pelo payment_check, webhook, uma vez só. */
import fs from "node:fs";
import { setup } from "./helpers.mjs";
import { IP_API } from "../src/mods/cartao.js";

const t = await setup();
const { ok, env } = t;
const db = env._db;
const read = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

// InfinitePay de mentira
const calls = []; let paidOn = new Set(); let linkFails = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  if (!url.startsWith(IP_API)) return realFetch(u, o);
  const b = JSON.parse(o.body || "{}"); calls.push([url.slice(IP_API.length), b]);
  if (url.endsWith("/links")) return linkFails ? new Response("erro", { status: 500 }) : Response.json({ url: "https://checkout.infinitepay.io/petala/abc" });
  if (url.endsWith("/payment_check")) { const p = paidOn.has(b.order_nsu) && b.transaction_nsu === "tx-1"; return Response.json({ success: true, paid: p, amount: p ? 25178 : 0, paid_amount: 25900, installments: 3, capture_method: "credit_card" }); }
  return new Response("?", { status: 404 });
};

const SITE = "/api/site/petala-e-lucas";
// desligado sem InfiniteTag
db.prepare("UPDATE weddings SET infinitepay_tag = '' WHERE slug = 'petala-e-lucas'").run();
ok((await t.json("GET", SITE, null, { ck: "" })).body.mods.cartao.on === false, "sem InfiniteTag: botão de cartão desligado");
ok((await t.json("POST", SITE + "/presentes/cartao", { gift: 0, author: "Ana" }, { ck: "" })).status === 404, "sem InfiniteTag: criar pagamento dá 404");

db.prepare("UPDATE weddings SET infinitepay_tag = 'petala-teste' WHERE slug = 'petala-e-lucas'").run();
ok((await t.json("GET", SITE, null, { ck: "" })).body.mods.cartao.on === true, "com InfiniteTag: botão de cartão ligado");

const gifts = JSON.parse(db.prepare("SELECT gifts_json FROM weddings WHERE slug = 'petala-e-lucas'").get().gifts_json);
let r = await t.json("POST", SITE + "/presentes/cartao", { gift: 0, cents: 1, author: "Ana Lima", message: "Felicidades!", back: "/" }, { ck: "" });
ok(r.status === 201 && r.body.url === "https://checkout.infinitepay.io/petala/abc", "cria o link de pagamento");
const [path, payload] = calls.at(-1);
ok(path === "/links" && payload.handle === "petala-teste" && payload.items[0].price === gifts[0].cents, "valor do presente vem da lista (não do navegador)");
ok(payload.redirect_url.includes("?cartao=" + r.body.order) && payload.webhook_url.endsWith("/api/infinitepay/webhook"), "volta e webhook");
const id = r.body.order;

// valor livre: mínimo R$ 1
ok((await t.json("POST", SITE + "/presentes/cartao", { gift: null, cents: 50, author: "Ana" }, { ck: "" })).status === 400, "valor livre abaixo de R$ 1 recusado");
ok((await t.json("POST", SITE + "/presentes/cartao", { gift: null, cents: 15000, author: "Bia" }, { ck: "" })).status === 201, "valor livre aceito");

// confirmação: não pago ainda
r = await t.json("POST", `${SITE}/presentes/cartao/${id}/confirmar`, { transaction_nsu: "tx-1", slug: "inv-1" }, { ck: "" });
ok(r.status === 200 && r.body.paid === false, "sem pagamento na InfinitePay: não confirma");
ok(!db.prepare("SELECT 1 FROM gift_notices WHERE via = 'cartao'").get(), "nenhum aviso de presente criado");

// pago na InfinitePay → confirma uma vez
paidOn.add(id);
r = await t.json("POST", `${SITE}/presentes/cartao/${id}/confirmar`, { transaction_nsu: "tx-falso", slug: "inv-1" }, { ck: "" });
ok(r.body.paid === false, "transaction_nsu errado: não confirma");
r = await t.json("POST", `${SITE}/presentes/cartao/${id}/confirmar`, { transaction_nsu: "tx-1", slug: "inv-1" }, { ck: "" });
ok(r.body.paid === true, "pago: confirma");
const { handle } = await import("../src/worker.js");
const wh = await handle(new Request("https://universo.test/api/infinitepay/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_nsu: id, transaction_nsu: "tx-1", invoice_slug: "inv-1", amount: 25178 }) }), env);
ok(wh.status === 200, "webhook responde 200");
const notes = db.prepare("SELECT * FROM gift_notices WHERE via = 'cartao'").all();
ok(notes.length === 1 && notes[0].author === "Ana Lima" && notes[0].cents === gifts[0].cents, "um aviso de presente só, com nome e valor");

// webhook de outro pedido não pago → 400 (InfinitePay tenta de novo); lixo → 200
const id2 = db.prepare("SELECT id FROM card_orders WHERE status = 'pending' LIMIT 1").get().id;
let w2 = await handle(new Request("https://universo.test/api/infinitepay/webhook", { method: "POST", body: JSON.stringify({ order_nsu: id2, transaction_nsu: "tx-1", invoice_slug: "x" }) }), env);
ok(w2.status === 400, "webhook de pedido não pago: 400");
w2 = await handle(new Request("https://universo.test/api/infinitepay/webhook", { method: "POST", body: "{}" }), env);
ok(w2.status === 200, "webhook sem pedido nosso: 200");

// falha da InfinitePay: mensagem amigável e pedido não fica pendurado
linkFails = true;
const before = db.prepare("SELECT COUNT(*) n FROM card_orders").get().n;
r = await t.json("POST", SITE + "/presentes/cartao", { gift: 1, author: "Ana" }, { ck: "" });
ok(r.status === 502 && db.prepare("SELECT COUNT(*) n FROM card_orders").get().n === before, "InfinitePay fora: 502 e nada gravado");
linkFails = false;

// painel e editor
await t.loginDemo();
ok(read("public/assets/painel/site.js").includes("infinitepay_tag") && read("public/assets/site.js").includes("Pagar no cartão"), "campo no painel e botão no site");
ok(read("migrations/0093_presentes_no_cartao.sql").includes("card_orders"), "migração 0093");
t.done("cartao");
