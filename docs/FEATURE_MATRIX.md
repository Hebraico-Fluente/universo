# Matriz de funcionalidades

Escala: **Impacto** (valor para casal/convidado) 1–5 · **Complexidade** 1–5 · **Custo operacional** B (baixo) · M · A
Critérios atendidos: T = economiza tempo · P = resolve problema real · E = emoção · $ = justifica premium · S = simples · ⚙ = sustentável

| # | Funcionalidade | Fase | Impacto | Compl. | Custo | Depende de | Critérios | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Homepage cinematográfica | 1 | 5 | 2 | B | design system | E $ | **Protótipo** (sem vídeo e sem trilha sonora) |
| 2 | História interativa | 1→3 | 4 | 3 | B | mídia (R2) | E $ | **Protótipo** (linha do tempo simples) |
| 3 | Convite ultra personalizado | 1 | 5 | 3 | B | tokens, convidados | T P E $ | **Protótipo funcional** (envelope, nome, eventos, mensagem, token revogável) |
| 4 | RSVP inteligente | 1 | 5 | 3 | B | convites | T P S | **Protótipo funcional** (família, por evento, restrição, acessibilidade, crianças, prazo, alteração) · lista de espera e menu: fase 2 |
| 5 | Multilíngue + RTL | 1→2 | 4 | 3 | B | i18n | P $ | Estrutura pronta, textos PT; EN/ES/HE na fase 2 |
| 6 | Wedding Command Center | 1→2 | 5 | 3 | B | dados | T P | **Protótipo** (convidados, respostas, orçamento, contagem) |
| 7 | Gestão financeira | 1→2 | 5 | 3 | B | — | T P | **Protótipo** (orçamento, pago, a pagar, simulador com premissas) · comprovantes/contratos: fase 2 |
| 8 | Fornecedores | 2 | 4 | 3 | M | R2 | T P | Planejado |
| 9 | Checklist automático | 2 | 4 | 3 | B | dados do evento | T P | Planejado |
| 10 | Seating planner visual | 2 | 4 | 4 | B | convidados | T P | Planejado (o site-modelo atual já tem “Encontre sua mesa”) |
| 11 | AI Copilot dos noivos | 4 | 5 | 4 | M | dados limpos, auditoria | T P $ | Planejado (respostas com citação de registros; ações exigem aprovação) |
| 12 | Concierge do convidado | 3 | 4 | 3 | M | FAQ autorizado | T P | Planejado (só responde o que o casal publicou) |
| 13 | Wedding Universe temático | 5 | 3 | 4 | B | design system | E $ | Experimental |
| 14 | Cápsula do tempo | 3 | 4 | 3 | M | R2, e-mail, retenção | E $ | Planejado (exige política de continuidade) |
| 15 | Memórias pós-casamento | 3 | 4 | 3 | M | R2 | E $ | Planejado |
| 16 | Story generator (IA) | 4 | 3 | 4 | M | mídia, aprovação | E | Planejado (nunca inventa fatos) |
| 17 | Mural ao vivo | 3 | 4 | 3 | M | moderação | E | Planejado |
| 18 | Wedding Quest | 5 | 2 | 3 | B | — | E | Experimental, desligável |
| 19 | Conexões entre convidados | 5 | 2 | 3 | B | consentimento | E | Experimental, opt-in |
| 20 | Trilha sonora colaborativa | 3 | 3 | 2 | B | — | E | Planejado (sugestões; sem hospedar músicas) |
| 21 | Travel hub | 2 | 4 | 2 | B | mapas | T P | Planejado |
| 22 | Clima | 3 | 3 | 2 | B | API meteorológica | P | Planejado |
| 23 | Digital twin 2D/3D | 5 | 3 | 5 | M | seating | P E | Experimental (começa 2D) |
| 24 | AR | 5 | 2 | 5 | M | estudo técnico | E | Experimental |
| 25 | Mensagens secretas | 3 | 3 | 3 | B | permissões | E | Planejado |
| 26 | Mapa de memórias | 3 | 3 | 2 | B | mapas | E | Planejado |
| 27 | Legacy (exportação total) | 3 | 4 | 2 | B | dados | ⚙ $ | **Base pronta**: exportação JSON dos dados do casamento |
| 28 | Risk radar | 4 | 4 | 3 | B | finanças, fornecedores | T P | Planejado |
| 29 | Surpresas com sigilo | 3 | 3 | 3 | B | permissões | E | Planejado |
| 30 | Jornal do casamento | 5 | 2 | 3 | B | conteúdo | E | Experimental |
| 31 | Passaporte multi-evento | 5 | 3 | 3 | B | eventos | E | Experimental (sem pontuação obrigatória) |
| 32 | Modo aniversário | 5 | 3 | 2 | B | memórias | E | Experimental |
| — | Módulos culturais (judaico, multicultural…) | 2→3 | 4 | 2 | B | i18n | P $ | Planejado; nunca presumir religião |
| — | Plataforma SaaS multi-tenant | 1 | 5 | 4 | M | auth | ⚙ | **Base pronta** (isolamento por casamento, papéis) |
| — | Admin da plataforma (planos, domínios, uso) | 2 | 4 | 3 | B | billing | ⚙ $ | Planejado |

## Ordem recomendada depois da Fase 1
1. **Multilíngue completo + edição do site pelo painel** (sem isso não há venda em escala).
2. **Fornecedores + checklist + pagamentos com vencimento** (é onde o casal perde mais tempo).
3. **Seating planner** (alto valor percebido, conecta com o “Encontre sua mesa”).
4. **Concierge do convidado** (reduz mensagens no WhatsApp dos noivos).
5. **Copilot** quando os dados estiverem completos e auditáveis.
