-- Pétala & Lucas: tira do quiz a pergunta "E qual é a bebida do noivo?" (pedido do casal). As outras ficam na mesma ordem.
-- O ranking guarda acertos e total de cada jogada (quiz_scores.score/total): quem já jogou continua com a marca que fez.
-- Idempotente: sem a pergunta, não faz nada.
UPDATE weddings SET quiz_json = (
  SELECT json_group_array(json(v)) FROM (
    SELECT value AS v FROM json_each(weddings.quiz_json)
    WHERE json_extract(value, '$.q') IS NOT 'E qual é a bebida do noivo?'
    ORDER BY CAST(key AS INTEGER)))
WHERE slug = 'petala-e-lucas' AND json_valid(quiz_json)
  AND EXISTS (SELECT 1 FROM json_each(weddings.quiz_json) WHERE json_extract(value, '$.q') = 'E qual é a bebida do noivo?');
