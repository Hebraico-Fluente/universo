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
0070+ em sequência (dados do casal real, música e ranking do quiz em 0074).
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
