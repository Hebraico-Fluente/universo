-- Convites de acesso ao painel: link de uso único; a pessoa escolhe o próprio e-mail e senha.
CREATE TABLE IF NOT EXISTS access_invites (
  token_hash TEXT PRIMARY KEY,                       -- SHA-256 do token (o token nunca é guardado nem publicado)
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','planner','viewer')),
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
