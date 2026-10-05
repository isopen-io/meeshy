import { describe, expect, test } from 'bun:test';

import type { PhotoArt, PhotoPalette } from './compose';
import { dateLabelOf, fileNameOf, renderPhotoFiles } from './render';
import { rankMoment } from './moments';

/**
 * LES DEUX IMAGES (#9382) — 9:16 pour la story, 1:1 pour le profil, rendues
 * d'un coup à la prise de vue. Le `canvas` est injecté : un faux canvas garde
 * sa taille et ses textes, et rend un Blob PNG.
 */
const palette: PhotoPalette = { top: '#0b1020', bottom: '#1e1b4b', ink: '#fff', inkSoft: '#ccc', scrim: '#000000' };
const art: PhotoArt = {
  emblem: {} as CanvasImageSource,
  mee: {} as CanvasImageSource,
  meo: {} as CanvasImageSource,
  signature: {} as CanvasImageSource,
};
const moment = rankMoment({ rank: 'voix', division: 2 });
const when = new Date('2026-10-05T10:00:00.000Z');

function fakeCanvasFactory() {
  const made: { width: number; height: number; texts: string[]; blobType: string | undefined }[] = [];
  return {
    made,
    createCanvas: (width: number, height: number) => {
      const entry = { width, height, texts: [] as string[], blobType: undefined as string | undefined };
      made.push(entry);
      const ctx = {
        save: () => undefined,
        restore: () => undefined,
        translate: () => undefined,
        scale: () => undefined,
        drawImage: () => undefined,
        fillRect: () => undefined,
        fillText: (text: string) => void entry.texts.push(text),
        createLinearGradient: () => ({ addColorStop: () => undefined }),
        fillStyle: '',
        font: '',
        textAlign: 'center',
        textBaseline: 'alphabetic',
        shadowColor: '',
        shadowBlur: 0,
      };
      return {
        width,
        height,
        getContext: () => ctx,
        toBlob: (done: (blob: Blob | null) => void, type?: string) => {
          entry.blobType = type;
          done(new Blob(['png'], { type: type ?? 'image/png' }));
        },
      } as unknown as HTMLCanvasElement;
    },
  };
}

describe('renderPhotoFiles', () => {
  test('deux images : la story en 1080 × 1920, le profil en 1080 × 1080', async () => {
    const { made, createCanvas } = fakeCanvasFactory();
    const files = await renderPhotoFiles({ moment, photo: null, art, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas });
    expect(made.map((m) => [m.width, m.height])).toEqual([[1080, 1920], [1080, 1080]]);
    expect(files?.story.type).toBe('image/png');
    expect(files?.square.type).toBe('image/png');
  });

  test('les fichiers portent le moment et le format dans leur nom', async () => {
    const { createCanvas } = fakeCanvasFactory();
    const files = await renderPhotoFiles({ moment, photo: null, art, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas });
    expect(files?.story.name).toBe('meeshy-rank-voix-2-story.png');
    expect(files?.square.name).toBe('meeshy-rank-voix-2-profil.png');
  });

  test('la date de la prise est écrite sur l’image', async () => {
    const { made, createCanvas } = fakeCanvasFactory();
    await renderPhotoFiles({ moment, photo: null, art, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas });
    expect(made[0]?.texts).toContain('5 octobre 2026');
  });

  test('un canvas qui ne rend pas de Blob : null, jamais une exception', async () => {
    const broken = {
      createCanvas: () =>
        ({
          width: 1,
          height: 1,
          getContext: () => null,
          toBlob: (done: (blob: Blob | null) => void) => done(null),
        }) as unknown as HTMLCanvasElement,
    };
    expect(await renderPhotoFiles({ moment, photo: null, art, palette, fontFamily: 'system-ui', now: when, ...broken })).toBeNull();
  });
});

describe('les petits noms', () => {
  test('la date en français, jour sans zéro', () => {
    expect(dateLabelOf(new Date('2026-10-05T10:00:00.000Z'), 'UTC')).toBe('5 octobre 2026');
    expect(dateLabelOf(new Date('2027-01-31T10:00:00.000Z'), 'UTC')).toBe('31 janvier 2027');
  });

  test('un nom de fichier sans deux-points ni espaces', () => {
    expect(fileNameOf('rank:voix:2', 'story')).toBe('meeshy-rank-voix-2-story.png');
    expect(fileNameOf('meesh:1', 'square')).toBe('meeshy-meesh-1-profil.png');
  });
});
