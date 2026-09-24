import { describe, expect, test } from 'bun:test';

import {
  READING_COLUMN_MAX,
  READING_COLUMN_STYLE,
  REEL_COLUMN_RATIO,
  REEL_COLUMN_STYLE,
  readingColumnWidth,
  reelColumnWidth,
} from './reading-column';

/**
 * LA COLONNE DE LECTURE (#7449) — le témoin porte la seule chose qu'une
 * capture ne dirait pas : que la borne ne MORD PAS aux gabarits déjà servis.
 * Une colonne qui rétrécirait un téléphone serait une régression silencieuse
 * — les gates navigateur ne mesurent que 390 × 844 et 320 × 568.
 */
describe('la colonne du fil borne les grandes fenêtres et ne touche pas les petites', () => {
  test('aux DEUX gabarits des gates, la largeur est celle de la fenêtre — au pixel près', () => {
    expect(readingColumnWidth(390)).toBe(390);
    expect(readingColumnWidth(320)).toBe(320);
  });

  test('au-delà de la borne, la colonne s’arrête et le reste devient de la marge', () => {
    expect(readingColumnWidth(1440)).toBe(READING_COLUMN_MAX);
    expect(readingColumnWidth(READING_COLUMN_MAX + 1)).toBe(READING_COLUMN_MAX);
  });

  test('elle se CENTRE — `marginInline: auto`, jamais un décalage calculé à la main', () => {
    expect(READING_COLUMN_STYLE.marginInline).toBe('auto');
    expect(READING_COLUMN_STYLE.maxWidth).toBe(READING_COLUMN_MAX);
    expect(READING_COLUMN_STYLE.width).toBe('100%');
  });
});

describe('la colonne des Réels suit la HAUTEUR, parce qu’un réel est en 9:16', () => {
  test('sur un téléphone, la scène tient déjà toute la largeur', () => {
    expect(reelColumnWidth({ width: 390, height: 844 })).toBe(390);
  });

  test('sur une fenêtre large et basse, c’est la hauteur qui donne la largeur', () => {
    expect(reelColumnWidth({ width: 1440, height: 900 })).toBeCloseTo(900 * REEL_COLUMN_RATIO, 5);
  });

  /* `dvh`, jamais `vh` : c'est la hauteur que `ReelsFrame` emploie (`h-dvh`),
     et les deux divergent dès que la barre d'adresse d'une WebView bouge. */
  test('la borne est exprimée en `dvh`, la même hauteur que le cadre des Réels', () => {
    expect(REEL_COLUMN_STYLE.maxWidth).toContain('100dvh');
    expect(REEL_COLUMN_STYLE.marginInline).toBe('auto');
  });
});
