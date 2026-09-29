import { describe, expect, test } from 'bun:test';

import { handOffSceneOpening, openingFrame, takeSceneOpening } from './scene-opening';

/**
 * #8598 — OUVRIR UNE SCÈNE DU FIL AU PLEIN ÉCRAN SANS ACCROC. La carte CONFIE
 * à la visionneuse son cadre (où l'œil regardait) et son temps (ce qu'il
 * regardait) ; la page scène les REPREND une fois, à son montage, pour partir
 * du cadre de la carte (FLIP) et reprendre la lecture à la même image.
 */
describe('scene-opening — ce que la carte confie à la visionneuse', () => {
  test('une ouverture confiée se reprend UNE fois, pour sa scène', () => {
    handOffSceneOpening({ itemId: 'scene:p1#0', seconds: 2.5, origin: null });
    expect(takeSceneOpening('scene:p1#0')).toEqual({ seconds: 2.5, origin: null });
    expect(takeSceneOpening('scene:p1#0')).toBeNull();
  });

  test('une autre scène ne reprend rien', () => {
    handOffSceneOpening({ itemId: 'scene:p2#0', seconds: 1, origin: null });
    expect(takeSceneOpening('scene:p2#1')).toBeNull();
    expect(takeSceneOpening('scene:p2#0')?.seconds).toBe(1);
  });

  test('un temps négatif ou non fini devient 0 — le cadre, lui, voyage quand même', () => {
    const origin = { left: 0, top: 0, width: 100, height: 100, radius: 12 };
    handOffSceneOpening({ itemId: 'scene:p3#0', seconds: Number.NaN, origin });
    expect(takeSceneOpening('scene:p3#0')).toEqual({ seconds: 0, origin });
  });
});

describe('openingFrame — la première image de l’ouverture, posée SUR la carte', () => {
  const target = { left: 0, top: 76, width: 390, height: 693 };

  test('une carte au même ratio : échelle uniforme, translation jusqu’au coin de la carte, aucun rognage', () => {
    const frame = openingFrame({ origin: { left: 16, top: 300, width: 195, height: 346.5, radius: 0 }, target });
    expect(frame).not.toBeNull();
    expect(frame!.transform).toBe('translate(16px, 224px) scale(0.5)');
    expect(frame!.clipPath).toBe('inset(0px 0px 0px 0px round 0px)');
  });

  test('une carte PLUS COURTE que la scène (cadrage `focus`) : la fenêtre visible se rogne, le reste reste hors champ', () => {
    // Carte 4:5 de 390 × 487,5 montrant la scène à partir de 20 % de sa hauteur.
    const frame = openingFrame({ origin: { left: 0, top: 100, width: 390, height: 487.5, radius: 20 }, target, focusY: 0.2 });
    expect(frame).not.toBeNull();
    // La fenêtre commence à 0,2 × 693 = 138,6 px du haut de la scène.
    expect(frame!.transform).toBe('translate(0px, -114.6px) scale(1)');
    expect(frame!.clipPath).toBe('inset(138.6px 0px 66.9px 0px round 20px)');
  });

  test('sans `focus`, une carte plus courte montre le CENTRE de la scène', () => {
    const frame = openingFrame({ origin: { left: 0, top: 100, width: 390, height: 493, radius: 0 }, target });
    expect(frame!.clipPath).toBe('inset(100px 0px 100px 0px round 0px)');
  });

  test('le rayon de la carte se lit à l’échelle de la scène (il est rendu APRÈS le rognage, avant la mise à l’échelle)', () => {
    const frame = openingFrame({ origin: { left: 16, top: 300, width: 195, height: 346.5, radius: 12 }, target });
    expect(frame!.clipPath).toBe('inset(0px 0px 0px 0px round 24px)');
  });

  test('un cadre dégénéré (0 px) ne rend AUCUNE image de départ — la page s’ouvre sans animation', () => {
    expect(openingFrame({ origin: { left: 0, top: 0, width: 0, height: 0, radius: 0 }, target })).toBeNull();
    expect(openingFrame({ origin: { left: 0, top: 0, width: 100, height: 100, radius: 0 }, target: { ...target, width: 0 } })).toBeNull();
  });
});
