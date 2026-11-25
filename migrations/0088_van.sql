-- Quem quer ir de van (src/mods/van.js): pergunta dentro do RSVP. Desligada por padrão; o casal liga no painel › Van.
CREATE TABLE IF NOT EXISTS van_settings (
  wedding_id  TEXT PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  on_         INTEGER NOT NULL DEFAULT 0,          -- pergunta "Quer ir de van?" no RSVP
  texto       TEXT NOT NULL DEFAULT '',            -- vazio = texto padrão
  ponto       TEXT NOT NULL DEFAULT '',            -- ponto de saída (opcional)
  saida       TEXT NOT NULL DEFAULT '',            -- horário de saída (opcional)
  volta       TEXT NOT NULL DEFAULT '',            -- horário de volta (opcional)
  vagas       INTEGER,                             -- NULL = sem limite
  valor_cents INTEGER,                             -- NULL = não mostra valor
  exige_celular INTEGER NOT NULL DEFAULT 0,        -- 1 = WhatsApp obrigatório (para o grupo da van)
  grupo_url   TEXT NOT NULL DEFAULT '',            -- link do grupo do WhatsApp; só aparece para quem já se inscreveu
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Dados de convidado (nome, celular, observação): entram na exportação e saem na limpeza LGPD.
CREATE TABLE IF NOT EXISTS van_interessados (
  id           TEXT PRIMARY KEY,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  household_id TEXT REFERENCES households(id) ON DELETE CASCADE,  -- família que respondeu no RSVP (uma linha por família)
  nome         TEXT NOT NULL,
  pessoas      INTEGER NOT NULL DEFAULT 1 CHECK (pessoas BETWEEN 1 AND 30),
  celular      TEXT NOT NULL DEFAULT '',                           -- só dígitos, com DDD
  obs          TEXT NOT NULL DEFAULT '',
  espera       INTEGER NOT NULL DEFAULT 0,                         -- 1 = lista de espera (passou das vagas)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_van_household ON van_interessados(wedding_id, household_id) WHERE household_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_van_w ON van_interessados(wedding_id, espera, created_at);

-- Pétala & Lucas: lista ligada, com o texto do casal e WhatsApp obrigatório (o casal vai criar um grupo com os interessados).
-- Sem ponto, horário, vagas, valor nem link do grupo por enquanto.
INSERT INTO van_settings (wedding_id, on_, texto, exige_celular)
SELECT id, 1, 'Estamos organizando uma van para o casamento. Se você tem interesse em ir de van, deixe seu nome e WhatsApp que a gente te coloca no grupo com os detalhes.', 1
FROM weddings WHERE slug = 'petala-e-lucas'
ON CONFLICT(wedding_id) DO NOTHING;
