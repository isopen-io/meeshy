import { describe, expect, test } from 'bun:test';

import { mineInMenu, selfControlsPlace } from './call-self-controls';

/**
 * LES COMMANDES DE MA CAMÉRA (#8626) — dans ma vignette, en haut au centre
 * quand mon image remplit l'écran, et dans le `(…)` seulement quand je n'ai
 * pas de vignette où les poser. Jamais à deux endroits à la fois.
 */

const place = (overrides: Partial<Parameters<typeof selfControlsPlace>[0]> = {}) => selfControlsPlace({ layout: 'video-duo', selfFull: false, selfTileShown: true, ...overrides });

describe('selfControlsPlace', () => {
  test('ma vignette en coin porte les commandes de ma caméra', () => {
    expect(place()).toBe('tile');
  });

  test('mon image en plein écran : les commandes montent en haut au centre', () => {
    expect(place({ selfFull: true })).toBe('top');
    expect(place({ selfFull: true, selfTileShown: false })).toBe('top');
  });

  test('sans vignette (caméra coupée), elles restent dans le (…) pour pouvoir la rallumer', () => {
    expect(place({ selfTileShown: false })).toBe('menu');
  });

  test('hors du duo vidéo (vocal, groupe, écran partagé par le pair), elles restent dans le (…)', () => {
    expect(place({ layout: 'portrait' })).toBe('menu');
    expect(place({ layout: 'grid', selfFull: true })).toBe('menu');
    expect(place({ layout: 'screen' })).toBe('menu');
  });
});

describe('mineInMenu', () => {
  test('la rangée « Mon image » du (…) ne double jamais les commandes posées ailleurs', () => {
    const set = { mine: ['camera', 'flip', 'effects', 'screen'] as const, call: ['captions'] as const };
    expect(mineInMenu(set, 'tile')).toEqual({ mine: [], call: ['captions'] });
    expect(mineInMenu(set, 'top')).toEqual({ mine: [], call: ['captions'] });
    expect(mineInMenu(set, 'menu')).toBe(set);
  });
});
