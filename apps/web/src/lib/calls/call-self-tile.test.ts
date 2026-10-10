import { describe, expect, test } from 'bun:test';

import { selfRowBounds, selfRowsLayout, selfRowWidth } from './call-self-controls';
import {
  cornerAfterArrow,
  DEFAULT_SELF_CORNER,
  DEFAULT_SELF_TILE,
  isTileDrag,
  nearestSelfCorner,
  scaleAfterPinch,
  scaleAfterWheel,
  SELF_CORNERS,
  selfTileBox,
  selfTileCornerFor,
  selfTileScaleFor,
  selfTileSize,
  selfTileStore,
  setSelfTileCorner,
  setSelfTileScale,
} from './call-self-tile';

/**
 * MA VIGNETTE EN COIN (#8577) — trois tailles, x1 · x2 · x3, la moyenne par
 * défaut (celle d'avant) ; un pincement la fait passer d'un cran (ou deux,
 * franchement pincé), jamais entre deux ; elle ne mange jamais l'écran ; la
 * taille choisie tient pour l'appel, pas pour le suivant.
 */

const phone = { width: 390, height: 844 };

describe('selfTileSize', () => {
  test('x2 est la vignette d’aujourd’hui, x1 plus petite, x3 plus grande — même proportion', () => {
    expect(DEFAULT_SELF_TILE).toBe(2);
    expect(selfTileSize(2, phone)).toEqual({ width: 112, height: 160 });
    expect(selfTileSize(1, phone)).toEqual({ width: 80, height: 114 });
    expect(selfTileSize(3, phone)).toEqual({ width: 168, height: 240 });
  });

  test('sur un petit écran, x3 se borne à 45 % de la largeur et 40 % de la hauteur, sans se déformer', () => {
    const small = selfTileSize(3, { width: 320, height: 568 });
    expect(small.width).toBeLessThanOrEqual(144);
    expect(small.height).toBeLessThanOrEqual(227);
    expect(small).toEqual({ width: 144, height: 206 });
    expect(selfTileSize(3, { width: 900, height: 400 })).toEqual({ width: 112, height: 160 });
  });
});

describe('scaleAfterPinch', () => {
  test('écarter d’un tiers passe au cran supérieur ; franchement, deux crans', () => {
    expect(scaleAfterPinch(2, 1.3)).toBe(3);
    expect(scaleAfterPinch(1, 1.3)).toBe(2);
    expect(scaleAfterPinch(1, 2)).toBe(3);
  });

  test('pincer passe au cran inférieur ; franchement, deux crans', () => {
    expect(scaleAfterPinch(2, 0.8)).toBe(1);
    expect(scaleAfterPinch(3, 0.8)).toBe(2);
    expect(scaleAfterPinch(3, 0.5)).toBe(1);
  });

  test('un geste timide ne change rien, et rien ne dépasse x1 ni x3', () => {
    expect(scaleAfterPinch(2, 1.1)).toBe(2);
    expect(scaleAfterPinch(2, 0.9)).toBe(2);
    expect(scaleAfterPinch(3, 3)).toBe(3);
    expect(scaleAfterPinch(1, 0.2)).toBe(1);
  });
});

describe('scaleAfterWheel', () => {
  test('Ctrl + molette vers le haut agrandit d’un cran, vers le bas réduit', () => {
    expect(scaleAfterWheel(2, -40)).toBe(3);
    expect(scaleAfterWheel(2, 40)).toBe(1);
    expect(scaleAfterWheel(3, -40)).toBe(3);
    expect(scaleAfterWheel(2, 0)).toBe(2);
  });
});

describe('la taille retenue pour l’appel', () => {
  test('la taille choisie tient pour CET appel ; un autre appel repart de x2', () => {
    selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE });
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-1')).toBe(2);
    setSelfTileScale('call-1', 3);
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-1')).toBe(3);
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-2')).toBe(2);
    setSelfTileScale('call-2', 1);
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-1')).toBe(2);
  });
});

/**
 * MA VIGNETTE SE GLISSE (#8747, miroir de `CallView+SelfView.swift`) — quatre
 * coins, 16 px du bord ; en haut 128 px sous la zone sûre, en bas 176 px
 * au-dessus d'elle : de chaque côté une rangée de commandes tient entre la
 * vignette et l'en-tête comme entre elle et la pilule.
 */
describe('selfTileBox — les quatre coins de repos', () => {
  const size = { width: 112, height: 160 };

  test('haut-droite par défaut, là où elle vivait', () => {
    expect(DEFAULT_SELF_CORNER).toBe('top-right');
    expect(selfTileBox({ corner: 'top-right', size, viewport: phone })).toEqual({ x: 262, y: 128, width: 112, height: 160 });
  });

  test('chaque coin à 16 px de son bord, la rangée tenant au-dessus comme en dessous', () => {
    expect(selfTileBox({ corner: 'top-left', size, viewport: phone })).toEqual({ x: 16, y: 128, width: 112, height: 160 });
    expect(selfTileBox({ corner: 'bottom-left', size, viewport: phone })).toEqual({ x: 16, y: 844 - 176 - 160, width: 112, height: 160 });
    expect(selfTileBox({ corner: 'bottom-right', size, viewport: phone })).toEqual({ x: 262, y: 844 - 176 - 160, width: 112, height: 160 });
  });

  test('un écran trop court : le coin bas ne remonte jamais au-dessus du coin haut', () => {
    const short = { width: 700, height: 360 };
    expect(selfTileBox({ corner: 'bottom-right', size, viewport: short }).y).toBe(128);
  });
});

