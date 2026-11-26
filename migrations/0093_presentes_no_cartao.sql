-- Presentes no cartão pela InfinitePay (Checkout Integrado). O Pix continua igual.
-- weddings.infinitepay_tag: a InfiniteTag do recebedor (sem o $). Vazio = sem botão de cartão.
ALTER TABLE weddings ADD COLUMN infinitepay_tag TEXT NOT NULL DEFAULT '';
-- gift_notices.via: '' (aviso "Já presenteei" do Pix) ou 'cartao' (pagamento confirmado na InfinitePay)
ALTER TABLE gift_notices ADD COLUMN via TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS card_orders (
  id              TEXT PRIMARY KEY,                       -- order_nsu enviado à InfinitePay
  wedding_id      TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  gift            TEXT NOT NULL,
  cents           INTEGER NOT NULL CHECK (cents BETWEEN 100 AND 10000000),
  author          TEXT NOT NULL,
  message         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',        -- pending | paid
  transaction_nsu TEXT,
  invoice_slug    TEXT,
  paid_cents      INTEGER,
  installments    INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at         TEXT
);
CREATE INDEX IF NOT EXISTS ix_card_orders_w ON card_orders(wedding_id, status, created_at);
