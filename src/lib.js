/** Utilidades sem dependências: respostas, validação, criptografia e limite de tentativas. */

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

export const err = (status, message, code) => json({ error: message, code: code || String(status) }, status);

export class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
export const fail = (status, message, code) => { throw new HttpError(status, message, code); };

/* ---------- validação ---------- */
export function str(v, { max = 200, min = 0, field = "campo" } = {}) {
  if (v == null) v = "";
  if (typeof v !== "string") fail(400, `${field}: texto inválido`, "invalid");
  v = v.trim().replace(/\s+/g, " ");
  if (v.length < min) fail(400, `${field}: obrigatório`, "required");
  if (v.length > max) fail(400, `${field}: no máximo ${max} caracteres`, "too_long");
  return v;
}
export function int(v, { min = 0, max = 1e12, field = "número" } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${field}: valor inválido`, "invalid");
  return n;
}
export function oneOf(v, list, field = "opção") { if (!list.includes(v)) fail(400, `${field}: valor inválido`, "invalid"); return v; }
export function isoDate(v, field = "data") {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + "T12:00:00Z"))) fail(400, `${field}: use AAAA-MM-DD`, "invalid");
  return v;
}
export async function body(req, maxBytes = 32_000) {
  const t = await req.text();
  if (t.length > maxBytes) fail(413, "Requisição grande demais", "too_large");
  try { return t ? JSON.parse(t) : {}; } catch { fail(400, "JSON inválido", "invalid_json"); }
}

/* ---------- criptografia ---------- */
const enc = new TextEncoder();
export const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const randomToken = (bytes = 16) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const uid = (p = "") => p + randomToken(9);
export async function sha256(text) { return b64(await crypto.subtle.digest("SHA-256", enc.encode(text))); }

const PBKDF2_ITER = 100_000; // limite do Cloudflare Workers
export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}

/* ---------- limite de tentativas (janela de 1 hora) ---------- */
export async function rateLimit(env, bucket, max) {
  const win = new Date().toISOString().slice(0, 13);
  await env.DB.prepare("INSERT INTO rate_limits (bucket, win, hits) VALUES (?, ?, 1) ON CONFLICT(bucket, win) DO UPDATE SET hits = hits + 1").bind(bucket, win).run();
  const row = await env.DB.prepare("SELECT hits FROM rate_limits WHERE bucket = ? AND win = ?").bind(bucket, win).first();
  if (row && row.hits > max) fail(429, "Muitas tentativas. Tente de novo em alguns minutos.", "rate_limited");
}

export const clientIp = req => req.headers.get("CF-Connecting-IP") || "local";

export async function audit(env, weddingId, actor, action, target = "") {
  await env.DB.prepare("INSERT INTO audit_log (wedding_id, actor, action, target) VALUES (?, ?, ?, ?)").bind(weddingId, actor, action, target).run();
}

export const parseJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
