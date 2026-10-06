import { describe, expect, test } from 'bun:test';

import { encodeQr } from '@/lib/qr';

import { PHOTO_FORMATS, photoLayout, type PhotoFormat } from './layout';
import { referralOf, referralPlaceholder } from './referral';
import { QR_MIN_MODULE_PX, QR_QUIET_MODULES, qrPath, referralQr, type QrSquare } from './referral-qr';

/**
 * LE CARRÉ QR DU LIEN DE PARRAINAGE (#9554) — demande porteur : « un QR code et
 * non le lien écrit — juste un carré QR code pour pouvoir capturer et y aller ».
 * `referralQr` est l'UNIQUE site qui fait du lien un carré : l'aperçu (SVG) et
 * l'image exportée (canvas) peignent les MÊMES rectangles, donc le même carré.
 *
 * Que la matrice soit la bonne se prouve dans `lib/qr.test.ts` (vecteurs de
 * libqrencode). Ici : que le carré porte CETTE matrice, sans rien y changer, et
 * qu'il reste lisible — marge de silence, pixels entiers, deux pixels au moins.
 */
const LINK = 'https://meeshy.me/signup/affiliate/aff_abc';
const FORMATS: readonly PhotoFormat[] = ['story', 'square'];

const sideOf = (format: PhotoFormat): number => {
  const side = photoLayout(format, { banner: true }).banner?.qr.w;
  if (side === undefined) throw new Error('bandeau attendu');
  return side;
};

/** Repeint les rectangles sur une grille de pixels, puis relit le centre de chaque module. */
const sampled = (square: QrSquare): readonly (readonly boolean[])[] => {
  const pixels = Array.from({ length: square.side }, () => new Uint8Array(square.side));
  for (const run of square.runs) {
    for (let y = run.y; y < run.y + run.h; y += 1) pixels[y]?.fill(1, run.x, run.x + run.w);
  }
  const center = (index: number): number => square.origin + index * square.module + Math.floor(square.module / 2);
  return Array.from({ length: square.size }, (_, y) => Array.from({ length: square.size }, (_, x) => pixels[center(y)]?.[center(x)] === 1));
};

const inked = (square: QrSquare): number => square.runs.reduce((sum, run) => sum + run.w * run.h, 0);

describe('le carré encode l’adresse COMPLÈTE du lien', () => {
  const referral = referralOf(LINK, 23);
  if (referral === null) throw new Error('lien attendu');

  for (const format of FORMATS) {
    test(`${format} : les rectangles peints redonnent la matrice de « ${LINK} », module pour module`, () => {
      const square = referralQr(referral, sideOf(format));
      if (square === null) throw new Error('carré attendu');
      expect(sampled(square)).toEqual(encodeQr(LINK)?.modules.map((row) => [...row]) ?? []);
      expect(square.size).toBe(29);
    });
  }

  test('rien n’est peint hors des modules sombres : la surface encrée est celle de la matrice', () => {
    const square = referralQr(referral, sideOf('story'));
    if (square === null) throw new Error('carré attendu');
    const dark = encodeQr(LINK)?.modules.flat().filter(Boolean).length ?? 0;
    expect(inked(square)).toBe(dark * square.module * square.module);
  });

  test('c’est `url` qui est encodée, protocole compris — un autre lien rend un autre carré', () => {
    const other = referralOf('https://meeshy.me/r/Ab3dE9', 23);
    if (other === null) throw new Error('lien attendu');
    const square = referralQr(other, sideOf('story'));
    if (square === null) throw new Error('carré attendu');
    expect(sampled(square)).toEqual(encodeQr('https://meeshy.me/r/Ab3dE9')?.modules.map((row) => [...row]) ?? []);
  });
});

describe('le carré reste lisible', () => {
  for (const format of FORMATS) {
    for (const length of [6, 22, 42, 64]) {
      test(`${format}, jeton de ${length} caractères : pixels entiers, ${QR_MIN_MODULE_PX} px au moins par module, ${QR_QUIET_MODULES} modules de silence`, () => {
        const referral = referralOf(`https://meeshy.me/r/${'k'.repeat(length)}`, null);
        if (referral === null) throw new Error('lien attendu');
        const side = sideOf(format);
        const square = referralQr(referral, side);
        if (square === null) throw new Error('carré attendu');
        expect(square.side).toBe(side);
        expect(Number.isInteger(square.module)).toBe(true);
        expect(Number.isInteger(square.origin)).toBe(true);
        expect(square.module).toBeGreaterThanOrEqual(QR_MIN_MODULE_PX);
        expect(square.origin).toBeGreaterThanOrEqual(QR_QUIET_MODULES * square.module);
        expect(square.origin + square.size * square.module + QR_QUIET_MODULES * square.module).toBeLessThanOrEqual(side);
        for (const run of square.runs) {
          expect(run.x).toBeGreaterThanOrEqual(square.origin);
          expect(run.x + run.w).toBeLessThanOrEqual(square.origin + square.size * square.module);
        }
      });
    }
  }

  test('un lien que la place ne rendrait pas à deux pixels le module : pas de carré, plutôt qu’un carré illisible', () => {
    const referral = referralOf(`https://meeshy.me/r/${'k'.repeat(2000)}`, null);
    if (referral === null) throw new Error('lien attendu');
    expect(referralQr(referral, sideOf('story'))).toBeNull();
    const short = referralOf(LINK, null);
    if (short === null) throw new Error('lien attendu');
    expect(referralQr(short, (29 + 8) * 2 - 1)).toBeNull();
    expect(referralQr(short, (29 + 8) * 2)?.module).toBe(2);
  });

  test('les formats de la carte ont la même largeur : le carré est le même sur la story et sur le profil', () => {
    expect(PHOTO_FORMATS.story.width).toBe(PHOTO_FORMATS.square.width);
    const referral = referralOf(LINK, 23);
    if (referral === null) throw new Error('lien attendu');
    expect(referralQr(referral, sideOf('story'))).toEqual(referralQr(referral, sideOf('square')));
  });
});

/**
 * AUCUN JETON SANS GESTE (#7742) — sans jeton il n'y a PAS de lien : l'emplacement
 * ne s'encode pas. Un QR d'un lien factice se scannerait et mènerait nulle part.
 */
describe('sans jeton, aucun QR', () => {
  test('l’emplacement ne rend jamais de carré, quelle que soit la place', () => {
    expect(referralQr(referralPlaceholder(23), sideOf('story'))).toBeNull();
    expect(referralQr(referralPlaceholder(null), 4000)).toBeNull();
  });

  test('un lien vide non plus, même s’il ne se déclare pas emplacement', () => {
    expect(referralQr({ url: '' }, sideOf('story'))).toBeNull();
  });
});

describe('le tracé de l’aperçu', () => {
  test('un sous-tracé fermé par rectangle, dans les pixels du carré', () => {
    const referral = referralOf(LINK, 23);
    if (referral === null) throw new Error('lien attendu');
    const square = referralQr(referral, sideOf('story'));
    if (square === null) throw new Error('carré attendu');
    const path = qrPath(square);
    const first = square.runs[0];
    expect(path.startsWith(`M${first?.x} ${first?.y}h${first?.w}v${first?.h}h-${first?.w}z`)).toBe(true);
    expect(path.match(/M/g)).toHaveLength(square.runs.length);
    expect(path).toMatch(/^(?:M\d+ \d+h\d+v\d+h-\d+z)+$/);
  });
});
