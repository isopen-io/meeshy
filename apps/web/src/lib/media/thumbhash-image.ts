/**
 * **LA RECONSTRUCTION COMPLÈTE D'UN THUMBHASH** (#8413) — là où
 * `thumbhash.ts` n'en tire que la couleur MOYENNE (un aplat, juste pour un
 * placeholder de carte), le SOL de la scène plein écran doit être peint de
 * l'image basse résolution entière, étirée et floutée : c'est ce que la
 * directive porteur du 2026-09-27 appelle « un sol peint en thumbhash du
 * résultat de la scène », et ce qu'iOS peint (`SceneBackdropView(.thumbHash)`).
 *
 * DÉCODAGE — miroir de `thumbHashToRGBA` de la référence ThumbHash (Evan
 * Wallace, licence MIT) : une DCT sur les canaux L/P/Q (et A), au plus 32 px
 * de côté.
 *
 * SORTIE — un `data:` BMP 24 bits, écrit octet par octet : aucun `<canvas>`
 * (indisponible sous `bun test`, et dont l'espace colorimétrique varie d'un
 * moteur à l'autre), le même fichier sur Chrome, WKWebView et la WebView
 * Android. Le BMP ignore l'alpha : un sol n'a pas de transparence à porter.
 */
export type ThumbHashImage = { readonly width: number; readonly height: number; readonly rgba: Uint8Array };

function bytesOf(base64: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const byteAt = (hash: Uint8Array, index: number): number => hash[index] ?? 0;

export function thumbHashToRgba(hash: Uint8Array): ThumbHashImage | null {
  if (hash.length < 5) return null;
  const header24 = byteAt(hash, 0) | (byteAt(hash, 1) << 8) | (byteAt(hash, 2) << 16);
  const header16 = byteAt(hash, 3) | (byteAt(hash, 4) << 8);
  const lDc = (header24 & 63) / 63;
  const pDc = ((header24 >> 6) & 63) / 31.5 - 1;
  const qDc = ((header24 >> 12) & 63) / 31.5 - 1;
  const lScale = ((header24 >> 18) & 31) / 31;
  const hasAlpha = header24 >> 23 !== 0;
  const pScale = ((header16 >> 3) & 63) / 63;
  const qScale = ((header16 >> 9) & 63) / 63;
  const isLandscape = header16 >> 15 !== 0;
  const lx = Math.max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
  const ly = Math.max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7);
  const aDc = hasAlpha ? (byteAt(hash, 5) & 15) / 15 : 1;
  const aScale = (byteAt(hash, 5) >> 4) / 15;

  const acStart = hasAlpha ? 6 : 5;
  let acIndex = 0;
  const decodeChannel = (nx: number, ny: number, scale: number): number[] => {
    const ac: number[] = [];
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = cy > 0 ? 0 : 1; cx * ny < nx * (ny - cy); cx++) {
        ac.push((((byteAt(hash, acStart + (acIndex >> 1)) >> ((acIndex & 1) << 2)) & 15) / 7.5 - 1) * scale);
        acIndex++;
      }
    }
    return ac;
  };
  const lAc = decodeChannel(lx, ly, lScale);
  const pAc = decodeChannel(3, 3, pScale * 1.25);
  const qAc = decodeChannel(3, 3, qScale * 1.25);
  const aAc = hasAlpha ? decodeChannel(5, 5, aScale) : [];

  const ratio = lx / ly;
  const width = Math.round(ratio > 1 ? 32 : 32 * ratio);
  const height = Math.round(ratio > 1 ? 32 / ratio : 32);
  const rgba = new Uint8Array(width * height * 4);
  const fx: number[] = [];
  const fy: number[] = [];
  const clamp255 = (value: number): number => Math.max(0, Math.round(255 * Math.min(1, value)));

  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      let l = lDc;
      let p = pDc;
      let q = qDc;
      let a = aDc;
      for (let cx = 0, n = Math.max(lx, hasAlpha ? 5 : 3); cx < n; cx++) fx[cx] = Math.cos((Math.PI / width) * (x + 0.5) * cx);
      for (let cy = 0, n = Math.max(ly, hasAlpha ? 5 : 3); cy < n; cy++) fy[cy] = Math.cos((Math.PI / height) * (y + 0.5) * cy);
      for (let cy = 0, j = 0; cy < ly; cy++) {
        const fy2 = (fy[cy] ?? 0) * 2;
        for (let cx = cy > 0 ? 0 : 1; cx * ly < lx * (ly - cy); cx++, j++) l += (lAc[j] ?? 0) * (fx[cx] ?? 0) * fy2;
      }
      for (let cy = 0, j = 0; cy < 3; cy++) {
        const fy2 = (fy[cy] ?? 0) * 2;
        for (let cx = cy > 0 ? 0 : 1; cx < 3 - cy; cx++, j++) {
          const f = (fx[cx] ?? 0) * fy2;
          p += (pAc[j] ?? 0) * f;
          q += (qAc[j] ?? 0) * f;
        }
      }
      if (hasAlpha) {
        for (let cy = 0, j = 0; cy < 5; cy++) {
          const fy2 = (fy[cy] ?? 0) * 2;
          for (let cx = cy > 0 ? 0 : 1; cx < 5 - cy; cx++, j++) a += (aAc[j] ?? 0) * (fx[cx] ?? 0) * fy2;
        }
      }
      const b = l - (2 / 3) * p;
      const r = (3 * l - b + q) / 2;
      const g = r - q;
      rgba[i] = clamp255(r);
      rgba[i + 1] = clamp255(g);
      rgba[i + 2] = clamp255(b);
      rgba[i + 3] = clamp255(a);
    }
  }
  return { width, height, rgba };
}

