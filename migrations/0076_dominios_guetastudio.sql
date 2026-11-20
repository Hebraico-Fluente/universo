-- Endereços profissionais no domínio do estúdio (Custom Domains do Worker, criados no deploy pelo wrangler.jsonc):
--   casamento.guetastudio.com.br   → a plataforma (painel, convites, /c/:slug) — host da plataforma (PLATFORM_HOSTS)
--   petalaelucas.guetastudio.com.br → "/" abre direto o site de Pétala & Lucas
INSERT OR IGNORE INTO domains (host, wedding_id, status, activated_at)
SELECT 'petalaelucas.guetastudio.com.br', id, 'active', datetime('now') FROM weddings WHERE slug = 'petala-e-lucas';
