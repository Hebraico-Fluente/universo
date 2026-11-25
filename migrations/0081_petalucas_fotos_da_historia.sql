-- Pétala & Lucas: fotos enviadas pelo casal nos capítulos 2017, 2019 e 2027 da "Nossa história" (aparecem no site e no documentário).
-- Mexe só no capítulo certo (achado pelo ano + título); os outros itens ficam como estão. Idempotente.
-- Arquivos em public/assets/themes/petalucas/historia/ (reduzidos e sem metadados EXIF/GPS).
UPDATE weddings SET story_json = json_set(story_json,
  '$[' || (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2017' AND json_extract(value, '$.title') = 'A música mais bonita do Djavan') || '].image', '/assets/themes/petalucas/historia/2017.jpg',
  '$[' || (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2017' AND json_extract(value, '$.title') = 'A música mais bonita do Djavan') || '].alt', 'Pétala e Lucas abraçados numa piscina, tirando uma selfie')
WHERE slug = 'petala-e-lucas' AND json_valid(story_json)
  AND EXISTS (SELECT 1 FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2017' AND json_extract(value, '$.title') = 'A música mais bonita do Djavan');

UPDATE weddings SET story_json = json_set(story_json,
  '$[' || (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2019' AND json_extract(value, '$.title') = 'O Diabo Veste Prada') || '].image', '/assets/themes/petalucas/historia/2019.jpg',
  '$[' || (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2019' AND json_extract(value, '$.title') = 'O Diabo Veste Prada') || '].alt', 'Pétala e Lucas abraçados, numa selfie no espelho')
WHERE slug = 'petala-e-lucas' AND json_valid(story_json)
  AND EXISTS (SELECT 1 FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2019' AND json_extract(value, '$.title') = 'O Diabo Veste Prada');

UPDATE weddings SET story_json = json_set(story_json,
  '$[' || (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2027' AND json_extract(value, '$.title') = 'A festa') || '].image', '/assets/themes/petalucas/historia/2027.jpg',
  '$[' || (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2027' AND json_extract(value, '$.title') = 'A festa') || '].alt', 'Pétala sorrindo e mostrando a aliança, com Lucas à mesa ao fundo')
WHERE slug = 'petala-e-lucas' AND json_valid(story_json)
  AND EXISTS (SELECT 1 FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2027' AND json_extract(value, '$.title') = 'A festa');

-- Capítulo novo "2026 · O pedido" (vídeo do pedido de casamento, 13 de junho de 2026), entre 2019 e 2027.
-- Só entra se ainda não houver um capítulo "O pedido" e se o de 2019 existir; os outros itens não mudam.
UPDATE weddings SET story_json = (
  SELECT json_group_array(json(v)) FROM (
    SELECT value AS v, CAST(key AS REAL) AS k FROM json_each(weddings.story_json)
    UNION ALL
    SELECT '{"year": "2026", "title": "O pedido", "text": "13 de junho de 2026.", "video": "/assets/themes/petalucas/historia/pedido.mp4", "poster": "/assets/themes/petalucas/historia/pedido.jpg", "alt": "Vídeo do pedido de casamento de Lucas e Pétala"}',
      (SELECT key FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2019' AND json_extract(value, '$.title') = 'O Diabo Veste Prada') + 0.5
    ORDER BY k))
WHERE slug = 'petala-e-lucas' AND json_valid(story_json)
  AND NOT EXISTS (SELECT 1 FROM json_each(weddings.story_json) WHERE json_extract(value, '$.title') = 'O pedido')
  AND EXISTS (SELECT 1 FROM json_each(weddings.story_json) WHERE json_extract(value, '$.year') = '2019' AND json_extract(value, '$.title') = 'O Diabo Veste Prada');
