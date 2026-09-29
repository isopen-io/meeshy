import { describe, expect, test } from 'bun:test';

import { developedSize, developPhoto, developPhotoFile, developPixels, lookFilter, PHOTO_LOOK, PHOTO_MAX_EDGE, type PhotoEnv, type PhotoFileEnv, type PhotoSurface } from './photo-develop';

/**
 * LE DÉVELOPPEMENT D'UNE PHOTO (#8695) — une seule fonction, réutilisée par
 * toutes les prises : bornée en taille, retouchée légèrement (lumière,
 * contraste, couleur, netteté), sans miroir, encodée en JPEG de qualité
 * bornée. Le navigateur est INJECTÉ : `bun test` n'a pas de canevas.
 */

const flat = (width: number, height: number, rgba: readonly [number, number, number, number]): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  Array.from({ length: width * height }, (_, index) => pixels.set(rgba, index * 4));
  return pixels;
};

const at = (pixels: Uint8ClampedArray, width: number, x: number, y: number): readonly number[] => [...pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];

type Journal = { painted: Array<{ crop: unknown; size: unknown }>; put: number; encoded: Array<{ mime: string; quality: number }> };

const fakeEnv = (options: { readonly pixels?: Uint8ClampedArray | null; readonly blob?: Blob | null } = {}): { readonly env: PhotoEnv; readonly journal: Journal } => {
  const journal: Journal = { painted: [], put: 0, encoded: [] };
  const surface = (size: { width: number; height: number }): PhotoSurface => ({
    paint: (_image, crop, target) => void journal.painted.push({ crop, size: target }),
    pixels: () => (options.pixels === undefined ? flat(size.width, size.height, [100, 100, 100, 255]) : options.pixels),
    put: () => void (journal.put += 1),
    encode: async (mime, quality) => {
      journal.encoded.push({ mime, quality });
      return options.blob === undefined ? new Blob(['jpeg'], { type: mime }) : options.blob;
    },
  });
  return { env: { surface }, journal };
};

