import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { MENU_ORDER } from '@/lib/reading-mode/catalog';

import { PREVIEW_SURFACE_PADDING, previewSurfaceOf, readingModeOfRow } from './message-preview-surface';

/**
 * L'APERÇU SUIT LE MODE DE LECTURE (décision #11204, lot #11206) — chaque mode
 * du menu (`MENU_ORDER`) a SA surface : la rangée plate de Focal se décolle du
 * voile sur une carte opaque, celle de Script garde sa transparence mais gagne
 * des marges, une bulle porte déjà la sienne.
 */
beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());

describe('previewSurfaceOf — une surface par mode de lecture', () => {
  test('les cinq modes du menu ont chacun leur surface', () => {
    expect(MENU_ORDER.map((mode) => previewSurfaceOf(mode).kind)).toEqual(['card', 'margins', 'none', 'card', 'none']);
  });

  test('Focal : une carte OPAQUE, à marges', () => {
    const surface = previewSurfaceOf('focal');
    expect(surface.background).not.toBe(null);
    expect(surface.padding).toBe(PREVIEW_SURFACE_PADDING);
    expect(surface.radius).toBeGreaterThan(0);
  });

  test('Script : transparente, mais à marges', () => {
    const surface = previewSurfaceOf('script');
    expect(surface.background).toBe(null);
    expect(surface.padding).toBe(PREVIEW_SURFACE_PADDING);
  });

  test('Bulles : aucune surface ajoutée, la bulle porte la sienne', () => {
    expect(previewSurfaceOf('bubbles')).toEqual({ kind: 'none', padding: 0, background: null, radius: 0 });
  });

  test('Résumé se présente comme Focal, Rivière comme Bulles', () => {
    expect(previewSurfaceOf('summary')).toEqual(previewSurfaceOf('focal'));
    expect(previewSurfaceOf('river')).toEqual(previewSurfaceOf('bubbles'));
  });

  test('la marge interne d’une rangée plate vaut 12 px', () => {
    expect(PREVIEW_SURFACE_PADDING).toBe(12);
  });
});

describe('readingModeOfRow — le mode se LIT sur la rangée pressée', () => {
  const rowOf = (html: string): HTMLElement => {
    const row = document.createElement('div');
    row.innerHTML = html;
    return row;
  };

  test('une rangée plate dit son mode par `data-reading-mode`', () => {
    expect(readingModeOfRow(rowOf('<div data-reading-mode="script"><p>x</p></div>'))).toBe('script');
    expect(readingModeOfRow(rowOf('<div data-reading-mode="focal"><p>x</p></div>'))).toBe('focal');
  });

  test('une bulle ne pose aucune marque : Bulles', () => {
    expect(readingModeOfRow(rowOf('<div data-effects-surface><p>x</p></div>'))).toBe('bubbles');
  });

  test('une valeur inconnue retombe sur Bulles, jamais sur une surface inventée', () => {
    expect(readingModeOfRow(rowOf('<div data-reading-mode="auto"></div>'))).toBe('bubbles');
  });
});
