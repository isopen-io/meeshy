import { describe, expect, test } from 'bun:test';

import { studioBackgroundMenuActions, studioMenuFrame, studioOverlayBackgroundAction } from './studio-scene-menu';

/** Jumelles de `ComposerBackgroundMenuAction.served` et `ComposerSceneMenu.frame` iOS (#8716, #8717). */
describe('studioBackgroundMenuActions — l’appui long sur le fond', () => {
  test('modifier, reprendre une photo, passer au premier plan, retirer — dans cet ordre', () => {
    expect(studioBackgroundMenuActions({ offersPhoto: true, overlayFree: true })).toEqual(['edit', 'retake', 'forward', 'remove']);
  });
  test('un réel n’a pas de photo au viseur : « Reprendre une photo » n’est pas offert', () => {
    expect(studioBackgroundMenuActions({ offersPhoto: false, overlayFree: true })).toEqual(['edit', 'forward', 'remove']);
  });
  test('un calque occupe déjà le premier plan : on ne peut pas y passer', () => {
    expect(studioBackgroundMenuActions({ offersPhoto: true, overlayFree: false })).toEqual(['edit', 'retake', 'remove']);
  });
});

describe('studioOverlayBackgroundAction — « Mettre en fond » ou « Remplacer le fond »', () => {
  test('le verbe dit ce qui arrive au fond', () => {
    expect(studioOverlayBackgroundAction({ hasBackground: false })).toBe('set-background');
    expect(studioOverlayBackgroundAction({ hasBackground: true })).toBe('replace-background');
  });
});

describe('studioMenuFrame — centré sur le doigt, sous lui s’il tient, toujours dans l’écran', () => {
  const container = { width: 390, height: 844 };
  const menu = { width: 250, height: 200 };
  test('au milieu : centré, sous le doigt', () => {
    expect(studioMenuFrame({ anchor: { x: 195, y: 300 }, menu, container, margin: 12 })).toEqual({ x: 70, y: 312, width: 250, height: 200 });
  });
  test('trop bas : au-dessus du doigt', () => {
    expect(studioMenuFrame({ anchor: { x: 195, y: 800 }, menu, container, margin: 12 })).toEqual({ x: 70, y: 588, width: 250, height: 200 });
  });
  test('au bord : repoussé dans l’écran', () => {
    expect(studioMenuFrame({ anchor: { x: 5, y: 300 }, menu, container, margin: 12 }).x).toBe(12);
    expect(studioMenuFrame({ anchor: { x: 385, y: 300 }, menu, container, margin: 12 }).x).toBe(128);
  });
  test('un menu plus grand que l’écran est borné', () => {
    expect(studioMenuFrame({ anchor: { x: 100, y: 100 }, menu: { width: 500, height: 900 }, container, margin: 12 })).toEqual({ x: 12, y: 12, width: 366, height: 820 });
  });
});
