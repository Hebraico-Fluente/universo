-- Quiz "Quanto você conhece o casal?" (perguntas só com fatos que o casal publicou)
ALTER TABLE weddings ADD COLUMN quiz_json TEXT NOT NULL DEFAULT '[]';   -- [{q, options[], answer(index), fact}]
