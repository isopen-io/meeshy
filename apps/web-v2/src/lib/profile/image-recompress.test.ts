import { describe, expect, test } from 'bun:test';

import { IMAGE_TARGETS, fitWithin, recompressImage, type ImageCodec } from './image-recompress';

/**
 * RECOMPRESSER AVANT D'ENVOYER (#5562, #6289) — une photo de téléphone pèse 3
 * à 8 Mo pour un avatar affiché en 96 px. Le CODEC est injecté : `bun test`
 * n'a pas de canvas, et la loi à prouver n'est pas celle du navigateur mais
 * celle des BORNES, du FORMAT et du repli.
 */

type Encoded = { readonly width: number; readonly height: number; readonly mime: string; readonly quality: number };

const codecOf = (params: {
  readonly width: number;
  readonly height: number;
  readonly encodedSize?: number;
  readonly served?: (mime: string) => string;
}) => {
  const encodings: Encoded[] = [];
  const closed: boolean[] = [];
  const codec: ImageCodec = {
    decode: async () => ({ width: params.width, height: params.height, source: {}, close: () => closed.push(true) }),
    encode: async ({ size, mime, quality }) => {
      encodings.push({ ...size, mime, quality });
      return new Blob([new Uint8Array(params.encodedSize ?? 40_000)], { type: params.served?.(mime) ?? mime });
    },
  };
  return { codec, encodings, closed };
};

const photo = (bytes: number, type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type });

describe('les bornes', () => {
  test('une photo paysage se réduit à la borne, proportions tenues', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, { maxWidth: 512, maxHeight: 512 })).toEqual({ width: 512, height: 384 });
  });

  test('un portrait se borne par sa hauteur', () => {
    expect(fitWithin({ width: 3024, height: 4032 }, { maxWidth: 512, maxHeight: 512 })).toEqual({ width: 384, height: 512 });
  });

  test('une petite image n’est JAMAIS agrandie', () => {
    expect(fitWithin({ width: 300, height: 200 }, { maxWidth: 512, maxHeight: 512 })).toEqual({ width: 300, height: 200 });
  });
});

describe('la recompression', () => {
  test('l’avatar part en WebP, à sa borne et à sa qualité — et la source décodée est libérée', async () => {
    const { codec, encodings, closed } = codecOf({ width: 4032, height: 3024 });
    const out = await recompressImage(photo(5_000_000), 'avatar', codec);

    expect(out.type).toBe('image/webp');
    expect(out.size).toBe(40_000);
    expect(encodings).toEqual([{ width: 512, height: 384, mime: 'image/webp', quality: IMAGE_TARGETS.avatar.quality }]);
    expect(closed).toEqual([true]);
  });

  test('la bannière a sa propre borne', async () => {
    const { codec, encodings } = codecOf({ width: 4032, height: 3024 });
    await recompressImage(photo(5_000_000), 'banner', codec);
    expect(encodings.map(({ width, height }) => ({ width, height }))).toEqual([{ width: IMAGE_TARGETS.banner.maxWidth, height: 1125 }]);
  });

  test('un navigateur qui ne sait pas écrire le WebP retombe sur le JPEG', async () => {
    const { codec, encodings } = codecOf({ width: 2000, height: 2000, served: (mime) => (mime === 'image/webp' ? 'image/png' : mime) });
    const out = await recompressImage(photo(3_000_000), 'avatar', codec);
    expect(encodings.map((e) => e.mime)).toEqual(['image/webp', 'image/jpeg']);
    expect(out.type).toBe('image/jpeg');
  });

  test('si la recompression PÈSE PLUS qu’un original déjà petit et accepté, l’original part', async () => {
    const original = photo(30_000);
    const { codec } = codecOf({ width: 400, height: 400, encodedSize: 90_000 });
    expect(await recompressImage(original, 'avatar', codec)).toBe(original);
  });

  test('une image que le navigateur ne décode pas est refusée', async () => {
    const codec: ImageCodec = {
      decode: async () => {
        throw new Error('decode');
      },
      encode: async () => null,
    };
    const refused = await recompressImage(photo(1000, 'image/heic'), 'avatar', codec).then(
      () => false,
      () => true,
    );
    expect(refused).toBe(true);
  });
});
