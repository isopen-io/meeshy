import { describe, expect, test } from 'bun:test';

import { resolveOutOfView } from './out-of-view';

/**
 * `resolveOutOfView` — DEUX seuils, jamais le même point (#6103). Chaque cas
 * cite la moitié de l'hystérésis qu'il prouve ; voir le doc-comment du module
 * pour le miroir iOS (`CollapsibleHeaderMetrics.pinnedAccessoryReveal`).
 */
describe('resolveOutOfView — deux seuils, jamais le même point', () => {
  test('non épinglé, entièrement hors champ ⇒ se révèle', () => {
    expect(resolveOutOfView({ pinned: false, visibleRatio: 0 })).toBe(true);
  });

  test('non épinglé, un peu visible ⇒ ne se révèle PAS trop tôt', () => {
    expect(resolveOutOfView({ pinned: false, visibleRatio: 0.1 })).toBe(false);
  });

  test('épinglé, encore peu visible ⇒ TIENT', () => {
    expect(resolveOutOfView({ pinned: true, visibleRatio: 0.2 })).toBe(true);
  });

  test('épinglé, à la borne de relâchement ⇒ relâche (borne INCLUSIVE)', () => {
    expect(resolveOutOfView({ pinned: true, visibleRatio: 0.25 })).toBe(false);
  });

  test('épinglé, entièrement revenu ⇒ relâche', () => {
    expect(resolveOutOfView({ pinned: true, visibleRatio: 1 })).toBe(false);
  });

  test('les seuils sont des PARAMÈTRES, jamais une constante interne figée', () => {
    // Un seuil de révélation à 0.5 révèle dès 40 % de visibilité — ce que les
    // défauts (revealRatio = 0) ne révéleraient JAMAIS à ce ratio.
    expect(resolveOutOfView({ pinned: false, visibleRatio: 0.4, revealRatio: 0.5 })).toBe(true);
    // Un seuil de relâchement à 0.9 garde la bande épinglée à 0.5, où le
    // défaut (releaseRatio = 0.25) l'aurait déjà relâchée.
    expect(resolveOutOfView({ pinned: true, visibleRatio: 0.5, releaseRatio: 0.9 })).toBe(true);
  });
});
