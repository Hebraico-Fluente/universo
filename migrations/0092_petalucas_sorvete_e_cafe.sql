-- Programação de Pétala & Lucas: sorvete às 17h45 e café às 21h30 (pedido do casal, 26/11/2026).
-- Só grava se o cronograma ainda não tiver esses itens (não duplica se o casal já tiver colocado pelo painel).
UPDATE weddings SET schedule_json = json_array(
  json_object('time','16h','title','Cerimônia','text','O “sim” mais esperado da galera.','icon','rings'),
  json_object('time','17h','title','Samba & soft drinks','text','Recepção no ritmo para abrir a festa.','icon','music'),
  json_object('time','17h45','title','Sorvete','text','Uma pausa geladinha pra refrescar a tarde.','icon','icecream'),
  json_object('time','18h','title','Pizza','text','Fatia quente, conversa boa.','icon','pizza'),
  json_object('time','19h','title','Drinks','text','Brinde ao amor e ao pôr do sol.','icon','glass'),
  json_object('time','21h30','title','Café','text','Um cafezinho pra recarregar a energia.','icon','coffee'),
  json_object('time','22h','title','Docinhos','text','A tradição que ninguém pula.','icon','sweet'),
  json_object('time','00h','title','Lanche da madrugada','text','Combustível pra dançar até o fim.','icon','snack'),
  json_object('time','01h45','title','Fim da festa','text','Mas o samba continua na memória.','icon','moon')
)
WHERE slug = 'petala-e-lucas'
  AND schedule_json NOT LIKE '%Sorvete%' AND schedule_json NOT LIKE '%Café%'
  AND json_array_length(schedule_json) = 7 AND schedule_json LIKE '%Docinhos%';
