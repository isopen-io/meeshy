import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { exportPalette } from './scene-export-browser';

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'https://meeshy.example/' });
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

describe('la palette de l’export est celle du lecteur', () => {
  test('les jetons CSS de la page colorent le fichier rendu', () => {
    document.documentElement.style.setProperty('--color-scrim', 'rgba(1, 2, 3, 0.5)');
    document.documentElement.style.setProperty('--ios-error', '#AA0000');
    const palette = exportPalette(document);
    expect(palette.scrim).toBe('rgba(1, 2, 3, 0.5)');
    expect(palette.pin).toBe('#AA0000');
    document.documentElement.style.removeProperty('--color-scrim');
    document.documentElement.style.removeProperty('--ios-error');
  });

  test('un jeton absent retombe sur la couleur du lecteur iOS', () => {
    expect(exportPalette(document).onMedia).toBe('#FFFFFF');
  });
});
