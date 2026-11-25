-- Imagem da prévia do link (WhatsApp/Instagram), 1200x630. Sem ela, o site usa a foto de capa, se houver.
ALTER TABLE weddings ADD COLUMN og_image TEXT;
UPDATE weddings SET og_image = '/assets/themes/petalucas/og.jpg' WHERE slug = 'petala-e-lucas';
