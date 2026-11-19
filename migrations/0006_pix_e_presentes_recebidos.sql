-- Pix com QR Code (BR Code estático, sem intermediário) e "Já presenteei" dos convidados.
ALTER TABLE weddings ADD COLUMN pix_name TEXT NOT NULL DEFAULT '';   -- nome no QR Code (o app do banco mostra o titular real da chave)
ALTER TABLE weddings ADD COLUMN pix_city TEXT NOT NULL DEFAULT '';   -- cidade no QR Code (campo obrigatório do padrão)

CREATE TABLE IF NOT EXISTS gift_notices (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  gift       TEXT NOT NULL,                      -- título do presente (vem da lista do casal, não do convidado)
  cents      INTEGER NOT NULL DEFAULT 0,         -- valor do presente; em "valor livre", o que o convidado informou
  author     TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  checked    INTEGER NOT NULL DEFAULT 0,         -- 1 = os noivos conferiram no extrato
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_gift_notices_w ON gift_notices(wedding_id, created_at);

UPDATE weddings SET pix_name = 'Petala e Lucas', pix_city = 'Piraquara' WHERE slug = 'petala-e-lucas';
