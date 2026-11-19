/**
 * Envio de arquivos do painel (módulo "midia").
 *
 *   uploadImage(file, { public, maxSide = 2000, quality = .82, kind })  → { id, url, type, size, name }
 *     Comprime no navegador (canvas → WebP, ou JPEG onde não houver WebP), respeitando a orientação da foto (EXIF).
 *   uploadFile(file, { public, kind, name })                           → { id, url, type, size, name }
 *     Envia como está (áudio, vídeo, PDF…). O servidor confere o tipo pelos bytes.
 *   compressImage(file, { maxSide, quality })                          → File (já comprimido)
 *
 * `public: true` = qualquer pessoa com a URL vê (ex.: fotos do site). Sem isso, só o casal logado.
 * `kind`: "site" (padrão de uploadImage), "gallery", "memory", "legacy" ou "file".
 */
const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Reduz a foto para no máximo `maxSide` px no maior lado e recomprime. */
export async function compressImage(file, { maxSide = 2000, quality = 0.82 } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Escolha uma foto (JPG, PNG ou WebP).");
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("Não deu para abrir esta foto neste navegador. Tente uma foto em JPG ou PNG."); }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = type => new Promise(r => canvas.toBlob(r, type, quality));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg"); // Safari antigo não gera WebP
  if (!blob) throw new Error("Não deu para preparar a foto. Tente outra.");
  // se a original já era pequena e leve, fica com ela
  if (scale === 1 && EXT[file.type] && file.size <= blob.size) return file;
  const base = String(file.name || "foto").replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${base}.${EXT[blob.type]}`, { type: blob.type });
}

/** Envia o arquivo como está. */
export async function uploadFile(file, { public: pub = false, kind = "file", name } = {}) {
  if (!file || !file.size) throw new Error("Escolha um arquivo.");
  const q = new URLSearchParams({ kind });
  if (pub) q.set("public", "1");
  const type = file.type || "application/octet-stream";
  const r = await fetch(`/api/admin/media?${q}`, {
    method: "POST", body: file, credentials: "same-origin",
    headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(name || file.name || "arquivo") },
  });
  let data = null; try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) { const e = new Error(data?.error || "Não deu para enviar o arquivo. Tente de novo."); e.status = r.status; e.code = data?.code; throw e; }
  return data;
}

/** Comprime e envia uma foto. Contrato estável (usado pelo editor do site). */
export async function uploadImage(file, { public: pub = false, maxSide = 2000, quality = 0.82, kind = "site" } = {}) {
  const small = await compressImage(file, { maxSide, quality });
  return uploadFile(small, { public: pub, kind });
}