describe('developedSize', () => {
  test('une grande photo est ramenée à la borne sur son grand côté, proportions gardées', () => {
    expect(developedSize({ width: 4032, height: 3024 })).toEqual({ width: PHOTO_MAX_EDGE, height: 1920 });
    expect(developedSize({ width: 3024, height: 4032 })).toEqual({ width: 1920, height: PHOTO_MAX_EDGE });
  });

  test('une petite photo garde sa taille — jamais agrandie', () => {
    expect(developedSize({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
  });
});

describe('developPixels', () => {
  test('une image grise s’éclaire légèrement, sans virer de couleur', () => {
    const out = developPixels(flat(3, 3, [100, 100, 100, 255]), { width: 3, height: 3 });
    const [r, g, b, a] = at(out, 3, 1, 1);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(110);
    expect(g).toBe(r ?? -1);
    expect(b).toBe(r ?? -1);
    expect(a).toBe(255);
  });

  test('une couleur se ravive un peu : l’écart entre canaux grandit', () => {
    const [r, , b] = at(developPixels(flat(3, 3, [160, 120, 80, 255]), { width: 3, height: 3 }), 3, 1, 1);
    expect((r ?? 0) - (b ?? 0)).toBeGreaterThan(80);
  });

  test('un bord se renforce : le point clair au milieu du sombre ressort davantage', () => {
    const pixels = flat(3, 3, [60, 60, 60, 255]);
    pixels.set([180, 180, 180, 255], 4 * 4);
    const soft = developPixels(pixels, { width: 3, height: 3 }, { ...PHOTO_LOOK, sharpness: 0 });
    const sharp = developPixels(pixels, { width: 3, height: 3 });
    expect(at(sharp, 3, 1, 1)[0]).toBeGreaterThan(at(soft, 3, 1, 1)[0] ?? 0);
  });

  test('l’image source n’est jamais modifiée', () => {
    const pixels = flat(2, 2, [100, 100, 100, 255]);
    developPixels(pixels, { width: 2, height: 2 });
    expect(at(pixels, 2, 0, 0)).toEqual([100, 100, 100, 255]);
  });

  test('un look neutre rend l’image intacte', () => {
    const pixels = flat(3, 3, [37, 90, 200, 255]);
    expect([...developPixels(pixels, { width: 3, height: 3 }, { brightness: 1, contrast: 1, saturation: 1, sharpness: 0 })]).toEqual([...pixels]);
  });
});

describe('lookFilter', () => {
  test('le même look, en filtre de canevas, pour le flux vidéo d’un appel', () => {
    expect(lookFilter()).toBe(`brightness(${PHOTO_LOOK.brightness}) contrast(${PHOTO_LOOK.contrast}) saturate(${PHOTO_LOOK.saturation})`);
  });
});

describe('developPhoto', () => {
  test('peint à la taille bornée, retouche, puis encode en JPEG de qualité bornée', async () => {
    const { env, journal } = fakeEnv();
    const blob = await developPhoto({ image: {} as CanvasImageSource, size: { width: 4032, height: 3024 } }, env);
    expect(blob?.type).toBe('image/jpeg');
    expect(journal.painted).toEqual([{ crop: { x: 0, y: 0, width: 4032, height: 3024 }, size: { width: PHOTO_MAX_EDGE, height: 1920 } }]);
    expect(journal.put).toBe(1);
    expect(journal.encoded).toHaveLength(1);
    expect(journal.encoded[0]?.mime).toBe('image/jpeg');
    expect(journal.encoded[0]?.quality).toBeGreaterThanOrEqual(0.8);
    expect(journal.encoded[0]?.quality).toBeLessThanOrEqual(0.92);
  });

  test('un recadrage (zoom numérique) borne la sortie à la taille du recadrage', async () => {
    const { env, journal } = fakeEnv();
    await developPhoto({ image: {} as CanvasImageSource, size: { width: 1920, height: 1080 }, crop: { x: 480, y: 270, width: 960, height: 540 } }, env);
    expect(journal.painted).toEqual([{ crop: { x: 480, y: 270, width: 960, height: 540 }, size: { width: 960, height: 540 } }]);
  });

  test('des pixels illisibles (canevas protégé) : la photo part quand même, bornée, sans retouche', async () => {
    const { env, journal } = fakeEnv({ pixels: null });
    expect(await developPhoto({ image: {} as CanvasImageSource, size: { width: 800, height: 600 } }, env)).not.toBeNull();
    expect(journal.put).toBe(0);
  });

  test('pas de canevas : rien', async () => {
    expect(await developPhoto({ image: {} as CanvasImageSource, size: { width: 800, height: 600 } }, { surface: () => null })).toBeNull();
  });

  test('une image vide : rien', async () => {
    const { env } = fakeEnv();
    expect(await developPhoto({ image: {} as CanvasImageSource, size: { width: 0, height: 600 } }, env)).toBeNull();
  });
});

describe('developPhotoFile', () => {
  const fileEnv = (photo: PhotoEnv, fail = false): PhotoFileEnv => ({
    ...photo,
    decode: async () => {
      if (fail) throw new Error('decode');
      return { image: {} as CanvasImageSource, size: { width: 4032, height: 3024 }, close: () => undefined };
    },
  });

  test('une photo prise à la caméra repart développée, en .jpg', async () => {
    const { env } = fakeEnv();
    const out = await developPhotoFile(new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' }), fileEnv(env));
    expect(out.name).toBe('IMG_0001.jpg');
    expect(out.type).toBe('image/jpeg');
  });

  test('ce qui n’est pas une image passe tel quel', async () => {
    const { env, journal } = fakeEnv();
    const file = new File(['x'], 'note.pdf', { type: 'application/pdf' });
    expect(await developPhotoFile(file, fileEnv(env))).toBe(file);
    expect(journal.encoded).toHaveLength(0);
  });

  test('une image que le navigateur ne sait pas lire part originale', async () => {
    const { env } = fakeEnv();
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(await developPhotoFile(file, fileEnv(env, true))).toBe(file);
  });
});
