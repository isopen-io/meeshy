import { describe, expect, test } from 'bun:test';

import {
  MOSAIC_FALLBACK_LAYOUT,
  MOSAIC_LAYOUT_MODES,
  captionWordLimit,
  isPagedLayout,
  mosaicAspectRatio,
  mosaicTiles,
  resolveMosaicLayout,
  tileCarriesCaption,
  type MosaicTile,
} from './mosaic-layout';

describe('resolveMosaicLayout — l’agencement CHOISI par l’auteur, lu sur `storyEffects` (#6514)', () => {
  test('une valeur connue sur un document canvas v3 est servie telle quelle', () => {
    expect(resolveMosaicLayout({ v: 3, scenes: [], layout: 'hero' })).toBe('hero');
    expect(resolveMosaicLayout({ v: 3, layout: 'wave' })).toBe('wave');
    expect(resolveMosaicLayout({ v: 3, layout: 'reel' })).toBe('reel');
    expect(resolveMosaicLayout({ v: 3, layout: 'sine' })).toBe('sine');
    expect(resolveMosaicLayout({ v: 3, layout: 'carousel' })).toBe('carousel');
  });

  test('`layout` ABSENT ⇒ le carrousel — toute publication antérieure au 2026-09-06', () => {
    expect(resolveMosaicLayout({ v: 3, scenes: [] })).toBe('carousel');
    expect(MOSAIC_FALLBACK_LAYOUT).toBe('carousel');
  });

  test('`layout` INCONNU (écrit par un client plus récent) ⇒ le carrousel, jamais une panne', () => {
    expect(resolveMosaicLayout({ v: 3, layout: 'spiral' })).toBe('carousel');
    expect(resolveMosaicLayout({ v: 3, layout: 7 })).toBe('carousel');
    expect(resolveMosaicLayout({ v: 3, layout: '' })).toBe('carousel');
  });

  test('aucun `storyEffects` servi ⇒ le carrousel', () => {
    expect(resolveMosaicLayout(undefined)).toBe('carousel');
    expect(resolveMosaicLayout(null)).toBe('carousel');
    expect(resolveMosaicLayout('hero')).toBe('carousel');
  });

  /** Miroir de `StoryEffects` (iOS) : seul un document MARQUÉ `v >= 3` est un
   * canvas, et seul un canvas porte `layout` — un blob v1 n'en a jamais eu. */
  test('la MARQUE décide : un blob sans `v >= 3` ne porte aucun agencement, un rang supérieur se lit', () => {
    expect(resolveMosaicLayout({ layout: 'hero' })).toBe('carousel');
    expect(resolveMosaicLayout({ v: 2, layout: 'hero' })).toBe('carousel');
    expect(resolveMosaicLayout({ v: 4, layout: 'sine' })).toBe('sine');
  });

  test('les cinq valeurs sont exactement celles de `MosaicLayoutMode` — le carrousel seul pagine', () => {
    expect([...MOSAIC_LAYOUT_MODES].sort()).toEqual(['carousel', 'hero', 'reel', 'sine', 'wave']);
    expect(MOSAIC_LAYOUT_MODES.filter(isPagedLayout)).toEqual(['carousel']);
  });
});

const rounded = (tiles: readonly MosaicTile[]) =>
  tiles.map((t) => ({
    index: t.index,
    x: Math.round(t.x * 1000) / 1000,
    y: Math.round(t.y * 1000) / 1000,
    width: Math.round(t.width * 1000) / 1000,
    height: Math.round(t.height * 1000) / 1000,
    overflow: t.overflow,
  }));

