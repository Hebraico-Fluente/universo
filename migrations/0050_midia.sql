-- Módulo "midia" (src/mods/midia.js): arquivos, galeria colaborativa, telão ao vivo, cápsula do tempo,
-- memórias pós-casamento e legado. Tudo isolado por wedding_id.

-- Arquivos. Conteúdo no R2 (binding MEDIA) quando existir; senão no próprio D1, em pedaços (media_chunks).
CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,                                  -- aleatório, vai na URL /m/:id
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('site','gallery','capsule','memory','legacy','file')),
  type       TEXT NOT NULL,                                     -- tipo conferido pelos bytes (magic numbers)
  name       TEXT NOT NULL DEFAULT '',                          -- nome higienizado
  size       INTEGER NOT NULL,
  public     INTEGER NOT NULL DEFAULT 0,                        -- 1 = qualquer pessoa com a URL; 0 = só o casal dono
  storage    TEXT NOT NULL CHECK (storage IN ('r2','d1')),
  chunks     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_media_w ON media(wedding_id, kind);

CREATE TABLE IF NOT EXISTS media_chunks (
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  n        INTEGER NOT NULL,
  data     BLOB NOT NULL,                                       -- até 900 KB por pedaço
  PRIMARY KEY (media_id, n)
);

-- Ajustes do casal (tudo desligado até o casal ligar no painel).
CREATE TABLE IF NOT EXISTS media_settings (
  wedding_id    TEXT PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  gallery_on    INTEGER NOT NULL DEFAULT 0,                     -- galeria aparece no site
  uploads_on    INTEGER NOT NULL DEFAULT 0,                     -- convidados podem enviar fotos
  capsule_on    INTEGER NOT NULL DEFAULT 0,                     -- seção da cápsula do tempo no site
  memories_on   INTEGER NOT NULL DEFAULT 0,                     -- depois da data: site vira "memórias"
  anniversary_on INTEGER NOT NULL DEFAULT 1,                    -- retrospectiva no dia do aniversário
  playlist_url  TEXT NOT NULL DEFAULT '',
  timeline_json TEXT NOT NULL DEFAULT '[]',                     -- [{time,title,text}]
  renewal_text  TEXT NOT NULL DEFAULT '',                       -- convite opcional para renovação de votos
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Galeria colaborativa: convidado envia → pendente → casal aprova. O casal também sobe fotos (já aprovadas).
CREATE TABLE IF NOT EXISTS gallery_photos (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  media_id   TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  moment     TEXT NOT NULL DEFAULT 'festa',
  caption    TEXT NOT NULL DEFAULT '',
  author     TEXT NOT NULL DEFAULT '',                          -- opcional; nunca vai para o site público
  source     TEXT NOT NULL DEFAULT 'guest' CHECK (source IN ('guest','couple')),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_gallery_w ON gallery_photos(wedding_id, status, created_at);

-- Telão ao vivo: um link secreto por casamento (só o hash). Gerar outro revoga o anterior.
CREATE TABLE IF NOT EXISTS media_walls (
  wedding_id TEXT PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE,                                       -- NULL = revogado
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cápsula do tempo: lacrada até o 1º, 5º ou 10º aniversário. Ninguém lê antes (nem o casal).
CREATE TABLE IF NOT EXISTS capsules (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,
  message    TEXT NOT NULL,
  media_id   TEXT REFERENCES media(id) ON DELETE SET NULL,
  years      INTEGER NOT NULL CHECK (years IN (1,5,10)),
  opened_at  TEXT,                                              -- preenchido pela rotina diária na data
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_capsules_w ON capsules(wedding_id, years, opened_at);

-- Votos, discursos (aparecem no site no modo memórias) e legado (cartas, áudios, tradições: só o casal vê).
CREATE TABLE IF NOT EXISTS keepsakes (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  area       TEXT NOT NULL CHECK (area IN ('memory','legacy')),
  kind       TEXT NOT NULL DEFAULT 'other',                     -- memory: vow|speech|other · legacy: letter|vow|audio|tradition|other
  title      TEXT NOT NULL,
  author     TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  media_id   TEXT REFERENCES media(id) ON DELETE SET NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_keepsakes_w ON keepsakes(wedding_id, area, sort);
