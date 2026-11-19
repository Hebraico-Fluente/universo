/** Utilitários comuns dos testes de API (cada arquivo *.test.mjs cria o próprio banco em memória). */
import { handle } from "../src/worker.js";
import { localEnv } from "./local-env.mjs";

export const O = "https://universo.test";

export async function setup() {
  const env = await localEnv();
  let passed = 0, failed = 0;
  const t = {
    env, cookie: "",
    ok(c, m) { if (c) passed++; else { failed++; process.exitCode = 1; } console.log((c ? "ok    " : "FALHA ") + m); },
    call(method, p, data, { origin = O, ip = "10.0.0.1", ck = t.cookie } = {}) {
      return handle(new Request(O + p, {
        method, headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": ip, ...(ck ? { Cookie: ck } : {}) },
        body: data ? JSON.stringify(data) : undefined }), env);
    },
    async json(method, p, data, opts) { const r = await t.call(method, p, data, opts); return { status: r.status, body: await r.json().catch(() => null), res: r }; },
    async login(email, password, ip = "10.0.0.9") {
      const r = await t.call("POST", "/api/auth/login", { email, password }, { ip, ck: "" });
      return { r, cookie: (r.headers.get("Set-Cookie") || "").split(";")[0] };
    },
    /** Entra como o casal de demonstração (Helena & Rafael) e guarda o cookie. */
    async loginDemo() { const { DEMO } = await import("../scripts/seed.mjs"); const l = await t.login(DEMO.login.email, DEMO.login.password); t.cookie = l.cookie; return l; },
    done(name) { console.log(`\n${name}: ${passed} passaram, ${failed} falharam`); },
  };
  return t;
}