describe('nearestSelfCorner — elle s’aimante au coin le plus proche de la dépose', () => {
  const size = { width: 112, height: 160 };
  const at = (x: number, y: number) => nearestSelfCorner({ center: { x, y }, size, viewport: phone });

  test('lâchée dans un quart de l’écran, elle va à son coin', () => {
    expect(at(60, 100)).toBe('top-left');
    expect(at(330, 120)).toBe('top-right');
    expect(at(40, 700)).toBe('bottom-left');
    expect(at(350, 800)).toBe('bottom-right');
  });

  test('un glissé timide la rend à son coin', () => {
    const home = selfTileBox({ corner: 'top-right', size, viewport: phone });
    expect(at(home.x + home.width / 2 - 30, home.y + home.height / 2 + 40)).toBe('top-right');
  });
});

describe('isTileDrag — un toucher reste un toucher', () => {
  test('sous 8 px de déplacement, ce n’est pas un glissé', () => {
    expect(isTileDrag({ dx: 3, dy: -4 })).toBe(false);
    expect(isTileDrag({ dx: 0, dy: 0 })).toBe(false);
    expect(isTileDrag({ dx: 6, dy: 6 })).toBe(true);
    expect(isTileDrag({ dx: -20, dy: 0 })).toBe(true);
  });
});

describe('cornerAfterArrow — au clavier, de coin en coin', () => {
  test('les flèches changent le côté qu’elles désignent et gardent l’autre', () => {
    expect(cornerAfterArrow('top-right', 'ArrowLeft')).toBe('top-left');
    expect(cornerAfterArrow('top-right', 'ArrowDown')).toBe('bottom-right');
    expect(cornerAfterArrow('bottom-left', 'ArrowUp')).toBe('top-left');
    expect(cornerAfterArrow('bottom-left', 'ArrowRight')).toBe('bottom-right');
  });

  test('une flèche vers le bord où elle est déjà ne fait rien ; une autre touche non plus', () => {
    expect(cornerAfterArrow('top-right', 'ArrowRight')).toBeNull();
    expect(cornerAfterArrow('top-right', 'ArrowUp')).toBeNull();
    expect(cornerAfterArrow('top-right', 'Enter')).toBeNull();
  });
});

describe('les rangées de commandes suivent la vignette dans les quatre coins', () => {
  const size = { width: 112, height: 160 };
  const bounds = selfRowBounds(phone);
  for (const corner of SELF_CORNERS) {
    test(`${corner} : Effets au-dessus, la caméra en dessous, dans l’écran, hors de la vignette`, () => {
      const tile = selfTileBox({ corner, size, viewport: phone });
      const rows = selfRowsLayout({ tile, bounds, effectsWidth: selfRowWidth(2), cameraWidth: selfRowWidth(3) });
      expect(rows.effects?.side).toBe('above');
      expect(rows.camera?.side).toBe('below');
      for (const row of [rows.effects, rows.camera]) {
        if (row === null) throw new Error('rangée absente');
        expect(row.x).toBeGreaterThanOrEqual(bounds.x);
        expect(row.x + row.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(row.y).toBeGreaterThanOrEqual(bounds.y);
        expect(row.y + row.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
    });
  }

  test('glissée tout en haut, la rangée Effets passe sous la caméra plutôt que sous l’en-tête', () => {
    const tile = { x: 140, y: 40, width: 112, height: 160 };
    const rows = selfRowsLayout({ tile, bounds, effectsWidth: selfRowWidth(2), cameraWidth: selfRowWidth(2) });
    expect(rows.effects?.side).toBe('below');
    expect(rows.camera?.side).toBe('below');
    expect(rows.effects?.y).toBeGreaterThan(rows.camera?.y ?? 0);
  });
});

describe('le coin retenu pour l’appel', () => {
  test('le coin choisi tient pour CET appel, avec la taille ; un autre appel repart du coin haut-droite', () => {
    selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE, corner: DEFAULT_SELF_CORNER });
    setSelfTileCorner('call-1', 'bottom-left');
    setSelfTileScale('call-1', 3);
    expect(selfTileCornerFor(selfTileStore.getState(), 'call-1')).toBe('bottom-left');
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-1')).toBe(3);
    expect(selfTileCornerFor(selfTileStore.getState(), 'call-2')).toBe('top-right');
    setSelfTileCorner('call-2', 'top-left');
    expect(selfTileScaleFor(selfTileStore.getState(), 'call-2')).toBe(2);
    expect(selfTileCornerFor(selfTileStore.getState(), 'call-1')).toBe('top-right');
  });
});
