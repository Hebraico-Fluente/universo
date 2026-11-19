-- Módulo "convidados": cardápio por evento, acompanhantes, lista de espera, mapa de mesas e prazo de limpeza (LGPD).

-- Opções de menu que o casal cadastra por evento (ex.: "Carne", "Peixe", "Vegetariano").
CREATE TABLE IF NOT EXISTS menu_options (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_menu_options_w ON menu_options(wedding_id, event_id, sort);

-- Escolha de prato de cada pessoa em cada evento (só quando a resposta é "sim").
ALTER TABLE rsvps ADD COLUMN menu_option_id TEXT REFERENCES menu_options(id) ON DELETE SET NULL;

-- Acompanhante adicionado pelo próprio convidado (até households.max_guests).
ALTER TABLE guests ADD COLUMN is_plus_one INTEGER NOT NULL DEFAULT 0;

-- Lista de espera: a família existe no painel, mas ainda não recebeu link.
ALTER TABLE households ADD COLUMN waitlist INTEGER NOT NULL DEFAULT 0;
ALTER TABLE households ADD COLUMN promoted_at TEXT;          -- quando saiu da lista de espera
ALTER TABLE households ADD COLUMN reminded_at TEXT;          -- último lembrete enviado pelo casal (WhatsApp, clicado no painel)

-- Mapa de mesas: posição em % da planta (0–100), para funcionar em qualquer tamanho de tela.
CREATE TABLE IF NOT EXISTS seating_tables (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  shape      TEXT NOT NULL DEFAULT 'round' CHECK (shape IN ('round','rect')),
  seats      INTEGER NOT NULL DEFAULT 8 CHECK (seats BETWEEN 1 AND 40),
  x          REAL NOT NULL DEFAULT 50,
  y          REAL NOT NULL DEFAULT 50,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_seating_tables_w ON seating_tables(wedding_id, sort);

-- Elementos fixos da planta (pista, palco, buffet, entrada, bar).
CREATE TABLE IF NOT EXISTS floor_items (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('pista','palco','buffet','entrada','bar')),
  label      TEXT NOT NULL DEFAULT '',
  x          REAL NOT NULL DEFAULT 50,
  y          REAL NOT NULL DEFAULT 50,
  w          REAL NOT NULL DEFAULT 20,
  h          REAL NOT NULL DEFAULT 14
);
CREATE INDEX IF NOT EXISTS ix_floor_items_w ON floor_items(wedding_id);

-- Quem senta em qual mesa (uma mesa por pessoa).
CREATE TABLE IF NOT EXISTS seat_assignments (
  guest_id   TEXT PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  table_id   TEXT NOT NULL REFERENCES seating_tables(id) ON DELETE CASCADE,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_seat_assignments_t ON seat_assignments(wedding_id, table_id);

ALTER TABLE weddings ADD COLUMN seating_event_id TEXT;                     -- evento das mesas (padrão: o último, normalmente a festa)
ALTER TABLE weddings ADD COLUMN show_tables INTEGER NOT NULL DEFAULT 0;    -- 1 = o convite mostra "Sua mesa"

-- Privacidade: dados pessoais dos convidados são apagados em date_iso + retention_days.
ALTER TABLE weddings ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 60 CHECK (retention_days BETWEEN 30 AND 365);
ALTER TABLE weddings ADD COLUMN guests_purged_at TEXT;                     -- quando a limpeza foi feita (rotina diária ou manual)
