import { describe, expect, test } from 'bun:test';

import { callWindow, callWindowFromBubble, windowOrigin, windowSwapKeyframes } from './call-window-motion';

/**
 * **L'ÉCRAN D'APPEL SE CONTRACTE VERS L'APPEL RÉDUIT ET SE REDÉPLOIE DEPUIS LUI** (P18.4, P18.8) — la loi pure,
 * miroir d'iOS `CallShareCapsuleMotion.window` (#18464) et d'Android `CallShareCapsuleMotion.window` (#18449),
 * avec LEURS vecteurs : 0,1 en haut au centre vers la capsule, 0,1 au centre MESURÉ de la bulle (borné à
 * l'écran), 0,92 au centre sans appel réduit, et 1 (fondu seul) sous « Réduire les animations ».
 */

describe('vers la capsule, et depuis elle', () => {
  test('l’écran se contracte au dixième, ancré en haut au centre', () => {
    expect(callWindow({ reducedMotion: false, capsuleLive: true })).toEqual({ scale: 0.1, pivotX: 0.5, pivotY: 0 });
  });

  test('sans appel réduit vivant, l’échelle courte au centre', () => {
    expect(callWindow({ reducedMotion: false, capsuleLive: false })).toEqual({ scale: 0.92, pivotX: 0.5, pivotY: 0.5 });
  });

  test('sous « Réduire les animations », aucune échelle : un fondu seul', () => {
    for (const capsuleLive of [true, false]) expect(callWindow({ reducedMotion: true, capsuleLive }).scale).toBe(1);
    expect(callWindowFromBubble({ reducedMotion: true, center: { x: 351, y: 422 }, size: { width: 390, height: 844 } }).scale).toBe(1);
  });
});

describe('depuis la bulle, là où elle flotte (P18.4)', () => {
  test('bord de fin, mi-hauteur', () => {
    expect(callWindowFromBubble({ reducedMotion: false, center: { x: 351, y: 422 }, size: { width: 390, height: 844 } })).toEqual({ scale: 0.1, pivotX: 0.9, pivotY: 0.5 });
  });

  test('bord de début, et jamais hors de l’écran', () => {
    expect(callWindowFromBubble({ reducedMotion: false, center: { x: -20, y: 900 }, size: { width: 400, height: 800 } })).toEqual({ scale: 0.1, pivotX: 0, pivotY: 1 });
    expect(callWindowFromBubble({ reducedMotion: false, center: { x: 40, y: 200 }, size: { width: 400, height: 800 } })).toEqual({ scale: 0.1, pivotX: 0.1, pivotY: 0.25 });
  });

  test('sans mesure, la capsule', () => {
    expect(callWindowFromBubble({ reducedMotion: false, center: { x: 10, y: 10 }, size: { width: 0, height: 0 } })).toEqual(callWindow({ reducedMotion: false, capsuleLive: true }));
  });
});

describe('les images clés : la transformation et l’opacité seules', () => {
  const bubble = { scale: 0.1, pivotX: 0.9, pivotY: 0.5 };

  test('l’ancre est le pivot, en pourcentage de l’écran', () => {
    expect(windowOrigin(bubble)).toBe('90% 50%');
    expect(windowOrigin(callWindow({ reducedMotion: false, capsuleLive: true }))).toBe('50% 0%');
  });

  test('arriver : de l’échelle du pivot à la pleine taille, en fondu', () => {
    expect(windowSwapKeyframes(true, bubble)).toEqual([
      { opacity: 0, transform: 'scale(0.1)' },
      { opacity: 1, transform: 'none' },
    ]);
  });

  test('repartir : le chemin inverse, depuis la transformation sous laquelle l’écran se voit', () => {
    expect(windowSwapKeyframes(false, bubble)).toEqual([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'scale(0.1)' },
    ]);
    expect(windowSwapKeyframes(false, bubble, 'translateY(480px)')).toEqual([
      { opacity: 1, transform: 'translateY(480px)' },
      { opacity: 0, transform: 'translateY(480px) scale(0.1)' },
    ]);
  });

  test('sous « Réduire les animations » (échelle 1) : l’opacité seule', () => {
    const still = callWindow({ reducedMotion: true, capsuleLive: true });
    expect(windowSwapKeyframes(true, still)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(windowSwapKeyframes(false, still, 'translateY(480px)')).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });
});
