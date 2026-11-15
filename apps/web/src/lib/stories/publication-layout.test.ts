import { describe, expect, test } from 'bun:test';

import { MOSAIC_FALLBACK_LAYOUT, MOSAIC_LAYOUT_MODES } from '@/lib/feed/mosaic-layout';

import { layoutIsServed, PUBLICATION_LAYOUT_ORDER, publicationLayoutLabelKey } from './publication-layout';

describe('layoutIsServed — LES DEUX MOITIÉS du seuil, comptées sur ce qui PARTIRA (#7684)', () => {
  test('UNE page publiable ⇒ jamais de sous-menu, quel que soit le format (loi 4)', () => {
    expect(layoutIsServed({ publishablePageCount: 1, kind: 'POST' })).toBe(false);
    expect(layoutIsServed({ publishablePageCount: 1, kind: 'REEL' })).toBe(false);
    expect(layoutIsServed({ publishablePageCount: 1, kind: 'STORY' })).toBe(false);
  });

  test('DEUX pages publiables ET un POST ⇒ servi', () => {
    expect(layoutIsServed({ publishablePageCount: 2, kind: 'POST' })).toBe(true);
  });

  test('DEUX pages mais une STORY ou un RÉEL ⇒ jamais servi (ComposerPublishMenu.swift:73)', () => {
    expect(layoutIsServed({ publishablePageCount: 2, kind: 'STORY' })).toBe(false);
    expect(layoutIsServed({ publishablePageCount: 2, kind: 'REEL' })).toBe(false);
  });

  test('dix pages restent servies — aucun plafond propre à ce prédicat', () => {
    expect(layoutIsServed({ publishablePageCount: 10, kind: 'POST' })).toBe(true);
  });
});

describe('PUBLICATION_LAYOUT_ORDER — le repli D’ABORD, la palette du lecteur ENTIÈRE', () => {
  test('le repli du modèle en tête — le premier choix est ce qu’on obtient sans rien choisir', () => {
    expect(PUBLICATION_LAYOUT_ORDER[0]).toBe(MOSAIC_FALLBACK_LAYOUT);
  });

  test('exactement les cinq modes du lecteur, sans doublon ni invention', () => {
    expect(new Set(PUBLICATION_LAYOUT_ORDER).size).toBe(PUBLICATION_LAYOUT_ORDER.length);
    expect([...PUBLICATION_LAYOUT_ORDER].sort()).toEqual([...MOSAIC_LAYOUT_MODES].sort());
  });
});

describe('publicationLayoutLabelKey — une clé PAR mode, aucune manquante', () => {
  test('chaque mode a sa propre clé de traduction', () => {
    const keys = new Set(MOSAIC_LAYOUT_MODES.map(publicationLayoutLabelKey));
    expect(keys.size).toBe(MOSAIC_LAYOUT_MODES.length);
    keys.forEach((key) => expect(key.startsWith('story.studio.layout.')).toBe(true));
  });
});
