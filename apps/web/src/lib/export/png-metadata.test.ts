import { describe, expect, test } from 'bun:test';

import { MEESHY_PNG_METADATA, pngCrc32, pngTextChunks, withPngMetadata } from './png-metadata';

/** Un PNG minimal valide : signature, IHDR 1×1, IDAT, IEND. */
function tinyPng(): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, data: number[]) => {
    const body = new Uint8Array([...Array.from(type, (c) => c.charCodeAt(0)), ...data]);
    const crc = pngCrc32(body);
    const length = data.length;
    return [(length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255, ...body, (crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
  };
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunk('IDAT', [120, 156, 99, 0, 1, 0, 0, 5, 0, 1]),
    ...chunk('IEND', []),
  ]);
}

const chunkTypes = (bytes: Uint8Array): string[] => {
  const types: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset < bytes.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const crc = view.getUint32(offset + 8 + length);
    expect(crc).toBe(pngCrc32(bytes.subarray(offset + 4, offset + 8 + length)));
    types.push(type);
    offset += 12 + length;
  }
  return types;
};

describe('les métadonnées PNG — l’image dit que Meeshy l’a créée', () => {
  test('le CRC est celui de la norme PNG', () => {
    expect(pngCrc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });

  test('les blocs texte se posent juste après IHDR, avec un CRC valide, sans toucher l’image', () => {
    const png = tinyPng();
    const stamped = withPngMetadata(png, MEESHY_PNG_METADATA);
    expect(chunkTypes(stamped)).toEqual(['IHDR', 'tEXt', 'tEXt', 'tEXt', 'iTXt', 'IDAT', 'IEND']);
    expect(stamped.subarray(stamped.length - 12)).toEqual(png.subarray(png.length - 12));
  });

  test('Meeshy est le logiciel créateur, en clair et en XMP (lu par Photos et les éditeurs)', () => {
    const text = pngTextChunks(withPngMetadata(tinyPng(), MEESHY_PNG_METADATA));
    expect(text['Software']).toBe('Meeshy');
    expect(text['Source']).toBe('Meeshy');
    expect(text['XML:com.adobe.xmp']?.includes('<xmp:CreatorTool>Meeshy</xmp:CreatorTool>')).toBe(true);
  });

  test('un fichier qui n’est pas un PNG ressort intact', () => {
    const notPng = new Uint8Array([1, 2, 3]);
    expect(withPngMetadata(notPng, MEESHY_PNG_METADATA)).toBe(notPng);
  });
});
