-- Editor do site (módulo "editor"): o casal edita o próprio site pelo painel.
-- Nenhum dado de casamento é alterado aqui; só tabelas novas.

-- Seções escondidas do site e o conteúdo guardado enquanto estão escondidas
-- (o site público só mostra o que está nas colunas de weddings; esconder = guardar aqui e esvaziar lá).
CREATE TABLE IF NOT EXISTS editor_state (
  wedding_id  TEXT PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  hidden_json TEXT NOT NULL DEFAULT '[]',          -- ["quiz","faq",...]
  stash_json  TEXT NOT NULL DEFAULT '{}',          -- {"quiz_json":"[...]", ...} conteúdo das seções escondidas
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Histórico de alterações por seção, com os valores ANTERIORES (para "desfazer última alteração").
CREATE TABLE IF NOT EXISTS editor_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wedding_id  TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,                       -- main | look | images | story | schedule | dress | faq | gifts | quiz | visibility
  keys        TEXT NOT NULL DEFAULT '',            -- campos alterados, separados por vírgula
  before_json TEXT NOT NULL,                       -- {campo: valor anterior}
  actor       TEXT NOT NULL,
  undone      INTEGER NOT NULL DEFAULT 0,          -- 1 = já desfeita
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_editor_versions_w ON editor_versions(wedding_id, id);
