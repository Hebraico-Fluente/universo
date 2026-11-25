-- Cápsula do tempo passa a abrir em MESES depois do casamento (opções novas: 6 meses e 1 ano).
-- Só acrescenta: a coluna antiga `years` (CHECK 1|5|10, NOT NULL) continua; as cápsulas já guardadas
-- para 5 e 10 anos seguem abrindo na data delas (months = years * 12).
-- Nas cápsulas novas, `months` é a fonte da verdade e `years` recebe 1 só para satisfazer o CHECK antigo.
ALTER TABLE capsules ADD COLUMN months INTEGER;
UPDATE capsules SET months = years * 12 WHERE months IS NULL;

-- E-mails de "hoje faz N meses: a cápsula do tempo abriu" (src/mods/aniversario.js): um por casamento por marco.
-- A linha é gravada (reservada) ANTES de enviar; se o envio falhar para todos, a linha é apagada e o dia seguinte tenta de novo.
CREATE TABLE IF NOT EXISTS aniversarios_enviados (
  wedding_id TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  meses      INTEGER NOT NULL,                                  -- 6, 12 (e 60/120 para cápsulas antigas de 5/10 anos)
  enviado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wedding_id, meses)
);
