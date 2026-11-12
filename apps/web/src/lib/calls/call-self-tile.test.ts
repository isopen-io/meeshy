import { describe, expect, test } from 'bun:test';

import {
  cornerAfterArrow,
  DEFAULT_SELF_CORNER,
  DEFAULT_SELF_TILE,
  isLandscapeWindow,
  isTileDrag,
  nearestSelfCorner,
  scaleAfterPinch,
  scaleAfterWheel,
  selfTileBox,
  selfTileClearance,
  selfTileCornerFor,
  selfTileCounterScaled,
  selfTileOrigin,
  selfTileRestingFactor,
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
    expect(selfTileSize(3, { width: 400, height: 300 })).toEqual({ width: 112, height: 160 });
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
    expect(selfTileBox({ corner: 'top-left', size, viewport: phone, topInset: 56 })).toEqual({ x: 16, y: 184, width: 112, height: 160 });
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

/**
 * G1.11 (#17536, miroir de `CallSelfTileScale.restingFactor` / `counterScaled` / `anchor`
 * d'iOS, #17534) — ranger ma vignette est une TRANSFORMATION : son cadre reste celui du
 * palier choisi, elle est mise à l'échelle de sa petite taille depuis son coin, jamais
 * relayoutée (largeur et hauteur ne s'animent pas).
 */
describe('ma vignette se range par une échelle ancrée à son coin (G1.11)', () => {
  const screen = { width: 390, height: 844 };

  test('commandes visibles, le facteur est 1 ; rangée, elle se ramène à la petite taille', () => {
    for (const scale of [1, 2, 3] as const) expect(selfTileRestingFactor(scale, true, screen)).toBe(1);
    expect(selfTileRestingFactor(3, false, screen)).toBeCloseTo(selfTileSize(1, screen).width / selfTileSize(3, screen).width, 5);
    expect(selfTileRestingFactor(2, false, screen)).toBeCloseTo(selfTileSize(1, screen).width / selfTileSize(2, screen).width, 5);
    expect(selfTileRestingFactor(1, false, screen)).toBe(1);
  });

  test('l’ancre est le coin où la vignette se tient : elle garde sa marge pendant la réduction', () => {
    expect(selfTileOrigin('top-right')).toBe('top right');
    expect(selfTileOrigin('bottom-left')).toBe('bottom left');
  });

  test('ce qui ne doit pas rapetisser (liseré, coins) est contre-mis à l’échelle', () => {
    const factor = selfTileRestingFactor(3, false, screen);
    expect(selfTileCounterScaled(2, factor) * factor).toBeCloseTo(2, 5);
    expect(selfTileCounterScaled(12, 1)).toBe(12);
    expect(selfTileCounterScaled(2, 0)).toBe(2);
    expect(selfTileCounterScaled(2, Number.NaN)).toBe(2);
  });
});

describe('L1.5 — dans une fenêtre plus large que haute, ma vignette se couche (130 × 96) à sa hauteur de coin', () => {
  const landscape = { width: 844, height: 390 };

  test('la fenêtre est couchée quand elle est plus large que haute — jamais carrée', () => {
    expect(isLandscapeWindow(landscape)).toBe(true);
    expect(isLandscapeWindow(phone)).toBe(false);
    expect(isLandscapeWindow({ width: 600, height: 600 })).toBe(false);
  });

  test('x2 couché fait 130 × 96, x1 et x3 le suivent à la même proportion ; le portrait ne change pas', () => {
    expect(selfTileSize(2, landscape)).toEqual({ width: 130, height: 96 });
    expect(selfTileSize(1, landscape)).toEqual({ width: 93, height: 69 });
    expect(selfTileSize(3, landscape)).toEqual({ width: 195, height: 144 });
    expect(selfTileSize(2, phone)).toEqual({ width: 112, height: 160 });
  });

  test('couchée, elle ne dépasse toujours pas 40 % de la hauteur de l’écran', () => {
    const short = selfTileSize(3, { width: 640, height: 300 });
    expect(short.height).toBeLessThanOrEqual(120);
    expect(short.width / short.height).toBeCloseTo(130 / 96, 1);
  });

  test('sa hauteur de coin : 60 sous le haut, 130 au-dessus du bas (iOS, Android) ; portrait 128 et 176', () => {
    expect(selfTileClearance(landscape)).toEqual({ top: 60, bottom: 130 });
    expect(selfTileClearance(phone)).toEqual({ top: 128, bottom: 176 });
  });

  test('les quatre coins couchés sont quatre places distinctes — les coins bas ne retombent plus sur les hauts', () => {
    const size = selfTileSize(2, landscape);
    expect(selfTileBox({ corner: 'top-right', size, viewport: landscape })).toEqual({ x: 844 - 16 - 130, y: 60, width: 130, height: 96 });
    expect(selfTileBox({ corner: 'top-left', size, viewport: landscape, topInset: 56 })).toEqual({ x: 16, y: 116, width: 130, height: 96 });
    expect(selfTileBox({ corner: 'bottom-left', size, viewport: landscape })).toEqual({ x: 16, y: 390 - 130 - 96, width: 130, height: 96 });
    expect(selfTileBox({ corner: 'bottom-right', size, viewport: landscape }).y).toBeGreaterThan(60);
  });
});
