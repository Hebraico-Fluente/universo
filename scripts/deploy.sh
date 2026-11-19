#!/bin/sh
# Publica o Universo: usado pelo GitHub Actions (e pela Cloudflare, se o Workers Builds estiver ligado).
#   1. atualiza as tabelas antes do código novo (mudanças só acrescentam colunas/tabelas)
#   2. liga o armazenamento de arquivos R2 se a conta tiver o bucket "universo-media"
#      (tenta criá-lo; se o R2 não estiver ativado na conta, segue guardando arquivos no D1)
#   3. publica o Worker e os arquivos (o banco D1 "universo" é criado no primeiro deploy)
#   4. só com o banco vazio: carrega os dados iniciais (site de Pétala & Lucas e demonstrações)
set -e
W="npx -y wrangler@4"
BUCKET="${R2_BUCKET:-universo-media}"

$W d1 migrations apply universo --remote || echo "Banco ainda não existe; as tabelas são criadas depois do primeiro deploy."

CFG=""
$W r2 bucket create "$BUCKET" >/dev/null 2>&1 || true
if $W r2 bucket list 2>/dev/null | grep -q "$BUCKET"; then
  node scripts/with-r2.mjs > wrangler.r2.jsonc
  CFG="-c wrangler.r2.jsonc"
  echo "Armazenamento de arquivos: R2 ($BUCKET)."
else
  echo "Armazenamento de arquivos: banco D1 (R2 não disponível nesta conta)."
fi

$W deploy $CFG
$W d1 migrations apply universo --remote $CFG
n=$($W d1 execute universo --remote --json $CFG --command "SELECT COUNT(*) AS n FROM weddings" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].n))')
if [ "$n" = "0" ]; then
  node scripts/seed.mjs > seed.sql
  $W d1 execute universo --remote $CFG --file=seed.sql
  echo "Dados iniciais carregados."
else
  echo "Banco já tem $n casamento(s); nada a carregar."
fi