/** Un BMP 24 bits, lignes de bas en haut, chacune complétée à 4 octets. */
function bmpOf(image: ThumbHashImage): Uint8Array {
  const rowSize = Math.ceil((image.width * 3) / 4) * 4;
  const size = 54 + rowSize * image.height;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, size, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, image.width, true);
  view.setInt32(22, image.height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowSize * image.height, true);
  for (let y = 0; y < image.height; y++) {
    const row = 54 + (image.height - 1 - y) * rowSize;
    for (let x = 0; x < image.width; x++) {
      const source = (y * image.width + x) * 4;
      bytes[row + x * 3] = image.rgba[source + 2] ?? 0;
      bytes[row + x * 3 + 1] = image.rgba[source + 1] ?? 0;
      bytes[row + x * 3 + 2] = image.rgba[source] ?? 0;
    }
  }
  return bytes;
}

/** L'image d'un thumbhash, prête pour un `<img src>` — `undefined` pour un
 * hash absent ou illisible : l'appelant garde alors sa surface. */
export function thumbHashImage(base64: string | undefined): string | undefined {
  if (base64 === undefined || base64 === '') return undefined;
  const hash = bytesOf(base64);
  const image = hash === null ? null : thumbHashToRgba(hash);
  if (image === null) return undefined;
  const bmp = bmpOf(image);
  let binary = '';
  bmp.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/bmp;base64,${btoa(binary)}`;
}

/**
 * **L'ENCODEUR** (#8425) — miroir de `rgbaToThumbHash` de la même référence
 * (Evan Wallace, licence MIT) : le composer hache le RENDU RÉDUIT de sa scène
 * (au plus 100 px de côté) pour peindre son sol du composite, comme iOS
 * (`StorySlideRenderer.computeThumbHash`).
 */
export function rgbaToThumbHash(w: number, h: number, rgba: Uint8Array): Uint8Array {
  if (w > 100 || h > 100) throw new Error(`${w}x${h} dépasse 100x100`);
  const px = (i: number): number => rgba[i] ?? 0;
  let avgR = 0;
  let avgG = 0;
  let avgB = 0;
  let avgA = 0;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const alpha = px(j + 3) / 255;
    avgR += (alpha / 255) * px(j);
    avgG += (alpha / 255) * px(j + 1);
    avgB += (alpha / 255) * px(j + 2);
    avgA += alpha;
  }
  if (avgA > 0) {
    avgR /= avgA;
    avgG /= avgA;
    avgB /= avgA;
  }
  const hasAlpha = avgA < w * h;
  const lLimit = hasAlpha ? 5 : 7;
  const lx = Math.max(1, Math.round((lLimit * w) / Math.max(w, h)));
  const ly = Math.max(1, Math.round((lLimit * h) / Math.max(w, h)));
  const l: number[] = [];
  const p: number[] = [];
  const q: number[] = [];
  const a: number[] = [];
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const alpha = px(j + 3) / 255;
    const r = avgR * (1 - alpha) + (alpha / 255) * px(j);
    const g = avgG * (1 - alpha) + (alpha / 255) * px(j + 1);
    const b = avgB * (1 - alpha) + (alpha / 255) * px(j + 2);
    l[i] = (r + g + b) / 3;
    p[i] = (r + g) / 2 - b;
    q[i] = r - g;
    a[i] = alpha;
  }
  const encodeChannel = (channel: readonly number[], nx: number, ny: number): { dc: number; ac: number[]; scale: number } => {
    let dc = 0;
    const ac: number[] = [];
    let scale = 0;
    const fx: number[] = [];
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = 0; cx * ny < nx * (ny - cy); cx++) {
        let f = 0;
        for (let x = 0; x < w; x++) fx[x] = Math.cos((Math.PI / w) * cx * (x + 0.5));
        for (let y = 0; y < h; y++) {
          const fy = Math.cos((Math.PI / h) * cy * (y + 0.5));
          for (let x = 0; x < w; x++) f += (channel[x + y * w] ?? 0) * (fx[x] ?? 0) * fy;
        }
        f /= w * h;
        if (cx > 0 || cy > 0) {
          ac.push(f);
          scale = Math.max(scale, Math.abs(f));
        } else {
          dc = f;
        }
      }
    }
    return { dc, ac: scale > 0 ? ac.map((value) => 0.5 + (0.5 / scale) * value) : ac, scale };
  };
  const L = encodeChannel(l, Math.max(3, lx), Math.max(3, ly));
  const P = encodeChannel(p, 3, 3);
  const Q = encodeChannel(q, 3, 3);
  const A = hasAlpha ? encodeChannel(a, 5, 5) : null;
  const isLandscape = w > h;
  const header24 =
    Math.round(63 * L.dc) |
    (Math.round(31.5 + 31.5 * P.dc) << 6) |
    (Math.round(31.5 + 31.5 * Q.dc) << 12) |
    (Math.round(31 * L.scale) << 18) |
    ((hasAlpha ? 1 : 0) << 23);
  const header16 = (isLandscape ? ly : lx) | (Math.round(63 * P.scale) << 3) | (Math.round(63 * Q.scale) << 9) | ((isLandscape ? 1 : 0) << 15);
  const hash: number[] = [header24 & 255, (header24 >> 8) & 255, header24 >> 16, header16 & 255, header16 >> 8];
  if (A !== null) hash.push(Math.round(15 * A.dc) | (Math.round(15 * A.scale) << 4));
  const acStart = hasAlpha ? 6 : 5;
  let acIndex = 0;
  const channels = A !== null ? [L.ac, P.ac, Q.ac, A.ac] : [L.ac, P.ac, Q.ac];
  channels.forEach((ac) =>
    ac.forEach((f) => {
      const index = acStart + (acIndex >> 1);
      hash[index] = (hash[index] ?? 0) | (Math.round(15 * f) << ((acIndex & 1) << 2));
      acIndex++;
    }),
  );
  return new Uint8Array(hash);
}

/** Le hash en base64 STANDARD — la forme que la passerelle sert et que
 * `thumbHashImage` relit. */
export function thumbHashToBase64(hash: Uint8Array): string {
  let binary = '';
  hash.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