describe('mosaicTiles — la géométrie de `MosaicLayout.swift`, en fractions de la boîte', () => {
  test('aucun visuel ⇒ aucune tuile ; un seul ⇒ une tuile pleine, quel que soit le mode', () => {
    expect(mosaicTiles(0, 'hero')).toEqual([]);
    for (const mode of MOSAIC_LAYOUT_MODES) {
      expect(rounded(mosaicTiles(1, mode))).toEqual([{ index: 0, x: 0, y: 0, width: 1, height: 1, overflow: 0 }]);
    }
  });

  test('`hero` à trois : une grande tuile à 0,62, deux satellites en colonne', () => {
    expect(rounded(mosaicTiles(3, 'hero'))).toEqual([
      { index: 0, x: 0, y: 0, width: 0.62, height: 1, overflow: 0 },
      { index: 1, x: 0.634, y: 0, width: 0.366, height: 0.493, overflow: 0 },
      { index: 2, x: 0.634, y: 0.507, width: 0.366, height: 0.493, overflow: 0 },
    ]);
  });

  test('`wave` à quatre : même largeur, hauteurs qui ondulent, centrées', () => {
    expect(rounded(mosaicTiles(4, 'wave'))).toEqual([
      { index: 0, x: 0, y: 0, width: 0.24, height: 1, overflow: 0 },
      { index: 1, x: 0.254, y: 0.13, width: 0.24, height: 0.74, overflow: 0 },
      { index: 2, x: 0.507, y: 0, width: 0.24, height: 1, overflow: 0 },
      { index: 3, x: 0.761, y: 0.13, width: 0.24, height: 0.74, overflow: 0 },
    ]);
  });

  test('`sine` à trois : une en haut, une en bas, une en haut', () => {
    expect(rounded(mosaicTiles(3, 'sine')).map((t) => t.y)).toEqual([0, 0.38, 0]);
    expect(rounded(mosaicTiles(3, 'sine')).every((t) => t.height === 0.62)).toBe(true);
  });

  test('`reel` DÉBORDE à droite : des tuiles de 0,60 au pas de 0,628', () => {
    expect(rounded(mosaicTiles(3, 'reel')).map((t) => [t.x, t.width, t.height])).toEqual([
      [0, 0.6, 1],
      [0.628, 0.6, 1],
      [1.256, 0.6, 1],
    ]);
  });

  test('au-delà de quatre, les mosaïques plafonnent et comptent le RESTE sur la dernière tuile seule', () => {
    const tiles = mosaicTiles(6, 'hero');
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.overflow)).toEqual([0, 0, 0, 2]);
  });

  test('le carrousel ne plafonne pas et ne cache rien', () => {
    const tiles = mosaicTiles(6, 'carousel');
    expect(tiles).toHaveLength(6);
    expect(tiles.every((t) => t.overflow === 0 && t.width === 1 && t.height === 1)).toBe(true);
  });

  test('chaque mosaïque déclare le rapport hauteur / largeur de sa boîte', () => {
    expect(mosaicAspectRatio('wave')).toBe(0.78);
    expect(mosaicAspectRatio('hero')).toBe(0.82);
    expect(mosaicAspectRatio('reel')).toBe(1.05);
    expect(mosaicAspectRatio('sine')).toBe(0.92);
  });
});

describe('la légende d’une tuile — là où la place le permet, en MOTS', () => {
  test('seules la grande tuile d’un `hero`, les tuiles d’un `reel` et un visuel seul portent une légende', () => {
    expect(tileCarriesCaption('hero', 0, 3)).toBe(true);
    expect(tileCarriesCaption('hero', 1, 3)).toBe(false);
    expect(tileCarriesCaption('reel', 2, 3)).toBe(true);
    expect(tileCarriesCaption('wave', 0, 3)).toBe(false);
    expect(tileCarriesCaption('sine', 0, 3)).toBe(false);
    expect(tileCarriesCaption('wave', 0, 1)).toBe(true);
  });

  test('le budget de mots se réduit à la part de la rangée, jamais sous deux mots', () => {
    expect(captionWordLimit('hero', 3, 0.62)).toBe(5);
    expect(captionWordLimit('reel', 3, 0.6)).toBe(12);
    expect(captionWordLimit('wave', 4, 0.2395)).toBe(2);
    expect(captionWordLimit('hero', 1, 1)).toBe(20);
  });
});
