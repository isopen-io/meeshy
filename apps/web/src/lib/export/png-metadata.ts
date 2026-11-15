/**
 * **LES MÉTADONNÉES D'UNE CARTE EXPORTÉE** — le PNG dit qui l'a CRÉÉ :
 * Meeshy. Des blocs `tEXt` (lus par les outils et les éditeurs) et un bloc
 * XMP `iTXt` (`xmp:CreatorTool`, lu par Photos, les galeries et les
 * réseaux qui gardent les métadonnées), posés juste après `IHDR` comme le
 * veut la norme, sans toucher un pixel.
 *
 * Rien de l'exportateur n'y entre : son pseudo est dans le filigrane, qu'il
 * voit ; une métadonnée qu'il ne voit pas n'emporte rien de lui.
 */

export type PngMetadata = {
  readonly text: Readonly<Record<string, string>>;
  readonly xmpCreatorTool: string;
};

export const MEESHY_PNG_METADATA: PngMetadata = {
  text: { Software: 'Meeshy', Source: 'Meeshy', Comment: 'Created with Meeshy (https://meeshy.me)' },
  xmpCreatorTool: 'Meeshy',
};

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const latin1 = (text: string): number[] => Array.from(text, (ch) => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 63));

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(latin1(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, pngCrc32(out.subarray(4, 8 + data.length)));
  return out;
}

const textChunk = (keyword: string, value: string) => chunk('tEXt', new Uint8Array([...latin1(keyword), 0, ...latin1(value)]));

const xmpPacket = (creatorTool: string): string =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>${creatorTool}</xmp:CreatorTool></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="r"?>`;

/** iTXt non compressé : mot-clé, 0, drapeau 0, méthode 0, langue vide, 0, mot traduit vide, 0, texte UTF-8. */
const xmpChunk = (creatorTool: string) =>
  chunk('iTXt', new Uint8Array([...latin1('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...new TextEncoder().encode(xmpPacket(creatorTool))]));

const isPng = (bytes: Uint8Array): boolean => bytes.length > 33 && SIGNATURE.every((byte, i) => bytes[i] === byte);

/** Le PNG avec ses métadonnées ; tout autre contenu ressort tel quel. */
export function withPngMetadata(png: Uint8Array<ArrayBuffer>, metadata: PngMetadata): Uint8Array<ArrayBuffer> {
  if (!isPng(png)) return png;
  const ihdrEnd = 8 + 12 + new DataView(png.buffer, png.byteOffset, png.byteLength).getUint32(8);
  const added = [...Object.entries(metadata.text).map(([keyword, value]) => textChunk(keyword, value)), xmpChunk(metadata.xmpCreatorTool)];
  const size = added.reduce((total, part) => total + part.length, png.length);
  const out = new Uint8Array(size);
  out.set(png.subarray(0, ihdrEnd), 0);
  let offset = ihdrEnd;
  for (const part of added) {
    out.set(part, offset);
    offset += part.length;
  }
  out.set(png.subarray(ihdrEnd), offset);
  return out;
}

/** Les blocs texte d'un PNG (`tEXt` et `iTXt` non compressés) — pour les témoins et les outils. */
export function pngTextChunks(png: Uint8Array): Readonly<Record<string, string>> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const entries: [string, string][] = [];
  for (let offset = 8; offset + 12 <= png.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const nul = data.indexOf(0);
    if (type === 'tEXt' && nul > 0) entries.push([String.fromCharCode(...data.subarray(0, nul)), String.fromCharCode(...data.subarray(nul + 1))]);
    if (type === 'iTXt' && nul > 0) {
      const afterLanguage = data.indexOf(0, nul + 3);
      const afterTranslated = data.indexOf(0, afterLanguage + 1);
      entries.push([String.fromCharCode(...data.subarray(0, nul)), new TextDecoder().decode(data.subarray(afterTranslated + 1))]);
    }
    offset += 12 + length;
  }
  return Object.fromEntries(entries);
}
