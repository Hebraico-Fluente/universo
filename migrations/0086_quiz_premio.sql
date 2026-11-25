-- Prêmio do quiz (texto livre do casal, editado no painel › Site › Quiz). Vazio = sem prêmio no site.
ALTER TABLE weddings ADD COLUMN quiz_premio TEXT NOT NULL DEFAULT '';
-- Pétala & Lucas: o prêmio do 1º lugar (pedido do casal).
UPDATE weddings SET quiz_premio = 'Quem ficar em 1º lugar no ranking ganha um cartão fura-fila para o bar da festa!' WHERE slug = 'petala-e-lucas';
