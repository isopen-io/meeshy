import { describe, expect, test } from 'bun:test';

import { imageFilesOf, mustReencode, prepareStickerSource, readClipboardImages, type ImageDecoder } from './prepare';

/**
 * UNE IMAGE VENUE D'AILLEURS DEVIENT UN STICKER (#7938) — ce que le client
 * prépare avant d'envoyer. La passerelle normalise de toute façon ; ces
 * témoins gardent ce que le CLIENT promet : l'animation d'un GIF intacte, une
 * grande image réduite au carré, et aucun refus à la place du serveur.
 */

const blob = (type: string, size = 10) => new Blob([new Uint8Array(size)], { type });

function fakeDecoder(width: number, height: number, encoded: Blob | null = blob('image/webp', 3)) {
  const calls: Array<readonly [number, number]> = [];
  const decode: ImageDecoder = async () => ({
    width,
    height,
    encode: async (w, h) => {
      calls.push([w, h]);
      return encoded;
    },
  });
  return { decode, calls };
}

describe('mustReencode', () => {
  test('un PNG ou un WebP déjà au format part tel quel', () => {
    expect(mustReencode({ mimeType: 'image/png', width: 400, height: 300, size: 50_000 })).toBe(false);
    expect(mustReencode({ mimeType: 'image/webp', width: 512, height: 512, size: 50_000 })).toBe(false);
  });

  test('une image trop grande, une photo JPEG ou un format exotique se ré-encodent', () => {
    expect(mustReencode({ mimeType: 'image/png', width: 2048, height: 1024, size: 50_000 })).toBe(true);
    expect(mustReencode({ mimeType: 'image/jpeg', width: 300, height: 300, size: 50_000 })).toBe(true);
    expect(mustReencode({ mimeType: 'image/avif', width: 300, height: 300, size: 50_000 })).toBe(true);
  });

  test('un GIF n’est jamais ré-encodé — un canvas n’en garderait qu’une image', () => {
    expect(mustReencode({ mimeType: 'image/gif', width: 4000, height: 4000, size: 9_000_000 })).toBe(false);
  });
});

describe('prepareStickerSource', () => {
  test('réduit une capture d’écran au carré du sticker, ratio gardé', async () => {
    const { decode, calls } = fakeDecoder(2048, 1024);
    const out = await prepareStickerSource(blob('image/png'), decode);

    expect(calls).toEqual([[512, 256]]);
    expect(out.type).toBe('image/webp');
  });

  test('laisse un GIF animé intact, sans même le décoder', async () => {
    const gif = blob('image/gif');
    const { decode, calls } = fakeDecoder(100, 100);

    expect(await prepareStickerSource(gif, decode)).toBe(gif);
    expect(calls).toEqual([]);
  });

  test('un décodage impossible rend la source : c’est la passerelle qui juge', async () => {
    const source = blob('image/heic');
    const failing: ImageDecoder = async () => {
      throw new Error('cannot decode');
    };

    expect(await prepareStickerSource(source, failing)).toBe(source);
  });

  test('un encodage qui ne rend rien retombe sur la source', async () => {
    const source = blob('image/jpeg');
    const { decode } = fakeDecoder(300, 300, null);

    expect(await prepareStickerSource(source, decode)).toBe(source);
  });
});

describe('imageFilesOf — ce qu’un collage apporte', () => {
  const file = (name: string, type: string) => new File([new Uint8Array(4)], name, { type });

  test('les fichiers image d’abord, sans le texte ni les autres fichiers', () => {
    const transfer = {
      files: [file('a.png', 'image/png'), file('notes.txt', 'text/plain')] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
    };

    expect(imageFilesOf(transfer).map((f) => f.name)).toEqual(['a.png']);
  });

  test('sinon les éléments image du presse-papier (une image copiée depuis une page)', () => {
    const pasted = file('image.png', 'image/png');
    const transfer = {
      files: [] as unknown as FileList,
      items: [
        { kind: 'string', type: 'text/html', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => pasted },
      ] as unknown as DataTransferItemList,
    };

    expect(imageFilesOf(transfer)).toEqual([pasted]);
  });

  test('rien d’image ⇒ liste vide ; pas de transfert ⇒ liste vide', () => {
    expect(imageFilesOf(null)).toEqual([]);
  });
});

describe('readClipboardImages — le bouton « Coller »', () => {
  test('rend les images du presse-papier, ignore le texte', async () => {
    const png = blob('image/png');
    const clipboard = {
      read: async () =>
        [
          { types: ['text/plain'], getType: async () => blob('text/plain') },
          { types: ['text/html', 'image/png'], getType: async () => png },
        ] as unknown as ClipboardItems,
    };

    expect(await readClipboardImages(clipboard)).toEqual([png]);
  });

  test('une permission refusée ou une API absente ne lève pas : rien à coller', async () => {
    const denied = {
      read: async (): Promise<ClipboardItems> => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    };

    expect(await readClipboardImages(denied)).toEqual([]);
    expect(await readClipboardImages(undefined)).toEqual([]);
  });
});
