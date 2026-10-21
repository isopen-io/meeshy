import { describe, expect, test } from 'bun:test';

import { createImageJobHost, runImageJob, type ImageJob, type ImageJobEnv, type ImageJobReply } from './image-job';
import { PHOTO_LOOK, PHOTO_MAX_EDGE, type DecodedPhoto, type PhotoSize, type PhotoSurface } from './photo-develop';

/**
 * LE TRAVAIL D'IMAGE, HORS DU FIL PRINCIPAL (#11310) — décoder, réduire,
 * retoucher, encoder : la même chaîne pour une photo de la caméra du système
 * et pour toute pièce qui part sur le réseau. Le navigateur est INJECTÉ
 * (`bun test` n'a ni Worker, ni OffscreenCanvas, ni createImageBitmap) ; la
 * loi à prouver est celle des bornes, du format et du repli.
 */

const pixelsOf = (size: PhotoSize, alpha: number): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(size.width * size.height * 4);
  Array.from({ length: size.width * size.height }, (_, index) => pixels.set([90, 120, 150, alpha], index * 4));
  return pixels;
};

type Journal = {
  scaled: PhotoSize[];
  decoded: number;
  closed: string[];
  encoded: Array<{ mime: string; quality: number }>;
  pixelReads: number;
  put: number;
};

type Behaviour = {
  /** Taille décodée de la source. */
  readonly source?: PhotoSize;
  /** Opacité des pixels : 255 = opaque. */
  readonly alpha?: number;
  /** Le navigateur ne sait pas ÉCRIRE du WebP : il rend un PNG à la place. */
  readonly webp?: boolean;
  readonly failDecode?: boolean;
};

const fakeEnv = (behaviour: Behaviour = {}): { readonly env: ImageJobEnv; readonly journal: Journal } => {
  const journal: Journal = { scaled: [], decoded: 0, closed: [], encoded: [], pixelReads: 0, put: 0 };
  const source = behaviour.source ?? { width: 4032, height: 3024 };
  const surface = (size: PhotoSize): PhotoSurface => ({
    paint: () => undefined,
    pixels: () => {
      journal.pixelReads += 1;
      return pixelsOf(size, behaviour.alpha ?? 255);
    },
    put: () => void (journal.put += 1),
    encode: async (mime, quality) => {
      journal.encoded.push({ mime, quality });
      const served = mime === 'image/webp' && behaviour.webp === false ? 'image/png' : mime;
      return new Blob(['x'], { type: served });
    },
  });
  const photo = (name: string, size: PhotoSize): DecodedPhoto => ({ image: {} as CanvasImageSource, size, close: () => void journal.closed.push(name) });
  const env: ImageJobEnv = {
    surface,
    decode: async () => {
      journal.decoded += 1;
      if (behaviour.failDecode === true) throw new Error('illisible');
      return photo('decoded', source);
    },
    scale: async (_image, size) => {
      journal.scaled.push(size);
      return photo('scaled', size);
    },
  };
  return { env, journal };
};

const upload = (overrides: Partial<ImageJob> = {}): ImageJob => ({
  input: { kind: 'file', blob: new Blob(['raw'], { type: 'image/png' }) },
  maxEdge: PHOTO_MAX_EDGE,
  look: null,
  output: { kind: 'efficient', quality: 0.85 },
  ...overrides,
});

describe('la réduction', () => {
  test('une grande photo est réduite au décodage (createImageBitmap) à la taille développée, jamais sur le canevas', async () => {
    const { env, journal } = fakeEnv();
    await runImageJob(upload(), env);
    expect(journal.scaled).toEqual([{ width: PHOTO_MAX_EDGE, height: 1920 }]);
    expect(journal.closed.sort()).toEqual(['decoded', 'scaled']);
  });

  test('une photo déjà sous la borne n’est pas réduite : aucune copie de plus', async () => {
    const { env, journal } = fakeEnv({ source: { width: 1200, height: 800 } });
    await runImageJob(upload(), env);
    expect(journal.scaled).toEqual([]);
    expect(journal.closed).toEqual(['decoded']);
  });
});

