import { describe, expect, test } from 'bun:test';

import { slotFlipKeyframes } from './call-group-motion';

/** **LE MOUVEMENT D'UNE VIGNETTE DONT LA CASE CHANGE** (P14.10, `GroupCallStageGeometry` d'Android). */
describe('slotFlipKeyframes — une vignette dont la case change repart de son ancienne case, en transformation seule', () => {
  const grid = { x: 12, y: 100, width: 171, height: 200 };
  const featured = { x: 12, y: 100, width: 366, height: 500 };

  test('la case grandit : déplacement et échelle inversés, rejoués vers zéro', () => {
    expect(slotFlipKeyframes({ first: grid, last: featured, reducedMotion: false })).toEqual([{ transform: `translate(0px, 0px) scale(${171 / 366}, ${200 / 500})` }, { transform: 'none' }]);
  });

  test('la case a bougé sans changer de taille : un déplacement seul', () => {
    expect(slotFlipKeyframes({ first: { ...grid, x: 200 }, last: grid, reducedMotion: false })).toEqual([{ transform: 'translate(188px, 0px) scale(1, 1)' }, { transform: 'none' }]);
  });

  test('rien n’a bougé : aucun mouvement', () => {
    expect(slotFlipKeyframes({ first: grid, last: { ...grid, x: 12.2 }, reducedMotion: false })).toBeNull();
  });

  test('Réduire les animations : un fondu court au lieu du déplacement, et rien si rien n’a bougé', () => {
    expect(slotFlipKeyframes({ first: grid, last: featured, reducedMotion: true })).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(slotFlipKeyframes({ first: grid, last: grid, reducedMotion: true })).toBeNull();
  });

  test('une case sans mesure n’anime rien', () => {
    expect(slotFlipKeyframes({ first: { x: 0, y: 0, width: 0, height: 0 }, last: featured, reducedMotion: false })).toBeNull();
  });

  test('seules les propriétés du compositeur sortent d’une image clé', () => {
    const keys = (slotFlipKeyframes({ first: grid, last: featured, reducedMotion: false }) ?? []).flatMap((frame) => Object.keys(frame));
    expect(keys.every((key) => key === 'transform' || key === 'opacity')).toBe(true);
  });
});
