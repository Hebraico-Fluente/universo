# Módulos do Universo

Cada área nova do produto é um **módulo**: dono das suas rotas, tabelas, telas e testes.
Assim várias áreas evoluem em paralelo sem mexer nos mesmos arquivos.

## Servidor — `src/mods/<nome>.js`

```js
export default {
  name: "convidados",                       // chave em data.mods[name]
  pages: [[/^\/padrinhos\/[\w-]{16,64}$/, "/padrinhos.html", true]], // [regex, arquivo em public/, privada (noindex/no-store)]
  async public(ctx) {},  // rotas públicas /api/... (sem login). Devolva Response ou null.
  async root(ctx) {},    // rotas com autenticação própria (ex.: /api/platform/*). Response ou null.
  async admin(ctx) {},   // rotas do casal /api/admin/... (já logado; escrita já checou origem e papel)
  async site(env, w) {},       // dados extras em GET /api/site/:slug → mods[name]  (NUNCA dados pessoais)
  async invite(env, w, h) {},  // dados extras em GET /api/invite/:token → mods[name] (só da família h)
  async overview(env, W) {},   // extras da visão geral → mods[name]  (ex.: { alerts: [{ text, href }] })
  async exportData(env, W) {}, // objeto mesclado na exportação completa (LGPD)
  async cron(env, now) {},     // rotina diária (06:23 UTC)
  async purgeGuests(env, W) {}, // limpeza LGPD: apaga dados pessoais de convidados que o módulo guarda
  async rsvp(env, h, body, responses) {}, // gancho do RSVP: valida antes de gravar; devolve async () => extras da resposta (ou null)
};
```

`ctx` = `{ req, env, url, p (pathname), m (método), session(), sameOrigin() }`; em `admin` também `{ s (sessão), W (wedding_id), actor }`.

Regras que valem para todos:
- **Toda consulta filtra por `wedding_id = W`** (isolamento entre casais). Nunca confie em ids vindos do cliente sem checar o dono.
- Rotas públicas que escrevem: `ctx.sameOrigin()` + `rateLimit(env, "<bucket>:" + clientIp(req), N)` + validação (`str`, `int`, `oneOf`, `isoDate` de `src/lib.js`).
- Nada de dados pessoais, tokens ou contratos em `site()` ou em páginas públicas. Tokens só como hash (`sha256`).
- Ações sensíveis (apagar, revogar, exportar) → `audit(env, W, actor, "acao", alvo)`.
- Sem dependências novas sem necessidade real. Sem estilos ou scripts inline (CSP): estilos via CSS ou CSSOM.

## Banco — `migrations/NNNN_nome.sql`
Faixas de numeração por módulo (evita colisão): convidados **0010–0019**, organização **0020–0029**,
plataforma **0030–0039**, editor **0040–0049**, mídia **0050–0059**, experiências **0060–0069**;
0070+ em sequência (dados do casal real, música e ranking do quiz em 0074; mural de P&L em 0077, cápsula em meses e aniversários em 0078, pasta do Drive em 0079, perguntas do quiz de P&L em 0080, 0082, 0084 e 0087; fotos e vídeo da história em 0081 e 0083; quiz uma vez e prêmio em 0085 e 0086; van em 0088; sem a pergunta dos gatos em 0089).
Os testes aplicam todas as migrações em ordem (como o deploy). `schema.sql` é só referência.

## Painel — `public/assets/painel/<tela>.js`
Registre a aba em `public/assets/painel/views.js` (`ready: false` esconde até ficar pronta).
A tela exporta `export default async function()` e desenha em `viewEl()` (de `./core.js`).
CSS próprio: `css("/assets/painel/<tela>.css")`. Componentes globais (ex.: assistente) vão em `WIDGETS`.
O painel carrega o tema do casal (`/assets/themes/<tema>/theme.css` + `painel.css`): use as variáveis
(`--accent`, `--paper`, `--line`, `--r-lg`, `--serif`, `--sans`…) em vez de cores fixas.

## Site e convite
- Site público: registre em `public/assets/site-mods/index.js` (veja o cabeçalho do arquivo). Uma seção pode
  entrar antes de outra (`before: "<id>"`) ou substituir uma existente (`replace: "<id>"`).
- Convite pessoal: `public/assets/invite-mods/index.js`.

## Testes
`test/<modulo>.test.mjs` usando `setup()` de `test/helpers.mjs`. `npm test` roda todos.
Servidor local: `PORT=88xx npm run dev`; rotina diária local: `GET /__cron?agora=AAAA-MM-DD`.

## E-mails de aniversário — `src/mods/aniversario.js`
Na rotina diária, depois de abrir as cápsulas do tempo (`openDue`), os noivos (papel `owner`) recebem um e-mail
quando o casamento faz **6 meses** ou **1 ano** (dia de `weddings.date_iso` + N meses, horário de Brasília; fim de mês
ajustado, ex.: 31/08 + 6 meses → 28/02 ou 29/02). Cápsulas antigas de 5 e 10 anos (antes da migração 0078) também
geram e-mail na data delas. O e-mail diz só **quantas** mensagens abriram (nunca o conteúdo) e leva a `PANEL_ORIGIN/painel`;
sem cápsulas, é uma nota de aniversário apontando para as fotos e memórias. Sem pixel de rastreio.
- Uma vez por casamento por marco (`aniversarios_enviados`, reserva antes de enviar). Rotina perdida: envia até 7 dias depois.
- Fora: `is_demo`, `suspended` e funcionalidade `aniversario` desligada na plataforma (ausente = ligada).
  Atenção: "aplicar plano" desliga `aniversario` em planos que não incluem essa chave.
