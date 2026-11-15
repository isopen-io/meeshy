import { describe, expect, test } from 'bun:test';

import { liftMotion, liftOffset } from './message-menu-lift';
import { PREVIEW_FADE_MS, PREVIEW_LIFT_MS } from './message-menu-metrics';

/**
 * L'ÉLÉVATION DE L'APERÇU (#11206) — le décalage du FLIP et ses images clés,
 * sans DOM : l'aperçu part du bord de la rangée d'où le message part.
 */
const placement = { previewLeft: 16, previewWidth: 358, previewTop: 240 };

describe('liftOffset', () => {
  test('un message reçu part de son bord GAUCHE', () => {
    expect(liftOffset({ anchor: { left: 0, right: 390, top: 300 }, placement, isMine: false })).toEqual({ dx: -16, dy: 60 });
  });

  test('un message envoyé part de son bord DROIT', () => {
    expect(liftOffset({ anchor: { left: 0, right: 390, top: 300 }, placement, isMine: true })).toEqual({ dx: 16, dy: 60 });
  });

  test('le rembourrage de la surface est retranché : le CONTENU de l’aperçu part du contenu de la rangée', () => {
    expect(liftOffset({ anchor: { left: 0, right: 390, top: 300 }, placement, isMine: false, inset: 12 })).toEqual({ dx: -28, dy: 48 });
    expect(liftOffset({ anchor: { left: 0, right: 390, top: 300 }, placement, isMine: true, inset: 12 })).toEqual({ dx: 28, dy: 48 });
  });

  test('le décalage tombe au pixel entier', () => {
    const offset = liftOffset({ anchor: { left: 0.4, right: 390.6, top: 300.7 }, placement, isMine: false });
    expect(Number.isInteger(offset.dx) && Number.isInteger(offset.dy)).toBe(true);
  });
});

/**
 * LE FLIP PART DU BORD QUE TIENT L'APERÇU (#12635) — en RTL, une bulle envoyée
 * vit à GAUCHE : partir du bord droit de la rangée la faisait sauter, au départ
 * de l'élévation, de la différence de largeur entre la rangée et l'aperçu.
 */
describe('liftOffset — le bord tenu par l’aperçu', () => {
  const row = { left: 14, right: 376, top: 300 };

  test('RTL, bulle envoyée tenue à gauche : le décalage part du bord GAUCHE', () => {
    expect(liftOffset({ anchor: row, placement: { ...placement, previewEdge: 'left' }, isMine: true })).toEqual({ dx: -2, dy: 60 });
  });

  test('sans bord déclaré, le côté du message décide comme avant', () => {
    expect(liftOffset({ anchor: row, placement, isMine: true })).toEqual({ dx: 2, dy: 60 });
  });
});

describe('liftMotion', () => {
  const offset = { dx: -16, dy: 60 };

  test('la montée va de la rangée au repos, transform seul', () => {
    const motion = liftMotion({ direction: 'in', offset, rest: 'none', reduced: false });
    expect(motion.keyframes).toEqual([{ transform: 'translate(-16px, 60px)' }, { transform: 'none' }]);
    expect(motion.options.duration).toBe(PREVIEW_LIFT_MS);
  });

  test('le retour est le chemin inverse', () => {
    const motion = liftMotion({ direction: 'out', offset, rest: 'scale(0.75)', reduced: false });
    expect(motion.keyframes).toEqual([{ transform: 'scale(0.75)' }, { transform: 'translate(-16px, 60px)' }]);
  });

  test('sous reduced-motion, un fondu de 150 ms dans les deux sens', () => {
    const lift = liftMotion({ direction: 'in', offset, rest: 'none', reduced: true });
    const back = liftMotion({ direction: 'out', offset, rest: 'none', reduced: true });
    expect(lift.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(back.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(lift.options.duration).toBe(PREVIEW_FADE_MS);
  });
});
