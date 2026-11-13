import { describe, expect, test } from 'bun:test';

import { bannerCloseKeyframes, followKeyframes, inlineSlideKeyframes, morphKeyframes, MORPH_MS, PORTRAIT_MORPH_MS, portraitMorphKeyframes, portraitMorphMs, STOW_MS, STOW_REDUCED_MS, stowFadeKeyframes, stowedGlass, SWAP_MS, swapKeyframes, swapMs, viewSwapKeyframes, viewSwapMs } from './call-pill-motion';

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

describe('la capsule de l’en-tête entre et sort par une mise à l’échelle (P9.8, `.scale(scale: 0.8, anchor: .trailing)` d’iOS)', () => {
  test('0,8 → 1 avec l’opacité, l’inverse au départ : transformation et opacité seules', () => {
    expect(swapKeyframes(true, false, 'scale')).toEqual([
      { opacity: 0, transform: 'scale(0.8)' },
      { opacity: 1, transform: 'scale(1)' },
    ]);
    expect(swapKeyframes(false, false, 'scale')).toEqual([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.8)' },
    ]);
  });

  test('« Réduire les animations » : un fondu seul, sans échelle', () => {
    expect(swapKeyframes(true, true, 'scale')).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(swapKeyframes(false, true, 'scale')).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });
});

describe('ce qui sort par un bord y retourne par le même chemin : le bandeau des autres et la capsule de la une (U2.10, U1.12)', () => {
  test('le bandeau du bas repart vers le bas de l’écran, et en revient : transformation et opacité seules', () => {
    expect(swapKeyframes(false, false, 'bottom')).toEqual([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(100%)' },
    ]);
    expect(swapKeyframes(true, false, 'bottom')[0]).toEqual({ opacity: 0, transform: 'translateY(100%)' });
  });

  test('la colonne du bandeau repart par le bord de FIN : à droite en gauche à droite, à gauche en droite à gauche', () => {
    expect(swapKeyframes(false, false, 'end')[1]).toEqual({ opacity: 0, transform: 'translateX(100%)' });
    expect(swapKeyframes(false, false, 'end', true)[1]).toEqual({ opacity: 0, transform: 'translateX(-100%)' });
    expect(swapKeyframes(true, false, 'end', true)[0]).toEqual({ opacity: 0, transform: 'translateX(-100%)' });
  });

  test('le bandeau « Vous partagez » repart vers le haut, par où l’en-tête se range, et en revient (P16.6)', () => {
    expect(swapKeyframes(false, false, 'top')).toEqual([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-100%)' },
    ]);
    expect(swapKeyframes(true, false, 'top')[0]).toEqual({ opacity: 0, transform: 'translateY(-100%)' });
  });

  test('la capsule repart en fondu, sans déplacement ni échelle', () => {
    expect(swapKeyframes(false, false, 'fade')).toEqual([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'none' },
    ]);
  });

  test('« Réduire les animations » : un fondu court, sans déplacement, pour chacune', () => {
    for (const shape of ['bottom', 'end', 'fade', 'top'] as const) expect(swapKeyframes(false, true, shape, true)).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });
});

describe('ce qui est posé sur un verre qui se déforme suit son bord du haut (P8b.6, loi 17)', () => {
  test('le verre perd 56 px : ce qui le surmonte part de sa place d’avant, 56 px plus haut, et descend avec lui', () => {
    expect(followKeyframes({ width: 400, height: 120 }, { width: 400, height: 64 }, false)).toEqual([{ transform: 'translateY(-56px)' }]);
    expect(followKeyframes({ width: 400, height: 64 }, { width: 400, height: 120 }, false)).toEqual([{ transform: 'translateY(56px)' }]);
  });

  test('rien ne bouge quand la hauteur ne change pas, ni sous « Réduire les animations »', () => {
    expect(followKeyframes({ width: 300, height: 64 }, { width: 400, height: 64 }, false)).toBeNull();
    expect(followKeyframes({ width: 400, height: 120 }, { width: 400, height: 64 }, true)).toBeNull();
  });
});

