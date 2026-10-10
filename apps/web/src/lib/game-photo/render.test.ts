import { describe, expect, test } from 'bun:test';

import type { PhotoArt, PhotoPalette } from './compose';
import { dateLabelOf, fileNameOf, renderPhotoFiles } from './render';
import { rankMoment } from './moments';
import { PHOTO_FORMATS, photoLayout } from './layout';
import { referralOf, referralPlaceholder } from './referral';
import { QR_DARK, QR_LIGHT, referralQr } from './referral-qr';

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
  const made: { width: number; height: number; texts: string[]; rects: { style: unknown; rect: number[] }[]; blobType: string | undefined }[] = [];
  return {
    made,
    createCanvas: (width: number, height: number) => {
      const entry = { width, height, texts: [] as string[], rects: [] as { style: unknown; rect: number[] }[], blobType: undefined as string | undefined };
      made.push(entry);
      const ctx: Record<string, unknown> = {
        save: () => undefined,
        restore: () => undefined,
        translate: () => undefined,
        scale: () => undefined,
        drawImage: () => undefined,
        fillRect: (...rect: number[]) => void entry.rects.push({ style: ctx.fillStyle, rect }),
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

describe('le lien de parrainage sur les deux images (#7742)', () => {
  const referral = referralOf('https://meeshy.me/signup/affiliate/aff_abc', 23);

  test('les deux formats portent le bandeau : la phrase et les jours de Flamme — le lien n’y est PLUS écrit (#9554)', async () => {
    const { made, createCanvas } = fakeCanvasFactory();
    await renderPhotoFiles({ moment, photo: null, art: { ...art, flame: {} as CanvasImageSource }, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas, referral });
    expect(made).toHaveLength(2);
    for (const entry of made) {
      expect(entry.texts).toContain('Rejoins-moi sur Meeshy');
      expect(entry.texts).toContain('23 j');
      expect(entry.texts.filter((text) => /meeshy\.me|https?:|aff_abc/i.test(text))).toEqual([]);
    }
  });

  test('les deux formats portent le carré QR de l’adresse COMPLÈTE, à sa place, deux pixels au moins par module', async () => {
    if (referral === null) throw new Error('lien attendu');
    const { made, createCanvas } = fakeCanvasFactory();
    await renderPhotoFiles({ moment, photo: null, art, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas, referral });
    for (const entry of made) {
      const format = entry.height === PHOTO_FORMATS.story.height ? 'story' : 'square';
      const slot = photoLayout(format, { banner: true }).banner?.qr;
      if (slot === undefined) throw new Error('bandeau attendu');
      const square = referralQr({ url: 'https://meeshy.me/signup/affiliate/aff_abc' }, slot.w);
      if (square === null) throw new Error('carré attendu');
      expect(entry.rects.filter((r) => r.style === QR_LIGHT).map((r) => r.rect)).toEqual([[slot.x, slot.y, slot.w, slot.h]]);
      expect(entry.rects.filter((r) => r.style === QR_DARK).map((r) => r.rect)).toEqual(square.runs.map((run) => [slot.x + run.x, slot.y + run.y, run.w, run.h]));
      expect(square.module).toBeGreaterThanOrEqual(2);
    }
  });

  test('sans jeton, l’image ne porte AUCUN QR : ni carré clair ni module (#7742)', async () => {
    const { made, createCanvas } = fakeCanvasFactory();
    await renderPhotoFiles({ moment, photo: null, art, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas, referral: referralPlaceholder(23) });
    for (const entry of made) {
      expect(entry.rects.filter((r) => r.style === QR_LIGHT || r.style === QR_DARK)).toEqual([]);
      expect(entry.texts).toContain('Rejoins-moi sur Meeshy');
      expect(entry.texts.filter((text) => /meeshy\.me/i.test(text))).toEqual([]);
    }
  });

  test('sans lien, la carte part sans bandeau : aucune phrase d’invitation', async () => {
    const { made, createCanvas } = fakeCanvasFactory();
    await renderPhotoFiles({ moment, photo: null, art, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas, referral: null });
    for (const entry of made) expect(entry.texts).not.toContain('Rejoins-moi sur Meeshy');
  });

  test('Flamme éteinte : le carré du lien part, sans jours', async () => {
    const { made, createCanvas } = fakeCanvasFactory();
    const cold = referralOf('https://meeshy.me/signup/affiliate/aff_abc', 0);
    await renderPhotoFiles({ moment, photo: null, art: { ...art, flame: {} as CanvasImageSource }, palette, fontFamily: 'system-ui', now: when, timeZone: 'UTC', createCanvas, referral: cold });
    expect(made[0]?.rects.some((r) => r.style === QR_DARK)).toBe(true);
    expect(made[0]?.texts.some((text) => / j$/.test(text))).toBe(false);
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