- Envio pela Resend (`src/lib/mail.js`). **Segredo `RESEND_API_KEY`** só no painel da Cloudflare
  (Worker › Settings › Variables and Secrets); **var `MAIL_FROM`** e `PANEL_ORIGIN` em `wrangler.jsonc`.
  O domínio do remetente (guetastudio.com.br) precisa estar **verificado na Resend** (registros DNS SPF/DKIM na zona).
  Sem chave ou remetente: não envia e não marca (sai quando configurar, dentro dos 7 dias). Erro da Resend para
  todos os noivos: desfaz a reserva e tenta no dia seguinte.
- Simulação (administrador da plataforma): `GET /api/platform/aniversarios?data=AAAA-MM-DD` — casamentos, marco,
  número de cápsulas e de noivos, sem endereços. Local: `GET /__cron?agora=AAAA-MM-DD` roda a rotina.
- LGPD: e-mails só para os noivos (não são convidados); endereços nunca vão para o log; `exportData`/`purgeGuests` não mudam.

## Cápsula do tempo em meses (migração 0078)
Convidados escolhem **daqui a 6 meses** ou **daqui a 1 ano** (`months` 6|12). A coluna `capsules.months` é a fonte da
verdade; `years` fica só pelo CHECK antigo (cápsulas novas gravam `years = 1`). Linhas antigas: `months = years * 12`.
Páginas antigas em cache que mandam `years=1` viram 12 meses; 5 e 10 anos não são aceitos em cápsulas novas.

## Fotos pela pasta do Google Drive (migração 0079)
`media_settings.drive_pasta_url` (só os noivos editam, no painel › Fotos e memórias › Moderação › Google Drive;
`GET|PATCH /api/admin/midia/drive`). Validado como `https://drive.google.com/drive/folders/<id>` (aceita `/u/N/` e `?usp=…`).
Preenchido e com "Convidados podem enviar fotos" ligado, a seção de fotos do site troca o formulário de envio por
**"Enviar fotos no Google Drive ↗"** (nova aba). Guia do casal: `docs/drive-fotos/LEIA-ME.md`. LGPD: as fotos enviadas
pela pasta ficam no Drive do casal, fora do Universo e sob controle deles (não entram na exportação nem na limpeza).

## Quiz: uma vez por pessoa e prêmio (migrações 0085–0086)
- Cada pessoa responde **uma vez**: o servidor recusa (409 `ja_jogou`) o mesmo nome normalizado (sem acento, minúsculo,
  espaços simples) ou o mesmo aparelho. Aparelho = id aleatório em cookie próprio (`__Host-quizdev`, HttpOnly, 400 dias)
  com cópia no localStorage; o banco guarda só o sha256 (`quiz_scores.device_hash`). Sem login isso é um limite honesto,
  não uma prova (outro navegador com outro nome passa). O quiz fica só no site público (o convite não tem quiz), então
  não há sinal de família/convite para usar.
- `POST /api/site/:slug/quiz/inicio` confere antes das perguntas e ao abrir a página; quem já jogou vê "Você já respondeu
  o quiz!" com a marca, a posição e o ranking. Não existe "Jogar de novo".
- Painel › Site › Quiz: "Liberar nova tentativa" apaga a jogada (audit `quiz.retry`) para a pessoa jogar de novo.
- Jogadas antigas continuam no ranking (o UNIQUE por nome já garantia uma linha por pessoa) e contam como "já jogou".
- `weddings.quiz_premio`: texto do prêmio, editado no painel; vazio = sem caixa de prêmio no site.

## Capítulos com vídeo (história)
Item de `story_json` pode ter `video` (só .mp4 do próprio site), `poster` e `alt`. No site aparece com controles (sem tocar
sozinho); no documentário toca sem som, em loop, só no capítulo ativo (com "reduzir movimento": espera o toque), com o botão
"Ativar som" (que pausa a trilha do documentário; a música do casal pausa sozinha quando um vídeo toca com som).
Ano e texto vazios não aparecem. O editor do painel preserva o vídeo ao salvar.

## Van (migração 0088) — `src/mods/van.js`
Pergunta "Quer ir de van para o casamento?" DENTRO do RSVP (convite pessoal e confirmação pelo nome), só para quem
confirma presença e só com a van ligada (painel › Van; funcionalidade de plataforma `van`). Sim → quantas pessoas (até o
número de confirmados) e WhatsApp (obrigatório com `exige_celular`; celular brasileiro, guarda só os dígitos). Vai no mesmo
envio do RSVP pelo gancho `rsvp()` (valida antes de gravar). Uma linha por família; "Não" ou "não vou" em tudo tira da lista.
Com vagas, quem passa do limite entra na lista de espera. O link do grupo (chat.whatsapp.com) só aparece para quem está na
lista (resposta do RSVP e convite). Painel: lista, WhatsApp de cada um, "Copiar números", "Copiar lista para o WhatsApp",
CSV. LGPD: entra na exportação e sai na limpeza dos convidados; nada vai para o site público.
