/** Roda todos os test/*.test.mjs em sequência (cada um em processo próprio). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
const files = fs.readdirSync(new URL(".", import.meta.url)).filter(f => f.endsWith(".test.mjs")).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--no-warnings", new URL(f, import.meta.url).pathname], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const fails = out.split("\n").filter(l => l.startsWith("FALHA") || /Error|at .*\.m?js/.test(l));
  console.log(`${r.status === 0 ? "✓" : "✗"} ${f}  ${out.trim().split("\n").pop()}`);
  if (r.status !== 0) { bad++; console.log(fails.slice(0, 20).join("\n")); }
}
process.exit(bad ? 1 : 0);
