-- Pétala & Lucas: tira do quiz a pergunta "Quais destes são os gatos do casal?" (pedido do casal). As outras ficam na mesma ordem.
-- Idempotente: sem a pergunta, não faz nada.
UPDATE weddings SET quiz_json = (
  SELECT json_group_array(json(v)) FROM (
    SELECT value AS v FROM json_each(weddings.quiz_json)
    WHERE json_extract(value, '$.q') IS NOT 'Quais destes são os gatos do casal?'
    ORDER BY CAST(key AS INTEGER)))
WHERE slug = 'petala-e-lucas' AND json_valid(quiz_json)
  AND EXISTS (SELECT 1 FROM json_each(weddings.quiz_json) WHERE json_extract(value, '$.q') = 'Quais destes são os gatos do casal?');
