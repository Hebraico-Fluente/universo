-- Pétala & Lucas: mais 7 perguntas no quiz (texto do casal): o bicho favorito e o perfume do Lucas, a viagem favorita do casal,
-- a fruta favorita da Pétala, a série favorita do casal, o lugar favorito deles em Curitiba e o carro dos sonhos da Pétala.
-- O fato da primeira vem da lista de presentes deles (“Gosto mais do Coffee”).
-- ACRESCENTA ao fim do quiz atual (as perguntas existentes não mudam). Só roda uma vez: não duplica se já estiver lá,
-- e não mexe se o quiz estiver vazio/escondido pelo painel ou se passar do limite de 16 perguntas do editor.
UPDATE weddings SET quiz_json = json_insert(quiz_json,
  '$[#]', json('{"q": "Qual o bicho favorito do Lucas?", "options": ["Coffee", "Pólen", "Felipe", "Miguel"], "answer": 0, "fact": "O Coffee! Tem até presente para ele na lista: “Gosto mais do Coffee”."}'),
  '$[#]', json('{"q": "Qual o perfume que o Lucas vai usar no casamento?", "options": ["Jequiti Cebolinha", "Grand Soir", "Malbecão da Massa", "Naxos"], "answer": 1, "fact": "Grand Soir."}'),
  '$[#]', json('{"q": "Qual a viagem favorita do casal?", "options": ["Lençóis Maranhenses", "Afropunk Salvador", "Carnaval Rio de Janeiro", "Interior do Maranhão"], "answer": 3, "fact": "O interior do Maranhão."}'),
  '$[#]', json('{"q": "Qual a fruta favorita da Pétala?", "options": ["Limão", "Jambo", "Maracujá", "Cupuaçu"], "answer": 1, "fact": "Jambo!"}'),
  '$[#]', json('{"q": "Qual a série favorita do casal?", "options": ["Magnatas do Crime", "As Quatro Estações", "Machos Alpha", "Attack on Titan"], "answer": 0, "fact": "Magnatas do Crime."}'),
  '$[#]', json('{"q": "Qual o lugar favorito do casal em Curitiba?", "options": ["Il Barbuto", "Na Feira Bar", "Casa Alaafia", "Sociedade Treze de Maio"], "answer": 3, "fact": "A Sociedade Treze de Maio."}'),
  '$[#]', json('{"q": "Qual o carro dos sonhos da Pétala?", "options": ["BYD Seal", "Honda Civic Type R", "Ferrari Testarossa", "Kombi do Scooby-Doo"], "answer": 1, "fact": "Um Honda Civic Type R."}'))
WHERE slug = 'petala-e-lucas'
  AND json_valid(quiz_json) AND json_array_length(quiz_json) BETWEEN 1 AND 9
  AND quiz_json NOT LIKE '%Qual o bicho favorito do Lucas?%';
