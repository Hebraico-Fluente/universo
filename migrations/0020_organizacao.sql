-- Módulo "organização": fornecedores e propostas, tarefas e checklist, compromissos,
-- parcelas e histórico do orçamento, alertas descartados do radar de riscos.
-- Toda tabela tem wedding_id (isolamento entre casais).

CREATE TABLE IF NOT EXISTS vendors (
  id             TEXT PRIMARY KEY,
  wedding_id     TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT '',          -- texto livre (ex.: "Buffet"); agrupa a comparação de propostas
  contact_name   TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  whatsapp       INTEGER NOT NULL DEFAULT 0,        -- 1 = o telefone também é WhatsApp
  email          TEXT NOT NULL DEFAULT '',
  site           TEXT NOT NULL DEFAULT '',          -- site ou Instagram (URL ou @perfil)
  status         TEXT NOT NULL DEFAULT 'pesquisando'
                 CHECK (status IN ('pesquisando','orcamento_pedido','proposta_recebida','contratado','descartado')),
  owner          TEXT NOT NULL DEFAULT '',          -- responsável pelo contato (texto livre)
  notes          TEXT NOT NULL DEFAULT '',          -- notas internas (nunca aparecem no site)
  doc_url        TEXT NOT NULL DEFAULT '',          -- link do contrato/proposta; o upload de arquivos virá do módulo de mídia
  dates_json     TEXT NOT NULL DEFAULT '[]',        -- [{label, date}] datas importantes
  checklist_json TEXT NOT NULL DEFAULT '[]',        -- [{text, done}] checklist próprio do fornecedor
  budget_item_id TEXT,                              -- lançamento do orçamento ligado (mesmo casamento)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_vendors_w ON vendors(wedding_id, status);

CREATE TABLE IF NOT EXISTS vendor_quotes (
  id           TEXT PRIMARY KEY,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  vendor_id    TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',            -- ex.: "Pacote completo 150 pessoas"
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  notes        TEXT NOT NULL DEFAULT '',
  received_at  TEXT,                                -- AAAA-MM-DD
  valid_until  TEXT,                                -- AAAA-MM-DD
  doc_url      TEXT NOT NULL DEFAULT '',
  chosen       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_quotes_v ON vendor_quotes(wedding_id, vendor_id);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  owner        TEXT NOT NULL DEFAULT '',            -- noiva, noivo, mãe, cerimonialista… (texto livre)
  due_date     TEXT,                                -- AAAA-MM-DD
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  done_at      TEXT,
  vendor_id    TEXT,                                -- fornecedor ligado (mesmo casamento)
  phase        TEXT NOT NULL DEFAULT '',            -- etapa do checklist: 12m, 9m, 6m, 3m, 1m, 2s, 1s, dia
  template_key TEXT,                                -- tarefa gerada pelo checklist (evita duplicar ao gerar de novo)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_tasks_w ON tasks(wedding_id, status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tasks_tpl ON tasks(wedding_id, template_key);

CREATE TABLE IF NOT EXISTS appointments (
  id           TEXT PRIMARY KEY,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'reuniao' CHECK (kind IN ('degustacao','prova','reuniao','visita','outro')),
  starts_at    TEXT NOT NULL,                       -- AAAA-MM-DDTHH:MM, hora local do casamento
  duration_min INTEGER NOT NULL DEFAULT 60 CHECK (duration_min BETWEEN 5 AND 1440),
  place        TEXT NOT NULL DEFAULT '',
  vendor_id    TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_appointments_w ON appointments(wedding_id, starts_at);

-- respostas do formulário "Gerar checklist" (nada é presumido: o casal escolhe)
CREATE TABLE IF NOT EXISTS org_profile (
  wedding_id    TEXT PRIMARY KEY REFERENCES weddings(id) ON DELETE CASCADE,
  ceremony_json TEXT NOT NULL DEFAULT '[]',         -- ["civil","religiosa","ao_ar_livre","destination"]
  guests        INTEGER NOT NULL DEFAULT 0,
  venue_defined INTEGER NOT NULL DEFAULT 0,
  prefs_json    TEXT NOT NULL DEFAULT '[]',
  generated_at  TEXT
);

-- alertas do radar de riscos que o casal descartou
CREATE TABLE IF NOT EXISTS dismissed_alerts (
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  alert_key    TEXT NOT NULL,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wedding_id, alert_key)
);

-- parcelas de um lançamento do orçamento (soma = valor do lançamento; o pago do lançamento = soma das parcelas pagas)
CREATE TABLE IF NOT EXISTS budget_installments (
  id           TEXT PRIMARY KEY,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  n            INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  due_date     TEXT,
  paid_at      TEXT,                                -- AAAA-MM-DD do pagamento; NULL = em aberto
  receipt_url  TEXT NOT NULL DEFAULT '',            -- comprovante (link); upload virá do módulo de mídia
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_inst_item ON budget_installments(wedding_id, item_id, n);

-- histórico de alterações dos lançamentos: quem, quando, o que mudou
CREATE TABLE IF NOT EXISTS budget_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  wedding_id   TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL,                       -- sem FK: o histórico sobrevive à exclusão do lançamento
  item_label   TEXT NOT NULL DEFAULT '',
  actor        TEXT NOT NULL,                       -- user:<id>
  action       TEXT NOT NULL,                       -- create | update | delete | pay | unpay | installments
  changes_json TEXT NOT NULL DEFAULT '[]',          -- [{field, from, to}]
  at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_bhist_w ON budget_history(wedding_id, at);

ALTER TABLE budget_items ADD COLUMN receipt_url TEXT NOT NULL DEFAULT '';  -- comprovante (link)
