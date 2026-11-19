#!/bin/sh
# Publica o Universo: usado pela Cloudflare (Workers Builds → "Deploy command") e pelo GitHub Actions.
#   1. publica o Worker e os arquivos (o banco D1 "universo" é criado no primeiro deploy)
#   2. cria/atualiza as tabelas
#   3. só com o banco vazio: carrega os dados iniciais (site de Pétala & Lucas e demonstrações)
set -e
npx -y wrangler@4 deploy
npx -y wrangler@4 d1 migrations apply universo --remote
n=$(npx -y wrangler@4 d1 execute universo --remote --json --command "SELECT COUNT(*) AS n FROM weddings" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].n))')
if [ "$n" = "0" ]; then
  node scripts/seed.mjs > seed.sql
  npx -y wrangler@4 d1 execute universo --remote --file=seed.sql
  echo "Dados iniciais carregados."
else
  echo "Banco já tem $n casamento(s); nada a carregar."
fi
