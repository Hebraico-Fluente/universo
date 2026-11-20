-- Música do casal (faixa do Spotify, tocada só quando o visitante abre o player) e ranking do quiz.

-- Link normalizado de uma faixa do Spotify (https://open.spotify.com/track/ID) e rótulo do botão no site.
ALTER TABLE weddings ADD COLUMN music_url TEXT NOT NULL DEFAULT '';
ALTER TABLE weddings ADD COLUMN music_label TEXT NOT NULL DEFAULT '';   -- ex.: "Pétala — Djavan" (até 60)

-- Ranking do quiz: uma linha por nome (normalizado) por casamento, com a MELHOR tentativa.
-- A pontuação é sempre calculada no servidor a partir de quiz_json.
CREATE TABLE IF NOT EXISTS quiz_scores (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                    -- como o visitante escreveu (aparece no ranking)
  name_norm  TEXT NOT NULL,                    -- sem acentos, minúsculo, espaços simples (evita duplicar a mesma pessoa)
  score      INTEGER NOT NULL,                 -- acertos
  total      INTEGER NOT NULL,                 -- perguntas quando jogou
  seconds    INTEGER NOT NULL,                 -- tempo informado pelo navegador (limitado a 5 s – 1 h); desempate
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (wedding_id, name_norm)
);
CREATE INDEX IF NOT EXISTS ix_quiz_scores_rank ON quiz_scores(wedding_id, score DESC, seconds ASC);
