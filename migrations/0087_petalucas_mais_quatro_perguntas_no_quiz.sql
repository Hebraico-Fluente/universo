-- Pétala & Lucas: mais 4 perguntas no quiz (texto do casal), depois da do carro: o anime do Lucas, as plantas da Pétala,
-- os perfumes do Lucas e o pet mais velho do casal.
-- Acrescenta ao fim, uma vez só, e só se o quiz não estiver vazio/escondido nem perto do limite de 20 perguntas do editor.
UPDATE weddings SET quiz_json = json_insert(quiz_json,
  '$[#]', json('{"q": "Qual o anime favorito do Lucas?", "options": ["Naruto Shippuden", "Attack on Titan", "Jujutsu Kaisen", "Demon Slayer"], "answer": 1, "fact": "Attack on Titan."}'),
  '$[#]', json('{"q": "Quantas plantas a Pétala tem?", "options": ["108", "46", "97", "85"], "answer": 1, "fact": "46 plantas!"}'),
  '$[#]', json('{"q": "Quantos perfumes o Lucas tem?", "options": ["55", "42", "38", "61"], "answer": 0, "fact": "55 perfumes!"}'),
  '$[#]', json('{"q": "Qual o pet mais velho do casal?", "options": ["Coffee", "Miguel", "Antônio", "Pólen"], "answer": 3, "fact": "O Pólen."}'))
WHERE slug = 'petala-e-lucas'
  AND json_valid(quiz_json) AND json_array_length(quiz_json) BETWEEN 1 AND 16
  AND quiz_json NOT LIKE '%Qual o anime favorito do Lucas?%';
