-- Módulo "experiências": concierge, copiloto, padrinhos, mensagens secretas, surpresas com sigilo,
-- quest, passaporte multi-evento, jornal, lugares e documentário. Toda tabela tem wedding_id.
-- Tokens (padrinhos e colaboradores de surpresas) só como hash SHA-256.

-- Interruptores e configurações do casal (um registro por casamento).
CREATE TABLE IF NOT EXISTS exp_settings (
  wedding_id     TEXT PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  flags_json     TEXT NOT NULL DEFAULT '{}',   -- {"concierge":true,"quest":false,...}; ausente = padrão do módulo
  padrinhos_json TEXT NOT NULL DEFAULT '{}',   -- {instructions, dress, schedule:[{time,text}], contacts:[{label,value}]}
  soundtrack_json TEXT NOT NULL DEFAULT '{}',  -- {url (arquivo próprio, mesmo site), title, song (só para links de busca)}
  jornal_json    TEXT NOT NULL DEFAULT '{}',   -- revisão do jornal: {headline, note, sections:{...}, messages:[ids]}
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Respostas do concierge escritas pelo casal (estacionamento, transporte, hospedagem…).
CREATE TABLE IF NOT EXISTS concierge_answers (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL,                   -- estacionamento | transporte | hospedagem | traje | acompanhante | criancas | comida | presentes | chegada | outro
  question   TEXT NOT NULL DEFAULT '',        -- pergunta de exemplo (também usada na busca)
  answer     TEXT NOT NULL,
  keywords   TEXT NOT NULL DEFAULT '',        -- palavras extras, separadas por vírgula
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_concierge_w ON concierge_answers(wedding_id, sort);

-- Padrinhos e madrinhas: link individual (hash), revogável.
CREATE TABLE IF NOT EXISTS padrinhos (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'padrinho',
  token_hash TEXT UNIQUE,
  token_at   TEXT,
  revoked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_padrinhos_w ON padrinhos(wedding_id);

-- Tarefas que o casal atribui aos padrinhos (padrinho_id NULL = para todos).
CREATE TABLE IF NOT EXISTS padrinho_tasks (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  padrinho_id TEXT REFERENCES padrinhos(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  due_date    TEXT,
  done_at     TEXT,
  done_by     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_ptasks_w ON padrinho_tasks(wedding_id);

-- Mural privado entre padrinhos (o casal não tem rota para ler).
CREATE TABLE IF NOT EXISTS padrinho_wall (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  padrinho_id TEXT REFERENCES padrinhos(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_pwall_w ON padrinho_wall(wedding_id, created_at);

-- Mensagens secretas: só a família escolhida vê, a partir de show_from (opcional).
CREATE TABLE IF NOT EXISTS secret_messages (
  id           TEXT PRIMARY KEY,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  media_id     TEXT,
  media_url    TEXT NOT NULL DEFAULT '',
  media_type   TEXT NOT NULL DEFAULT '',     -- image | video | ''
  show_from    TEXT,                         -- AAAA-MM-DD
  opened_at    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_secrets_h ON secret_messages(wedding_id, household_id);

-- Surpresas com sigilo. honoree_type='casal' fica invisível para o casal até reveal_at.
CREATE TABLE IF NOT EXISTS surprises (
  id            TEXT PRIMARY KEY,
  wedding_id    TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('homenagem','video','presente','discurso','outro')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  honoree_type  TEXT NOT NULL CHECK (honoree_type IN ('casal','household','padrinho','outro')),
  honoree_ref   TEXT,                        -- id da família ou do padrinho homenageado
  honoree_label TEXT NOT NULL DEFAULT '',
  reveal_at     TEXT,                        -- AAAA-MM-DD (obrigatório quando é para o casal)
  organizer_padrinho_id TEXT REFERENCES padrinhos(id) ON DELETE SET NULL,
  created_by    TEXT NOT NULL,               -- couple | padrinho:<id>
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_surprises_w ON surprises(wedding_id);

-- Quem colabora numa surpresa: padrinho (pelo portal) ou colaborador com link próprio (hash).
CREATE TABLE IF NOT EXISTS surprise_members (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  surprise_id TEXT NOT NULL REFERENCES surprises(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  padrinho_id TEXT REFERENCES padrinhos(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_smembers_s ON surprise_members(wedding_id, surprise_id);

CREATE TABLE IF NOT EXISTS surprise_posts (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  surprise_id TEXT NOT NULL REFERENCES surprises(id) ON DELETE CASCADE,
  member_id   TEXT REFERENCES surprise_members(id) ON DELETE SET NULL,
  author      TEXT NOT NULL,
  message     TEXT NOT NULL,
  link        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_sposts_s ON surprise_posts(wedding_id, surprise_id, created_at);

-- Quest: desafios escolhidos pelo casal e o que cada família marcou como feito (sem ranking).
CREATE TABLE IF NOT EXISTS quest_challenges (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                  -- chave do modelo ou 'custom'
  title      TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_quest_w ON quest_challenges(wedding_id, sort);
CREATE TABLE IF NOT EXISTS quest_done (
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES quest_challenges(id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  done_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (challenge_id, household_id)
);

-- Passaporte multi-evento: check-in por família e evento.
CREATE TABLE IF NOT EXISTS passport_checkins (
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  by           TEXT NOT NULL CHECK (by IN ('guest','couple')),
  at           TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, household_id)
);

-- Mapa de memórias: lugares marcantes do casal (publicados no site quando ligado).
CREATE TABLE IF NOT EXISTS memory_places (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  year       TEXT NOT NULL DEFAULT '',
  text       TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_places_w ON memory_places(wedding_id, sort);