describe('le format', () => {
  test('WebP à 0,85 d’abord', async () => {
    const { env, journal } = fakeEnv();
    const blob = await runImageJob(upload(), env);
    expect(journal.encoded).toEqual([{ mime: 'image/webp', quality: 0.85 }]);
    expect(blob?.type).toBe('image/webp');
  });

  test('un navigateur qui ne sait pas écrire du WebP (il rend un PNG) : repli sur le JPEG', async () => {
    const { env, journal } = fakeEnv({ webp: false });
    const blob = await runImageJob(upload(), env);
    expect(journal.encoded.map((call) => call.mime)).toEqual(['image/webp', 'image/jpeg']);
    expect(blob?.type).toBe('image/jpeg');
  });

  test('un PNG à transparence reste un PNG : l’alpha n’est jamais perdu', async () => {
    const { env, journal } = fakeEnv({ alpha: 120 });
    const blob = await runImageJob(upload(), env);
    expect(journal.encoded.map((call) => call.mime)).toEqual(['image/png']);
    expect(blob?.type).toBe('image/png');
  });

  test('un PNG opaque devient un WebP', async () => {
    const { env, journal } = fakeEnv({ alpha: 255 });
    await runImageJob(upload(), env);
    expect(journal.encoded.map((call) => call.mime)).toEqual(['image/webp']);
  });

  test('une source déclarée opaque (JPEG) ne paie pas le balayage de l’alpha', async () => {
    const { env, journal } = fakeEnv();
    await runImageJob(upload({ output: { kind: 'efficient', quality: 0.85, opaque: true } }), env);
    expect(journal.pixelReads).toBe(0);
  });

  test('la sortie JPEG des prises de vue garde sa qualité', async () => {
    const { env, journal } = fakeEnv();
    await runImageJob(upload({ output: { kind: 'jpeg', quality: 0.88 }, look: PHOTO_LOOK }), env);
    expect(journal.encoded).toEqual([{ mime: 'image/jpeg', quality: 0.88 }]);
  });
});

describe('le look', () => {
  test('retouché dans le worker quand le look est donné', async () => {
    const { env, journal } = fakeEnv();
    await runImageJob(upload({ look: PHOTO_LOOK }), env);
    expect(journal.put).toBe(1);
  });

  test('aucune retouche sans look', async () => {
    const { env, journal } = fakeEnv();
    await runImageJob(upload(), env);
    expect(journal.put).toBe(0);
  });
});

describe('la panne', () => {
  test('une image illisible rend null — l’appelant garde l’original', async () => {
    const { env, journal } = fakeEnv({ failDecode: true });
    expect(await runImageJob(upload(), env)).toBeNull();
    expect(journal.encoded).toEqual([]);
  });
});

describe('une image déjà capturée (le cadre d’une caméra)', () => {
  test('ni décodage ni réduction : le cadre est développé puis libéré', async () => {
    const { env, journal } = fakeEnv();
    const bitmap = { width: 800, height: 600, close: () => void journal.closed.push('frame') } as unknown as ImageBitmap;
    const blob = await runImageJob(upload({ input: { kind: 'frame', bitmap }, output: { kind: 'jpeg', quality: 0.88 }, look: PHOTO_LOOK }), env);
    expect(journal.decoded).toBe(0);
    expect(journal.scaled).toEqual([]);
    expect(journal.closed).toEqual(['frame']);
    expect(blob?.type).toBe('image/jpeg');
  });
});

describe('l’hôte du worker', () => {
  test('répond à chaque demande sous le même identifiant', async () => {
    const { env } = fakeEnv();
    const replies: ImageJobReply[] = [];
    const host = createImageJobHost({ env, post: (reply) => void replies.push(reply) });
    await host.receive({ id: 7, job: upload() });
    expect(replies.map((reply) => reply.id)).toEqual([7]);
    expect(replies[0]?.blob?.type).toBe('image/webp');
  });

  test('une panne inattendue répond null, jamais un silence', async () => {
    const { env } = fakeEnv();
    const replies: ImageJobReply[] = [];
    const broken: ImageJobEnv = { ...env, surface: () => { throw new Error('mémoire'); } };
    const host = createImageJobHost({ env: broken, post: (reply) => void replies.push(reply) });
    await host.receive({ id: 3, job: upload() });
    expect(replies).toEqual([{ id: 3, blob: null }]);
  });
});
