# Plano de implementação

## Fase 1 · Fundação comercial (em andamento)

### Feito e testado
| Item | Onde | Validação |
|---|---|---|
| Landing premium | `public/index.html` | e2e (celular e computador) |
| Design system + 3 universos | `public/assets/ds.css`, `site.css` | e2e + revisão visual |
| Identidade sob medida por casal (tema) | `public/assets/themes/<tema>/` | Pétala & Lucas (casal real, prévia) |
| Site do casal: abertura, história, eventos, cronograma, mapa ilustrado, traje, presença, recados, presentes, dúvidas | `public/assets/site.js` | e2e |
| Convite pessoal com envelope, eventos por família, RSVP por pessoa e por evento, prazo, alteração | `public/assets/convite.js` + API | 55 testes de API + e2e |
| Mural de recados com aprovação dos noivos | API `/api/site/:slug/recados`, `/api/admin/recados` | testes de API |
| Autenticação (PBKDF2, sessão com hash, CSRF por Origin, limite de tentativas) | `src/worker.js` | testes de API |
| Multi-tenant com isolamento por casamento | `src/worker.js` | testes de isolamento |
| Painel: visão geral, convidados (criar, gerar/revogar link, apagar), orçamento, simulador com premissas, exportação | `public/assets/painel.js` | e2e |
| Política de segurança (CSP sem inline, noindex no convite, Referrer-Policy) | `src/worker.js` | e2e sem erros de CSP |

### Ainda simulado ou pendente
- **Dados de demonstração** (Helena & Rafael, Clara & Davi, Lia & Tomás): fictícios e marcados.
- **Pétala & Lucas**: textos, horários, regras, logo e mapa vêm do site atual do casal; a família convidada
  e o recado do mural são exemplos. O link da lista de presentes não foi encontrado e está desligado.
- **Moderação dos recados no painel**: a API existe; falta a aba “Recados” no painel.
- **Edição do conteúdo do site pelo painel** (hoje os dados entram pelo banco).
- **Publicação**: falta o repositório no GitHub e o segredo `CLOUDFLARE_API_TOKEN`.
- **Limpeza automática** de `rate_limits` e de sessões expiradas (Cron).

## Fase 2 · Organização avançada
1. Editor do site no painel (textos, fotos via R2, cronograma, traje, FAQ) + aba Recados.
2. Idiomas EN/ES/HE com RTL e revisão das traduções pelos noivos.
3. Fornecedores, contratos e documentos (R2 com URLs assinadas).
4. Checklist e cronograma gerados pela data e tipo de cerimônia.
5. Mapa de mesas 2D com arrastar e soltar; “Encontre sua mesa” para os convidados.
6. Lembretes para quem não respondeu (e-mail; WhatsApp só com autorização).

## Fase 3 · Experiência premium
Narrativa cinematográfica com vídeo, concierge do convidado (respostas só do conteúdo publicado),
galeria colaborativa com consentimento, portal dos padrinhos, cápsula do tempo, memórias pós-casamento.

## Fase 4 · IA
Copiloto que cita os registros usados; simulações; alertas (radar de riscos); qualquer ação que altere
dados, envie mensagens ou gere cobrança exige aprovação explícita.

## Fase 5 · Experimental
Universe temático, digital twin 2D→3D, AR, gamificação desligável, passaporte multi-evento, legacy, aniversário.

## Riscos
| Risco | Mitigação |
|---|---|
| Fontes de terceiros sem licença comercial clara (ex.: TrashHand, usada pelo casal) | Confirmar licença com o casal/autora antes de publicar; alternativa: fonte manuscrita OFL |
| Dados pessoais de convidados | Tokens com hash, nada pessoal em páginas públicas, exportação e retenção |
| Limites do D1 | Índices por `wedding_id`; reavaliar Postgres acima de ~5 mil casamentos ativos |
| Vazamento de link de convite | Link revogável; página `noindex`; aviso no próprio convite |
