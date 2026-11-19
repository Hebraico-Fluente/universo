-- Universo · esquema D1 (SQLite). Multi-tenant lógico: toda tabela de dados tem wedding_id.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS weddings (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,              -- endereço público: /c/:slug
  names         TEXT NOT NULL,                     -- "Helena & Rafael"
  date_iso      TEXT NOT NULL,                     -- início da cerimônia, ISO com fuso
  city          TEXT NOT NULL DEFAULT '',
  universe      TEXT NOT NULL DEFAULT 'editorial' CHECK (universe IN ('timeless','editorial','dreamscape')),
  welcome       TEXT NOT NULL DEFAULT '',
  hero_image    TEXT NOT NULL DEFAULT '',
  story_json    TEXT NOT NULL DEFAULT '[]',        -- [{year,title,text,image}]
  gifts_json    TEXT NOT NULL DEFAULT '[]',        -- [{title,cents}] (presentes vão direto para o casal)
  pix_key       TEXT NOT NULL DEFAULT '',
  faq_json      TEXT NOT NULL DEFAULT '[]',        -- [{q,a}] só o que o casal decidiu publicar
  rsvp_deadline TEXT NOT NULL,                     -- AAAA-MM-DD
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT NOT NULL,
  pass_hash  TEXT NOT NULL,                        -- PBKDF2-SHA256 (base64)
  pass_salt  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','planner','viewer')),
  PRIMARY KEY (user_id, wedding_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash    TEXT PRIMARY KEY,                     -- SHA-256 do valor do cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  venue      TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  dress_code TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  is_public  INTEGER NOT NULL DEFAULT 1,           -- 0 = só aparece para quem foi convidado (ex.: jantar de ensaio)
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_events_w ON events(wedding_id, sort);

-- Uma "família convidada": recebe um convite e um link.
CREATE TABLE IF NOT EXISTS households (
  id           TEXT PRIMARY KEY,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                      -- "Família Andrade"
  greeting     TEXT NOT NULL DEFAULT '',           -- como o convite chama: "Tia Lúcia e Tio Beto"
  message      TEXT NOT NULL DEFAULT '',           -- mensagem pessoal do casal
  max_guests   INTEGER NOT NULL DEFAULT 1 CHECK (max_guests BETWEEN 1 AND 20),
  token_hash   TEXT UNIQUE,                        -- SHA-256 do token do convite (o token não é guardado)
  token_at     TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0,
  note_to_couple TEXT NOT NULL DEFAULT '',         -- recado deixado no RSVP
  responded_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_households_w ON households(wedding_id);

CREATE TABLE IF NOT EXISTS guests (
  id            TEXT PRIMARY KEY,
  wedding_id    TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_child      INTEGER NOT NULL DEFAULT 0,
  diet          TEXT NOT NULL DEFAULT '',          -- opcional, dado sensível: só para o buffet
  accessibility TEXT NOT NULL DEFAULT '',          -- opcional
  sort          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_guests_h ON guests(household_id);
CREATE INDEX IF NOT EXISTS ix_guests_w ON guests(wedding_id);

-- Para quais eventos cada família foi convidada.
CREATE TABLE IF NOT EXISTS invitations (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, event_id)
);

-- Resposta de cada pessoa para cada evento.
CREATE TABLE IF NOT EXISTS rsvps (
  guest_id   TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('yes','no')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guest_id, event_id)
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id            TEXT PRIMARY KEY,
  wedding_id    TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  planned_cents INTEGER NOT NULL DEFAULT 0 CHECK (planned_cents >= 0),
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budget_items (
  id              TEXT PRIMARY KEY,
  wedding_id      TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  category_id     TEXT NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  vendor          TEXT NOT NULL DEFAULT '',
  amount_cents    INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),   -- valor contratado/orçado
  paid_cents      INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  due_date        TEXT,                                                 -- próximo vencimento
  per_guest_cents INTEGER,                                              -- custo por convidado, se o contrato for por pessoa
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_budget_w ON budget_items(wedding_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wedding_id TEXT NOT NULL,
  actor      TEXT NOT NULL,                        -- user:<id> | guest:<household id>
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_audit_w ON audit_log(wedding_id, at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,                            -- ex.: "invite:1.2.3.4"
  win    TEXT NOT NULL,                            -- janela (hora)
  hits   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, win)
);
-- Identidade própria do casal (por cima do universo), cronograma, traje, mapa ilustrado e mural de recados.
ALTER TABLE weddings ADD COLUMN theme TEXT NOT NULL DEFAULT '';          -- identidade sob medida: public/assets/themes/<theme>/
ALTER TABLE weddings ADD COLUMN venue_name TEXT NOT NULL DEFAULT '';
ALTER TABLE weddings ADD COLUMN schedule_json TEXT NOT NULL DEFAULT '[]'; -- [{time,title,text,icon}]
ALTER TABLE weddings ADD COLUMN dress_json TEXT NOT NULL DEFAULT '[]';    -- [{title,text,icon}]
ALTER TABLE weddings ADD COLUMN map_image TEXT NOT NULL DEFAULT '';
ALTER TABLE weddings ADD COLUMN gift_url TEXT NOT NULL DEFAULT '';
ALTER TABLE weddings ADD COLUMN rsvp_note TEXT NOT NULL DEFAULT '';
ALTER TABLE weddings ADD COLUMN guestbook INTEGER NOT NULL DEFAULT 1;     -- mural de recados ligado

CREATE TABLE IF NOT EXISTS guestbook (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),  -- só aparece no site depois de aprovado
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_guestbook_w ON guestbook(wedding_id, status, created_at);
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
-- Quiz "Quanto você conhece o casal?" (perguntas só com fatos que o casal publicou)
ALTER TABLE weddings ADD COLUMN quiz_json TEXT NOT NULL DEFAULT '[]';   -- [{q, options[], answer(index), fact}]
-- Pix com QR Code e "Já presenteei"
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

