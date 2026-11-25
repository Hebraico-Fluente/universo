-- Fotos da festa: link opcional para a pasta compartilhada do Google Drive do casal.
-- Preenchido, a seção de fotos do site troca o formulário de envio por um botão que abre a pasta.
ALTER TABLE media_settings ADD COLUMN drive_pasta_url TEXT NOT NULL DEFAULT '';

-- Pétala & Lucas: os convidados mandam as fotos da festa direto na pasta do Drive do casal (link enviado por eles,
-- aparece no site público). Liga "Convidados podem enviar fotos" para o botão aparecer. Idempotente.
INSERT INTO media_settings (wedding_id, uploads_on, drive_pasta_url)
SELECT id, 1, 'https://drive.google.com/drive/folders/1sFBIoYDgo728artjSkZcTZp9hmtP3EJK' FROM weddings WHERE slug = 'petala-e-lucas'
ON CONFLICT(wedding_id) DO UPDATE SET uploads_on = 1, drive_pasta_url = excluded.drive_pasta_url, updated_at = datetime('now');
