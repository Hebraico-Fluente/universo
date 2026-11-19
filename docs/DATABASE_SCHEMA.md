# Esquema do banco

Fonte de verdade: [`schema.sql`](../schema.sql) (D1/SQLite, portável para Postgres).

```
weddings ─┬─< memberships >── users ──< sessions
          ├─< events ──────────────┐
          ├─< households ─< invitations >─┘
          │        └─< guests ─< rsvps >── events
          ├─< budget_categories ─< budget_items
          └─< audit_log
rate_limits (global)
```

## Tabelas da Fase 1

| Tabela | Para quê | Observações |
|---|---|---|
| `weddings` | O *tenant*: um casamento e o conteúdo público do site | `slug` é o endereço público; `is_demo` marca dados fictícios |
| `users` | Pessoas com acesso ao painel | Senha com PBKDF2 + sal |
| `memberships` | Quem acessa qual casamento e com que papel | `owner`, `planner`, `viewer` |
| `sessions` | Sessões do painel | Guarda só o hash do cookie |
| `events` | Cerimônia, festa, jantar de ensaio, brunch… | `is_public = 0` esconde do site público (só aparece no convite de quem foi chamado) |
| `households` | Família convidada = um convite | Guarda só o **hash** do token; `revoked` invalida o link |
| `guests` | Cada pessoa da família | Restrição alimentar e acessibilidade opcionais |
| `invitations` | Para quais eventos cada família foi convidada | Permite convites diferentes por evento |
| `rsvps` | Resposta de cada pessoa para cada evento | Sem linha = pendente; pode ser alterada até o prazo |
| `budget_categories` / `budget_items` | Orçamento planejado, contratado, pago e a pagar | Valores em centavos; `per_guest_cents` alimenta o simulador |
| `audit_log` | Ações sensíveis | Gerar/revogar link, apagar família, exportar dados, RSVP |
| `rate_limits` | Limite de tentativas por janela de 1 hora | Login, convite, RSVP |

## Regras de integridade importantes
- Toda consulta da área dos noivos filtra por `wedding_id` **da sessão**.
- Um RSVP só é aceito se o `guest_id` pertence à família do token **e** o `event_id` está em
  `invitations` daquela família.
- Depois do `rsvp_deadline`, o convite mostra as respostas mas não aceita mudanças (o casal ainda pode
  editar pelo painel na Fase 2).

## Próximas tabelas (Fase 2+)
`vendors`, `vendor_documents` (R2), `tasks`, `timeline_items`, `tables` + `seat_assignments`,
`messages` (envios), `gifts_received`, `capsule_messages`, `media` (R2, com consentimento e retenção).
