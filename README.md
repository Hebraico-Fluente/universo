# Universo

Sites de casamento sob medida, com convite pessoal para cada família e um painel para os noivos.
Cloudflare Workers + D1 + arquivos estáticos. Sem dependências de runtime.

## Rodar localmente
```bash
npm test          # 55 testes da API (Worker real + SQLite em memória)
npm run dev       # http://localhost:8787 com dados de demonstração
npm run e2e       # (com o dev rodando) percorre tudo no celular e no computador
```

| Página | Endereço local |
|---|---|
| Landing | http://localhost:8787/ |
| Site (universo Editorial) | /c/helena-e-rafael · Timeless: /c/clara-e-davi · Dreamscape: /c/lia-e-tomas |
| Site com identidade própria | /c/petala-e-lucas |
| Convite pessoal (exemplo) | /i/demo-tia-lucia-tio-beto · /i/exemplo-petala-e-lucas-2027 |
| Painel | /painel → “Preencher acesso de demonstração” (demo@universo.app / casamento-demo-2027) |

As senhas acima existem só nos dados de demonstração locais. Em produção, crie usuários reais.

## Publicar
Dois caminhos, ambos rodam `scripts/deploy.sh` (publica, cria as tabelas e, só com o banco vazio, carrega os dados iniciais):

- **Cloudflare Workers Builds** (atual): projeto importado do GitHub em Workers & Pages, com
  *Deploy command* `sh scripts/deploy.sh`. Cada push na `main` publica.
- **GitHub Actions**: adicione o segredo `CLOUDFLARE_API_TOKEN` no repositório. Sem o segredo, o Actions só roda os testes.

## Documentação
`docs/PRODUCT_VISION.md` · `docs/FEATURE_MATRIX.md` · `docs/ARCHITECTURE.md` · `docs/DATABASE_SCHEMA.md` ·
`docs/DESIGN_SYSTEM.md` · `docs/IMPLEMENTATION_PLAN.md`
