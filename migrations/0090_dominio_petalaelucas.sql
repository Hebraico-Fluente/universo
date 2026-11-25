-- Domínio próprio de Pétala & Lucas: petalaelucas.com.br (o www cai no mesmo host, o Worker tira o "www.").
-- O Custom Domain do Worker é criado no deploy pelo wrangler.jsonc.
INSERT OR IGNORE INTO domains (host, wedding_id, status, activated_at)
SELECT 'petalaelucas.com.br', id, 'active', datetime('now') FROM weddings WHERE slug = 'petala-e-lucas';
