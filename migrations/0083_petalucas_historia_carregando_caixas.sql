-- Pétala & Lucas: o capítulo de 2019 passa a contar o mesmo que o quiz (o Lucas ajudou carregando caixas na mudança).
-- Mexe só no texto desse capítulo (ano + título) e só se ainda estiver com o texto antigo; foto e descrição ficam. Idempotente.
UPDATE weddings SET story_json = json_set(story_json,
  '$[' || (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2019' AND json_extract(value, '$.title') = 'O Diabo Veste Prada') || '].text',
  'O casal só foi se encontrar quando Pétala estava se mudando e o Lucas apareceu para ajudar carregando caixas. Pétala chamou ele para assistir O Diabo Veste Prada, mas ela não tinha o filme em casa. Desde então eles não se desgrudaram.')
WHERE slug = 'petala-e-lucas' AND json_valid(story_json)
  AND EXISTS (SELECT 1 FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2019' AND json_extract(value, '$.title') = 'O Diabo Veste Prada'
    AND json_extract(value, '$.text') = 'O casal só foi se encontrar quando Pétala estava se mudando e o Lucas ofereceu seus serviços como arquiteto. Pétala chamou ele para assistir O Diabo Veste Prada, mas ela não tinha o filme em casa. Desde então eles não se desgrudaram.');
