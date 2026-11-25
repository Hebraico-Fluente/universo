-- Pétala & Lucas: o site deixa de ter a seção "Mural de recados · Deixe um carinho" (pedido do casal).
-- Só desliga a seção (weddings.guestbook); nenhum recado guardado é apagado e o casal pode religar no painel.
UPDATE weddings SET guestbook = 0 WHERE slug = 'petala-e-lucas';
