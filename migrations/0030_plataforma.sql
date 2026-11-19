-- Plataforma (Gueta Studio): administradores, clientes, planos, cobranças manuais, funcionalidades,
-- domínios próprios, erros do servidor e chamados de suporte. Nada aqui guarda token em claro.

-- Papel na plataforma: 'admin' ou NULL. Ninguém vira admin por rota pública: só por convite de uso único (abaixo).
ALTER TABLE users ADD COLUMN platform_role TEXT CHECK (platform_role IN ('admin'));

-- Estado do casamento como cliente da plataforma.
ALTER TABLE weddings ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;        -- 1 = site e painel mostram aviso de pausa
ALTER TABLE weddings ADD COLUMN suspended_at TEXT;
ALTER TABLE weddings ADD COLUMN plan_id TEXT;                                -- plans.id (sem FK: o plano pode ser apagado)
ALTER TABLE weddings ADD COLUMN features_json TEXT NOT NULL DEFAULT '{}';    -- {"mesas":false,...}; ausente = ligado
ALTER TABLE weddings ADD COLUMN platform_note TEXT NOT NULL DEFAULT '';      -- observação interna do estúdio

-- Convite de uso único para criar um administrador (o hash é inserido pelo workflow "plataforma-admin").
CREATE TABLE IF NOT EXISTS platform_invites (
  token_hash TEXT PRIMARY KEY,                       -- SHA-256 do token (o token nunca é guardado)
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessões do painel da plataforma (separadas das sessões do casal, que são sempre de um casamento).
CREATE TABLE IF NOT EXISTS platform_sessions (
  id_hash    TEXT PRIMARY KEY,                       -- SHA-256 do valor do cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  project_cents INTEGER NOT NULL DEFAULT 0 CHECK (project_cents >= 0),   -- preço único por projeto
  monthly_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cents >= 0),   -- mensalidade
  features_json TEXT NOT NULL DEFAULT '[]',                              -- chaves de funcionalidades incluídas
  description   TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registro MANUAL de cobranças e pagamentos (não há gateway integrado).
CREATE TABLE IF NOT EXISTS charges (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  cents       INTEGER NOT NULL CHECK (cents > 0),
  due_date    TEXT NOT NULL,                                             -- AAAA-MM-DD
  method      TEXT NOT NULL CHECK (method IN ('pix','cartao','transferencia')),
  status      TEXT NOT NULL CHECK (status IN ('pago','pendente','atrasado')),
  paid_at     TEXT,                                                      -- AAAA-MM-DD
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_charges_w ON charges(wedding_id, due_date);

-- Domínio próprio do casal (ex.: petalaelucas.com.br). Só 'active' é servido pelo Worker.
CREATE TABLE IF NOT EXISTS domains (
  host        TEXT PRIMARY KEY,                                          -- minúsculo, sem www/porta
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_domains_w ON domains(wedding_id);

-- Erros 500 do servidor: só rota (sem tokens), método, tipo e mensagem higienizada. Sem IP, e-mail ou corpo.
CREATE TABLE IF NOT EXISTS error_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  method  TEXT NOT NULL,
  route   TEXT NOT NULL,
  kind    TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_error_log_at ON error_log(at);

-- Chamados de suporte: o casal abre pelo painel, o estúdio responde na plataforma.
CREATE TABLE IF NOT EXISTS tickets (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_tickets_w ON tickets(wedding_id, updated_at);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author      TEXT NOT NULL CHECK (author IN ('casal','plataforma')),
  author_name TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_ticket_messages_t ON ticket_messages(ticket_id, created_at);
