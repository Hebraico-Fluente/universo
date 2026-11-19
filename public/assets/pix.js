/**
 * Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central) gerado no navegador.
 * Sem intermediário e sem taxa: o dinheiro vai direto da conta do convidado para a conta dos noivos.
 * O app do banco confirma o titular da chave antes do pagamento.
 */
const plain = (s, max) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Za-z0-9 .,\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
const f = (id, v) => id + String(v.length).padStart(2, "0") + v;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como exige o BR Code. */
export function crc16(s) {
  let c = 0xFFFF;
  for (const ch of new TextEncoder().encode(s)) {
    c ^= ch << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, "0");
}

/** Monta o código. cents = 0 deixa o valor em aberto (o convidado digita no banco). */
export function brcode({ key, name, city, cents = 0, description = "", txid = "***" }) {
  key = String(key || "").trim();
  if (!key || key.length > 77) throw new Error("Chave Pix inválida");
  let desc = plain(description, 99 - 4 - 18 - 4 - key.length - 4);
  const acct = f("00", "br.gov.bcb.pix") + f("01", key) + (desc ? f("02", desc) : "");
  const p = f("00", "01") + f("26", acct) + f("52", "0000") + f("53", "986")
    + (cents > 0 ? f("54", (cents / 100).toFixed(2)) : "") + f("58", "BR")
    + f("59", plain(name, 25).toUpperCase() || "RECEBEDOR") + f("60", plain(city, 15).toUpperCase() || "BRASIL")
    + f("62", f("05", txid)) + "6304";
  return p + crc16(p);
}