describe('#17529 — l’avatar du duo audio se réduit vers l’en-tête compact par morphisme (loi 6, P9b)', () => {
  const full = { x: 139, y: 300, width: 112 };
  const compact = { x: 24, y: 80, width: 56 };

  test('il part de sa place (son centre) et de sa taille d’avant, vues depuis la nouvelle (FLIP), et la rejoint : transformation seule', () => {
    expect(portraitMorphKeyframes(full, compact, false)).toEqual([{ transform: 'translate(143px, 248px) scale(2)' }, { transform: 'none' }]);
    expect(portraitMorphKeyframes(compact, full, false)).toEqual([{ transform: 'translate(-143px, -248px) scale(0.5)' }, { transform: 'none' }]);
  });

  test('« Réduire les animations » : aucun déplacement ni changement d’échelle, un fondu court les remplace', () => {
    expect(portraitMorphKeyframes(full, compact, true)).toBeNull();
    expect(portraitMorphMs(true)).toBe(STOW_REDUCED_MS);
    expect(portraitMorphMs(false)).toBe(PORTRAIT_MORPH_MS);
    expect(PORTRAIT_MORPH_MS).toBe(200);
  });

  test('rien ne bouge quand rien n’a bougé, ni quand une taille manque', () => {
    expect(portraitMorphKeyframes(full, full, false)).toBeNull();
    expect(portraitMorphKeyframes({ ...full, width: 0 }, compact, false)).toBeNull();
  });
});

describe('#17774 — l’écran d’appel et la capsule s’échangent en mouvement (S1.7, S2.1 ; iOS #17765, Android #17772)', () => {
  test('l’arrivée dure 220 ms et le départ 180 ms ; « Réduire les animations » les ramène à un fondu de 120 ms', () => {
    expect(viewSwapMs(true, false)).toBe(220);
    expect(viewSwapMs(false, false)).toBe(180);
    expect(viewSwapMs(true, true)).toBe(120);
    expect(viewSwapMs(false, true)).toBe(120);
  });

  test('ce qui arrive grandit de 0,92 à 1 en fondu ; ce qui part fait le chemin inverse : transformation et opacité seules', () => {
    expect(viewSwapKeyframes(true, false)).toEqual([
      { opacity: 0, transform: 'scale(0.92)' },
      { opacity: 1, transform: 'none' },
    ]);
    expect(viewSwapKeyframes(false, false)).toEqual([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'scale(0.92)' },
    ]);
  });

  test('sous « Réduire les animations » : un fondu seul, aucune échelle', () => {
    expect(viewSwapKeyframes(true, true)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(viewSwapKeyframes(false, true)).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });

  test('ce qui repart d’où le doigt l’a laissé (le glissé vers le bas) s’y contracte : aucun saut vers le haut', () => {
    const seen = 'matrix(1, 0, 0, 1, 0, 480)';
    expect(viewSwapKeyframes(false, false, seen)).toEqual([
      { opacity: 1, transform: seen },
      { opacity: 0, transform: `${seen} scale(0.92)` },
    ]);
    expect(viewSwapKeyframes(false, false, 'none')).toEqual(viewSwapKeyframes(false, false));
    expect(viewSwapKeyframes(false, true, seen)).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(viewSwapKeyframes(true, false, seen)).toEqual(viewSwapKeyframes(true, false));
  });
});

describe('#17774 — la pile des bandeaux se referme en mouvement (S2.6)', () => {
  test('un bandeau qui remonte part de sa place d’avant, vue comme une translation, et rejoint la sienne', () => {
    expect(bannerCloseKeyframes(60, false)).toEqual([{ transform: 'translateY(60px)' }, { transform: 'none' }]);
    expect(bannerCloseKeyframes(-60, false)).toEqual([{ transform: 'translateY(-60px)' }, { transform: 'none' }]);
  });

  test('rien ne bouge quand la place est la même (l’arrondi d’une mesure n’est pas un mouvement)', () => {
    expect(bannerCloseKeyframes(0.2, false)).toBeNull();
    expect(bannerCloseKeyframes(0.2, true)).toBeNull();
  });

  test('« Réduire les animations » : aucun déplacement, un fondu court', () => {
    expect(bannerCloseKeyframes(60, true)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });
});

describe('ce qui se recentre quand la colonne du journal entre ou repart (W1.20)', () => {
  test('le centre repart de celui d’avant par une translation, sans toucher la géométrie', () => {
    expect(inlineSlideKeyframes(184, false)).toEqual([{ transform: 'translateX(184px)' }, { transform: 'none' }]);
    expect(inlineSlideKeyframes(-184, false)).toEqual([{ transform: 'translateX(-184px)' }, { transform: 'none' }]);
  });

  test('sous « Réduire les animations », un fondu court sans déplacement ; un écart sous le demi-pixel ne joue rien', () => {
    expect(inlineSlideKeyframes(184, true)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(inlineSlideKeyframes(0.2, false)).toBeNull();
  });
});
