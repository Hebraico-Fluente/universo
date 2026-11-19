/**
 * Gera a configuração de deploy com o armazenamento de arquivos R2 ligado (binding MEDIA).
 * Usado pelo scripts/deploy.sh só quando o bucket "universo-media" existe na conta.
 * Sem R2, o Universo guarda os arquivos no próprio banco D1 (limite menor).
 */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const cfg = JSON.parse(src.split("\n").filter(l => !l.trim().startsWith("//")).join("\n"));
cfg.r2_buckets = [{ binding: "MEDIA", bucket_name: process.env.R2_BUCKET || "universo-media" }];
process.stdout.write(JSON.stringify(cfg, null, 2) + "\n");
