-- Módulo "convidados": confirmar presença direto no site do casal, pelo nome completo.
ALTER TABLE weddings ADD COLUMN rsvp_by_name INTEGER NOT NULL DEFAULT 1;   -- 1 = o site mostra "Confirme pelo seu nome"

-- Acesso temporário ao RSVP de uma família, emitido quando o nome completo bate com exatamente uma pessoa.
CREATE TABLE IF NOT EXISTS rsvp_name_tokens (
  token_hash   TEXT PRIMARY KEY,                    -- SHA-256 do token (o token não é guardado)
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,                       -- ISO; ~30 minutos
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_rsvp_name_tokens_h ON rsvp_name_tokens(household_id);
