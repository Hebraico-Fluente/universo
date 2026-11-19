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
