# Arquitetura

## Decisão de stack (e por quê)
O briefing sugere Next.js + PostgreSQL. Antes de escolher, auditei os projetos existentes do estúdio:
**Balcão** (painel de pedidos), **Pitangueira** (orçamento + leads) e o **site do Gueta Studio** rodam em
**Cloudflare Workers + D1 + assets estáticos**, sem dependências de runtime, publicados por GitHub Actions,
com testes em Node usando `node:sqlite`.

Para a Fase 1 mantive essa stack:

| Critério | Workers + D1 (escolhido) | Next.js + Postgres |
|---|---|---|
| Custo operacional | Muito baixo e previsível (plano gratuito cobre os primeiros casais) | Servidor/DB gerenciado desde o dia 1 |
| Experiência de dev do estúdio | Já usada em 3 projetos; mesmo deploy | Nova toolchain |
| Latência no Brasil | Edge (São Paulo) | Depende da região |
| Dependências | Zero em runtime | Dezenas |
| Limites | D1 = SQLite (10 GB por base), sem extensões do Postgres | Mais flexível para consultas analíticas |

**Ponto de reavaliação:** se a plataforma passar de ~5.000 casamentos ativos, precisar de buscas
analíticas pesadas ou de equipe maior de front-end, migrar o front para Next.js/React e o banco para
Postgres (o esquema já é relacional e portável; ver `DATABASE_SCHEMA.md`).

## Visão geral

```
navegador ──► Cloudflare Worker (src/worker.js)
               ├─ páginas: /  /c/:slug  /i/:token  /painel  → arquivos de public/ (ASSETS)
               ├─ API pública:  /api/site/:slug   /api/invite/:token   /api/invite/:token/rsvp
               ├─ API auth:     /api/auth/login   /api/auth/logout   /api/me
               └─ API noivos:   /api/admin/*  (sessão + papel + casamento da sessão)
                         │
                         ▼
                      D1 (SQLite)  ── multi-tenant lógico: toda tabela tem wedding_id
```

Futuro: R2 (fotos/vídeos com URLs assinadas), Queues (envio de e-mail/WhatsApp), Cron (lembretes e
alertas), Workers AI ou API externa (copilot), Stripe (assinaturas).

## Multi-tenant e autorização
- Cada casamento é um *tenant* (`weddings.id`). **Toda** consulta da API dos noivos recebe o
  `wedding_id` da **sessão**, nunca do corpo da requisição ou da URL.
- Usuários se ligam a casamentos por `memberships(role)`: `owner` (noivos), `planner` (cerimonial),
  `viewer` (família). Ações de escrita exigem `owner` ou `planner`.
- Teste automatizado garante que o casal A não lê nem altera dados do casal B.

## Sessão
- Login com e-mail + senha (PBKDF2-SHA256, 100 mil iterações, sal por usuário).
- Cookie `__Host-sess` (`HttpOnly; Secure; SameSite=Lax; Path=/`), valor aleatório de 256 bits;
  no banco fica só o SHA-256 do valor. Expira em 14 dias.
- Requisições que alteram dados exigem cabeçalho `Origin` igual ao do site (proteção CSRF).
- Limite de tentativas de login por IP e por e-mail.

## Convites (tokens)
- Cada família convidada (`households`) recebe um token aleatório de 128 bits em base64url.
- No banco fica **só o hash**; o link completo aparece para o casal no momento em que é gerado.
  Gerar um novo link revoga o anterior (útil se o link vazou).
- A rota pública do convite tem limite de consultas por IP e devolve a mesma resposta para token
  inexistente e revogado (sem enumeração).
- A página do convite não é indexada (`noindex`) e não usa analytics de terceiros.

## Segurança das páginas
- Cabeçalhos: `Content-Security-Policy` (sem scripts inline), `X-Content-Type-Options`,
  `Referrer-Policy: same-origin` (o token do convite não vaza para outros sites), `X-Frame-Options: DENY`.
- Validação de entrada em toda rota (tamanhos máximos, tipos, listas fechadas).
- Nada de dado pessoal na API pública do site: só informações que o casal publicou.

## Privacidade (LGPD)
- Finalidade declarada no formulário de presença; restrição alimentar e acessibilidade são opcionais.
- Exportação completa dos dados do casamento em JSON (`/api/admin/export`).
- Política de retenção planejada: dados de convidados apagados 90 dias após o casamento, salvo se o
  casal ativar “Memórias” (consentimento explícito).
- Log de auditoria para ações sensíveis (gerar/revogar link, apagar convidado, exportar dados).

## Testes
- `npm test` → `test/api.test.mjs`: roda o Worker de verdade contra SQLite em memória (`node:sqlite`).
- `npm run dev` → servidor local em `http://localhost:8787` com o mesmo Worker e banco local com dados de demonstração.
- `npm run e2e` → Playwright percorre landing, site, convite, RSVP e painel em celular e computador.

## Publicação
Mesmo fluxo dos outros projetos: GitHub Actions + `wrangler deploy`, com `CLOUDFLARE_API_TOKEN` como
segredo do repositório. Migrações D1 aplicadas com `wrangler d1 migrations apply`.
