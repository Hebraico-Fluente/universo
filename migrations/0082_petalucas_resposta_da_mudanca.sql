-- Pétala & Lucas: correção do casal na pergunta da mudança (2019): a resposta certa é "Carregando caixas".
-- Mexe só nessa pergunta (achada pelo texto): troca a resposta certa e a curiosidade. Idempotente.
UPDATE weddings SET quiz_json = json_set(quiz_json,
  '$[' || (SELECT key FROM json_each(weddings.quiz_json) WHERE json_extract(value, '$.q') = 'Como o Lucas entrou na mudança da Pétala, em 2019?') || '].answer', 1,
  '$[' || (SELECT key FROM json_each(weddings.quiz_json) WHERE json_extract(value, '$.q') = 'Como o Lucas entrou na mudança da Pétala, em 2019?') || '].fact', 'Carregando caixas! Desde então, não se desgrudaram.')
WHERE slug = 'petala-e-lucas' AND json_valid(quiz_json)
  AND EXISTS (SELECT 1 FROM json_each(weddings.quiz_json) WHERE json_extract(value, '$.q') = 'Como o Lucas entrou na mudança da Pétala, em 2019?'
    AND json_extract(value, '$.options[1]') = 'Carregando caixas');
