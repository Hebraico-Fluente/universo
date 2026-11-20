-- Pétala & Lucas: mais 4 perguntas no quiz, com fatos da lista de presentes publicada pelo próprio casal
-- (gatos Antônio e Pólen, caipirinha sem açúcar da noiva, tequila do noivo, Estância Dom Raul).
-- ACRESCENTA ao fim do quiz atual (as perguntas existentes não mudam). Só roda uma vez: não duplica se já estiverem lá,
-- e não mexe se o quiz estiver vazio/escondido pelo painel ou se passar do limite de 12 perguntas do editor.
UPDATE weddings SET quiz_json = json_insert(quiz_json,
  '$[#]', json('{"q": "Quais destes são os gatos do casal?", "options": ["Antônio e Pólen", "Mingau e Frajola", "Garfield e Tom", "Sushi e Tofu"], "answer": 0, "fact": "Antônio e Pólen até ganharam presente próprio na lista: “Por dó do Antônio” e “Sou fã do Pólen”."}'),
  '$[#]', json('{"q": "Qual é o drink da noiva?", "options": ["Caipirinha de limão sem açúcar", "Gin tônica", "Aperol spritz", "Vinho tinto"], "answer": 0, "fact": "Tanto que tem um presente na lista: 10 caipirinhas de limão sem açúcar para a noiva!"}'),
  '$[#]', json('{"q": "E qual é a bebida do noivo?", "options": ["Cerveja", "Tequila", "Whisky", "Cachaça"], "answer": 1, "fact": "Uma garrafa de tequila pro noivo está na lista de presentes."}'),
  '$[#]', json('{"q": "Onde vai ser a festa?", "options": ["Estância Dom Raul, em Piraquara", "Um salão em Curitiba", "Uma praia em Santa Catarina", "Um sítio em Campo Largo"], "answer": 0, "fact": "Dia 20 de fevereiro de 2027, na Estância Dom Raul."}'))
WHERE slug = 'petala-e-lucas'
  AND json_valid(quiz_json) AND json_array_length(quiz_json) BETWEEN 1 AND 8
  AND quiz_json NOT LIKE '%Quais destes são os gatos do casal?%';
