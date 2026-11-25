-- Quiz: cada pessoa responde UMA vez. Além do nome (UNIQUE wedding_id + name_norm, que já existia), guarda o hash do
-- aparelho (id aleatório em cookie próprio + localStorage; nunca o id em si). Quem já está no ranking continua lá
-- (o UNIQUE de nome já garantia uma linha por pessoa) e conta como "já jogou".
ALTER TABLE quiz_scores ADD COLUMN device_hash TEXT;
CREATE INDEX IF NOT EXISTS ix_quiz_scores_device ON quiz_scores(wedding_id, device_hash);
