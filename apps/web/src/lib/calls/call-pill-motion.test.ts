import { describe, expect, test } from 'bun:test';

import { morphKeyframes, MORPH_MS, STOW_MS, STOW_REDUCED_MS, stowFadeKeyframes, stowedGlass, SWAP_MS, swapKeyframes, swapMs } from './call-pill-motion';

/**
 * RIEN N'APPARAÎT NI NE DISPARAÎT D'UN COUP (#17406, #17536 ; `CallChromeStow` et
 * `unfoldTransition` d'iOS, #17534) — le verre de la pilule s'allonge et grandit pour
 * contenir ce qu'on y ouvre, puis reprend sa forme ; ranger les commandes resserre ce
 * même verre autour des sous-titres. Seules la transformation et l'opacité bougent.
 */

describe('le verre se déforme par une échelle, jamais par sa géométrie (G2.11, G3.4)', () => {
  test('la barre qui grandit part de son ancienne taille, vue comme une échelle de la nouvelle, et rejoint sa forme', () => {
    const frames = morphKeyframes({ width: 200, height: 100 }, { width: 400, height: 300 }, false);
    expect(frames).toEqual([{ transform: 'scale(0.5, 0.3333333333333333)' }]);
  });

  test('la barre qui se referme part plus grande et se resserre : le même chemin, à l’envers', () => {
    expect(morphKeyframes({ width: 400, height: 300 }, { width: 200, height: 100 }, false)).toEqual([{ transform: 'scale(2, 3)' }]);
  });

  test('rien ne se joue quand la taille ne change pas (l’arrondi d’une mesure n’est pas un mouvement)', () => {
    expect(morphKeyframes({ width: 200, height: 100 }, { width: 200.2, height: 100.3 }, false)).toBeNull();
  });

  test('sous « Réduire les animations », le verre ne se déforme pas : un fondu court prend le relais', () => {
    expect(morphKeyframes({ width: 200, height: 100 }, { width: 400, height: 300 }, true)).toBeNull();
    expect(STOW_REDUCED_MS).toBeLessThan(STOW_MS);
  });

  test('une taille dégénérée (rien de mesuré) ne produit aucune image clé', () => {
    expect(morphKeyframes({ width: 0, height: 0 }, { width: 400, height: 300 }, false)).toBeNull();
    expect(morphKeyframes({ width: 400, height: 300 }, { width: 0, height: 0 }, false)).toBeNull();
    expect(MORPH_MS).toBeLessThanOrEqual(300);
  });
});

describe('un seul verre se resserre autour des sous-titres quand tout se range (G1.3)', () => {
  test('le verre garde son bord du bas ; les sous-titres descendent d’autant qu’il perd', () => {
    expect(stowedGlass({ height: 200, keptTop: 12, keptHeight: 80, padding: 6 })).toEqual({ scale: 92 / 200, shift: 200 - 6 - (12 + 80) });
  });

  test('un verre déjà resserré ne bouge pas', () => {
    expect(stowedGlass({ height: 92, keptTop: 6, keptHeight: 80, padding: 6 })).toEqual({ scale: 1, shift: 0 });
  });

  test('rien de mesuré, ou rien à garder : aucune règle', () => {
    expect(stowedGlass({ height: 0, keptTop: 0, keptHeight: 80, padding: 6 })).toBeNull();
    expect(stowedGlass({ height: 200, keptTop: 12, keptHeight: 0, padding: 6 })).toBeNull();
  });
});

describe('le fondu court de « Réduire les animations »', () => {
  test('ranger : de visible à invisible ; rendre : d’invisible à visible, l’opacité seule', () => {
    expect(stowFadeKeyframes(true)).toEqual([
      { opacity: 1, visibility: 'visible' },
      { opacity: 0, visibility: 'hidden' },
    ]);
    expect(stowFadeKeyframes(false)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });
});

describe('Réglages remplace la bande de looks, en fondu et en montée (P8b.6, `CallEffectsSettingsMotion` d’iOS)', () => {
  test('≈ 200 ms ; sous « Réduire les animations », un fondu court', () => {
    expect(SWAP_MS).toBe(200);
    expect(swapMs(false)).toBe(200);
    expect(swapMs(true)).toBe(STOW_REDUCED_MS);
  });

  test('ce qui arrive monte en fondu depuis la barre, ce qui repart y redescend : transformation et opacité seules', () => {
    expect(swapKeyframes(true, false)).toEqual([
      { opacity: 0, transform: 'translateY(20px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ]);
    expect(swapKeyframes(false, false)).toEqual([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(20px)' },
    ]);
  });

  test('« Réduire les animations » : un fondu seul, sans montée', () => {
    expect(swapKeyframes(true, true)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(swapKeyframes(false, true)).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });
});
