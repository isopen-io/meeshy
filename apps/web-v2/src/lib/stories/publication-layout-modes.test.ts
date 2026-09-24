import { describe, expect, test } from 'bun:test';

import { MOSAIC_LAYOUT_MODES } from '@/lib/feed/mosaic-layout';

import { PUBLICATION_LAYOUT_ORDER, publicationLayoutLabelKey, publicationLayoutOrderCoversAllModes } from './publication-layout-modes';

describe('PUBLICATION_LAYOUT_ORDER — le repli D’ABORD', () => {
  test('carousel en tête — le premier choix du menu est ce qu’on obtient sans rien choisir', () => {
    expect(PUBLICATION_LAYOUT_ORDER[0]).toBe('carousel');
  });

  test('les cinq modes, sans doublon', () => {
    expect(new Set(PUBLICATION_LAYOUT_ORDER).size).toBe(5);
  });

  test('couvre exactement la même palette que la géométrie du lecteur (MOSAIC_LAYOUT_MODES)', () => {
    expect(publicationLayoutOrderCoversAllModes()).toBe(true);
    expect(PUBLICATION_LAYOUT_ORDER).toHaveLength(MOSAIC_LAYOUT_MODES.length);
  });
});

describe('publicationLayoutLabelKey — une clé PAR mode, aucune manquante', () => {
  test('chaque mode a sa propre clé de traduction', () => {
    const keys = new Set(MOSAIC_LAYOUT_MODES.map(publicationLayoutLabelKey));
    expect(keys.size).toBe(MOSAIC_LAYOUT_MODES.length);
    keys.forEach((key) => expect(key.startsWith('story.studio.layout.')).toBe(true));
  });
});
